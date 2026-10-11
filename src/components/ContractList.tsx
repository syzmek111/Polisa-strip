import React, { useState } from 'react';
import {
  FileArchive,
  Search,
  Eye,
  Edit2,
  Check,
  RotateCcw,
  FileText,
  Building,
  Car,
  Download,
  Calendar,
  User,
  ShieldAlert,
  Hash,
  Coins,
  Sparkles,
  Camera,
  AlertCircle,
  Mail,
  Send
} from 'lucide-react';
import { PolicyContract } from '../types/policy';
import { LicensePlateBadge } from './LicensePlateBadge';
import { triggerFileDownload } from '../utils/pdfProcessor';

interface ContractListProps {
  contracts: PolicyContract[];
  totalPages: number;
  originalFileName: string;
  onUpdateRegistration: (contractId: string, newPlate: string) => void;
  onDownloadZip: () => void;
  onPreviewContract: (contract: PolicyContract) => void;
  onReset: () => void;
  isZipping: boolean;
  onOpenEmailModal: (preselectedContracts?: PolicyContract[]) => void;
}

export const ContractList: React.FC<ContractListProps> = ({
  contracts,
  totalPages,
  originalFileName,
  onUpdateRegistration,
  onDownloadZip,
  onPreviewContract,
  onReset,
  isZipping,
  onOpenEmailModal
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlateValue, setEditPlateValue] = useState('');

  const nonTextCount = contracts.filter((c) => c.plateSource === 'ocr' || c.isNonTextOrScanned).length;

  const filteredContracts = contracts.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.registrationNumber.toLowerCase().includes(q) ||
      c.customFilename.toLowerCase().includes(q) ||
      (c.insurerName && c.insurerName.toLowerCase().includes(q)) ||
      (c.policyNumber && c.policyNumber.toLowerCase().includes(q)) ||
      (c.vin && c.vin.toLowerCase().includes(q)) ||
      (c.vehicleModel && c.vehicleModel.toLowerCase().includes(q)) ||
      (c.policyHolder && c.policyHolder.toLowerCase().includes(q)) ||
      (c.insurancePeriod && c.insurancePeriod.toLowerCase().includes(q))
    );
  });

  const startEditing = (contract: PolicyContract) => {
    setEditingId(contract.id);
    setEditPlateValue(contract.registrationNumber.startsWith('POLISA') ? '' : contract.registrationNumber);
  };

  const saveEditing = (contractId: string) => {
    if (editPlateValue.trim()) {
      onUpdateRegistration(contractId, editPlateValue.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, contractId: string) => {
    if (e.key === 'Enter') {
      saveEditing(contractId);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Karta podsumowania i akcji */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
              <span>Wyniki analizy i weryfikacji umów</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Wyodrębniono {contracts.length}{' '}
              {contracts.length === 1 ? 'umowę' : contracts.length < 5 ? 'umowy' : 'umów'}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{originalFileName}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums font-mono">{totalPages} stron łącznie</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 font-medium">Nazwy plików: czyste numery rejestracyjne (.pdf)</span>
              {nonTextCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-purple-700 font-medium bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                    <Sparkles className="w-3 h-3 text-purple-600" />
                    {nonTextCount} {nonTextCount === 1 ? 'umowa odczytana z obrazu (OCR)' : 'umów z odczytem z obrazu (OCR)'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onReset}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Wgraj inny plik</span>
            </button>

            {/* Przycisk wysyłki wybranych plików przez Gmail */}
            <button
              type="button"
              onClick={() => onOpenEmailModal()}
              disabled={contracts.length === 0}
              className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
              title="Wyślij wybrane pliki PDF bezpośrednio ze swojego maila"
            >
              <Mail className="w-4 h-4 text-blue-600" />
              <span>Wyślij e-mail</span>
            </button>

            <button
              type="button"
              onClick={onDownloadZip}
              disabled={isZipping || contracts.length === 0}
              className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-md transition-all cursor-pointer inline-flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileArchive className="w-5 h-5" />
              <span>
                Pobierz paczkę ZIP ({contracts.length} {contracts.length === 1 ? 'plik' : 'plików'})
              </span>
            </button>
          </div>
        </div>

        {/* Filtr i statystyki */}
        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filtruj wg rejestracji, VIN, polisy, nazwiska, marki..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="text-xs text-slate-500 self-end sm:self-center font-mono tabular-nums">
            Wyświetlanie: {filteredContracts.length} z {contracts.length}
          </div>
        </div>
      </div>

      {/* Lista poszczególnych umów */}
      <div className="space-y-4">
        {filteredContracts.map((contract) => {
          const isEditing = editingId === contract.id;
          const pageRangeStr =
            contract.pageIndices.length === 1
              ? `Strona ${contract.pageIndices[0] + 1}`
              : `Strony ${contract.pageIndices[0] + 1}–${contract.pageIndices[contract.pageIndices.length - 1] + 1}`;

          const isUnassigned =
            contract.registrationNumber.startsWith('POLISA') ||
            contract.detectionConfidence === 'fallback' ||
            contract.isNonTextOrScanned;

          return (
            <div
              key={contract.id}
              className={`bg-white border rounded-2xl p-5 shadow-xs transition-all hover:border-slate-300 ${
                isUnassigned ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      contract.plateSource === 'ocr'
                        ? 'bg-purple-100 text-purple-700'
                        : isUnassigned
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {contract.plateSource === 'ocr' ? (
                      <Camera className="w-5 h-5 text-purple-600" />
                    ) : (
                      <Car className="w-6 h-6" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editPlateValue}
                            onChange={(e) => setEditPlateValue(e.target.value.toUpperCase())}
                            onKeyDown={(e) => handleKeyDown(e, contract.id)}
                            autoFocus
                            className="px-2.5 py-1 text-sm font-mono font-bold uppercase border-2 border-blue-500 rounded-lg focus:outline-none w-36 bg-blue-50/50"
                            placeholder="NP. KR12345"
                          />
                          <button
                            type="button"
                            onClick={() => saveEditing(contract.id)}
                            className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
                            title="Zapisz numer rejestracyjny"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <LicensePlateBadge
                            plateNumber={isUnassigned ? 'BRAK NUMERU' : contract.registrationNumber}
                            size="md"
                          />
                          <button
                            type="button"
                            onClick={() => startEditing(contract)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                            title="Zmień numer rejestracyjny"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono">
                        {contract.customFilename}
                      </span>

                      {/* Odznaka źródła danych */}
                      {contract.plateSource === 'ocr' && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200 inline-flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-600" />
                          OCR (z obrazu)
                        </span>
                      )}

                      {contract.plateSource === 'annotation' && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Formularz PDF
                        </span>
                      )}

                      {contract.plateSource === 'text' && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          Warstwa tekstowa
                        </span>
                      )}

                      <span className="text-xs text-slate-400 font-mono">
                        (Umowa #{contract.contractIndex})
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span className="font-mono tabular-nums">{pageRangeStr}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {contract.pageCount} {contract.pageCount === 1 ? 'strona' : contract.pageCount < 5 ? 'strony' : 'stron'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => onPreviewContract(contract)}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    title="Zobacz pełny podgląd stron tej umowy"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>Podgląd stron</span>
                  </button>

                  {/* Bezpośrednia wysyłka pojedynczej umowy na e-mail */}
                  <button
                    type="button"
                    onClick={() => onOpenEmailModal([contract])}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    title={`Wyślij ${contract.customFilename} na e-mail`}
                  >
                    <Mail className="w-3.5 h-3.5 text-blue-600" />
                    <span className="hidden sm:inline">Wyślij na mail</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (contract.pdfBlob) {
                        triggerFileDownload(contract.pdfBlob, contract.customFilename);
                      }
                    }}
                    className="px-3.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    title={`Pobierz plik ${contract.customFilename}`}
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>Pobierz PDF</span>
                  </button>
                </div>
              </div>

              {/* Informacja i asystent gdy dane są w formacie graficznym / brak tekstu */}
              {isUnassigned && (
                <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Dane w formacie graficznym (skan / brak numeru w warstwie tekstowej)</span>
                  </div>
                  <p className="text-amber-800 mb-2">
                    Na tej stronie nie znaleziono cyfrowego tekstu z numerem rejestracyjnym. Dokument został
                    zabezpieczony pod nazwą roboczą{' '}
                    <strong className="font-mono">{contract.customFilename}</strong>. Możesz wpisać poprawny numer
                    klikając ikonę ołówka lub wybrać z propozycji odczytanych z grafiki (OCR):
                  </p>

                  {contract.suggestedPlates && contract.suggestedPlates.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="font-medium text-amber-950 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                        Sugerowane z grafiki:
                      </span>
                      {contract.suggestedPlates.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => onUpdateRegistration(contract.id, sug)}
                          className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-mono font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                        >
                          Użyj: {sug}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Szczegółowe metadane polisy */}
              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
                {contract.insurerName && (
                  <div className="space-y-0.5">
                    <div className="text-slate-400 flex items-center gap-1">
                      <Building className="w-3 h-3 text-slate-400" />
                      <span>Ubezpieczyciel</span>
                    </div>
                    <div className="font-semibold text-slate-800 truncate" title={contract.insurerName}>
                      {contract.insurerName}
                    </div>
                  </div>
                )}

                {contract.policyNumber && (
                  <div className="space-y-0.5">
                    <div className="text-slate-400 flex items-center gap-1">
                      <Hash className="w-3 h-3 text-slate-400" />
                      <span>Numer polisy</span>
                    </div>
                    <div className="font-mono font-semibold text-slate-800 truncate" title={contract.policyNumber}>
                      {contract.policyNumber}
                    </div>
                  </div>
                )}

                {contract.policyHolder && (
                  <div className="space-y-0.5">
                    <div className="text-slate-400 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>Ubezpieczający</span>
                    </div>
                    <div className="font-semibold text-slate-800 truncate" title={contract.policyHolder}>
                      {contract.policyHolder}
                    </div>
                  </div>
                )}

                {contract.vehicleModel && (
                  <div className="space-y-0.5">
                    <div className="text-slate-400 flex items-center gap-1">
                      <Car className="w-3 h-3 text-slate-400" />
                      <span>Pojazd</span>
                    </div>
                    <div className="font-semibold text-slate-800 truncate" title={contract.vehicleModel}>
                      {contract.vehicleModel}
                    </div>
                  </div>
                )}

                {contract.vin && (
                  <div className="space-y-0.5">
                    <div className="text-slate-400 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-slate-400" />
                      <span>VIN</span>
                    </div>
                    <div className="font-mono font-semibold text-slate-800 truncate" title={contract.vin}>
                      {contract.vin}
                    </div>
                  </div>
                )}

                {contract.insurancePeriod && (
                  <div className="space-y-0.5">
                    <div className="text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>Okres ochrony</span>
                    </div>
                    <div className="font-mono text-slate-800 truncate" title={contract.insurancePeriod}>
                      {contract.insurancePeriod}
                    </div>
                  </div>
                )}

                {contract.coverageTypes && contract.coverageTypes.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="text-slate-400">Zakres ochrony</div>
                    <div className="flex flex-wrap gap-1">
                      {contract.coverageTypes.map((cov) => (
                        <span
                          key={cov}
                          className="px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded font-semibold text-[10px]"
                        >
                          {cov}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {contract.totalPremium && (
                  <div className="space-y-0.5">
                    <div className="text-slate-400 flex items-center gap-1">
                      <Coins className="w-3 h-3 text-slate-400" />
                      <span>Składka łączna</span>
                    </div>
                    <div className="font-mono font-bold text-slate-800 truncate">
                      {contract.totalPremium}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
