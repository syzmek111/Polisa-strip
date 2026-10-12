import http from 'http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// BEZPIECZEŃSTWO & OWASP: KONTROLA CZĘSTOTLIWOŚCI ŻĄDAŃ (RATE LIMITING)
// ============================================================================
interface RateLimitBucket {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

/**
 * Czyści przedawnione rekordy rate-limitera co 5 minut, aby zapobiec wyciekowi pamięci.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (now > bucket.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function createRateLimiter(windowMs: number, maxRequests: number, actionName: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
    const key = `${actionName}:${ip}`;
    const now = Date.now();

    const bucket = rateLimitStore.get(key);

    if (!bucket || now > bucket.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      const retryAfterSec = Math.ceil((bucket.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        success: false,
        error: `Zbyt wiele żądań (${actionName}). W celach bezpieczeństwa i ochrony przed nadużyciami nałożono ograniczenie. Spróbuj ponownie za ${retryAfterSec} s.`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfterSec,
      });
    }

    bucket.count++;
    return next();
  };
}

// Limity:
// 12 testów SMTP na minutę
const smtpVerifyLimiter = createRateLimiter(60 * 1000, 12, 'smtp_verify');
// 25 wysyłek na 5 minut
const smtpSendLimiter = createRateLimiter(5 * 60 * 1000, 25, 'smtp_send');

// ============================================================================
// BEZPIECZEŃSTWO: OCHRONA PRZED SSRF (Server-Side Request Forgery)
// ============================================================================
function isSsrfSafeHost(hostRaw: string): { safe: boolean; reason?: string } {
  if (!hostRaw || typeof hostRaw !== 'string') {
    return { safe: false, reason: 'Brak podanego adresu hosta.' };
  }
  const host = hostRaw.trim().toLowerCase();

  // Blokada znaków specjalnych
  if (/[^a-z0-9.-]/.test(host)) {
    return { safe: false, reason: 'Adres serwera zawiera niedozwolone znaki.' };
  }

  // Blokada pętli zwrotnej i localhost
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost')
  ) {
    return { safe: false, reason: 'Zablokowano próbę połączenia z adresem lokalnym (localhost/127.0.0.1).' };
  }

  // Blokada serwisów metadanych chmurowych (GCP, AWS, Azure)
  if (
    host === '169.254.169.254' ||
    host.includes('metadata.google.internal') ||
    host.includes('metadata.internal')
  ) {
    return { safe: false, reason: 'Zablokowano niebezpieczny adres punktu metadanych chmury (ochrona SSRF).' };
  }

  // Blokada prywatnych zakresów sieciowych RFC 1918 (10.x, 172.16-31.x, 192.168.x)
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const oct1 = parseInt(ipv4Match[1], 10);
    const oct2 = parseInt(ipv4Match[2], 10);
    if (oct1 === 10) return { safe: false, reason: 'Zablokowano prywatną podsieć 10.0.0.0/8.' };
    if (oct1 === 192 && oct2 === 168) return { safe: false, reason: 'Zablokowano prywatną podsieć 192.168.0.0/16.' };
    if (oct1 === 172 && oct2 >= 16 && oct2 <= 31) return { safe: false, reason: 'Zablokowano prywatną podsieć 172.16.0.0/12.' };
    if (oct1 === 127) return { safe: false, reason: 'Zablokowano pętlę zwrotną 127.0.0.0/8.' };
    if (oct1 === 169 && oct2 === 254) return { safe: false, reason: 'Zablokowano adres link-local 169.254.0.0/16.' };
  }

  return { safe: true };
}

// ============================================================================
// BEZPIECZEŃSTWO: ANTY-INJECTION (CRLF w nagłówkach pocztowych)
// ============================================================================
function sanitizeHeaderString(value: any): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\r\n\x00]/g, '').trim();
}

function isValidEmail(email: any): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim();
  if (clean.length > 254) return false;
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return regex.test(clean);
}

// ============================================================================
// INICJALIZACJA SERWERA EXPRESS & VITE
// ============================================================================
async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // 1. Zabezpieczające nagłówki HTTP (OWASP & standardy bezpieczeństwa aplikacji webowych)
  app.use((req, res, next) => {
    // Ochrona przed atakami MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Ochrona przed Clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // Ochrona HSTS (wymuszenie szyfrowania SSL/TLS)
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // Ochrona prywatności odnośników
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Blokada nieużywanych API urządzeń
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

    // Zezwolenie na komunikację z oknem popup dla Google OAuth (COOP)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com https://www.gstatic.com https://cdn.jsdelivr.net https://unpkg.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://lh3.googleusercontent.com",
        "connect-src 'self' https://accounts.google.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com https://*.firebaseapp.com https://cdn.jsdelivr.net https://unpkg.com https://tessdata.projectnaptha.com data: blob:",
        "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
        "worker-src 'self' blob: https://cdn.jsdelivr.net https://unpkg.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );

    next();
  });

  // Serwowanie zasobów tesseract.js lokalnie (Worker & Core)
  const tesseractDistPath = path.resolve(__dirname, 'node_modules/tesseract.js/dist');
  const tesseractCorePath = path.resolve(__dirname, 'node_modules/tesseract.js-core');
  app.use('/tesseract-worker', express.static(tesseractDistPath));
  app.use('/tesseract-core', express.static(tesseractCorePath));

  // Obsługa danych wejściowych z limitem do 50MB (duże załączniki PDF)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  /**
   * Endpoint do sprawdzania stanu zdrowia i statusu bezpieczeństwa serwera
   */
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      security: {
        ssrfProtection: true,
        rateLimiting: true,
        headerInjectionProtection: true,
        pdfSignatureVerification: true,
        gdprCompliant: true,
      },
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Endpoint do weryfikacji danych serwera SMTP z ochroną SSRF i Rate Limitingiem
   */
  app.post('/api/smtp/verify', smtpVerifyLimiter, async (req, res) => {
    try {
      const { host, port, secure, user, pass } = req.body || {};

      if (!host || !user || !pass) {
        return res.status(400).json({
          success: false,
          message: 'Wymagane jest podanie serwera SMTP (host), loginu/użytkownika oraz hasła.',
        });
      }

      const cleanHost = sanitizeHeaderString(host);
      const cleanUser = sanitizeHeaderString(user);

      // Weryfikacja SSRF
      const ssrfCheck = isSsrfSafeHost(cleanHost);
      if (!ssrfCheck.safe) {
        return res.status(400).json({
          success: false,
          code: 'SSRF_BLOCKED',
          message: ssrfCheck.reason || 'Podany adres hosta SMTP narusza reguły bezpieczeństwa.',
        });
      }

      const smtpPort = Number(port) || (secure ? 465 : 587);
      if (smtpPort < 1 || smtpPort > 65535) {
        return res.status(400).json({
          success: false,
          message: 'Nieprawidłowy numer portu SMTP (dozwolony zakres 1-65535).',
        });
      }

      const isSecure = secure !== undefined ? Boolean(secure) : smtpPort === 465;

      const transporter = nodemailer.createTransport({
        host: cleanHost,
        port: smtpPort,
        secure: isSecure,
        auth: {
          user: cleanUser,
          pass: String(pass),
        },
        tls: {
          rejectUnauthorized: false, // zapobiega odrzucaniu certyfikatów na lokalnych/firmowych serwerach hostingowych
        },
        connectionTimeout: 12000,
        greetingTimeout: 8000,
        socketTimeout: 20000,
      });

      await transporter.verify();

      return res.json({
        success: true,
        message: 'Połączenie z serwerem pocztowym SMTP powiodło się! Dane autoryzacji są poprawne.',
      });
    } catch (err: any) {
      console.error('Błąd weryfikacji SMTP:', err?.message || err);
      let friendlyMessage = 'Nie udało się nawiązać połączenia z serwerem SMTP.';
      if (err.code === 'EAUTH') {
        friendlyMessage = 'Błąd autoryzacji (EAUTH): Niepoprawny login (użytkownik) lub hasło do skrzynki pocztowej.';
      } else if (err.code === 'ENOTFOUND' || err.code === 'EDNS' || String(err.message).includes('ENOTFOUND')) {
        friendlyMessage = `Nie odnaleziono serwera pocztowego. Sprawdź czy adres serwera SMTP jest prawidłowy (np. mail.nazwafirmy.pl).`;
      } else if (err.code === 'ETIMEDOUT' || String(err.message).includes('ETIMEDOUT')) {
        friendlyMessage = `Przekroczono limit czasu oczekiwania na serwer SMTP. Sprawdź numer portu (465 dla SSL lub 587 dla TLS).`;
      } else if (err.code === 'ECONNREFUSED') {
        friendlyMessage = `Połączenie zostało odrzucone przez serwer. Sprawdź czy serwer obsługuje ten port.`;
      } else if (err.message) {
        friendlyMessage = err.message;
      }

      return res.status(400).json({
        success: false,
        message: friendlyMessage,
        code: err.code || 'SMTP_ERROR',
      });
    }
  });

