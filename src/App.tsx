import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Header } from './components/Header';
import { Dropzone } from './components/Dropzone';
import { ProgressBar } from './components/ProgressBar';
import { ContractList } from './components/ContractList';
import { PreviewModal } from './components/PreviewModal';
import { InfoModal } from './components/InfoModal';
import { ErrorAlert } from './components/ErrorAlert';
import { EmailModal } from './components/EmailModal';
import { PolicyContract, ProcessingErrorDetails, ProcessingProgress } from './types/policy';
import { processPdfDocument, generateAndDownloadZip, triggerFileDownload, PdfProcessingError } from './utils/pdfProcessor';
import { sanitizePlateForFilename } from './utils/plateExtractor';
import { initAuth } from './utils/firebaseAuth';

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
  const [infoModalType, setInfoModalType] = useState<'help' | 'privacy' | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  // Stan uwierzytelnienia Gmail i modal wysyłki e-mail
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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

  const isProcessing =
    progress.stage === 'reading' ||
    progress.stage === 'analyzing' ||
    progress.stage === 'splitting' ||
    progress.stage === 'zipping';

  const handleFileLoaded = async (bytes: Uint8Array, name: string) => {
    setFileBytes(bytes);
    setFileName(name);
    setContracts([]);

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
      triggerFileDownload(zipBlob, `Umowy_Ubezpieczeniowe_${dateStr}.zip`);
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

  const handleOpenEmailModal = (preselected?: PolicyContract[]) => {
    setEmailModalContracts(preselected && preselected.length > 0 ? preselected : contracts);
    setIsEmailModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans">
      <Header
        onOpenHelp={() => setInfoModalType('help')}
        onOpenPrivacy={() => setInfoModalType('privacy')}
        currentUser={currentUser}
        onOpenEmailSettings={() => handleOpenEmailModal()}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-3xl mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight mb-3">
            Automatyczny podział umów ubezpieczeniowych PDF
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            Wgraj wielostronicowy dokument zawierający polisy komunikacyjne. Aplikacja rozpozna numery rejestracyjne,
            dokładne parametry polis (VIN, ubezpieczyciel, numer umowy, pojazd), potnie plik na osobne dokumenty
            nazwane czystym numerem rejestracyjnym i umożliwi natychmiastowe pobranie paczki ZIP lub bezpośrednią
            wysyłkę wybranych plików e-mailem ze swojego połączonego konta.
          </p>
        </div>

        {contracts.length === 0 && !isProcessing && progress.stage !== 'error' && (
          <Dropzone
            onFileLoaded={handleFileLoaded}
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
            isZipping={isZipping}
            onOpenEmailModal={handleOpenEmailModal}
          />
        )}
      </main>

      <PreviewModal
        contract={previewContract}
        onClose={() => setPreviewContract(null)}
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
      />

      <InfoModal
        type={infoModalType}
        onClose={() => setInfoModalType(null)}
      />

      <footer className="border-t border-slate-200 bg-white py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <span>PolisaSplit © {new Date().getFullYear()}</span>
            <span aria-hidden="true" className="mx-2">·</span>
            <span>Bezpieczne dzielenie umów ubezpieczeniowych w przeglądarce</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setInfoModalType('privacy')}
              className="hover:text-slate-800 transition-colors cursor-pointer"
            >
              Polityka prywatności (RODO)
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
