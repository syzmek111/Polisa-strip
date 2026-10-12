import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Shield, FileCheck, Layers, FileArchive } from 'lucide-react';
import { ProcessingErrorDetails } from '../types/policy';

interface DropzoneProps {
  onFileLoaded: (fileBytes: Uint8Array, filename: string) => void;
  onStartReading?: (filename: string) => void;
  onError?: (details: ProcessingErrorDetails) => void;
  isProcessing: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFileLoaded,
  onStartReading,
  onError,
  isProcessing
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];

    // Weryfikacja pustego pliku
    if (file.size === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      onError?.({
        title: 'Pusty plik (0 bajtów)',
        reason: `Wybrany plik "${file.name}" ma rozmiar 0 B i nie zawiera żadnej treści ani stron.`,
        solution: 'Sprawdź, czy plik nie został przerwany podczas pobierania z poczty lub portalu i wybierz prawidłowy dokument.',
        category: 'empty_file',
        fileName: file.name,
        fileSize: 0
      });
      return;
    }

    // Weryfikacja rozszerzenia i typu MIME
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      if (fileInputRef.current) fileInputRef.current.value = '';
      const ext = file.name.split('.').pop() || 'nieznane';
      onError?.({
        title: 'Nieprawidłowy format pliku',
        reason: `Wczytano plik "${file.name}" w formacie .${ext}. Aplikacja wymaga dokumentów w formacie PDF (.pdf).`,
        solution: `Zapisz dokument jako PDF (np. w programie MS Word lub Excel kliknij "Plik -> Zapisz jako -> PDF", a w przypadku zdjęć JPG/PNG zapisz je jako dokument PDF), a następnie wgraj go ponownie.`,
        category: 'not_pdf',
        fileName: file.name,
        fileSize: file.size
      });
      return;
    }

    // Natychmiast informujemy aplikację o rozpoczęciu wczytywania – eliminuje to jakiekolwiek miganie ekranu
    onStartReading?.(file.name);

    try {
      const buffer = await file.arrayBuffer();
      onFileLoaded(new Uint8Array(buffer), file.name);
    } catch (err: any) {
      console.error(err);
      onError?.({
        title: 'Błąd odczytu pliku z dysku',
        reason: `Nie udało się załadować pliku "${file.name}" z Twojego dysku do pamięci przeglądarki.`,
        solution: 'Upewnij się, że plik nie jest zablokowany przez inny otwarty program i spróbuj ponownie.',
        category: 'corrupted',
        rawError: String(err?.message || err),
        fileName: file.name,
        fileSize: file.size
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isProcessing) return;
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-14 text-center transition-all cursor-pointer ${
          isDragOver
            ? 'border-blue-600 bg-blue-50/70 scale-[1.005]'
            : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50/60 shadow-xs'
        } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={isProcessing}
        />

        <div className="mx-auto w-18 h-18 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 shadow-xs border border-blue-100">
          <UploadCloud className="w-9 h-9" />
        </div>

        <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
          Wgraj wielostronicowy plik PDF z umowami
        </h3>

        <p className="text-sm text-slate-600 max-w-lg mx-auto mb-6 leading-relaxed">
          Przeciągnij i upuść dokument tutaj lub kliknij przycisk poniżej, aby wybrać plik PDF z dysku.
          Program automatycznie podzieli każdą umowę na osobny plik nazwany numerem rejestracyjnym.
        </p>

        <div className="flex items-center justify-center">
          <button
            type="button"
            className="px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-2.5"
          >
            <FileText className="w-4 h-4" />
            <span>Wybierz plik PDF z dysku</span>
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
            <Shield className="w-4 h-4 text-emerald-600" />
            100% lokalne przetwarzanie w pamięci RAM
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>Pełna ochrona danych osobowych (RODO)</span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>Brak limitu stron i rozmiaru</span>
        </div>
      </div>

      {/* Instrukcja 3 kroków */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold mb-3">
            <FileCheck className="w-4 h-4" />
          </div>
          <div className="text-sm font-semibold text-slate-900 mb-1">1. Wczytanie pliku PDF</div>
          <div className="text-xs text-slate-500 leading-relaxed">
            Wybierasz jeden wielostronicowy dokument zawierający polisy i certyfikaty ubezpieczenia (np. zbiór umów flotowych).
          </div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold mb-3">
            <Layers className="w-4 h-4" />
          </div>
          <div className="text-sm font-semibold text-slate-900 mb-1">2. Automatyczny podział</div>
          <div className="text-xs text-slate-500 leading-relaxed">
            Algorytm identyfikuje tablice rejestracyjne, numery polis, dane pojazdu, VIN i ubezpieczających, precyzyjnie rozdzielając strony.
          </div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold mb-3">
            <FileArchive className="w-4 h-4" />
          </div>
          <div className="text-sm font-semibold text-slate-900 mb-1">3. Zbiorcza paczka ZIP</div>
          <div className="text-xs text-slate-500 leading-relaxed">
            Pobierasz kompletne archiwum ZIP ze wszystkimi wyodrębnionymi plikami nazwanymi czystymi numerami rejestracyjnymi.
          </div>
        </div>
      </div>
    </div>
  );
};
