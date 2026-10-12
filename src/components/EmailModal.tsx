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
  Plus,
  Trash2,
  Check,
  Building2,
  Server,
  KeyRound,
  Eye,
  EyeOff,
  Settings,
  RefreshCw,
  Edit2,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import { User } from 'firebase/auth';
import { PolicyContract } from '../types/policy';
import { MailboxAccount, SmtpConfig } from '../types/mailbox';
import { googleSignIn, logoutGoogle, getAccessToken } from '../utils/firebaseAuth';
import { sendEmailWithPdfAttachments, SendEmailResult } from '../utils/gmailSender';
import {
  getSavedMailboxes,
  saveMailboxes,
  getActiveMailboxId,
  setActiveMailboxId,
  upsertMailbox,
  removeMailbox,
  guessSmtpSettingsFromEmail,
  verifySmtpConnection,
  sendEmailViaSmtp
} from '../utils/mailboxManager';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contracts: PolicyContract[];
  currentUser: User | null;
  onUserChange: (user: User | null) => void;
  onActiveMailboxChange?: (mailbox: MailboxAccount | null) => void;
}

const RECIPIENT_STORAGE_KEY = 'polisasplit_recipient_email';
const SENDER_NOTE_KEY = 'polisasplit_email_note';
const SEND_CC_KEY = 'polisasplit_send_cc';

