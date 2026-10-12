export type RodoActionType =
  | 'FILE_LOADED'
  | 'POLICIES_SPLIT'
  | 'ZIP_EXPORTED'
  | 'SINGLE_PDF_DOWNLOADED'
  | 'SMTP_CONFIG_SAVED'
  | 'SMTP_CONFIG_REMOVED'
  | 'EMAIL_SENT'
  | 'DATA_PURGED'
  | 'SETTINGS_CHANGED';

export interface RodoAuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  action: RodoActionType;
  title: string;
  description: string;
  legalBasis: string; // np. 'Art. 6 ust. 1 lit. b RODO'
  userOrSender?: string; // zamaskowany e-mail
  recipient?: string; // zamaskowany e-mail
  itemCount?: number;
  ipNotice?: string;
}

export interface SecurityPrivacySettings {
  screenPrivacyMode: boolean; // maskowanie danych poufnych na ekranie
  storePasswordsInSessionOnly: boolean; // hasła SMTP tylko w pamięci sesji (SessionStorage) zamiast LocalStorage
  requireSendConfirmation: boolean; // dodatkowa weryfikacja przed wysyłką e-mail
}
