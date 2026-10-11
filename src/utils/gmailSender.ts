// Narzędzie do tworzenia wiadomości MIME zgodnej z RFC 5322, RFC 5321 i RFC 2045
// oraz wysyłki przez oficjalne Gmail REST API v1 z dołączaniem wygenerowanych plików PDF jako załączników.

import { PolicyContract } from '../types/policy';

/**
 * Dzieli ciąg Base64 na linie o maksymalnej długości (standard RFC 2045 i RFC 5321 to 76 znaków).
 * Zapobiega odrzucaniu wiadomości przez serwery pocztowe (np. błędy SMTP 500/550 "Line too long"
 * oraz oznaczaniu wiadomości jako SPAM przez filtry antyspamowe z powodu braku łamania linii).
 */
export function chunkBase64(str: string, lineLength = 76): string {
  if (!str) return '';
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += lineLength) {
    chunks.push(str.slice(i, i + lineLength));
  }
  return chunks.join('\r\n');
}

/**
 * Bezpiecznie koduje Uint8Array do Base64 partiami (chunked),
 * unikając przekroczenia limitu argumentów funkcji call stack w przeglądarce.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 16384;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Bezpieczne kodowanie tekstu UTF-8 do Base64 ze wsparciem polskich znaków diakrytycznych
 */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return uint8ArrayToBase64(bytes);
}

/**
 * Koduje surowy tekst MIME do Base64URL wymaganego przez Gmail API (RFC 4648 Base64URL)
 */