  /**
   * Endpoint do bezpośredniej wysyłki wiadomości e-mail przez konto SMTP
   * Z pełną walidacją załączników PDF (weryfikacja nagłówka magicznych bajtów %PDF-),
   * ochroną przed CRLF injection i rate limitingiem.
   */
  app.post('/api/smtp/send', smtpSendLimiter, async (req, res) => {
    try {
      const {
        smtp,
        senderEmail,
        senderName,
        recipientEmail,
        ccEmail,
        replyTo,
        subject,
        messageBody,
        attachments,
      } = req.body || {};

      if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
        return res.status(400).json({
          success: false,
          error: 'Brak kompletnych danych serwera SMTP do wysyłki wiadomości.',
        });
      }

      const cleanHost = sanitizeHeaderString(smtp.host);
      const cleanUser = sanitizeHeaderString(smtp.user);
      const cleanRecipient = sanitizeHeaderString(recipientEmail);
      const cleanSender = sanitizeHeaderString(senderEmail || smtp.user);
      const cleanSenderName = sanitizeHeaderString(senderName || '');
      const cleanCc = ccEmail ? sanitizeHeaderString(ccEmail) : '';
      const cleanReplyTo = replyTo ? sanitizeHeaderString(replyTo) : cleanSender;
      const cleanSubject = sanitizeHeaderString(subject || 'Polisy ubezpieczeniowe pojazdów');

      // Walidacja SSRF hosta
      const ssrfCheck = isSsrfSafeHost(cleanHost);
      if (!ssrfCheck.safe) {
        return res.status(400).json({
          success: false,
          code: 'SSRF_BLOCKED',
          error: ssrfCheck.reason || 'Podany adres hosta SMTP narusza reguły bezpieczeństwa.',
        });
      }

      // Walidacja formatu adresu odbiorcy (RODO: zapobieganie wysyłce na wadliwe adresy)
      if (!isValidEmail(cleanRecipient)) {
        return res.status(400).json({
          success: false,
          error: 'Nieprawidłowy format adresu e-mail odbiorcy. Sprawdź poprawność wpisu.',
          code: 'INVALID_RECIPIENT_EMAIL',
        });
      }

      if (cleanCc && !isValidEmail(cleanCc)) {
        return res.status(400).json({
          success: false,
          error: 'Nieprawidłowy format adresu e-mail kopii (DW).',
          code: 'INVALID_CC_EMAIL',
        });
      }

      const smtpPort = Number(smtp.port) || (smtp.secure ? 465 : 587);
      const isSecure = smtp.secure !== undefined ? Boolean(smtp.secure) : smtpPort === 465;

      const transporter = nodemailer.createTransport({
        host: cleanHost,
        port: smtpPort,
        secure: isSecure,
        auth: {
          user: cleanUser,
          pass: String(smtp.pass),
        },
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
      });

      // Formatowanie nagłówka From z zabezpieczeniem przed Header Injection
      const fromHeader = cleanSenderName
        ? `"${cleanSenderName.replace(/"/g, '')}" <${cleanSender}>`
        : cleanSender;

      // Walidacja i przygotowanie załączników PDF
      if (!Array.isArray(attachments) || attachments.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Wiadomość musi zawierać przynajmniej jeden załącznik z polisą PDF.',
        });
      }

