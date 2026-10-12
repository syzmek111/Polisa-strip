import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  Check,
  Maximize2,
  Minimize2,
  RotateCcw,
  Move
} from 'lucide-react';
import { PolicyContract } from '../types/policy';
import { LicensePlateBadge } from './LicensePlateBadge';
import { triggerFileDownload } from '../utils/pdfProcessor';
import { pdfjsLib } from '../utils/pdfjsWrapper';
import { maskVin, maskPersonName } from '../utils/security';

interface PreviewModalProps {
  contract: PolicyContract | null;
  onClose: () => void;
  onUpdateRegistration?: (contractId: string, newPlate: string) => void;
  screenPrivacyMode?: boolean;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  contract,
  onClose,
  onUpdateRegistration,
  screenPrivacyMode
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [isEditingPlate, setIsEditingPlate] = useState(false);
  const [editPlateValue, setEditPlateValue] = useState('');
  const [naturalPageSize, setNaturalPageSize] = useState<{ width: number; height: number } | null>(null);
  const [canvasStyleSize, setCanvasStyleSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Stan przeciągania myszką (Pan & Drag)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);

  // Obsługa klawiatury (Escape, strzałki stron, powiększenie +/-)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentPage((p) => Math.min(totalPages, p + 1));
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(3.0, Number((s + 0.15).toFixed(2))));
      } else if (e.key === '-') {
        setScale((s) => Math.max(0.4, Number((s - 0.15).toFixed(2))));
      } else if (e.key === '0') {
        setScale(1.0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, totalPages]);

  // Obsługa kółka myszy z Ctrl / Command lub gestu pinch do zoomowania
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        setScale((s) => Math.min(3.0, Math.max(0.4, Number((s + delta).toFixed(2)))));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Ładowanie instancji dokumentu PDF za pomocą pdfjsLib
  useEffect(() => {
    let isCancelled = false;
    setCurrentPage(1);
    setIsLoadingDoc(true);
    setIsEditingPlate(false);
    setScale(1.15);

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

        // Zapamiętujemy naturalny rozmiar strony (dla dopasowywania do szerokości/okna)
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        setNaturalPageSize({ width: unscaledViewport.width, height: unscaledViewport.height });

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });

        const displayWidth = Math.floor(viewport.width);
        const displayHeight = Math.floor(viewport.height);

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);

        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        setCanvasStyleSize({ width: displayWidth, height: displayHeight });

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

  // Obsługa przeciągania myszą (Pan & Drag przy powiększeniu)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || !scrollContainerRef.current) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: scrollContainerRef.current.scrollLeft,
      scrollTop: scrollContainerRef.current.scrollTop
    });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    scrollContainerRef.current.scrollLeft = dragStart.scrollLeft - dx;
    scrollContainerRef.current.scrollTop = dragStart.scrollTop - dy;
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Dopasowanie do szerokości okna
  const handleFitWidth = () => {
    if (!scrollContainerRef.current || !naturalPageSize) return;
    const availableWidth = scrollContainerRef.current.clientWidth - 64;
    if (availableWidth > 0 && naturalPageSize.width > 0) {
      const calculatedScale = Math.max(0.4, Math.min(3.0, availableWidth / naturalPageSize.width));
      setScale(Number(calculatedScale.toFixed(2)));
    }
  };

  // Dopasowanie do całej strony (Fit to view)
  const handleFitPage = () => {
    if (!scrollContainerRef.current || !naturalPageSize) return;
    const availableWidth = scrollContainerRef.current.clientWidth - 64;
    const availableHeight = scrollContainerRef.current.clientHeight - 64;
    if (availableWidth > 0 && availableHeight > 0 && naturalPageSize.width > 0 && naturalPageSize.height > 0) {
      const scaleW = availableWidth / naturalPageSize.width;
      const scaleH = availableHeight / naturalPageSize.height;
      const calculatedScale = Math.max(0.4, Math.min(3.0, Math.min(scaleW, scaleH)));
      setScale(Number(calculatedScale.toFixed(2)));
    }
  };

  const handleResetZoom = () => {
    setScale(1.0);
  };

  if (!contract) return null;

  const handleSavePlate = () => {
    if (editPlateValue.trim() && onUpdateRegistration) {
      onUpdateRegistration(contract.id, editPlateValue.trim().toUpperCase());
    }
    setIsEditingPlate(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-xs">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-6xl w-full h-[94vh] flex flex-col overflow-hidden z-10 border border-slate-300">
        {/* Pasek nagłówka */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {isEditingPlate ? (
              <div className="flex items-center gap-1.5 shrink-0">
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
                  className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer shadow-xs"
                  title="Zapisz numer"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
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
                <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  {contract.customFilename}
                </h3>
                {contract.plateSource === 'ocr' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 inline-flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    OCR
                  </span>
                )}
                {contract.hasInformationClause && (
                  <span className="hidden md:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 items-center gap-1">
                    Klauzula RODO
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate">
                Strony w pliku źródłowym: {contract.pageIndices.map((p) => p + 1).join(', ')} ({contract.pageCount} {contract.pageCount === 1 ? 'strona' : contract.pageCount < 5 ? 'strony' : 'stron'})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Zaawansowane narzędzia lupy / powiększenia */}
            <div className="flex items-center gap-0.5 sm:gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.4, Number((s - 0.15).toFixed(2))))}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                title="Pomniejsz (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleResetZoom}
                className="text-[11px] font-mono px-1.5 py-0.5 tabular-nums text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer font-bold"
                title="Kliknij, aby zresetować do 100% (klawisz 0)"
              >
                {Math.round(scale * 100)}%
              </button>

              <button
                type="button"
                onClick={() => setScale((s) => Math.min(3.0, Number((s + 0.15).toFixed(2))))}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                title="Powiększ (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              <span className="w-px h-4 bg-slate-200 mx-0.5" />

              <button
                type="button"
                onClick={handleFitWidth}
                className="hidden md:inline-flex p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                title="Dopasuj do szerokości okna"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleFitPage}
                className="hidden md:inline-flex p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                title="Dopasuj do całej strony"
              >
                <Minimize2 className="w-3.5 h-3.5" />
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
              className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
              title="Pobierz ten plik PDF na dysk"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pobierz PDF</span>
            </button>

            {/* Zamknij */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer ml-1"
              title="Zamknij (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pasek szczegółowych parametrów umowy dla całkowitej pewności */}
        <div className="bg-slate-100/90 px-6 py-2 border-b border-slate-200 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs shrink-0">
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
            <div className="inline-flex items-center gap-1.5 text-slate-800 font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
              <span>VIN: {screenPrivacyMode ? maskVin(contract.vin) : contract.vin}</span>
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
              <span className="truncate max-w-xs">
                {screenPrivacyMode ? maskPersonName(contract.policyHolder) : contract.policyHolder}
              </span>
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

        {/* 
          Obszar podglądu Canvas z nieograniczonym przesuwaniem (Pan & Drag)
          i pełną widocznością każdego fragmentu dokumentu po przybliżeniu.
        */}
        <div
          ref={scrollContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`flex-1 bg-slate-900/90 overflow-auto relative select-none ${
            isDragging ? 'cursor-grabbing' : scale > 1 ? 'cursor-grab' : 'cursor-default'
          }`}
          style={{ overscrollBehavior: 'contain' }}
        >
          {isLoadingDoc && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/70 backdrop-blur-xs gap-3 z-20 text-white">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              <span className="text-sm font-medium text-slate-200">
                Renderowanie stron dokumentu...
              </span>
            </div>
          )}

          {/* 
            Gwarancja pełnej widoczności dokumentu po przybliżeniu (Zero Cutoff):
            Użycie 'm-auto' na karcie wewnątrz kontenera flex (bez items-center justify-center)
            zapewnia idealne wyśrodkowanie, gdy strona mieści się w oknie, oraz
            płynne wyrównanie do (0,0) przy powiększeniu, co eliminuje ujemne współrzędne flexboxa
            i pozwala przewinąć oraz przeciągnąć każdy zakątek dokumentu bez ucinania krawędzi.
          */}
          <div className="min-w-full min-h-full p-8 sm:p-14 flex">
            <div
              className="m-auto bg-white shadow-2xl rounded-sm border border-slate-700/50 shrink-0 transition-shadow duration-150"
              style={{
                width: canvasStyleSize.width ? `${canvasStyleSize.width}px` : 'auto',
                height: canvasStyleSize.height ? `${canvasStyleSize.height}px` : 'auto',
              }}
            >
              <canvas
                ref={canvasRef}
                className="block pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* Pasek nawigacji stron i pomocniczych wskazówek */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
            <span>Strona {currentPage} z {totalPages} w tej umowie</span>
            {scale > 1.2 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                <Move className="w-3 h-3" />
                Możesz przeciągać dokument myszką
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
              title="Poprzednia strona (Strzałka w lewo)"
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
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
              title="Następna strona (Strzałka w prawo)"
            >
              <ChevronRight className="w-4 h-4 text-slate-700" />
            </button>
          </div>

          <div className="text-xs text-slate-400 hidden lg:flex items-center gap-3">
            <span>Skróty: Ctrl + kółko myszy = lupa</span>
            <span>·</span>
            <span>Przeciągaj myszką, aby przesuwać</span>
          </div>
        </div>
      </div>
    </div>
  );
};
