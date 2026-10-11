import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  LogOut,
  FileText,
  UserCheck,
  CheckSquare,
  Square,
  Sparkles,
  Info,
  ExternalLink,
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';
import { User } from 'firebase/auth';
import { PolicyContract } from '../types/policy';
import { googleSignIn, logoutGoogle, getAccessToken } from '../utils/firebaseAuth';
import { sendEmailWithPdfAttachments, SendEmailResult } from '../utils/gmailSender';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contracts: PolicyContract[];
  currentUser: User | null;
  onUserChange: (user: User | null) => void;
}

const RECIPIENT_STORAGE_KEY = 'polisasplit_recipient_email';
const SENDER_NOTE_KEY = 'polisasplit_email_note';
const SEND_CC_KEY = 'polisasplit_send_cc';

export const EmailModal: React.FC<EmailModalProps> = ({
  isOpen,
  onClose,
  contracts,
  currentUser,
  onUserChange
}) => {
  // Stan konfiguracji odbiorcy
  const [recipientEmail, setRecipientEmail] = useState<string>(() => {
    return localStorage.getItem(RECIPIENT_STORAGE_KEY) || '';
  });

  // Kopia DW do samego siebie (ułatwia natychmiastową weryfikację dostarczenia)
  const [sendCopyToMe, setSendCopyToMe] = useState<boolean>(() => {
    const saved = localStorage.getItem(SEND_CC_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  // Wybór załączników (domyślnie zaznaczone wszystkie)
  const [selectedContractIds, setSelectedContractIds] = useState<Set<string>>(() => {
    return new Set(contracts.map((c) => c.id));
  });

  const [subject, setSubject] = useState<string>('');
  const [messageNote, setMessageNote] = useState<string>(() => {
    return (
      localStorage.getItem(SENDER_NOTE_KEY) ||
      'Dzień dobry,\n\nw załączeniu przesyłam wyodrębnione polisy ubezpieczeniowe dla wybranych pojazdów.\n\nPozdrawiam,\nZespół PolisaSplit'
    );
  });

  // Stany wysyłki i logowania
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [successResult, setSuccessResult] = useState<SendEmailResult | null>(null);

  // Stan modala potwierdzenia operacji wysyłki
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Synchronizacja listy umów
  useEffect(() => {
    if (contracts.length > 0) {
      setSelectedContractIds(new Set(contracts.map((c) => c.id)));
      const platesSample = contracts
        .slice(0, 3)
        .map((c) => c.registrationNumber)
        .filter((p) => p && !p.startsWith('POLISA'))
        .join(', ');

      const titleSuffix = platesSample ? ` (${platesSample}${contracts.length > 3 ? '...' : ''})` : '';
      setSubject(`Polisy ubezpieczeniowe pojazdów${titleSuffix}`);
    }
  }, [contracts]);

  // Zapisywanie zapamiętanego odbiorcy w localStorage
  const handleRecipientChange = (val: string) => {
    setRecipientEmail(val);
    localStorage.setItem(RECIPIENT_STORAGE_KEY, val);
  };

  const handleCcChange = (checked: boolean) => {
    setSendCopyToMe(checked);
    localStorage.setItem(SEND_CC_KEY, String(checked));
  };

  const handleNoteChange = (val: string) => {
    setMessageNote(val);
    localStorage.setItem(SENDER_NOTE_KEY, val);
  };

  // Toggle pojedynczej umowy
  const toggleSelect = (id: string) => {
    const next = new Set(selectedContractIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedContractIds(next);
  };

  // Zaznacz wszystkie / odznacz
  const toggleSelectAll = () => {
    if (selectedContractIds.size === contracts.length) {
      setSelectedContractIds(new Set());
    } else {
      setSelectedContractIds(new Set(contracts.map((c) => c.id)));
    }
  };

  // Logowanie przez Google
  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMessage(null);
    setIsAuthError(false);
    try {
      const res = await googleSignIn();
      onUserChange(res.user);
    } catch (err: any) {
      console.error('Błąd logowania:', err);
      setErrorMessage(
        err?.message || 'Nie udało się połączyć konta Google. Upewnij się, że okno logowania nie zostało zablokowane w przeglądarce.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Rozłączenie konta
  const handleGoogleLogout = async () => {
    try {
      await logoutGoogle();
      onUserChange(null);
      setSuccessResult(null);
    } catch (err) {
      console.error('Błąd wylogowania:', err);
    }
  };

  const selectedContracts = contracts.filter((c) => selectedContractIds.has(c.id));

  // Walidacja przed otwarciem dialogu potwierdzenia
  const handleInitiateSend = () => {
    setErrorMessage(null);
    setIsAuthError(false);
    setSuccessResult(null);

    if (!currentUser) {
      setErrorMessage('Połącz najpierw swoje konto Google (Gmail), aby móc wysłać wiadomość.');
      return;
    }

    const trimmedRecipients = recipientEmail
      .split(/[;,]+/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    if (trimmedRecipients.length === 0) {
      setErrorMessage('Wprowadź docelowy adres e-mail odbiorcy w polu "Adres e-mail odbiorcy".');
      return;
    }

    const invalidEmails = trimmedRecipients.filter((r) => !r.includes('@') || !r.includes('.'));
    if (invalidEmails.length > 0) {
      setErrorMessage(`Niepoprawny format adresu e-mail: ${invalidEmails.join(', ')}. Sprawdź pisownię.`);
      return;
    }

    if (selectedContracts.length === 0) {
      setErrorMessage('Zaznacz co najmniej jedną polisę PDF do załączenia w wiadomości.');
      return;
    }

    // Wyświetlamy modal potwierdzenia
    setShowConfirmModal(true);
  };

  // Rzeczywista wysyłka po potwierdzeniu przez użytkownika
  const handleConfirmAndSend = async () => {
    setShowConfirmModal(false);
    setIsSending(true);
    setErrorMessage(null);
    setIsAuthError(false);
    setSuccessResult(null);

    try {
      let token = await getAccessToken();
      if (!token) {
        // Jeśli sesja wygasła lub token nie jest w pamięci, ponów logowanie
        const res = await googleSignIn();
        token = res.accessToken;
        onUserChange(res.user);
      }

      const senderEmailAddr = currentUser?.email || '';
      const cc = sendCopyToMe && senderEmailAddr ? senderEmailAddr : undefined;

      const result = await sendEmailWithPdfAttachments({
        accessToken: token,
        senderEmail: senderEmailAddr,
        senderName: currentUser?.displayName || undefined,
        recipientEmail: recipientEmail.trim(),
        ccEmail: cc,
        subject: subject.trim() || 'Polisy ubezpieczeniowe',
        messageBody: messageNote,
        contracts: selectedContracts
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Wystąpił problem podczas wysyłania e-maila.');
        if (result.isAuthError) {
          setIsAuthError(true);
        }
      } else {
        setSuccessResult(result);
      }
    } catch (err: any) {
      console.error('Błąd wysyłki:', err);
      setErrorMessage(
        err?.message || 'Nie udało się wysłać wiadomości e-mail. Sprawdź połączenie z internetem i uprawnienia konta.'
      );
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Nagłówek modala */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">
                Wysyłka wygenerowanych polis przez e-mail
              </h3>
              <p className="text-xs text-slate-500">
                Wysyłaj pliki PDF bezpośrednio ze swojego połączonego konta Gmail (standard RFC 5322)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
            title="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ciało modala */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Komunikat błędu */}
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div>
                  <span className="font-bold block text-sm mb-0.5">Wystąpił problem z wysyłką</span>
                  <span className="leading-relaxed">{errorMessage}</span>
                </div>
                {isAuthError && (
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className="mt-1 px-3 py-1.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {isLoggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>Połącz konto ponownie</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Sukces wysyłki z precyzyjną diagnozą doręczenia */}
          {successResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold block text-sm text-emerald-950 mb-0.5">
                    Wiadomość została przekazana przez serwery Google i wysłana!
                  </span>
                  <p className="text-emerald-800 leading-relaxed">
                    Wysłano {selectedContracts.length} {selectedContracts.length === 1 ? 'plik PDF' : 'pliki PDF'} na adres:{' '}
                    <strong className="font-mono text-emerald-950">{recipientEmail.trim()}</strong>.
                    {sendCopyToMe && currentUser?.email && (
                      <span className="block mt-0.5 font-medium">
                        Kopia wiadomości (DW) została również wysłana na Twój adres:{' '}
                        <strong className="font-mono text-emerald-950">{currentUser.email}</strong>.
                      </span>
                    )}
                  </p>
                  {successResult.messageId && (
                    <div className="mt-1.5 text-[11px] text-emerald-700 font-mono">
                      Identyfikator Gmail: {successResult.messageId}
                    </div>
                  )}
                </div>
              </div>

              {/* Box instrukcji dla użytkownika gdy odbiorca nie widzi wiadomości */}
              <div className="p-3 bg-white/80 border border-emerald-200/80 rounded-lg space-y-2 text-slate-700">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  <span>Dlaczego odbiorca może nie widzieć wiadomości od razu?</span>
                </div>
                <ul className="space-y-1.5 pl-5 list-disc text-[11.5px] leading-relaxed text-slate-600">
                  <li>
                    <strong>Folder SPAM / Oferty / Inne:</strong> Jeśli wysyłasz do tego odbiorcy po raz pierwszy z załącznikami PDF, filtry antyspamowe (np. WP, Onet, Gmail, Outlook) mogły umieścić wiadomość w folderze <em>SPAM</em>, <em>Oferty</em> lub <em>Kosz</em>. Poproś odbiorcę o sprawdzenie tych folderów.
                  </li>
                  <li>
                    <strong>Sprawdź swój folder „Wysłane”:</strong> Wiadomość znajduje się w Twojej skrzynce Gmail. Kliknij przycisk poniżej, aby otworzyć folder Wysłane i zweryfikować wysyłkę.
                  </li>
                  <li>
                    <strong>Zwrotka od serwera (Delivery Failure):</strong> Jeśli adres odbiorcy jest błędny lub jego skrzynka jest przepełniona, Google prześle powiadomienie <em>Mail Delivery Subsystem</em> do Twojej skrzynki odbiorczej.
                  </li>
                </ul>

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <a
                    href="https://mail.google.com/mail/u/0/#sent"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <span>Otwórz folder Wysłane w Gmail</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {sendCopyToMe && (
                    <a
                      href="https://mail.google.com/mail/u/0/#inbox"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors inline-flex items-center gap-1.5"
                    >
                      <span>Sprawdź swoją Skrzynkę Odbiorczą (Kopia DW)</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sekcja 1: Połączone konto nadawcy (Google / Gmail) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-blue-600" />
                <span>Twoje konto nadawcy (Gmail)</span>
              </label>
              {currentUser && (
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Połączono
                </span>
              )}
            </div>

            {currentUser ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200">
                <div className="flex items-center gap-3">
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.displayName || 'Użytkownik'}
                      className="w-9 h-9 rounded-full border border-slate-200"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                      {currentUser.email?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-slate-900 text-xs">
                      {currentUser.displayName || 'Konto Google'}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{currentUser.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleLogout}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-red-600 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-center"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Rozłącz / Zmień konto</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  Aby wysyłać wiadomości bezpośrednio ze swojej skrzynki, połącz konto Google. Możesz je w każdej chwili zmienić lub odłączyć.
                </p>
                {/* Oficjalny przycisk logowania Google */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs border border-slate-300 rounded-lg shadow-2xs hover:shadow-xs transition-all cursor-pointer inline-flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span>Łączenie z Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      </svg>
                      <span className="font-semibold">Połącz ze swoim kontem Google (Gmail)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Sekcja 2: Konfiguracja adresu docelowego odbiorcy i kopii */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="recipientEmailInput" className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span>Wpisz docelowy adres e-mail (odbiorca)</span>
                </label>
                <span className="text-[11px] text-slate-400">Adres jest zapamiętywany</span>
              </div>
              <input
                id="recipientEmailInput"
                type="text"
                value={recipientEmail}
                onChange={(e) => handleRecipientChange(e.target.value)}
                placeholder="np. klient@firma.pl lub kilka: biuro@ubezpieczenia.pl, jan@firma.pl"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <p className="text-[11px] text-slate-500">
                Możesz wpisać jeden adres lub kilka adresów oddzielonych przecinkami.
              </p>
            </div>

            {/* Opcja: Kopia DW na mój adres e-mail */}
            {currentUser && (
              <label className="flex items-center gap-2 p-2.5 bg-blue-50/60 hover:bg-blue-50 border border-blue-200/80 rounded-xl cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={sendCopyToMe}
                  onChange={(e) => handleCcChange(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <div className="text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">
                    Wyślij kopię (DW) na mój adres e-mail
                  </span>{' '}
                  <span className="text-slate-500 font-mono">({currentUser.email})</span>
                  <span className="block text-[11px] text-slate-500">
                    Zalecane: pozwala natychmiast sprawdzić w swojej skrzynce, że wiadomość i pliki PDF dotarły.
                  </span>
                </div>
              </label>
            )}
          </div>

          {/* Sekcja 3: Temat i treść wiadomości */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label htmlFor="emailSubjectInput" className="text-xs font-semibold text-slate-700 block mb-1">
                Temat wiadomości:
              </label>
              <input
                id="emailSubjectInput"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Temat wiadomości..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="emailBodyInput" className="text-xs font-semibold text-slate-700 block mb-1">
                Treść wiadomości:
              </label>
              <textarea
                id="emailBodyInput"
                rows={3}
                value={messageNote}
                onChange={(e) => handleNoteChange(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          {/* Sekcja 4: Wybór plików PDF do wysłania */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Wybierz pliki do wysłania ({selectedContracts.length} z {contracts.length})</span>
              </span>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
              >
                {selectedContractIds.size === contracts.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
              </button>
            </div>

            <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50 p-1">
              {contracts.map((contract) => {
                const isSelected = selectedContractIds.has(contract.id);
                return (
                  <label
                    key={contract.id}
                    onClick={() => toggleSelect(contract.id)}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/70 text-slate-900' : 'hover:bg-slate-100/80 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="text-blue-600">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="truncate">
                        <span className="font-bold font-mono text-xs text-slate-800">
                          {contract.customFilename}
                        </span>
                        {contract.insurerName && (
                          <span className="text-[11px] text-slate-500 ml-2">
                            ({contract.insurerName})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono shrink-0 pl-2">
                      {contract.pageCount} {contract.pageCount === 1 ? 'strona' : 'strony'}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stopka modala */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Bezpieczne połączenie OAuth z Gmail API (RFC 5322)</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Zamknij
            </button>
            <button
              type="button"
              onClick={handleInitiateSend}
              disabled={isSending || selectedContracts.length === 0}
              className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Wysyłanie plików...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Wyślij {selectedContracts.length} {selectedContracts.length === 1 ? 'plik' : 'plików'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Okno dialogowe potwierdzenia wysyłki (Zgodnie z wymaganiami bezpieczeństwa OAuth) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Potwierdzenie wysyłki e-mail</h4>
                <p className="text-xs text-slate-500">Upewnij się przed wysłaniem plików</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Nadawca:</span>
                <span className="font-semibold text-slate-900 font-mono">{currentUser?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Odbiorca:</span>
                <span className="font-semibold text-blue-700 font-mono">{recipientEmail}</span>
              </div>
              {sendCopyToMe && currentUser?.email && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Kopia DW:</span>
                  <span className="font-semibold text-slate-700 font-mono">{currentUser.email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Liczba załączników PDF:</span>
                <span className="font-bold text-slate-900">{selectedContracts.length} pliki</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Temat:</span>
                <span className="font-medium text-slate-800 truncate max-w-[200px]">{subject}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Wiadomość z załączonymi umowami ubezpieczenia zostanie natychmiast wysłana z Twojej skrzynki pocztowej. Czy chcesz kontynuować?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSend}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Tak, wyślij teraz</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