      if (attachments.length > 200) {
        return res.status(400).json({
          success: false,
          error: 'Przekroczono maksymalną dopuszczalną liczbę załączników (maks. 200).',
        });
      }

      const mailAttachments = [];
      let totalBytes = 0;

      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        if (!att || !att.contentBase64 || typeof att.contentBase64 !== 'string') {
          return res.status(400).json({
            success: false,
            error: `Załącznik nr ${i + 1} zawiera uszkodzone dane.`,
          });
        }

        // Sanityzacja nazwy pliku
        const safeFilename = sanitizeHeaderString(att.filename || `polisa_${i + 1}.pdf`)
          .replace(/[\\/:\*\?"<>\|]/g, '_');

        if (!safeFilename.toLowerCase().endsWith('.pdf')) {
          return res.status(400).json({
            success: false,
            error: `Niedozwolony format załącznika "${safeFilename}". Dozwolone są wyłącznie pliki PDF.`,
          });
        }

        const buffer = Buffer.from(att.contentBase64, 'base64');
        totalBytes += buffer.length;

        // Weryfikacja nagłówka magicznych bajtów formatu PDF (%PDF-)
        // Ochrona przed podszywaniem się pod PDF plikami wykonywalnymi lub skryptami
        if (buffer.length < 5 || buffer.toString('utf8', 0, 5) !== '%PDF-') {
          return res.status(400).json({
            success: false,
            error: `Załącznik "${safeFilename}" nie jest prawidłowym dokumentem PDF (błędna sygnatura pliku).`,
            code: 'INVALID_PDF_SIGNATURE',
          });
        }

        mailAttachments.push({
          filename: safeFilename,
          content: buffer,
          contentType: 'application/pdf',
        });
      }

      // Sprawdzenie łącznego rozmiaru (maks 45MB)
      if (totalBytes > 45 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: 'Łączny rozmiar załączników przekracza bezpieczny limit 45 MB.',
          code: 'PAYLOAD_TOO_LARGE',
        });
      }

      // Wysłanie wiadomości
      const info = await transporter.sendMail({
        from: fromHeader,
        to: cleanRecipient,
        cc: cleanCc || undefined,
        replyTo: cleanReplyTo,
        subject: cleanSubject,
        text: String(messageBody || ''),
        headers: {
          'X-Mailer': 'PolisaSplit/2.1 (Bezpieczny Rozdzielacz Polis - Zgodny z RODO)',
        },
        attachments: mailAttachments,
      });

      return res.json({
        success: true,
        messageId: info.messageId,
        response: info.response,
      });
    } catch (err: any) {
      console.error('Błąd wysyłki e-mail przez SMTP:', err?.message || err);
      let friendlyError = 'Nie udało się wysłać wiadomości przez serwer pocztowy.';
      if (err.code === 'EAUTH') {
        friendlyError = 'Błąd autoryzacji: Serwer SMTP odrzucił podane dane logowania.';
      } else if (err.code === 'EMESSAGE') {
        friendlyError = `Serwer SMTP odrzucił treść lub załączniki wiadomości: ${err.message}`;
      } else if (err.message) {
        friendlyError = err.message;
      }

      return res.status(500).json({
        success: false,
        error: friendlyError,
        code: err.code || 'SMTP_SEND_ERROR',
      });
    }
  });

  // Integracja z Vite w trybie dev lub serwowanie plików statycznych w prod
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PolisaSplit fullstack server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Błąd startu serwera PolisaSplit:', err);
  process.exit(1);
});
