import React from 'react';
import { X, ShieldCheck, CheckCircle2, FileCode2, HelpCircle } from 'lucide-react';

interface InfoModalProps {
  type: 'help' | 'privacy' | null;
  onClose: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ type, onClose }) => {
  if (!type) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-xs">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 sm:p-8 z-10 border border-slate-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {type === 'help' ? (
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <HelpCircle className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Jak działa automatyczny podział umów?
            </h3>

            <div className="space-y-4 text-sm text-slate-600 mt-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  Wykrywanie nowej umowy
                </div>
                <p className="text-xs text-slate-500">
                  Aplikacja skanuje zawartość każdej strony. Jeśli na kolejnej stronie pojawi się nowy
                  numer rejestracyjny pojazdu lub nagłówek dokumentu (np. &quot;Polisa nr&quot;, &quot;Certyfikat&quot;),
                  rozpoczynany jest nowy plik PDF.
                </p>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="font-semibold text-emerald-950 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Inteligentny kontekst 2-stronicowych polis (Klauzula informacyjna / RODO)
                </div>
                <p className="text-xs text-emerald-800">
                  Większość polskich polis ubezpieczeniowych (PZU, Warta, Ergo Hestia, Generali itp.) składa się z 2 stron,
                  z czego 2. strona stanowi klauzulę informacyjną o przetwarzaniu danych osobowych (RODO), pouczenia lub oświadczenia
                  (często bez powtórzonego numeru rejestracyjnego). Zaawansowany silnik analizy tekstu wykrywa kontekst klauzuli,
                  nagłówki RODO oraz numerację (&quot;Strona 1 z 2&quot; / &quot;2 z 2&quot;), gwarantując bezbłędne łączenie obu stron w jedną kompletną umowę.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  Wielostronicowe polisy i załączniki
                </div>
                <p className="text-xs text-slate-500">
                  Wszelkie strony kontynuacji (załączniki flotowe, postanowienia szczególne, wyciągi z OWU)
                  są automatycznie rozpoznawane i dołączane do właściwej umowy.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  Obsługiwane tablice rejestracyjne
                </div>
                <p className="text-xs text-slate-500">
                  Wspierane są wszystkie polskie formaty: tablice standardowe (np. KR 12345, WA 9876A),
                  indywidualne (np. W1 BOSS), zabytkowe oraz tymczasowe.
                </p>
              </div>

              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-950">
                <div className="font-semibold mb-1 flex items-center gap-1.5 text-purple-900">
                  <CheckCircle2 className="w-4 h-4 text-purple-600" />
                  Obsługa skanów i danych graficznych (OCR)
                </div>
                <p className="text-xs text-purple-800">
                  Gdy numer rejestracyjny, VIN lub dane polisy są w formacie graficznym (np. skan dokumentu,
                  pieczątka, naklejka lub obraz bez warstwy tekstowej), zintegrowany silnik OCR
                  automatycznie odczytuje treść bezpośrednio z renderowanego obrazu.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Prywatność i bezpieczeństwo danych (RODO)
            </h3>

            <div className="space-y-4 text-sm text-slate-600 mt-4">
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 text-emerald-900">
                <div className="font-semibold mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  100% Przetwarzanie w Twojej przeglądarce
                </div>
                <p className="text-xs text-emerald-800">
                  Żaden wczytany plik PDF ani zawarte w nim dane osobowe (PESEL, adresy, kwoty, nazwiska)
                  <strong> nigdy nie opuszczają Twojego komputera</strong>. Wszystkie operacje cięcia stron,
                  odczytu tekstu i tworzenia paczki ZIP odbywają się lokalnie w pamięci RAM Twojej przeglądarki.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                  <FileCode2 className="w-4 h-4 text-blue-600" />
                  Bezpieczeństwo operacji finansowych
                </div>
                <p className="text-xs text-slate-500">
                  Możesz bezpiecznie rozdzielać poufne umowy leasingowe, floty firmowej, ubezpieczenia
                  OC/AC i dokumenty skarbowe bez obaw o wyciek informacji czy przechowywanie plików w chmurze.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};