export const EmailModal: React.FC<EmailModalProps> = ({
  isOpen,
  onClose,
  contracts,
  currentUser,
  onUserChange,
  onActiveMailboxChange
}) => {
  // Nawigacja w modalu: 'send' (formularz wysyłki) lub 'manage' (zarządzanie skrzynkami)
  const [activeTab, setActiveTab] = useState<'send' | 'manage'>('send');

  // Lista zapisanych skrzynek
  const [mailboxes, setMailboxes] = useState<MailboxAccount[]>(() => getSavedMailboxes());
  const [activeMailboxId, setActiveMailboxIdState] = useState<string | null>(() => getActiveMailboxId());

  // Formularz dodawania/edycji skrzynki SMTP
  const [isAddingSmtp, setIsAddingSmtp] = useState(false);
  const [editingMailboxId, setEditingMailboxId] = useState<string | null>(null);
  const [smtpFormName, setSmtpFormName] = useState('');
  const [smtpFormEmail, setSmtpFormEmail] = useState('');
  const [smtpFormSenderName, setSmtpFormSenderName] = useState('');
  const [smtpFormHost, setSmtpFormHost] = useState('');
  const [smtpFormPort, setSmtpFormPort] = useState<number>(465);
  const [smtpFormSecure, setSmtpFormSecure] = useState<boolean>(true);
  const [smtpFormUser, setSmtpFormUser] = useState('');
  const [smtpFormPass, setSmtpFormPass] = useState('');
  const [smtpFormReplyTo, setSmtpFormReplyTo] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status testowania połączenia SMTP
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Stan konfiguracji odbiorcy
  const [recipientEmail, setRecipientEmail] = useState<string>(() => {
    return localStorage.getItem(RECIPIENT_STORAGE_KEY) || '';
  });

  // Kopia DW
  const [sendCopyToMe, setSendCopyToMe] = useState<boolean>(() => {
    const saved = localStorage.getItem(SEND_CC_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  // Wybór załączników
  const [selectedContractIds, setSelectedContractIds] = useState<Set<string>>(() => {
    return new Set(contracts.map((c) => c.id));
  });

  const [subject, setSubject] = useState<string>('');
  const [messageNote, setMessageNote] = useState<string>(() => {
    return (
      localStorage.getItem(SENDER_NOTE_KEY) ||
      'Dzień dobry,\n\nw załączeniu przesyłam wyodrębnione polisy ubezpieczeniowe dla wybranych pojazdów.\n\nPozdrawiam,\nZespół Obsługi Polis'
    );
  });

  // Stany wysyłki i błędów
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    senderType: 'smtp' | 'google';
    senderEmail: string;
    recipientEmail: string;
    messageId?: string;
    contractsCount: number;
    responseDetails?: string;
  } | null>(null);

  // Modal potwierdzenia
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [rodoConsentChecked, setRodoConsentChecked] = useState(false);

  // Synchronizacja konta Google z listą skrzynek
  useEffect(() => {
    if (currentUser?.email) {
      const googleBoxId = `google_${currentUser.uid}`;
      setMailboxes((prev) => {
        const exists = prev.some((b) => b.id === googleBoxId || (b.type === 'google' && b.email === currentUser.email));
        if (!exists) {
          const newGoogleBox: MailboxAccount = {
            id: googleBoxId,
            type: 'google',
            name: `Google (${currentUser.email})`,
            email: currentUser.email!,
            senderDisplayName: currentUser.displayName || undefined,
            isVerified: true,
            createdAt: new Date().toISOString()
          };
          const updated = [...prev, newGoogleBox];
          saveMailboxes(updated);
          return updated;
        }
        return prev;
      });
    }
  }, [currentUser]);

  // Pobranie aktualnej skrzynki
  const activeMailbox: MailboxAccount | null = React.useMemo(() => {
    if (activeMailboxId) {
      const found = mailboxes.find((b) => b.id === activeMailboxId);
      if (found) return found;
    }
    // Fallback: pierwsza zapisana skrzynka lub zalogowany użytkownik Google
    if (mailboxes.length > 0) return mailboxes[0];
    if (currentUser?.email) {
      return {
        id: `google_${currentUser.uid}`,
        type: 'google',
        name: `Google (${currentUser.email})`,
        email: currentUser.email,
        senderDisplayName: currentUser.displayName || undefined,
        isVerified: true,
        createdAt: new Date().toISOString()
      };
    }
    return null;
  }, [activeMailboxId, mailboxes, currentUser]);

  // Powiadomienie komponentu nadrzędnego o aktywnej skrzynce
  useEffect(() => {
    if (onActiveMailboxChange) {
      onActiveMailboxChange(activeMailbox);
    }
  }, [activeMailbox, onActiveMailboxChange]);

  // Synchronizacja tematu i załączników
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

  // Obsługa zapisu preferencji
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

  // Zmiana zaznaczenia pojedynczego pliku
  const toggleSelect = (id: string) => {
    const next = new Set(selectedContractIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedContractIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedContractIds.size === contracts.length) {
      setSelectedContractIds(new Set());
    } else {
      setSelectedContractIds(new Set(contracts.map((c) => c.id)));
    }
  };

  // Zmiana aktywnej skrzynki
  const handleSelectActiveMailbox = (boxId: string) => {
    setActiveMailboxId(boxId);
    setActiveMailboxIdState(boxId);
    setErrorMessage(null);
  };

  // Autouzupełnianie ustawień SMTP po wpisaniu adresu e-mail (np. xyz@nazwafirmy.pl)
  const handleEmailInputChange = (val: string) => {
    setSmtpFormEmail(val);
    if (!smtpFormUser || smtpFormUser === smtpFormEmail) {
      setSmtpFormUser(val);
    }
    if (val.includes('@') && val.split('@')[1].includes('.')) {
      const guessed = guessSmtpSettingsFromEmail(val);
      if (guessed.host && !smtpFormHost) {
        setSmtpFormHost(guessed.host);
      }
      if (guessed.port !== undefined && smtpFormPort === 465) {
        setSmtpFormPort(guessed.port);
        setSmtpFormSecure(guessed.secure ?? true);
      }
      if (!smtpFormName) {
        setSmtpFormName(`Firmowa (${val})`);
      }
    }
  };

  // Rozpoczęcie edycji istniejącej skrzynki
  const handleStartEditMailbox = (box: MailboxAccount) => {
    setEditingMailboxId(box.id);
    setSmtpFormName(box.name);
    setSmtpFormEmail(box.email);
    setSmtpFormSenderName(box.senderDisplayName || '');
    setSmtpFormReplyTo(box.replyTo || '');
    if (box.smtp) {
      setSmtpFormHost(box.smtp.host);
      setSmtpFormPort(box.smtp.port);
      setSmtpFormSecure(box.smtp.secure);
      setSmtpFormUser(box.smtp.user);
      setSmtpFormPass(box.smtp.pass);
    }
    setSmtpTestResult(null);
    setIsAddingSmtp(true);
    setActiveTab('manage');
  };

  // Reset formularza dodawania skrzynki
  const handleResetSmtpForm = () => {
    setIsAddingSmtp(false);
    setEditingMailboxId(null);
    setSmtpFormName('');
    setSmtpFormEmail('');
    setSmtpFormSenderName('');
    setSmtpFormHost('');
    setSmtpFormPort(465);
    setSmtpFormSecure(true);
    setSmtpFormUser('');
    setSmtpFormPass('');
    setSmtpFormReplyTo('');
    setSmtpTestResult(null);
  };

  // Test połączenia SMTP
  const handleTestSmtpConnection = async () => {
    if (!smtpFormHost || !smtpFormUser || !smtpFormPass) {
      setSmtpTestResult({
        success: false,
        message: 'Wypełnij pola: Serwer SMTP (host), Użytkownik / Login oraz Hasło przed uruchomieniem testu.'
      });
      return;
    }

    setIsTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await verifySmtpConnection({
        host: smtpFormHost.trim(),
        port: smtpFormPort,
        secure: smtpFormSecure,
        user: smtpFormUser.trim(),
        pass: smtpFormPass
      });
      setSmtpTestResult(res);
    } catch (err: any) {
      setSmtpTestResult({
        success: false,
        message: err?.message || 'Wystąpił błąd podczas testowania serwera SMTP.'
      });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  // Zapis skrzynki SMTP
  const handleSaveSmtpMailbox = async () => {
    if (!smtpFormEmail || !smtpFormEmail.includes('@')) {
      setErrorMessage('Wprowadź prawidłowy adres e-mail nadawcy (np. xyz@nazwafirmy.pl).');
      return;
    }
    if (!smtpFormHost) {
      setErrorMessage('Podaj adres serwera poczty wychodzącej SMTP (np. mail.nazwafirmy.pl).');
      return;
    }
    if (!smtpFormUser || !smtpFormPass) {
      setErrorMessage('Podaj login (użytkownika) oraz hasło do skrzynki.');
      return;
    }

    const boxId = editingMailboxId || `smtp_${Date.now()}`;
    const newBox: MailboxAccount = {
      id: boxId,
      type: 'smtp',
      name: smtpFormName.trim() || `Firmowa (${smtpFormEmail.trim()})`,
      email: smtpFormEmail.trim(),
      senderDisplayName: smtpFormSenderName.trim() || undefined,
      replyTo: smtpFormReplyTo.trim() || undefined,
      smtp: {
        host: smtpFormHost.trim(),
        port: smtpFormPort,
        secure: smtpFormSecure,
        user: smtpFormUser.trim(),
        pass: smtpFormPass
      },
      isVerified: smtpTestResult?.success ?? true,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    };

    const updated = upsertMailbox(newBox);
    setMailboxes(updated);
    setActiveMailboxIdState(boxId);
    handleResetSmtpForm();
    setActiveTab('send');
    setErrorMessage(null);
  };

  // Usuwanie skrzynki
  const handleDeleteMailbox = (boxId: string) => {
    const updated = removeMailbox(boxId);
    setMailboxes(updated);
    if (activeMailboxId === boxId) {
      setActiveMailboxIdState(updated[0]?.id || null);
    }
  };

  // Logowanie Google
  const handleGoogleLogin = async () => {
    setIsLoggingInGoogle(true);
    setErrorMessage(null);
    setIsAuthError(false);
    try {
      const res = await googleSignIn();
      onUserChange(res.user);
      const googleBoxId = `google_${res.user.uid}`;
      handleSelectActiveMailbox(googleBoxId);
    } catch (err: any) {
      console.error('Błąd logowania Google:', err);
      setErrorMessage(
        err?.message || 'Nie udało się połączyć konta Google. Upewnij się, że okno logowania nie zostało zablokowane.'
      );
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  // Wylogowanie Google
  const handleGoogleLogout = async () => {
    try {
      await logoutGoogle();
      onUserChange(null);
      if (currentUser?.uid) {
        handleDeleteMailbox(`google_${currentUser.uid}`);
      }
    } catch (err) {
      console.error('Błąd wylogowania Google:', err);
    }
  };

  const selectedContracts = contracts.filter((c) => selectedContractIds.has(c.id));

  // Inicjacja wysyłki
  const handleInitiateSend = () => {
    setErrorMessage(null);
    setIsAuthError(false);
    setSuccessInfo(null);

    if (!activeMailbox) {
      setErrorMessage(
        'Nie wybrano aktywnej skrzynki nadawczej. Skonfiguruj skrzynkę firmową (np. xyz@nazwafirmy.pl) lub połącz konto Google.'
      );
      setActiveTab('manage');
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

    setRodoConsentChecked(false);
    setShowConfirmModal(true);
  };

  // Właściwa wysyłka
  const handleConfirmAndSend = async () => {
    setShowConfirmModal(false);
    setIsSending(true);
    setErrorMessage(null);
    setIsAuthError(false);
    setSuccessInfo(null);

    if (!activeMailbox) {
      setErrorMessage('Brak aktywnej skrzynki nadawczej.');
      setIsSending(false);
      return;
    }

    try {
      const cc = sendCopyToMe ? activeMailbox.email : undefined;

      // WARIANT 1: Wysyłka przez własny serwer SMTP (skrzynka firmowa, np. xyz@nazwafirmy.pl)
      if (activeMailbox.type === 'smtp' && activeMailbox.smtp) {
        const smtpResult = await sendEmailViaSmtp({
          smtp: activeMailbox.smtp,
          senderEmail: activeMailbox.email,
          senderName: activeMailbox.senderDisplayName,
          recipientEmail: recipientEmail.trim(),
          ccEmail: cc,
          replyTo: activeMailbox.replyTo,
          subject: subject.trim() || 'Polisy ubezpieczeniowe pojazdów',
          messageBody: messageNote,
          contracts: selectedContracts
        });

        if (!smtpResult.success) {
          setErrorMessage(smtpResult.error || 'Wystąpił problem z wysyłką przez serwer SMTP.');
        } else {
          setSuccessInfo({
            senderType: 'smtp',
            senderEmail: activeMailbox.email,
            recipientEmail: recipientEmail.trim(),
            messageId: smtpResult.messageId,
            contractsCount: selectedContracts.length,
            responseDetails: smtpResult.response
          });
        }
      }
      // WARIANT 2: Wysyłka przez oficjalne Gmail REST API (Konto Google)
      else if (activeMailbox.type === 'google') {
        let token = await getAccessToken();
        if (!token) {
          const res = await googleSignIn();
          token = res.accessToken;
          onUserChange(res.user);
        }

        const gmailResult = await sendEmailWithPdfAttachments({
          accessToken: token,
          senderEmail: activeMailbox.email,
          senderName: activeMailbox.senderDisplayName,
          recipientEmail: recipientEmail.trim(),
          ccEmail: cc,
          replyTo: activeMailbox.replyTo,
          subject: subject.trim() || 'Polisy ubezpieczeniowe pojazdów',
          messageBody: messageNote,
          contracts: selectedContracts
        });

        if (!gmailResult.success) {
          setErrorMessage(gmailResult.error || 'Wystąpił błąd podczas wysyłania przez Gmail.');
          if (gmailResult.isAuthError) {
            setIsAuthError(true);
          }
        } else {
          setSuccessInfo({
            senderType: 'google',
            senderEmail: activeMailbox.email,
            recipientEmail: recipientEmail.trim(),
            messageId: gmailResult.messageId,
            contractsCount: selectedContracts.length
          });
        }
      }
    } catch (err: any) {
      console.error('Błąd w trakcie wysyłki wiadomości:', err);
      setErrorMessage(err?.message || 'Wystąpił nieoczekiwany błąd podczas wysyłania e-maila.');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Nagłówek modala z zakładkami */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">
                Wysyłka wygenerowanych polis przez e-mail
              </h3>
              <p className="text-xs text-slate-500">
                Wysyłaj pliki PDF ze swojej skrzynki firmowej (SMTP) lub konta Google
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* Przełącznik zakładek */}
            <div className="inline-flex p-1 bg-slate-200/80 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('send');
                  setIsAddingSmtp(false);
                }}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'send'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Wyślij pliki
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manage')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                  activeTab === 'manage'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Skrzynki pocztowe ({mailboxes.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              title="Zamknij"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Zawartość modala */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm flex-1">
          {/* Komunikat błędu */}
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <span className="font-bold block text-sm">Wystąpił problem</span>
                <span className="leading-relaxed block">{errorMessage}</span>
                {isAuthError && (
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoggingInGoogle}
                    className="mt-1 px-3 py-1.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {isLoggingInGoogle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>Zaloguj ponownie do Google</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Sukces wysyłki */}
          {successInfo && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold block text-sm text-emerald-950 mb-0.5">
                    Wiadomość została pomyślnie wysłana!
                  </span>
                  <p className="text-emerald-800 leading-relaxed">
                    Wysłano <strong>{successInfo.contractsCount}</strong> {successInfo.contractsCount === 1 ? 'plik PDF' : 'pliki PDF'} na adres:{' '}
                    <strong className="font-mono text-emerald-950">{successInfo.recipientEmail}</strong> z konta:{' '}
                    <strong className="font-mono text-emerald-950">{successInfo.senderEmail}</strong> ({successInfo.senderType === 'smtp' ? 'serwer SMTP' : 'Google'}).
                  </p>
                  {successInfo.messageId && (
                    <div className="mt-1 text-[11px] text-emerald-700 font-mono">
                      ID wiadomości: {successInfo.messageId}
                    </div>
                  )}
                </div>
              </div>

              {/* Informacja o folderze SPAM i weryfikacji */}
              <div className="p-3 bg-white/80 border border-emerald-200/80 rounded-lg space-y-1.5 text-slate-700">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  <span>Wskazówki doręczenia</span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-slate-600">
                  Jeśli odbiorca nie widzi wiadomości w skrzynce głównej, poproś o sprawdzenie folderów <strong>SPAM / Oferty / Inne</strong> (zwłaszcza gdy otrzymuje pliki PDF od nowego nadawcy).
                  {sendCopyToMe && (
                    <span className="block mt-1 font-medium text-emerald-800">
                      Kopia DW została wysłana na Twój adres e-mail ({successInfo.senderEmail}).
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* ZAKŁADKA 1: WYŚLIJ POLISY */}
          {/* ============================================================== */}
          {activeTab === 'send' && (
            <>
              {/* Wybór aktywnej skrzynki nadawczej */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    <span>Twoja skrzynka nadawcza</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('manage');
                      setIsAddingSmtp(true);
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Dodaj inną skrzynkę (np. firmową)</span>
                  </button>
                </div>

                {activeMailbox ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        activeMailbox.type === 'smtp' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {activeMailbox.type === 'smtp' ? (
                          <Building2 className="w-5 h-5" />
                        ) : (
                          <Mail className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                            {activeMailbox.name}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            activeMailbox.type === 'smtp'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {activeMailbox.type === 'smtp' ? 'SMTP (Firmowa)' : 'Google'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono truncate">
                          {activeMailbox.email}
                          {activeMailbox.smtp && (
                            <span className="text-slate-400 ml-1.5">
                              ({activeMailbox.smtp.host}:{activeMailbox.smtp.port})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => setActiveTab('manage')}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Zmień skrzynkę
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs space-y-3">
                    <div className="flex items-center gap-2 text-amber-900 font-bold">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Nie skonfigurowano jeszcze żadnej skrzynki nadawczej</span>
                    </div>
                    <p className="text-amber-800 leading-relaxed">
                      Wybierz, w jaki sposób chcesz wysyłać e-maile: skonfiguruj skrzynkę firmową (np. <code className="bg-white/80 px-1 py-0.5 rounded font-mono">xyz@nazwafirmy.pl</code> z protokołem SMTP) lub połącz swoje konto Google.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('manage');
                          setIsAddingSmtp(true);
                        }}
                        className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                      >
                        <Building2 className="w-4 h-4" />
                        <span>Dodaj skrzynkę firmową (np. xyz@nazwafirmy.pl)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={isLoggingInGoogle}
                        className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 font-semibold border border-slate-300 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        {isLoggingInGoogle ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Mail className="w-4 h-4 text-blue-600" />}
                        <span>Połącz z Google (Gmail)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Odbiorca i kopia DW */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="recipientEmailInput" className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-blue-600" />
                      <span>Adres e-mail odbiorcy</span>
                    </label>
                    <span className="text-[11px] text-slate-400">Zapamiętywany w przeglądarce</span>
                  </div>
                  <input
                    id="recipientEmailInput"
                    type="text"
                    value={recipientEmail}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    placeholder="np. klient@firma.pl lub kilka: biuro@twojadomena.pl, szymon@firma.pl"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Możesz podać jeden adres lub kilka adresów oddzielonych przecinkami.
                  </p>
                </div>

                {/* Kopia DW */}
                {activeMailbox && (
                  <label className="flex items-center gap-2.5 p-2.5 bg-blue-50/60 hover:bg-blue-50 border border-blue-200/80 rounded-xl cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={sendCopyToMe}
                      onChange={(e) => handleCcChange(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">
                        Wyślij kopię (DW) na moją skrzynkę nadawczą
                      </span>{' '}
                      <span className="text-slate-500 font-mono">({activeMailbox.email})</span>
                      <span className="block text-[11px] text-slate-500">
                        Pozwala natychmiast sprawdzić w swojej skrzynce, że e-mail oraz załączniki PDF dotarły.
                      </span>
                    </div>
                  </label>
                )}
              </div>

              {/* Temat i treść */}
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

              {/* Lista załączników */}
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

                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50 p-1">
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
            </>
          )}

          {/* ============================================================== */}
          {/* ZAKŁADKA 2: ZARZĄDZANIE SKRZYNKAMI POCZTOWYMI */}
          {/* ============================================================== */}
          {activeTab === 'manage' && (
            <div className="space-y-5">
              {/* Sekcja listy skrzynek */}
              {!isAddingSmtp && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Twoje skrzynki nadawcze</h4>
                      <p className="text-xs text-slate-500">
                        Wybierz skrzynkę, z której chcesz wysyłać wiadomości lub dodaj nową
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleResetSmtpForm();
                        setIsAddingSmtp(true);
                      }}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Dodaj skrzynkę firmową (SMTP)</span>
                    </button>
                  </div>

                  {mailboxes.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 border border-slate-200 border-dashed rounded-2xl space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h5 className="font-bold text-slate-800 text-sm">Brak skonfigurowanych skrzynek</h5>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          Możesz dodać dowolną skrzynkę firmową (np. xyz@nazwafirmy.pl) przez serwer SMTP lub połączyć konto Google.
                        </p>
                      </div>
                      <div className="pt-2 flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsAddingSmtp(true)}
                          className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-xs hover:bg-blue-700 transition-colors cursor-pointer"
                        >
                          Dodaj skrzynkę firmową (SMTP)
                        </button>
                        <button
                          type="button"
                          onClick={handleGoogleLogin}
                          disabled={isLoggingInGoogle}
                          className="px-4 py-2 bg-white text-slate-700 font-semibold border border-slate-300 rounded-xl text-xs hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                        >
                          {isLoggingInGoogle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 text-blue-600" />}
                          <span>Połącz z Google</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {mailboxes.map((box) => {
                        const isActive = activeMailbox?.id === box.id;
                        return (
                          <div
                            key={box.id}
                            className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isActive
                                ? 'bg-blue-50/60 border-blue-300 shadow-2xs'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                  box.type === 'smtp'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {box.type === 'smtp' ? (
                                  <Building2 className="w-5 h-5" />
                                ) : (
                                  <Mail className="w-5 h-5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                                    {box.name}
                                  </span>
                                  {isActive && (
                                    <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                                      Aktywna
                                    </span>
                                  )}
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                    box.type === 'smtp'
                                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                                  }`}>
                                    {box.type === 'smtp' ? 'SMTP' : 'Google API'}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500 font-mono truncate">
                                  {box.email}
                                  {box.smtp && (
                                    <span className="text-slate-400 ml-1.5">
                                      ({box.smtp.host}:{box.smtp.port} {box.smtp.secure ? 'SSL' : 'TLS'})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              {!isActive && (
                                <button
                                  type="button"
                                  onClick={() => handleSelectActiveMailbox(box.id)}
                                  className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                                >
                                  Wybierz
                                </button>
                              )}
                              {box.type === 'smtp' && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditMailbox(box)}
                                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Edytuj dane serwera SMTP"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteMailbox(box.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Usuń skrzynkę"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Przycisk logowania / ponownego połączenia z Google */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleGoogleLogin}
                          disabled={isLoggingInGoogle}
                          className="w-full p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors cursor-pointer flex items-center justify-center gap-2"
                        >
                          {isLoggingInGoogle ? (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          ) : (
                            <Mail className="w-4 h-4 text-blue-600" />
                          )}
                          <span>{currentUser ? 'Połącz inne konto Google (Gmail)' : 'Połącz konto Google (Gmail)'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Formularz konfiguracji skrzynki firmowej SMTP */}
              {isAddingSmtp && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">
                          {editingMailboxId ? 'Edycja skrzynki pocztowej' : 'Dodaj nową skrzynkę pocztową (np. xyz@nazwafirmy.pl)'}
                        </h4>
                        <p className="text-xs text-slate-500">
                          Konfiguracja bezpiecznego połączenia pocztowego SMTP
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetSmtpForm}
                      className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Anuluj
                    </button>
                  </div>

                  {/* Informacja pomocnicza */}
                  <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl text-xs text-purple-900 space-y-1">
                    <span className="font-bold flex items-center gap-1.5 text-purple-950">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>Obsługa dowolnej domeny firmowej i hostingu</span>
                    </span>
                    <p className="leading-relaxed text-[11.5px] text-purple-800">
                      Możesz podać dowolny adres firmowy (np. <code>xyz@nazwafirmy.pl</code>, Cyberfolks, OVH, Home.pl, dhosting, Outlook 365, itp.). Po wpisaniu adresu e-mail aplikacja automatycznie podpowie serwer SMTP.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Nazwa etykiety */}
                    <div className="sm:col-span-2">
                      <label className="font-semibold text-slate-700 block mb-1">
                        Nazwa profilu / etykieta (np. „Firmowa - Jan Kowalski”):
                      </label>
                      <input
                        type="text"
                        value={smtpFormName}
                        onChange={(e) => setSmtpFormName(e.target.value)}
                        placeholder="np. Biuro Ubezpieczeń (xyz@nazwafirmy.pl)"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>

                    {/* Adres e-mail nadawcy */}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Adres e-mail nadawcy: <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={smtpFormEmail}
                        onChange={(e) => handleEmailInputChange(e.target.value)}
                        placeholder="np. xyz@nazwafirmy.pl"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium font-mono text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>

                    {/* Nazwa wyświetlana nadawcy */}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Nazwa wyświetlana (Imię / Firma):
                      </label>
                      <input
                        type="text"
                        value={smtpFormSenderName}
                        onChange={(e) => setSmtpFormSenderName(e.target.value)}
                        placeholder="np. Jan Kowalski - Doradca Ubezpieczeniowy"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>

                    {/* Serwer SMTP Host */}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Serwer poczty wychodzącej (SMTP host): <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={smtpFormHost}
                        onChange={(e) => setSmtpFormHost(e.target.value)}
                        placeholder="np. mail.nazwafirmy.pl lub smtp.nazwafirmy.pl"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium font-mono text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>

                    {/* Port i Szyfrowanie */}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Port SMTP i szyfrowanie:
                      </label>
                      <div className="flex items-center gap-2">
                        <select
                          value={smtpFormPort}
                          onChange={(e) => {
                            const p = Number(e.target.value);
                            setSmtpFormPort(p);
                            setSmtpFormSecure(p === 465);
                          }}
                          className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer"
                        >
                          <option value={465}>Port 465 (SSL/TLS - domyślny)</option>
                          <option value={587}>Port 587 (STARTTLS)</option>
                          <option value={25}>Port 25 (Standardowy)</option>
                        </select>
                      </div>
                    </div>

                    {/* Login / Użytkownik */}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Login / Użytkownik SMTP: <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={smtpFormUser}
                        onChange={(e) => setSmtpFormUser(e.target.value)}
                        placeholder="zazwyczaj taki sam jak e-mail: xyz@nazwafirmy.pl"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium font-mono text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>

                    {/* Hasło do skrzynki */}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Hasło do skrzynki pocztowej: <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={smtpFormPass}
                          onChange={(e) => setSmtpFormPass(e.target.value)}
                          placeholder="Hasło do skrzynki / hasło aplikacji"
                          className="w-full px-3 py-2 pr-9 bg-white border border-slate-300 rounded-lg font-medium font-mono text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Opcjonalny Reply-To */}
                    <div className="sm:col-span-2">
                      <label className="font-semibold text-slate-700 block mb-1">
                        Adres do odpowiedzi (Reply-To) – opcjonalny:
                      </label>
                      <input
                        type="email"
                        value={smtpFormReplyTo}
                        onChange={(e) => setSmtpFormReplyTo(e.target.value)}
                        placeholder="np. kontakt@nazwafirmy.pl (pozostaw puste, by użyć adresu nadawcy)"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium font-mono text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Wynik testu połączenia */}
                  {smtpTestResult && (
                    <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                      smtpTestResult.success
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                        : 'bg-red-50 border border-red-200 text-red-900'
                    }`}>
                      {smtpTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-bold block">
                          {smtpTestResult.success ? 'Połączenie udane!' : 'Błąd połączenia z serwerem SMTP'}
                        </span>
                        <span>{smtpTestResult.message}</span>
                      </div>
                    </div>
                  )}

                  {/* Przyciski formularza */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={handleTestSmtpConnection}
                      disabled={isTestingSmtp || !smtpFormHost || !smtpFormUser || !smtpFormPass}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isTestingSmtp ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                          <span>Testowanie połączenia...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Przetestuj połączenie z serwerem SMTP</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetSmtpForm}
                        className="px-3.5 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold cursor-pointer"
                      >
                        Anuluj
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveSmtpMailbox}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Zapisz skrzynkę i używaj</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stopka modala */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Szyfrowane połączenie TLS/SSL – standard RFC 5322</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Zamknij
            </button>
            {activeTab === 'send' && (
              <button
                type="button"
                onClick={handleInitiateSend}
                disabled={isSending || selectedContracts.length === 0 || !activeMailbox}
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
            )}
          </div>
        </div>
      </div>

      {/* Modal potwierdzenia wysyłki */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Potwierdzenie wysyłki e-mail</h4>
                <p className="text-xs text-slate-500">Sprawdź parametry przed wysłaniem plików</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Konto nadawcy:</span>
                <span className="font-semibold text-slate-900 font-mono">{activeMailbox?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Typ serwera:</span>
                <span className="font-medium text-slate-700">
                  {activeMailbox?.type === 'smtp' ? `SMTP (${activeMailbox.smtp?.host})` : 'Google Gmail API'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Odbiorca:</span>
                <span className="font-semibold text-blue-700 font-mono">{recipientEmail}</span>
              </div>
              {sendCopyToMe && activeMailbox?.email && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Kopia DW:</span>
                  <span className="font-semibold text-slate-700 font-mono">{activeMailbox.email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Liczba załączników:</span>
                <span className="font-bold text-slate-900">{selectedContracts.length} pliki PDF</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Temat:</span>
                <span className="font-medium text-slate-800 truncate max-w-[200px]">{subject}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Ochrona Danych Osobowych (RODO Art. 33)</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Upewnij się, że adres e-mail odbiorcy (<strong className="font-mono">{recipientEmail}</strong>) jest prawidłowy.
                Wysyłka dokumentów zawierających dane osobowe (PESEL, dane polisy) do niewłaściwego adresata stanowi naruszenie ochrony danych.
              </p>
            </div>

            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer text-xs select-none hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={rodoConsentChecked}
                onChange={(e) => setRodoConsentChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
              />
              <span className="text-slate-700 text-[11px] leading-relaxed">
                Oświadczam, że posiadam podstawę prawną (art. 6 ust. 1 RODO, np. upoważnienie klienta) do przesłania załączonych dokumentów ubezpieczeniowych na ten adres e-mail.
              </span>
            </label>

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
                disabled={!rodoConsentChecked}
                onClick={handleConfirmAndSend}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
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