export function rawMimeToBase64Url(mime: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(mime);
  const base64 = uint8ArrayToBase64(bytes);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Bezpiecznie czyści i formatuje nazwę pliku załącznika (ASCII + RFC 2231)
 */
export function sanitizeAttachmentFilename(filename: string): string {
  const clean = filename.trim().replace(/[/\\?%*:|"<>]/g, '_');
  return clean.endsWith('.pdf') ? clean : `${clean}.pdf`;
}

export interface SendEmailOptions {
  accessToken: string;
  senderEmail: string;
  senderName?: string;
  recipientEmail: string; // Może zawierać jeden lub wiele adresów oddzielonych przecinkami
  ccEmail?: string;       // Opcjonalna kopia DW (np. do samego siebie)
  subject: string;
  messageBody: string;
  contracts: PolicyContract[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  statusText?: string;
  error?: string;
  isAuthError?: boolean;
}

/**
 * Buduje w pełni poprawną wiadomość multipart/mixed w standardzie RFC 5322 i MIME
 * ze wszystkimi wymaganymi nagłówkami chroniącymi przed zakwalifikowaniem jako SPAM.
 */
export function buildMimeMessage({
  senderEmail,
  senderName,
  recipientEmail,
  ccEmail,
  subject,
  messageBody,
  contracts
}: Omit<SendEmailOptions, 'accessToken'>): string {
  const boundary = `====_Boundary_${Date.now()}_${Math.random().toString(36).substring(2, 10)}_====`;

  // 1. Nagłówek Date (RFC 5322 section 3.6.1 - BEZWZGLĘDNIE WYMAGANY dla legalnych e-maili)
  const dateHeader = new Date().toUTCString();

  // 2. Unikalny identyfikator Message-ID
  const messageIdHeader = `<polisasplit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@mail.gmail.com>`;

  // 3. Formatowanie nagłówka From (z czytelną nazwą nadawcy, jeśli dostępna)
  let formattedFrom = `<${senderEmail}>`;
  if (senderName && senderName.trim()) {
    const cleanName = senderName.trim();
    // Jeśli nazwa zawiera znaki spoza ASCII, kodujemy ją w standardzie RFC 2047
    const hasNonAscii = /[^\x20-\x7E]/.test(cleanName);
    const encodedName = hasNonAscii ? `=?UTF-8?B?${utf8ToBase64(cleanName)}?=` : `"${cleanName.replace(/"/g, '')}"`;
    formattedFrom = `${encodedName} <${senderEmail}>`;
  }

  // 4. Formatowanie nagłówka To (obsługa wielu odbiorców rozdzielonych przecinkiem/średnikiem)
  const recipientsList = recipientEmail
    .split(/[;,]+/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && r.includes('@'));
  const formattedTo = recipientsList.join(', ');

  // 5. Kodowanie tematu UTF-8 Base64 RFC 2047
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(subject || 'Polisy ubezpieczeniowe')}?=`;

  const headers: string[] = [
    `Date: ${dateHeader}`,
    `Message-ID: ${messageIdHeader}`,
    `From: ${formattedFrom}`,
    `To: ${formattedTo}`
  ];

  if (ccEmail && ccEmail.trim() && ccEmail.includes('@')) {
    headers.push(`Cc: ${ccEmail.trim()}`);
  }

  headers.push(`Subject: ${encodedSubject}`);
  headers.push('MIME-Version: 1.0');
  headers.push('X-Mailer: PolisaSplit Pro (Official Gmail Integration)');
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [];

  // Treść tekstowa wiadomości (format UTF-8 z poprawnym zawijaniem wierszy Base64 na 76 znaków)
  const bodyBase64Chunked = chunkBase64(utf8ToBase64(messageBody || ''));
  parts.push(
    `--${boundary}\r\n` +
    'Content-Type: text/plain; charset="UTF-8"; format=flowed\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    bodyBase64Chunked
  );

  // Załączniki PDF
  for (const contract of contracts) {
    if (!contract.pdfBytes || contract.pdfBytes.length === 0) continue;

    const rawFilename = contract.customFilename || `Polisa_${contract.registrationNumber || contract.contractIndex}.pdf`;
    const cleanFilename = sanitizeAttachmentFilename(rawFilename);

    // Bezpieczna nazwa ASCII dla kompatybilności wstecznej + standard RFC 2231 filename*
    const asciiSafeFilename = cleanFilename.replace(/[^\x20-\x7E]/g, '_');
    const rfc2231Filename = `UTF-8''${encodeURIComponent(cleanFilename)}`;

    // Kluczowa poprawka: zawijanie base64 pliku PDF do maksymalnie 76 znaków na wiersz!
    // Bez tego wiersz ma ponad 200 000 znaków, co powoduje natychmiastowe odrzucenie lub kwarantannę przez serwery SMTP
    const pdfBase64 = uint8ArrayToBase64(contract.pdfBytes);
    const pdfBase64Chunked = chunkBase64(pdfBase64, 76);

    parts.push(
      `--${boundary}\r\n` +
      `Content-Type: application/pdf; name="${asciiSafeFilename}"\r\n` +
      `Content-Disposition: attachment; filename="${asciiSafeFilename}"; filename*=${rfc2231Filename}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      pdfBase64Chunked
    );
  }

  // Zakończenie MIME
  parts.push(`--${boundary}--`);

  return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n') + '\r\n';
}

/**
 * Wysyła wiadomość e-mail z załącznikami PDF przez oficjalne Gmail REST API v1
 */
export async function sendEmailWithPdfAttachments(options: SendEmailOptions): Promise<SendEmailResult> {
  const { accessToken, contracts, recipientEmail } = options;

  if (!accessToken) {
    return {
      success: false,
      isAuthError: true,
      error: 'Brak autoryzacji Google. Zaloguj się na swoje konto Gmail, aby wysłać wiadomość.'
    };
  }

  const validRecipients = recipientEmail
    .split(/[;,]+/)
    .map((r) => r.trim())
    .filter((r) => r.includes('@'));

  if (validRecipients.length === 0) {
    return {
      success: false,
      error: 'Wprowadź co najmniej jeden poprawny adres e-mail odbiorcy (np. klient@firma.pl).'
    };
  }

  if (contracts.length === 0) {
    return {
      success: false,
      error: 'Nie wybrano żadnych plików PDF do wysłania.'
    };
  }

  try {
    const rawMime = buildMimeMessage(options);
    const rawBase64Url = rawMimeToBase64Url(rawMime);

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: rawBase64Url
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          success: false,
          isAuthError: true,
          error: 'Sesja konta Google wygasła. Połącz konto ponownie, aby odnowić uprawnienia do wysyłki.'
        };
      }

      const errBody = await response.json().catch(() => ({}));
      const message =
        errBody?.error?.message ||
        `Serwer Gmail zwrócił kod błędu HTTP ${response.status} (${response.statusText})`;
      return {
        success: false,
        error: `Błąd podczas wysyłania przez Gmail: ${message}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      messageId: data.id,
      threadId: data.threadId,
      statusText: 'Wiadomość została zaakceptowana przez serwery Google i wysłana'
    };
  } catch (error: any) {
    console.error('Błąd wysyłki e-mail przez Gmail API:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Wystąpił nieoczekiwany błąd podczas wysyłania wiadomości.'
    };
  }
}
