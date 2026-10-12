import React from 'react';
import { ShieldCheck, HelpCircle, Lock, Mail, Building2, CheckCircle2 } from 'lucide-react';
import { User } from 'firebase/auth';
import { MailboxAccount } from '../types/mailbox';

interface HeaderProps {
  onOpenHelp: () => void;
  onOpenPrivacy: () => void;
  currentUser: User | null;
  activeMailbox?: MailboxAccount | null;
  onOpenEmailSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenHelp,
  onOpenPrivacy,
  currentUser,
  activeMailbox,
  onOpenEmailSettings
}) => {
  // Określamy etykietę i styl wyświetlanego konta e-mail
  const isSmtp = activeMailbox?.type === 'smtp';
  const isGoogle = activeMailbox?.type === 'google' || (!activeMailbox && !!currentUser);
  const displayEmail = activeMailbox?.email || currentUser?.email;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Zone 1: Brand wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-xs">
              PS
            </div>
            <a
              href="/"
              className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap hover:text-blue-600 transition-colors"
            >
              PolisaSplit
            </a>
          </div>

          {/* Zone 2: Navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={onOpenHelp}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 text-left cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span>Zasady podziału</span>
            </button>
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 text-left cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>RODO i Prywatność</span>
            </button>
          </nav>

          {/* Zone 3: User Email status & Security Badge */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Przycisk statusu konta e-mail */}
            <button
              type="button"
              onClick={onOpenEmailSettings}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                displayEmail
                  ? isSmtp
                    ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                    : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title={
                displayEmail
                  ? `Aktywna skrzynka nadawcza: ${displayEmail} (${isSmtp ? 'Własny serwer SMTP' : 'Konto Google'}). Kliknij, aby zarządzać skrzynkami.`
                  : 'Skonfiguruj skrzynkę pocztową (własną firmową lub Google) do wysyłki polis'
              }
            >
              {isSmtp ? (
                <Building2 className="w-3.5 h-3.5 text-purple-600" />
              ) : (
                <Mail className={`w-3.5 h-3.5 ${displayEmail ? 'text-blue-600' : 'text-slate-400'}`} />
              )}
              <span className="hidden sm:inline font-mono">
                {displayEmail ? displayEmail : 'Połącz skrzynkę e-mail'}
              </span>
              <span className="sm:hidden font-mono">
                {displayEmail ? displayEmail.split('@')[0] : 'E-mail'}
              </span>
              {displayEmail && (
                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0 hidden sm:inline" />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenPrivacy}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
              title="Aplikacja działa w trybie bezpiecznym z pełną zgodnością RODO (Client-Side). Kliknij, aby otworzyć Centrum Bezpieczeństwa."
            >
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tryb bezpieczny (RODO)</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
