import React from 'react';
import { Loader2, Sparkles, FileText, Split, FileArchive, Search } from 'lucide-react';
import { ProcessingProgress } from '../types/policy';

interface ProgressBarProps {
  progress: ProcessingProgress;
}

const STAGE_LABELS: Record<string, string> = {
  reading: 'Wczytywanie i weryfikacja pliku',
  analyzing: 'Skanowanie stron i rozpoznawanie polis',
  ocr: 'Odczyt tekstu z obrazu / skanu (OCR)',
  splitting: 'Wyodrębnianie i zapisywanie plików PDF',
  zipping: 'Tworzenie paczki ZIP',
  completed: 'Przetwarzanie zakończone',
  idle: 'Oczekiwanie',
  error: 'Wystąpił błąd'
};

const getStageIcon = (stage: string) => {
  switch (stage) {
    case 'reading':
      return <FileText className="w-4 h-4 text-blue-600 animate-pulse" />;
    case 'analyzing':
      return <Search className="w-4 h-4 text-blue-600 animate-spin" />;
    case 'ocr':
      return <Sparkles className="w-4 h-4 text-purple-600 animate-bounce" />;
    case 'splitting':
      return <Split className="w-4 h-4 text-emerald-600" />;
    case 'zipping':
      return <FileArchive className="w-4 h-4 text-amber-600" />;
    default:
      return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
  }
};

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  const percent =
    progress.total > 0
      ? Math.min(100, Math.max(0, Math.round((progress.current / progress.total) * 100)))
      : progress.stage === 'reading'
      ? 5
      : 0;

  const stageLabel = STAGE_LABELS[progress.stage] || 'Przetwarzanie dokumentu';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-2xl mx-auto my-8 animate-in fade-in duration-200 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
            {getStageIcon(progress.stage)}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900 truncate">
              {progress.message || 'Przetwarzanie dokumentu...'}
            </h4>
            <p className="text-xs text-slate-500 font-medium">
              {stageLabel}
            </p>
          </div>
        </div>
        <span className="text-base font-mono font-bold text-blue-600 tabular-nums ml-4 shrink-0">
          {percent}%
        </span>
      </div>

      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden relative">
        <div
          className={`h-3 rounded-full transition-all duration-300 ease-out relative ${
            progress.stage === 'ocr'
              ? 'bg-linear-to-r from-purple-600 to-indigo-600'
              : 'bg-linear-to-r from-blue-600 to-sky-500'
          }`}
          style={{ width: `${Math.max(percent, 4)}%` }}
        >
          {/* Efekt płynnego przesuwania światła w trakcie ładowania */}
          <div className="absolute inset-0 bg-white/20 animate-pulse" />
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
        <span className="text-slate-600 font-medium">
          {progress.stage === 'ocr' ? 'Analiza graficzna' : 'Postęp operacji'}
        </span>
        <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 font-bold text-slate-700">
          {progress.total > 0 ? `${progress.current} / ${progress.total}` : 'Przygotowanie'}
        </span>
      </div>
    </div>
  );
};
