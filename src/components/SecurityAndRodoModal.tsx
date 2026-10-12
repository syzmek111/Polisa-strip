import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Lock,
  FileText,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Server,
  Eye,
  EyeOff,
  Database,
  RefreshCw,
  Info,
  Scale,
  Cpu,
  Layers,
  KeyRound,
  FileCheck
} from 'lucide-react';
import {
  getRodoAuditLogs,
  clearRodoAuditLogs,
  exportAuditLogsAsText,
  exportAuditLogsAsJson,
  purgeAllApplicationData,
  getPrivacySettings,
  savePrivacySettings
} from '../utils/security';
import { RodoAuditLogEntry, SecurityPrivacySettings } from '../types/security';

interface SecurityAndRodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurgeDataSuccess?: () => void;
  privacySettings: SecurityPrivacySettings;
  onPrivacySettingsChange: (settings: SecurityPrivacySettings) => void;
}

export const SecurityAndRodoModal: React.FC<SecurityAndRodoModalProps> = ({
  isOpen,
  onClose,
  onPurgeDataSuccess,
  privacySettings,
  onPrivacySettingsChange,
}) => {
  const [activeTab, setActiveTab] = useState<'rodo' | 'security' | 'audit' | 'data'>('rodo');
  const [auditLogs, setAuditLogs] = useState<RodoAuditLogEntry[]>([]);
  const [isPurging, setIsPurging] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeSuccessMessage, setPurgeSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAuditLogs(getRodoAuditLogs());
      setPurgeSuccessMessage(null);
      setShowPurgeConfirm(false);
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleDownloadAuditTxt = () => {
    const text = exportAuditLogsAsText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PolisaSplit_Rejestr_RODO_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAuditJson = () => {
    const json = exportAuditLogsAsJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PolisaSplit_Audyt_RODO_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearLogs = () => {
    clearRodoAuditLogs();
    setAuditLogs([]);
  };

  const handlePurgeAll = () => {
    setIsPurging(true);
    setTimeout(() => {
      const result = purgeAllApplicationData();
      setIsPurging(false);
      setShowPurgeConfirm(false);
      setPurgeSuccessMessage(`Wyczyszczono wszystkie dane aplikacji (${result.clearedKeysCount} rekordów). Pamięć podręczna jest czysta.`);
      setAuditLogs([]);
      if (onPurgeDataSuccess) {
        onPurgeDataSuccess();
      }
    }, 400);
  };

  const toggleScreenPrivacy = () => {
    const updated = savePrivacySettings({ screenPrivacyMode: !privacySettings.screenPrivacyMode });
    onPrivacySettingsChange(updated);
  };

  const toggleSessionPasswords = () => {
    const updated = savePrivacySettings({ storePasswordsInSessionOnly: !privacySettings.storePasswordsInSessionOnly });
    onPrivacySettingsChange(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] z-10 border border-slate-200 overflow-hidden">
        {/* Nagłówek modalu */}
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Centrum Bezpieczeństwa i Zgodności RODO
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Zgodność z RODO / GDPR
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Standardy ochrony danych osobowych, rejestr czynności przetwarzania (art. 30) oraz zabezpieczenia techniczne (art. 32)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            title="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Zakładki */}
        <div className="flex border-b border-slate-200 bg-white px-6 shrink-0 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('rodo')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'rodo'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Klauzula RODO (Art. 13/14)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'security'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Zabezpieczenia Techniczne (Art. 32)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'audit'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Rejestr Czynności (Art. 30)</span>
            {auditLogs.length > 0 && (
              <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full text-[10px] font-mono">
                {auditLogs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'data'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Prawo do Zapomnienia (Art. 17)</span>
          </button>
        </div>

        {/* Zawartość zakładek */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: KLAUZULA RODO */}
          {activeTab === 'rodo' && (
            <div className="space-y-6 text-sm text-slate-700 leading-relaxed">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-emerald-900 mb-1">
                    Architektura zerowego zapisu (Privacy by Design / Client-Side Zero Storage)
                  </h4>
                  <p className="text-xs text-emerald-800">
                    Wszystkie pliki PDF z umowami i polisami ubezpieczeniowymi są wczytywane, dzielone,
                    analizowane i kompresowane do ZIP <strong>wyłącznie w pamięci operacyjnej RAM Twojej przeglądarki</strong>.
                    Żadne dane dokumentów nie są zapisywane na dyskach twardych serwera ani w zewnętrznych bazach danych.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="font-semibold text-slate-900 flex items-center gap-2 text-xs uppercase tracking-wider text-blue-700">
                    <Scale className="w-4 h-4" />
                    1. Administrator i Kontrola Danych
                  </div>
                  <p className="text-xs text-slate-600">
                    Użytkownik aplikacji (agent ubezpieczeniowy, pracownik firmy lub zarządca floty) zachowuje pełną,
                    wyłączną kontrolę nad procesem przetwarzania. Aplikacja PolisaSplit stanowi narzędzie wspierające
                    pracę kancelaryjną i nie przejmuje roli zewnętrznego administratora danych.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="font-semibold text-slate-900 flex items-center gap-2 text-xs uppercase tracking-wider text-blue-700">
                    <FileCheck className="w-4 h-4" />
                    2. Podstawy Prawne (Art. 6 RODO)
                  </div>
                  <p className="text-xs text-slate-600">
                    Operacje wykonywane są na podstawie:
                    <br />• <strong>Art. 6 ust. 1 lit. b RODO</strong> – wykonanie umowy lub czynności na żądanie podmiotu danych.
                    <br />• <strong>Art. 6 ust. 1 lit. f RODO</strong> – prawnie uzasadniony interes w organizacji dokumentacji i obsłudze flot.
                    <br />• <strong>Art. 6 ust. 1 lit. a RODO</strong> – dobrowolna zgoda na wysyłkę e-mail.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="font-semibold text-slate-900 flex items-center gap-2 text-xs uppercase tracking-wider text-blue-700">
                    <Cpu className="w-4 h-4" />
                    3. Kategorie Przetwarzanych Danych
                  </div>
                  <p className="text-xs text-slate-600">
                    Zakres odczytywanych danych z polis obejmuje: numery rejestracyjne pojazdów, numery VIN,
                    dane ubezpieczyciela, numery polis, dane ubezpieczających/właścicieli oraz okresy ochrony.
                    Zgodnie z zasadą minimalizacji (art. 5 ust. 1 lit. c RODO) odczytywane są jedynie parametry niezbędne do nazwania i przypisania pliku.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="font-semibold text-slate-900 flex items-center gap-2 text-xs uppercase tracking-wider text-blue-700">
                    <ShieldCheck className="w-4 h-4" />
                    4. Prawa Osób i Organ Nadzorczy
                  </div>
                  <p className="text-xs text-slate-600">
                    Osoby, których dane dotyczą, mają prawo do: dostępu, sprostowania, usunięcia danych (&quot;prawo do zapomnienia&quot;),
                    ograniczenia przetwarzania oraz wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (UODO, ul. Stawki 2, 00-193 Warszawa).
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50 text-xs text-blue-900 space-y-2">
                <div className="font-bold flex items-center gap-2 text-blue-950">
                  <Info className="w-4 h-4 text-blue-600" />
                  Wysyłka e-mail a bezpieczeństwo RODO (Zapobieganie naruszeniom art. 33/34 RODO)
                </div>
                <p>
                  Przesyłanie wyodrębnionych dokumentów ubezpieczeniowych pocztą elektroniczną wymaga zachowania szczególnej staranności.
                  PolisaSplit wymusza weryfikację adresu e-mail odbiorcy oraz oświadczenie o posiadaniu podstawy prawnej
                  przed wysyłką, chroniąc przed omyłkowym ujawnieniem danych poufnych osobom nieuprawnionym.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: ZABEZPIECZENIA TECHNICZNE (ART. 32 RODO & OWASP) */}
          {activeTab === 'security' && (
            <div className="space-y-6 text-sm text-slate-700">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-blue-600" />
                  Wdrożone Standardy Bezpieczeństwa Aplikacji (OWASP Top 10)
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="p-3.5 flex items-start gap-3 bg-white">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">Szyfrowanie transmisji i HSTS</div>
                      <div className="text-slate-500 mt-0.5">
                        Wymuszenie protokołów TLS 1.3 / SSL z nagłówkiem <code>Strict-Transport-Security: max-age=31536000</code>.
                        Transmisja załączników oraz danych logowania jest w pełni szyfrowana.
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 flex items-start gap-3 bg-white">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">Restrykcyjna Polityka CSP & Nagłówki Ochronne</div>
                      <div className="text-slate-500 mt-0.5">
                        Wdrożono <code>Content-Security-Policy</code>, <code>X-Content-Type-Options: nosniff</code> (blokada MIME sniffing),
                        <code>X-Frame-Options: SAMEORIGIN</code> (ochrona przed Clickjacking) oraz izolację uprawnień.
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 flex items-start gap-3 bg-white">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">Ochrona przed SSRF (Server-Side Request Forgery)</div>
                      <div className="text-slate-500 mt-0.5">
                        Połączenia SMTP przechodzą rygorystyczną filtrację: zablokowano łączenie się z pętlą zwrotną (localhost, 127.0.0.1),
                        prywatnymi podsieciami wewnętrznymi (RFC 1918) oraz punktami metadanych chmurowych (169.254.169.254).
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 flex items-start gap-3 bg-white">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">Ochrona przed atakami Brute-Force (Rate Limiting)</div>
                      <div className="text-slate-500 mt-0.5">
                        Wprowadzono mechanizm ograniczenia liczby żądań (sliding-window rate limiter) na punktach weryfikacji SMTP
                        oraz wysyłki maili z kodem odpowiedzi HTTP 429 i nagłówkiem <code>Retry-After</code>.
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 flex items-start gap-3 bg-white">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">Weryfikacja sygnatury binarnej plików PDF (Magic Bytes)</div>
                      <div className="text-slate-500 mt-0.5">
                        Przed dołączeniem jakiegokolwiek załącznika serwer sprawdza czy pierwsze bajty w buforze binarnym
                        odpowiadają podpisowi formatu PDF (<code>%PDF-</code>). Zapobiega to przesyłaniu plików wykonywalnych lub skryptów.
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 flex items-start gap-3 bg-white">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">Zabezpieczenie przed CRLF & Header Injection</div>
                      <div className="text-slate-500 mt-0.5">
                        Wszystkie nagłówki (temat, nadawca, odbiorca, DW, reply-to) są oczyszczane ze znaków nowego wiersza (\r, \n),
                        eliminując podatności wstrzykiwania nagłówków pocztowych.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: REJESTR CZYNNOŚCI PRZETWARZANIA (ART. 30 RODO) */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <div className="font-bold text-xs text-slate-900">
                    Lokalny Dziennik Czynności Przetwarzania (Art. 30 RODO)
                  </div>
                  <div className="text-xs text-slate-500">
                    Zapisuje operacje importu, wyodrębniania polis, pobierania i wysyłki e-mail w przeglądarce.
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadAuditTxt}
                    disabled={auditLogs.length === 0}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    Raport TXT
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadAuditJson}
                    disabled={auditLogs.length === 0}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    Eksport JSON
                  </button>
                  <button
                    type="button"
                    onClick={handleClearLogs}
                    disabled={auditLogs.length === 0}
                    className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                    title="Wyczyść wpisy rejestru"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">Brak zarejestrowanych operacji w bieżącej sesji.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Wpisy pojawią się automatycznie po wczytaniu plików, podziale polis, pobraniu paczki ZIP lub wysyłce e-mail.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/80">
                      <div>
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-[10px]">
                            {log.action}
                          </span>
                          <span>{log.title}</span>
                        </div>
                        <div className="text-slate-600 mt-0.5">{log.description}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Podstawa: {log.legalBasis}
                          {log.recipient && ` · Odbiorca: ${log.recipient}`}
                          {log.itemCount !== undefined && ` · Polis: ${log.itemCount}`}
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleString('pl-PL')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ZARZĄDZANIE DANYMI I PRAWO DO ZAPOMNIENIA (ART. 17 RODO) */}
          {activeTab === 'data' && (
            <div className="space-y-6 text-sm text-slate-700">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-900 mb-1">
                    Prawo do usunięcia danych (&quot;Prawo do bycia zapomnianym&quot; - Art. 17 RODO)
                  </h4>
                  <p className="text-xs text-amber-800">
                    W dowolnym momencie możesz całkowicie zresetować stan aplikacji i usunąć z przeglądarki
                    wszystkie zapisane konta pocztowe, adresy odbiorców, historię czynności audytowych
                    oraz załadowane dokumenty polis.
                  </p>
                </div>
              </div>

              {/* Opcje prywatności */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Ustawienia Bezpieczeństwa i Ochrony Prywatności
                </h4>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-2 text-xs">
                      {privacySettings.screenPrivacyMode ? (
                        <EyeOff className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Eye className="w-4 h-4 text-slate-400" />
                      )}
                      Tryb ochrony ekranu (Maskowanie poufnych danych)
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Ukrywa pełne numery VIN, nazwiska właścicieli i numery rejestracyjne na liście i podglądzie (ochrona przed podglądaniem w otwartym biurze).
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleScreenPrivacy}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      privacySettings.screenPrivacyMode
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {privacySettings.screenPrivacyMode ? 'Włączone' : 'Wyłączone'}
                  </button>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-2 text-xs">
                      <KeyRound className="w-4 h-4 text-slate-500" />
                      Przechowywanie haseł SMTP wyłącznie w pamięci sesji (SessionStorage)
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Hasła do skrzynek firmowych nie będą zapisywane na stałe w przeglądarce i zostaną usunięte natychmiast po zamknięciu karty lub przeglądarki.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleSessionPasswords}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      privacySettings.storePasswordsInSessionOnly
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {privacySettings.storePasswordsInSessionOnly ? 'Tylko sesja' : 'Pamięć trwała'}
                  </button>
                </div>
              </div>

              {/* Czyszczenie danych */}
              <div className="pt-4 border-t border-slate-200">
                <div className="p-4 bg-rose-50/60 border border-rose-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-rose-900 font-bold text-xs uppercase tracking-wider">
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    Kompletne czyszczenie pamięci aplikacji
                  </div>
                  <p className="text-xs text-rose-800">
                    Operacja ta bezpowrotnie usunie wszystkie lokalnie zapisane konfiguracje skrzynek pocztowych,
                    historie odbiorców, zapamiętane preferencje oraz zwolni całą pamięć operacyjną RAM.
                  </p>

                  {purgeSuccessMessage && (
                    <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-lg text-xs text-emerald-800 font-medium">
                      {purgeSuccessMessage}
                    </div>
                  )}

                  {!showPurgeConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowPurgeConfirm(true)}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Wyczyść wszystkie dane (Realizuj Prawo do Zapomnienia)
                    </button>
                  ) : (
                    <div className="p-3 bg-white border border-rose-300 rounded-lg space-y-2">
                      <div className="text-xs font-bold text-slate-900">
                        Czy na pewno chcesz usunąć wszystkie zapisane dane?
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isPurging}
                          onClick={handlePurgeAll}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                        >
                          {isPurging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Tak, wyczyść bezpowrotnie
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPurgeConfirm(false)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          Anuluj
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stopka modalu */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Bezpieczne środowisko piaskownicy przeglądarki (Browser Sandbox)</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shadow-2xs"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};
