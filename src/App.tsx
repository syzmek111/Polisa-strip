import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { Header } from './components/Header';
import { Dropzone } from './components/Dropzone';
import { ProgressBar } from './components/ProgressBar';
import { ContractList } from './components/ContractList';
import { PreviewModal } from './components/PreviewModal';
import { InfoModal } from './components/InfoModal';
import { ErrorAlert } from './components/ErrorAlert';
import { EmailModal } from './components/EmailModal';
import { SecurityAndRodoModal } from './components/SecurityAndRodoModal';
import { PolicyContract, ProcessingErrorDetails, ProcessingProgress } from './types/policy';
import { MailboxAccount } from './types/mailbox';
import { SecurityPrivacySettings } from './types/security';
import { processPdfDocument, generateAndDownloadZip, triggerFileDownload, PdfProcessingError } from './utils/pdfProcessor';
import { sanitizePlateForFilename } from './utils/plateExtractor';
import { initAuth } from './utils/firebaseAuth';
import {
  getPrivacySettings,
  savePrivacySettings,
  addRodoAuditLog,
  DEFAULT_PRIVACY_SETTINGS
} from './utils/security';
import { ShieldCheck, Lock, CheckCircle2, Database, UploadCloud } from 'lucide-react';

export default function App() {
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [totalPages, setTotalPages] = useState<number>(0);
  const [contracts, setContracts] = useState<PolicyContract[]>([]);

  const [progress, setProgress] = useState<ProcessingProgress>({
    stage: 'idle',
    current: 0,
    total: 0,
    message: ''
  });

  const [previewContract, setPreviewContract] = useState<PolicyContract | null>(null);
  const [infoModalType, setInfoModalType] = useState<'help' | null>(null);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // Ustawienia prywatności i bezpieczeństwa (RODO)
  const [privacySettings, setPrivacySettings] = useState<SecurityPrivacySettings>(() => getPrivacySettings());

  // Stan uwierzytelnienia poczty (SMTP lub Google) i modal wysyłki e-mail
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeMailbox, setActiveMailbox] = useState<MailboxAccount | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailModalContracts, setEmailModalContracts] = useState<PolicyContract[]>([]);

  useEffect(() => {
    // Inicjalizacja nasłuchu stanu logowania Firebase
    const unsubscribe = initAuth(
      (user) => {
        setCurrentUser(user);
      },
      () => {
        setCurrentUser(null);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const [isWindowDragOver, setIsWindowDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const isProcessing =
    progress.stage === 'reading' ||
    progress.stage === 'analyzing' ||
    progress.stage === 'ocr' ||
    progress.stage === 'splitting' ||
    progress.stage === 'zipping';

  const handleStartReading = (name: string) => {
    setFileName(name);
    setContracts([]);
    setProgress({
      stage: 'reading',
      current: 5,
      total: 100,
      message: `Wczytywanie pliku "${name}"...`
    });
  };

  const handleDirectFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      handleDropzoneError({
        title: 'Nieprawidłowy format pliku',
        reason: `Wczytano plik "${file.name}". Program wymaga dokumentu w formacie PDF (.pdf).`,
        solution: 'Wybierz plik z rozszerzeniem .pdf.',
        category: 'not_pdf',
        fileName: file.name,
        fileSize: file.size
      });
      return;
    }

    handleStartReading(file.name);
    try {
      const buffer = await file.arrayBuffer();
      handleFileLoaded(new Uint8Array(buffer), file.name);
    } catch (err: any) {
      handleDropzoneError({
        title: 'Błąd odczytu pliku',
        reason: 'Nie udało się odczytać wybranego pliku z dysku.',
        solution: 'Upewnij się, że plik nie jest zablokowany i spróbuj ponownie.',
        category: 'corrupted',
        rawError: String(err?.message || err),
        fileName: file.name,
        fileSize: file.size
      });
    }
  };

  const handleWindowDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsWindowDragOver(true);
    }
  };

  const handleWindowDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsWindowDragOver(false);
    }
  };

  const handleWindowDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleWindowDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsWindowDragOver(false);
    if (isProcessing) return;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    handleDirectFileSelect(files[0]);
  };

  const handleFileLoaded = async (bytes: Uint8Array, name: string) => {
    setFileBytes(bytes);
    setFileName(name);
    setContracts([]);
    setProgress((prev) => ({
      stage: 'reading',
      current: Math.max(prev.current, 10),
      total: 100,
      message: `Weryfikacja struktury dokumentu "${name}"...`
    }));

    // Rejestracja zdarzenia w Rejestrze Czynności Przetwarzania RODO (Art. 30)
    addRodoAuditLog({
      action: 'FILE_LOADED',
      title: 'Wczytano dokument PDF do analizy',
      description: `Wczytano dokument "${name}" (${(bytes.length / 1024).toFixed(1)} KB). Przetwarzanie w lokalnej pamięci RAM.`,
      itemCount: 1,
    });

    try {
      const result = await processPdfDocument(bytes, name, (p) => setProgress(p));
      setContracts(result.contracts);
      setTotalPages(result.totalPages);
      setProgress({
        stage: 'completed',
        current: result.contracts.length,
        total: result.contracts.length,
        message: 'Przetwarzanie zakończone sukcesem.'
      });

      // Rejestracja podziału w audycie RODO
      addRodoAuditLog({
        action: 'POLICIES_SPLIT',
        title: 'Wyodrębniono polisy ubezpieczeniowe',
        description: `Zidentyfikowano i wyodrębniono ${result.contracts.length} odrębnych polis PDF z ${result.totalPages} stron dokumentu.`,
        itemCount: result.contracts.length,
      });
    } catch (err: any) {
      console.error('Błąd podczas przetwarzania PDF:', err);

      if (err instanceof PdfProcessingError) {
        setProgress({
          stage: 'error',
          current: 0,
          total: 0,
          message: err.reason,
          error: err.rawError || err.message,
          errorDetails: {
            title: err.title,
            reason: err.reason,
            solution: err.solution,
            category: err.category,
            rawError: err.rawError,
            fileName: name,
            fileSize: bytes.length
          }
        });
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Nieznany błąd';
        setProgress({
          stage: 'error',
          current: 0,
          total: 0,
          message: errorMsg,
          error: errorMsg,
          errorDetails: {
            title: 'Nieoczekiwany problem z plikiem PDF',
            reason: `Podczas analizy pliku wystąpił nieoczekiwany błąd: ${errorMsg}`,
            solution: 'Upewnij się, że plik nie jest uszkodzony, spróbuj otworzyć go w przeglądarce i wydrukować do nowego pliku PDF.',
            category: 'generic',
            rawError: err instanceof Error ? err.stack : String(err),
            fileName: name,
            fileSize: bytes.length
          }
        });
      }
    }
  };

  const handleDropzoneError = (details: ProcessingErrorDetails) => {
    setProgress({
      stage: 'error',
      current: 0,
      total: 0,
      message: details.reason,
      errorDetails: details
    });
  };

  const handleUpdateRegistration = (contractId: string, newPlate: string) => {
    setContracts((prev) =>
      prev.map((c) => {
        if (c.id === contractId) {
          const sanitized = sanitizePlateForFilename(newPlate);
          return {
            ...c,
            registrationNumber: newPlate.toUpperCase().trim(),
            customFilename: sanitized,
            isEdited: true
          };
        }
        return c;
      })
    );
  };

  const handleDownloadZip = async () => {
    if (contracts.length === 0) return;
    setIsZipping(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const zipBlob = await generateAndDownloadZip(contracts, fileName, (p) => setProgress(p));
      const zipFileName = `Umowy_Ubezpieczeniowe_${dateStr}.zip`;
      triggerFileDownload(zipBlob, zipFileName);

      // Rejestracja w audycie RODO
      addRodoAuditLog({
        action: 'ZIP_EXPORTED',
        title: 'Pobrano archiwum ZIP z polisami',
        description: `Wygenerowano i pobrano lokalne archiwum ZIP zawierające ${contracts.length} plików PDF.`,
        itemCount: contracts.length,
      });

      setProgress({
        stage: 'completed',
        current: contracts.length,
        total: contracts.length,
        message: 'Paczka ZIP została pomyślnie pobrana.'
      });
    } catch (err) {
      console.error('Błąd tworzenia ZIP:', err);
    } finally {
      setIsZipping(false);
    }
  };

  const handleReset = () => {
    setFileBytes(null);
    setFileName('');
    setContracts([]);
    setTotalPages(0);
    setProgress({
      stage: 'idle',
      current: 0,
      total: 0,
      message: ''
    });
  };

  const handlePurgeAllApplicationDataSuccess = () => {
    handleReset();
    setActiveMailbox(null);
    setCurrentUser(null);
    setPrivacySettings(DEFAULT_PRIVACY_SETTINGS);
  };

  const handleToggleScreenPrivacy = () => {
    const updated = savePrivacySettings({ screenPrivacyMode: !privacySettings.screenPrivacyMode });
    setPrivacySettings(updated);
  };

  const handleOpenEmailModal = (preselected?: PolicyContract[]) => {
    setEmailModalContracts(preselected && preselected.length > 0 ? preselected : contracts);
    setIsEmailModalOpen(true);
  };

  return (
    <div
      onDragEnter={handleWindowDragEnter}
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
      className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans relative"
    >
      {/* Globalny overlay przeciągania pliku PDF na całe okno aplikacji */}
      {isWindowDragOver && !isProcessing && (
        <div className="fixed inset-0 z-50 bg-blue-900/85 backdrop-blur-xs flex flex-col items-center justify-center text-white border-4 border-dashed border-blue-400 m-4 rounded-3xl pointer-events-none transition-all animate-in fade-in duration-150">
          <div className="p-6 bg-white/10 rounded-2xl mb-4 border border-white/20 shadow-xl">
            <UploadCloud className="w-16 h-16 text-blue-200 animate-bounce" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-2 text-white">
            Upuść nowy plik PDF tutaj
          </h2>
          <p className="text-sm text-blue-100 max-w-md text-center">
            Dokument zostanie natychmiast załadowany i podzielony na odrębne polisy ubezpieczeniowe.
          </p>
        </div>
      )}

      <Header
        onOpenHelp={() => setInfoModalType('help')}
        onOpenPrivacy={() => setIsSecurityModalOpen(true)}
        currentUser={currentUser}
        activeMailbox={activeMailbox}
        onOpenEmailSettings={() => handleOpenEmailModal()}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-3xl mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Zgodność z RODO / GDPR
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <Lock className="w-3 h-3 text-blue-600" />
              100% Przetwarzanie w pamięci RAM przeglądarki
            </span>
            <button
              type="button"
              onClick={() => setIsSecurityModalOpen(true)}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium ml-1"
            >
              Centrum Bezpieczeństwa →
            </button>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight mb-3">
            Automatyczny podział umów ubezpieczeniowych PDF
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            Wgraj wielostronicowy dokument zawierający polisy komunikacyjne. Inteligentny silnik analizy
            rozpoznaje pełen kontekst wielostronicowości (w tym 2-stronicowe polisy z klauzulą informacyjną RODO lub pouczeniami na drugiej stronie),
            precyzyjnie łączy strony właściwej umowy i tnie plik na osobne dokumenty nazwane czystym numerem rejestracyjnym pojazdu.
          </p>
        </div>

        {contracts.length === 0 && !isProcessing && progress.stage !== 'error' && (
          <Dropzone
            onFileLoaded={handleFileLoaded}
            onStartReading={handleStartReading}
            onError={handleDropzoneError}
            isProcessing={isProcessing}
          />
        )}

        {isProcessing && (
          <ProgressBar progress={progress} />
        )}

        {progress.stage === 'error' && (
          <ErrorAlert
            errorDetails={progress.errorDetails}
            onReset={handleReset}
          />
        )}

        {contracts.length > 0 && !isProcessing && (
          <ContractList
            contracts={contracts}
            totalPages={totalPages}
            originalFileName={fileName}
            onUpdateRegistration={handleUpdateRegistration}
            onDownloadZip={handleDownloadZip}
            onPreviewContract={(c) => setPreviewContract(c)}
            onReset={handleReset}
            onSelectNewFile={handleDirectFileSelect}
            isZipping={isZipping}
            onOpenEmailModal={handleOpenEmailModal}
            screenPrivacyMode={privacySettings.screenPrivacyMode}
            onTogglePrivacyMode={handleToggleScreenPrivacy}
          />
        )}
      </main>

      <PreviewModal
        contract={previewContract}
        onClose={() => setPreviewContract(null)}
        screenPrivacyMode={privacySettings.screenPrivacyMode}
        onUpdateRegistration={(contractId, newPlate) => {
          handleUpdateRegistration(contractId, newPlate);
          setPreviewContract((prev) =>
            prev && prev.id === contractId
              ? {
                  ...prev,
                  registrationNumber: newPlate.toUpperCase().trim(),
                  customFilename: sanitizePlateForFilename(newPlate),
                  isEdited: true
                }
              : prev
          );
        }}
      />

      <EmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        contracts={emailModalContracts.length > 0 ? emailModalContracts : contracts}
        currentUser={currentUser}
        onUserChange={(user) => setCurrentUser(user)}
        onActiveMailboxChange={(box) => setActiveMailbox(box)}
      />

      {/* Centrum Bezpieczeństwa i RODO */}
      <SecurityAndRodoModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        onPurgeDataSuccess={handlePurgeAllApplicationDataSuccess}
        privacySettings={privacySettings}
        onPrivacySettingsChange={(s) => setPrivacySettings(s)}
      />

      <InfoModal
        type={infoModalType}
        onClose={() => setInfoModalType(null)}
      />

      <footer className="border-t border-slate-200 bg-white py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>PolisaSplit © {new Date().getFullYear()}</span>
            <span aria-hidden="true">·</span>
            <span>Bezpieczne dzielenie umów w piaskownicy przeglądarki (100% Client-Side)</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsSecurityModalOpen(true)}
              className="text-emerald-700 font-semibold hover:text-emerald-900 transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Bezpieczeństwo i RODO</span>
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setInfoModalType('help')}
              className="hover:text-slate-800 transition-colors cursor-pointer"
            >
              Zasady rozpoznawania polis
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
