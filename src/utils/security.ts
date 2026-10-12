import { RodoAuditLogEntry, RodoActionType, SecurityPrivacySettings } from '../types/security';

const RODO_AUDIT_LOGS_KEY = 'polisasplit_rodo_audit_logs_v1';
const PRIVACY_SETTINGS_KEY = 'polisasplit_privacy_settings_v1';

export const DEFAULT_PRIVACY_SETTINGS: SecurityPrivacySettings = {
  screenPrivacyMode: false,
  storePasswordsInSessionOnly: false,
  requireSendConfirmation: true,
};

/**
 * Pobiera bieżące ustawienia prywatności i bezpieczeństwa.
 */
export function getPrivacySettings(): SecurityPrivacySettings {
  try {
    const raw = localStorage.getItem(PRIVACY_SETTINGS_KEY);
    if (!raw) return DEFAULT_PRIVACY_SETTINGS;
    return { ...DEFAULT_PRIVACY_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return DEFAULT_PRIVACY_SETTINGS;
  }
}

/**
 * Zapisuje ustawienia prywatności i bezpieczeństwa.
 */
export function savePrivacySettings(settings: Partial<SecurityPrivacySettings>): SecurityPrivacySettings {
  try {
    const current = getPrivacySettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(PRIVACY_SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    return DEFAULT_PRIVACY_SETTINGS;
  }
}

/**
 * Zamaskowanie adresu e-mail (np. jan.kowalski@firma.pl -> j***i@firma.pl)
 * Zgodnie z zasadą minimalizacji danych (art. 5 ust. 1 lit. c RODO).
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  const parts = email.trim().split('@');
  if (parts.length !== 2) return '***';
  const [user, domain] = parts;
  if (user.length <= 2) {
    return `${user[0] || '*'}***@${domain}`;
  }
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

/**
 * Zamaskowanie numeru VIN (np. WVWZZZ1KZ9W123456 -> WVW*********3456)
 */
export function maskVin(vin: string): string {
  if (!vin || typeof vin !== 'string') return '';
  const clean = vin.trim();
  if (clean.length < 8) return '********';
  return `${clean.slice(0, 3)}${'*'.repeat(Math.max(4, clean.length - 7))}${clean.slice(-4)}`;
}

/**
 * Zamaskowanie nazwiska / imienia ubezpieczonego (np. Jan Kowalski -> J** K*******)
 */
export function maskPersonName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  const words = name.trim().split(/\s+/);
  return words
    .map((w) => {
      if (w.length <= 2) return `${w[0]}*`;
      return `${w[0]}${'*'.repeat(w.length - 1)}`;
    })
    .join(' ');
}

/**
 * Zamaskowanie numeru PESEL (np. 85010212345 -> 850102***** lub ***********)
 */
export function maskPesel(pesel: string): string {
  if (!pesel || typeof pesel !== 'string') return '';
  const clean = pesel.trim();
  if (clean.length !== 11) return '***********';
  return `${clean.slice(0, 6)}*****`;
}

/**
 * Pobiera wpisy z lokalnego Rejestru Czynności Przetwarzania (Art. 30 RODO).
 */
export function getRodoAuditLogs(): RodoAuditLogEntry[] {
  try {
    const raw = localStorage.getItem(RODO_AUDIT_LOGS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

/**
 * Dodaje wpis do lokalnego Rejestru Czynności Przetwarzania (Art. 30 RODO).
 * Zachowuje maksymalnie 100 ostatnich wpisów, zapobiegając nadmiernemu zapełnianiu pamięci.
 */
export function addRodoAuditLog(params: {
  action: RodoActionType;
  title: string;
  description: string;
  legalBasis?: string;
  userOrSender?: string;
  recipient?: string;
  itemCount?: number;
}): void {
  try {
    const logs = getRodoAuditLogs();
    const entry: RodoAuditLogEntry = {
      id: `rodo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      action: params.action,
      title: params.title,
      description: params.description,
      legalBasis: params.legalBasis || 'Art. 6 ust. 1 lit. b RODO (wykonanie umowy / zleconej operacji)',
      userOrSender: params.userOrSender ? maskEmail(params.userOrSender) : undefined,
      recipient: params.recipient ? maskEmail(params.recipient) : undefined,
      itemCount: params.itemCount,
      ipNotice: 'Przetwarzanie lokalne (Klient)',
    };

    const updated = [entry, ...logs].slice(0, 100);
    localStorage.setItem(RODO_AUDIT_LOGS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Nie udało się zapisać wpisu audytowego RODO:', e);
  }
}

/**
 * Czyści rejestr czynności przetwarzania.
 */
export function clearRodoAuditLogs(): void {
  try {
    localStorage.removeItem(RODO_AUDIT_LOGS_KEY);
  } catch (e) {
    // cichy fallback
  }
}

/**
 * Eksport rejestru RODO do formatu JSON.
 */
export function exportAuditLogsAsJson(): string {
  const logs = getRodoAuditLogs();
  return JSON.stringify(
    {
      system: 'PolisaSplit',
      exportDate: new Date().toISOString(),
      standard: 'RODO / GDPR Art. 30 (Rejestr Czynności Przetwarzania)',
      totalEntries: logs.length,
      logs,
    },
    null,
    2
  );
}

/**
 * Eksport rejestru RODO do czytelnego raportu tekstowego TXT.
 */
export function exportAuditLogsAsText(): string {
  const logs = getRodoAuditLogs();
  const header = `========================================================================\n` +
    `POLISASPLIT - REJESTR CZYNNOŚCI PRZETWARZANIA (ART. 30 RODO)\n` +
    `Data wygenerowania raportu: ${new Date().toLocaleString('pl-PL')}\n` +
    `Liczba zarejestrowanych operacji: ${logs.length}\n` +
    `Podstawa prawna: Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2016/679\n` +
    `========================================================================\n\n`;

  if (logs.length === 0) {
    return header + 'Brak zarejestrowanych operacji w bieżącym rejestrze.\n';
  }

  const entriesText = logs
    .map((log, index) => {
      const dt = new Date(log.timestamp).toLocaleString('pl-PL');
      return `[${index + 1}] ${dt} - ${log.action}\n` +
        `  Tytuł: ${log.title}\n` +
        `  Opis: ${log.description}\n` +
        `  Podstawa prawna: ${log.legalBasis}\n` +
        (log.userOrSender ? `  Nadawca/Operator: ${log.userOrSender}\n` : '') +
        (log.recipient ? `  Odbiorca: ${log.recipient}\n` : '') +
        (log.itemCount !== undefined ? `  Liczba elementów: ${log.itemCount}\n` : '') +
        `------------------------------------------------------------------------`;
    })
    .join('\n\n');

  return header + entriesText;
}

/**
 * Całkowite wyczyszczenie wszystkich danych aplikacji z pamięci przeglądarki
 * (Realizacja Prawa do Bycia Zapomnianym - Art. 17 RODO).
 */
export function purgeAllApplicationData(): { clearedKeysCount: number } {
  let clearedCount = 0;
  try {
    // 1. Czyszczenie kluczy localStorage PolisaSplit
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('polisasplit_') || key.includes('firebase:authUser'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
      clearedCount++;
    });

    // 2. Czyszczenie sessionStorage
    sessionStorage.clear();
  } catch (e) {
    console.error('Błąd podczas czyszczenia danych RODO:', e);
  }

  return { clearedKeysCount: clearedCount };
}

/**
 * Walidacja adresu e-mail zgodna ze standardem RFC 5322
 */
export function isValidEmailAddress(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim();
  if (clean.length > 254) return false;
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return regex.test(clean);
}
