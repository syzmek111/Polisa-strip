export type EmailProviderType = 'smtp' | 'google';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface MailboxAccount {
  id: string;
  type: EmailProviderType;
  name: string; // Np. "Firma (xyz@nazwafirmy.pl)" lub "Gmail"
  email: string; // Adres e-mail nadawcy
  senderDisplayName?: string; // Imię i nazwisko lub nazwa firmy
  replyTo?: string; // Opcjonalny adres Reply-To
  smtp?: SmtpConfig;
  isVerified?: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface SmtpVerifyResponse {
  success: boolean;
  message: string;
  code?: string;
  details?: string;
}

export interface SmtpSendResponse {
  success: boolean;
  messageId?: string;
  response?: string;
  error?: string;
  code?: string;
}
