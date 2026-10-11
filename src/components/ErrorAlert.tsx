import React, { useState } from 'react';
import {
  AlertTriangle,
  FileX,
  Lock,
  ScanLine,
  FileQuestion,
  AlertOctagon,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText
} from 'lucide-react';
import { ProcessingErrorDetails } from '../types/policy';

interface ErrorAlertProps {
  errorDetails?: ProcessingErrorDetails;
  onReset: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ errorDetails, onReset }) => {
  const [showTechnical, setShowTechnical] = useState(false);

  if (!errorDetails) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 sm:p-8 text-center max-w-2xl mx-auto my-8 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-red-950 mb-2">Wystąpił błąd podczas przetwarzania</h3>
        <p className="text-sm text-red-700 mb-6">
          Nie udało się odczytać wskazanego dokumentu. Upewnij się, że plik jest poprawnym dokumentem PDF.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="px-5 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Spróbuj ponownie z innym plikiem</span>
        </button>
      </div>
    );
  }

  const { title, reason, solution, category, rawError, fileName, fileSize } = errorDetails;

  const getCategoryConfig = () => {
    switch (category) {
      case 'not_pdf':
        return {
          icon: <FileX className="w-6 h-6 text-amber-600" />,
          badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
          containerBg: 'bg-amber-50/70 border-amber-200',
          headerColor: 'text-amber-950',
          btnBg: 'bg-amber-600 hover:bg-amber-700',
          label: 'Nieprawidłowy format pliku'
        };
      case 'password_protected':
        return {
          icon: <Lock className="w-6 h-6 text-purple-600" />,
          badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
          containerBg: 'bg-purple-50/70 border-purple-200',
          headerColor: 'text-purple-950',
          btnBg: 'bg-purple-600 hover:bg-purple-700',
          label: 'Hasło dostępu do pliku'
        };
      case 'scanned_no_text':
        return {
          icon: <ScanLine className="w-6 h-6 text-blue-600" />,
          badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
          containerBg: 'bg-blue-50/70 border-blue-200',
          headerColor: 'text-blue-950',
          btnBg: 'bg-blue-600 hover:bg-blue-700',
          label: 'Skan bez warstwy tekstowej OCR'
        };
      case 'no_policies_found':
        return {
          icon: <FileQuestion className="w-6 h-6 text-amber-600" />,
          badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
          containerBg: 'bg-amber-50/70 border-amber-200',
          headerColor: 'text-amber-950',
          btnBg: 'bg-amber-600 hover:bg-amber-700',
          label: 'Brak numerów rejestracyjnych i polis'
        };
      case 'empty_file':
      case 'corrupted':
      default:
        return {
          icon: <AlertOctagon className="w-6 h-6 text-red-600" />,
          badgeBg: 'bg-red-100 text-red-800 border-red-200',
          containerBg: 'bg-red-50/70 border-red-200',
          headerColor: 'text-red-950',
          btnBg: 'bg-red-600 hover:bg-red-700',
          label: 'Błąd struktury dokumentu'
        };
    }
  };

  const config = getCategoryConfig();

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className={`max-w-3xl mx-auto my-8 rounded-2xl border p-6 sm:p-8 shadow-xs transition-all ${config.containerBg}`}>
      {/* Nagłówek i status */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-black/10">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white shadow-xs border border-slate-200/80 flex items-center justify-center shrink-0">
            {config.icon}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${config.badgeBg}`}>
                {config.label}
              </span>
              {fileName && (
                <span className="text-xs font-mono text-slate-600 bg-white/70 px-2 py-0.5 rounded border border-slate-200">
                  {fileName} {fileSize ? `(${formatFileSize(fileSize)})` : ''}
                </span>
              )}
            </div>
            <h2 className={`text-xl font-extrabold tracking-tight ${config.headerColor}`}>
              {title}
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onReset}
          className={`px-4 py-2 text-xs font-bold text-white rounded-xl transition-colors cursor-pointer inline-flex items-center gap-2 shrink-0 ${config.btnBg}`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Wgraj inny plik</span>
        </button>
      </div>

      {/* Wyjaśnienie: Co się stało i dlaczego */}
      <div className="mt-5 space-y-4">
        <div className="bg-white/90 rounded-xl p-4 border border-black/5 shadow-2xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Co się stało?
          </h4>
          <p className="text-sm text-slate-800 leading-relaxed font-medium">
            {reason}
          </p>
        </div>

        {/* Rozwiązanie / Co zrobić */}
        <div className="bg-white/90 rounded-xl p-4 border border-black/5 shadow-2xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1.5 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Jak to rozwiązać?
          </h4>
          <p className="text-sm text-slate-700 leading-relaxed">
            {solution}
          </p>
        </div>
      </div>

      {/* Zwijane szczegóły techniczne jeśli dostępne */}
      {rawError && (
        <div className="mt-4 pt-3 border-t border-black/5">
          <button
            type="button"
            onClick={() => setShowTechnical(!showTechnical)}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Szczegóły techniczne dla administratora</span>
            {showTechnical ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showTechnical && (
            <pre className="mt-2 p-3 bg-slate-900 text-slate-200 text-[11px] font-mono rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
              {rawError}
            </pre>
          )}
        </div>
      )}

      {/* Dolny pasek z ponownym przyciskiem */}
      <div className="mt-6 pt-4 border-t border-black/10 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Twoje pliki są bezpieczne i przetwarzane wyłącznie lokalnie w przeglądarce.
        </span>

        <button
          type="button"
          onClick={onReset}
          className="text-xs font-semibold text-slate-700 hover:text-slate-950 underline underline-offset-4 transition-colors cursor-pointer"
        >
          Powrót do wyboru pliku
        </button>
      </div>
    </div>
  );
};
