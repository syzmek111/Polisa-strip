import React from 'react';
import { Loader2 } from 'lucide-react';
import { ProcessingProgress } from '../types/policy';

interface ProgressBarProps {
  progress: ProcessingProgress;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  const percent =
    progress.total > 0
      ? Math.min(100, Math.max(0, Math.round((progress.current / progress.total) * 100)))
      : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs max-w-2xl mx-auto my-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <span className="text-sm font-semibold text-slate-900">
            {progress.message || 'Przetwarzanie dokumentu...'}
          </span>
        </div>
        <span className="text-sm font-mono font-bold text-slate-700 tabular-nums">
          {percent}%
        </span>
      </div>

      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
        <span>
          Etap: {progress.stage === 'reading' ? 'Odczyt pliku' : progress.stage === 'analyzing' ? 'Skanowanie stron' : progress.stage === 'splitting' ? 'Dzielenie PDF' : 'Kompresja ZIP'}
        </span>
        <span>
          {progress.current} / {progress.total}
        </span>
      </div>
    </div>
  );
};
