import { MailboxAccount, SmtpConfig, SmtpVerifyResponse, SmtpSendResponse } from '../types/mailbox';
import { PolicyContract } from '../types/policy';
import { addRodoAuditLog, getPrivacySettings } from './security';

const MAILBOXES_STORAGE_KEY = 'polisasplit_mailbox_accounts_v1';
const ACTIVE_MAILBOX_ID_KEY = 'polisasplit_active_mailbox_id_v1';
const SESSION_PASSWORDS_PREFIX = 'polisasplit_session_smtp_pass_';

/**
 * Pobiera listę wszystkich skonfigurowanych skrzynek pocztowych.
 * Łączy hasła z sessionStorage jeśli włączony jest tryb haseł sesyjnych.
 */
export function getSavedMailboxes(): MailboxAccount[] {
  try {
    const raw = localStorage.getItem(MAILBOXES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: MailboxAccount[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Jeśli hasło było zapisane w sessionStorage, uzupełniamy je
    return parsed.map((box) => {
      if (box.type === 'smtp' && box.smtp) {
        const sessionPass = sessionStorage.getItem(`${SESSION_PASSWORDS_PREFIX}${box.id}`);
        if (sessionPass) {
          return {
            ...box,
            smtp: {
              ...box.smtp,
              pass: sessionPass,
            },
          };
        }
      }
      return box;
    });
  } catch (e) {
    console.error('Błąd odczytu zapisanych skrzynek:', e);
    return [];
  }
}

/**
 * Zapisuje listę skrzynek.
 * Jeśli włączony jest tryb bezpieczny (hasła tylko w sesji), hasło nie trafia do trwałego localStorage.
 */
export function saveMailboxes(boxes: MailboxAccount[]): void {
  try {
    const privacy = getPrivacySettings();
    const sanitizedBoxes = boxes.map((box) => {
      if (box.type === 'smtp' && box.smtp) {
        if (privacy.storePasswordsInSessionOnly) {
          // Zapisz hasło tylko w bieżącej sesji przeglądarki
          sessionStorage.setItem(`${SESSION_PASSWORDS_PREFIX}${box.id}`, box.smtp.pass || '');
          // W localStorage zapisz pusty string
          return {
            ...box,
            smtp: {
              ...box.smtp,
              pass: '',
            },
          };
        } else {
          // Wyczyść sesyjną kopię jeśli zapisujemy trwale
          sessionStorage.removeItem(`${SESSION_PASSWORDS_PREFIX}${box.id}`);
        }
      }
      return box;
    });

    localStorage.setItem(MAILBOXES_STORAGE_KEY, JSON.stringify(sanitizedBoxes));
  } catch (e) {
    console.error('Błąd zapisu skrzynek:', e);
  }
}

/**
 * Pobiera ID aktualnie wybranej skrzynki pocztowej.
 */
export function getActiveMailboxId(): string | null {
  return localStorage.getItem(ACTIVE_MAILBOX_ID_KEY);
}

/**
 * Ustawia aktywną skrzynkę pocztową.
 */
export function setActiveMailboxId(id: string): void {
  localStorage.setItem(ACTIVE_MAILBOX_ID_KEY, id);
}

/**
 * Dodaje lub aktualizuje skrzynkę w pamięci.
 */
export function upsertMailbox(account: MailboxAccount): MailboxAccount[] {
  const current = getSavedMailboxes();
  const index = current.findIndex((b) => b.id === account.id);
  let updated: MailboxAccount[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = account;
  } else {
    updated = [...current, account];
  }
  saveMailboxes(updated);
  setActiveMailboxId(account.id);

  // Audyt RODO: Rejestracja konfiguracji skrzynki
  addRodoAuditLog({
    action: 'SMTP_CONFIG_SAVED',
    title: 'Zapisano konfigurację skrzynki pocztowej',
    description: `Skonfigurowano konto pocztowe typu ${account.type.toUpperCase()}: ${account.email}`,
    userOrSender: account.email,
  });

  return updated;
}

/**
 * Usuwa wskazaną skrzynkę pocztową.
 */
export function removeMailbox(id: string): MailboxAccount[] {
  const current = getSavedMailboxes();
  const removedBox = current.find((b) => b.id === id);
  const updated = current.filter((b) => b.id !== id);
  sessionStorage.removeItem(`${SESSION_PASSWORDS_PREFIX}${id}`);
  saveMailboxes(updated);

  if (getActiveMailboxId() === id) {
    if (updated.length > 0) {
      setActiveMailboxId(updated[0].id);
    } else {
      localStorage.removeItem(ACTIVE_MAILBOX_ID_KEY);
    }
  }

  // Audyt RODO: Rejestracja usunięcia skrzynki
  if (removedBox) {
    addRodoAuditLog({
      action: 'SMTP_CONFIG_REMOVED',
      title: 'Usunięto konfigurację skrzynki pocztowej',
      description: `Usunięto profil skrzynki pocztowej: ${removedBox.email}`,
      userOrSender: removedBox.email,
    });
  }

  return updated;
}

/**
 * Pomocnik: sugeruje host SMTP i port na podstawie wpisanego adresu e-mail (np. xyz@nazwafirmy.pl -> mail.nazwafirmy.pl)
 */
export function guessSmtpSettingsFromEmail(email: string): Partial<SmtpConfig> {
  const parts = email.split('@');
  if (parts.length !== 2) return { port: 465, secure: true };
  const domain = parts[1].toLowerCase().trim();

  // Popularne domeny
  if (domain === 'gmail.com') {
    return { host: 'smtp.gmail.com', port: 465, secure: true, user: email };
  }
  if (domain === 'wp.pl') {
    return { host: 'smtp.wp.pl', port: 465, secure: true, user: email };
  }
  if (domain === 'o2.pl') {
    return { host: 'poczta.o2.pl', port: 465, secure: true, user: email };
  }
  if (domain === 'onet.pl' || domain === 'op.pl' || domain === 'poczta.onet.pl') {
    return { host: 'smtp.poczta.onet.pl', port: 465, secure: true, user: email };
  }
  if (domain === 'interia.pl' || domain === 'poczta.fm') {
    return { host: 'poczta.interia.pl', port: 465, secure: true, user: email };
  }
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'office365.com') {
    return { host: 'smtp.office365.com', port: 587, secure: false, user: email };
  }

  // Domyślna konwencja dla firmowych domen (np. mail.nazwafirmy.pl lub smtp.nazwafirmy.pl)
  return {
    host: `mail.${domain}`,
    port: 465,
    secure: true,
    user: email,
  };
}

/**
 * Weryfikacja połączenia z serwerem SMTP przez backend API.
 */
export async function verifySmtpConnection(smtp: SmtpConfig): Promise<SmtpVerifyResponse> {
  try {
    const res = await fetch('/api/smtp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(smtp),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        message: data.message || data.error || 'Weryfikacja serwera SMTP nie powiodła się.',
        details: data.details,
        code: data.code,
      };
    }
    return {
      success: true,
      message: data.message || 'Połączenie z serwerem SMTP powiodło się!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Brak łączności z serwerem aplikacji lub błąd sieciowy.',
      details: err?.message,
    };
  }
}

