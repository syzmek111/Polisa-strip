import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building,
  Car,
  Calendar,
  User,
  ShieldAlert,
  Hash,
  Coins,
  Sparkles,
  Edit2,
  Check
} from 'lucide-react';
import { PolicyContract } from '../types/policy';
import { LicensePlateBadge } from './LicensePlateBadge';
import { triggerFileDownload } from '../utils/pdfProcessor';
import { pdfjsLib } from '../utils/pdfjsWrapper';

interface PreviewModalProps {
  contract: PolicyContract | null;
  onClose: () => void;
  onUpdateRegistration?: (contractId: string, newPlate: string) => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  contract,
  onClose,
  onUpdateRegistration
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [isEditingPlate, setIsEditingPlate] = useState(false);
  const [editPlateValue, setEditPlateValue] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);

  // Obsługa klawisza Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Ładowanie instancji dokumentu PDF za pomocą pdfjsLib (Canvas HTML5)
  useEffect(() => {
    let isCancelled = false;
    setCurrentPage(1);
    setIsLoadingDoc(true);
    setIsEditingPlate(false);

    if (!contract || !contract.pdfBytes) {
      setIsLoadingDoc(false);
      return;
    }

    setEditPlateValue(contract.registrationNumber);

    const loadDoc = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: contract.pdfBytes!.slice(),
          verbosity: 0
        });
        const doc = await loadingTask.promise;
        if (isCancelled) return;

        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setIsLoadingDoc(false);
      } catch (err) {
        console.error('Błąd ładowania podglądu PDF:', err);
        if (!isCancelled) {
          setIsLoadingDoc(false);
        }
      }
    };

    loadDoc();

    return () => {
      isCancelled = true;
      pdfDocRef.current = null;
    };
  }, [contract]);

  // Renderowanie bieżącej strony na Canvas
  useEffect(() => {
    let isCancelled = false;
    const doc = pdfDocRef.current;
    if (!doc || !canvasRef.current || isLoadingDoc) return;

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
        }

        const page = await doc.getPage(currentPage);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Błąd renderowania canvas podglądu:', err);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [currentPage, scale, isLoadingDoc]);

  if (!contract) return null;

  const handleSavePlate = () => {
    if (editPlateValue.trim() && onUpdateRegistration) {
      onUpdateRegistration(contract.id, editPlateValue.trim().toUpperCase());
    }
    setIsEditingPlate(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full h-[92vh] flex flex-col overflow-hidden z-10 border border-slate-200">
        {/* Pasek nagłówka */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            {isEditingPlate ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={editPlateValue}
                  onChange={(e) => setEditPlateValue(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSavePlate();
                    if (e.key === 'Escape') setIsEditingPlate(false);
                  }}
                  autoFocus
                  placeholder="NP. KR12345"
                  className="px-2 py-1 text-sm font-mono font-bold uppercase border-2 border-blue-500 rounded-lg w-32 bg-white"
                />
                <button
                  type="button"
                  onClick={handleSavePlate}
                  className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
                  title="Zapisz numer"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <LicensePlateBadge plateNumber={contract.registrationNumber} size="md" />
                {onUpdateRegistration && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditPlateValue(contract.registrationNumber.startsWith('POLISA') ? '' : contract.registrationNumber);
                      setIsEditingPlate(true);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                    title="Popraw numer rejestracyjny na podstawie skanu"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {contract.customFilename}
                </h3>
                {contract.plateSource === 'ocr' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 inline-flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    OCR
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Strony w pliku źródłowym: {contract.pageIndices.map((p) => p + 1).join(', ')} ({contract.pageCount} str.)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Przyciski powiększenia / pomniejszenia */}
            <div className="hidden sm:flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 mr-2">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.6, s - 0.15))}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
                title="Pomniejsz"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono px-1 tabular-nums text-slate-600">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
                title="Powiększ"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Pobierz ten plik */}
            <button
              type="button"
              onClick={() => {
                if (contract.pdfBlob) {
                  triggerFileDownload(contract.pdfBlob, contract.customFilename);
                }
              }}
              className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pobierz ten plik</span>
            </button>

            {/* Zamknij */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pasek szczegółowych parametrów umowy dla całkowitej pewności */}
        <div className="bg-slate-100/80 px-6 py-2.5 border-b border-slate-200 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          {contract.insurerName && (
            <div className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              <span>{contract.insurerName}</span>
            </div>
          )}

          {contract.policyNumber && (
            <div className="inline-flex items-center gap-1.5 text-slate-700 font-mono">
              <Hash className="w-3.5 h-3.5 text-slate-400" />
              <span>Polisa: {contract.policyNumber}</span>
            </div>
          )}

          {contract.vin && (
            <div className="inline-flex items-center gap-1.5 text-slate-800 font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
              <span>VIN: {contract.vin}</span>
            </div>
          )}

          {contract.vehicleModel && (
            <div className="inline-flex items-center gap-1.5 text-slate-700">
              <Car className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {contract.vehicleModel}
                {contract.productionYear ? ` (${contract.productionYear})` : ''}
              </span>
            </div>
          )}

          {contract.policyHolder && (
            <div className="inline-flex items-center gap-1.5 text-slate-700">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="truncate max-w-xs">{contract.policyHolder}</span>
            </div>
          )}

          {contract.insurancePeriod && (
            <div className="inline-flex items-center gap-1.5 text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono text-[11px]">{contract.insurancePeriod}</span>
            </div>
          )}

          {contract.totalPremium && (
            <div className="inline-flex items-center gap-1.5 text-emerald-700 font-bold ml-auto">
              <Coins className="w-3.5 h-3.5 text-emerald-600" />
              <span>{contract.totalPremium}</span>
            </div>
          )}
        </div>

        {/* Obszar podglądu Canvas */}
        <div className="flex-1 bg-slate-200/70 overflow-auto p-4 sm:p-8 flex items-center justify-center relative">
          {isLoadingDoc && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/80 gap-3 z-10">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <span className="text-sm font-medium text-slate-600">
                Renderowanie stron dokumentu...
              </span>
            </div>
          )}

          <div className="bg-white shadow-xl rounded-sm border border-slate-300 max-w-full overflow-hidden transition-all duration-150 flex items-center justify-center">
            <canvas ref={canvasRef} className="block max-w-full h-auto" />
          </div>
        </div>

        {/* Pasek nawigacji stron */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500 font-mono">
            Strona {currentPage} z {totalPages} w tej umowie
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-700" />
            </button>

            <span className="text-xs font-mono px-2 text-slate-700 font-medium">
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-700" />
            </button>
          </div>

          <div className="text-xs text-slate-400 hidden sm:block">
            Użyj kółka myszy lub przycisków lupy, aby powiększyć detale dokumentu
          </div>
        </div>
      </div>
    </div>
  );
};