/**
 * Konwertuje Uint8Array do Base64 bez problemów z limitem argumentów stosu
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
 * Wysyła e-mail z załącznikami PDF przez konto SMTP (firmowe).
 */
export async function sendEmailViaSmtp(params: {
  smtp: SmtpConfig;
  senderEmail: string;
  senderName?: string;
  recipientEmail: string;
  ccEmail?: string;
  replyTo?: string;
  subject: string;
  messageBody: string;
  contracts: PolicyContract[];
}): Promise<SmtpSendResponse> {
  try {
    // Przygotowanie załączników
    const attachments = params.contracts.map((contract) => {
      if (!contract.pdfBytes) {
        throw new Error(`Brak wygenerowanego pliku binarnego PDF dla polisy: ${contract.customFilename}`);
      }
      return {
        filename: contract.customFilename,
        contentBase64: uint8ArrayToBase64(contract.pdfBytes),
      };
    });

    const payload = {
      smtp: params.smtp,
      senderEmail: params.senderEmail,
      senderName: params.senderName,
      recipientEmail: params.recipientEmail,
      ccEmail: params.ccEmail,
      replyTo: params.replyTo,
      subject: params.subject,
      messageBody: params.messageBody,
      attachments,
    };

    const res = await fetch('/api/smtp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Nie udało się wysłać wiadomości przez serwer SMTP.',
        code: data.code,
      };
    }

    // Rejestracja wysyłki w Rejestrze Audytowym RODO
    addRodoAuditLog({
      action: 'EMAIL_SENT',
      title: 'Wysłano e-mail z załącznikami PDF (SMTP)',
      description: `Wysłano ${params.contracts.length} polis na adres ${params.recipientEmail}`,
      userOrSender: params.senderEmail,
      recipient: params.recipientEmail,
      itemCount: params.contracts.length,
    });

    return {
      success: true,
      messageId: data.messageId,
      response: data.response,
    };
  } catch (err: any) {
    console.error('Błąd wysyłki SMTP:', err);
    return {
      success: false,
      error: err?.message || 'Błąd sieciowy podczas wysyłania przez SMTP.',
    };
  }
}
