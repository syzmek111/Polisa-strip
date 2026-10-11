# Rozdzielacz Umów Ubezpieczeniowych PDF (PolisaSplit)

Kompleksowa aplikacja webowa do automatycznego dzielenia wielostronicowych plików PDF zawierających umowy ubezpieczeniowe na osobne dokumenty PDF, rozpoznawania numerów rejestracyjnych pojazdów (oraz numerów polis) i eksportu kompletu plików w jednym zbiorczym archiwum ZIP.

### User Review & Critical Decisions

> [!IMPORTANT]
> Na podstawie odpowiedzi z Fazy 1 ustalono kluczowe zasady działania aplikacji:

- **Confirmed Decision 1 (Zasada podziału umów)**: Wykrywanie nowej umowy następuje automatycznie w momencie zmiany numeru rejestracyjnego lub po wykryciu nagłówka nowej umowy (np. "Polisa", "Umowa ubezpieczenia", "Certyfikat"). Strony kontynuujące tę samą umowę są automatycznie łączone w jeden wielostronicowy plik danej polisy.
- **Confirmed Decision 2 (Format eksportu)**: Eksport w postaci jednej zbiorczej paczki ZIP zawierającej wszystkie wygenerowane pliki PDF nazwane odpowiednimi numerami rejestracyjnymi (np. `KR12345.pdf`, `WA9876A.pdf`).
- **Confirmed Decision 3 (Typ plików)**: Standardowe pliki PDF z zaznaczalną warstwą tekstową – natywne, ultra-szybkie przetwarzanie po stronie klienta (z gwarancją prywatności danych RODO, bez konieczności wysyłania wrażliwych umów na serwery zewnętrzne), z opcjonalnym podglądem i możliwością ręcznej korekty numeru w razie potrzeby przed pobraniem archiwum ZIP.

---

### 1. Overview & Core Concept

- **Co robi aplikacja**: Użytkownik przeciąga lub wybiera wielostronicowy plik PDF z umowami ubezpieczenia komunikacyjnego (OC/AC/NNW). Aplikacja natychmiast analizuje strukturę dokumentu strona po stronie, identyfikuje polskie tablice rejestracyjne (np. standardowe formaty 7- i 8-znakowe, tablice zabytkowe, tymczasowe itp.) oraz nagłówki umów, dzieli strony na poszczególne pakiety umów i generuje osobne pliki PDF nazwane numerami rejestracyjnymi.
- **Grupa docelowa**: Agenci i brokerzy ubezpieczeniowi, działy księgowości, floty samochodowe, firmy leasingowe i transportowe obsługujące setki polis w zbiorczych skanach lub zestawieniach.
- **Kluczowa wartość**: Oszczędność godzin żmudnego ręcznego dzielenia plików PDF i ich przepisywania. 100% prywatności (przetwarzanie w pamięci przeglądarki dzięki `pdf-lib` oraz `pdfjs-dist`), zerowe ryzyko wycieku danych osobowych i natychmiastowe pobranie gotowego archiwum ZIP.

---

### 2. User Experience & Visual Design

#### Kluczowe ścieżki użytkownika (User Flows)
1. **Stan początkowy (Dropzone)**: Nowoczesna, czysta strefa uploadu z obsługą Drag & Drop, informacją o dopuszczalnych formatach oraz opcją wypróbowania pliku demonstracyjnego (generowanego w locie testowego wielostronicowego PDF-a z umowami).
2. **Przetwarzanie dokumentu (Processing & Parsing)**: Przejrzysty wskaźnik postępu (analiza stron, rozpoznawanie numerów rejestracyjnych, cięcie stron PDF).
3. **Weryfikacja i podsumowanie (Result Grid & Table)**:
   - Podsumowanie: Liczba stron wejściowych, liczba wykrytych umów, liczba stron w każdej umowie, statusy wykrycia rejestracji.
   - Interaktywna lista umów: Wykaz z podglądem miniatury pierwszej strony, wykrytym numerem rejestracyjnym (z możliwością szybkiej edycji, jeśli system trafił na nietypowy format), zakresem stron oraz rozmiarem pliku.
   - Możliwość podejrzenia wygenerowanego PDF-a w oknie modalnym przed pobraniem.
4. **Finalna akcja (Download All ZIP)**: Wyrazisty, pojedynczy przycisk pobierania kompletnego archiwum ZIP (`Umowy_Ubezpieczeniowe_YYYY-MM-DD.zip`), w którym każdy plik nosi nazwę `[NUMER_REJESTRACYJNY].pdf` (np. `DW12345.pdf`, `PO87654.pdf`).

#### Visual Identity & Theme (SaaS Dashboard & Productivity Tool)
- **Aesthetic Direction**: Utylitarny, profesjonalny styl narzędziowy dedykowany branży ubezpieczeniowej i finansowej – stonowane barwy, wysoki kontrast, doskonała czytelność i brak zbędnych ozdobników.
- **Paleta barw**:
  - Tło główne: Neutralny, czysty jasny odcień (`#F8FAFC` / `slate-50`) z kontrastowym panelem roboczym (`#FFFFFF`).
  - Akcenty: Głęboki szafirowy granat (`#0F172A` / `#1E293B`) dla elementów nawigacji i tekstu, akcent w odcieniu ubezpieczeniowego błękitu (`#2563EB` / `blue-600`) dla akcji głównych oraz szmaragdowa zieleń (`#16A34A` / `emerald-600`) dla potwierdzonych numerów rejestracyjnych.
- **Typografia**: 
  - Nagłówki i interfejs: `Plus Jakarta Sans` / system sans-serif o wyrazistych wagach.
  - Numery rejestracyjne i dane tabelaryczne: Stylizowane fonty o stałej szerokości (`font-mono tabular-nums`), formatowane na wzór tablic rejestracyjnych (np. z subtelnym symbolem flagi PL / UE dla czytelności).
- **Zasady Zero-Pill**: Metadane (liczba stron, waga pliku, data) prezentowane w postaci czystego tekstu z separatorami (`·`), bez wielokolorowych cukierkowych badge'y.

---

### 3. Key Product Decisions & Trade-Offs

- **Klientowe przetwarzanie PDF (pdf-lib + pdfjs-dist)**:
  - *Wybrane rozwiązanie*: Parsowanie tekstu za pomocą `pdfjs-dist`, rozcinanie i scalanie stron w nowe dokumenty PDF za pomocą `pdf-lib`, pakowanie do ZIP za pomocą `jszip`.
  - *Dlaczego*: Zapewnia natychmiastowe działanie, brak limitów rozmiaru uploadu serwera, brak opóźnień sieciowych oraz spełnia rygorystyczne normy RODO (dane polis ubezpieczeniowych nigdy nie opuszczają komputera użytkownika).
  - *Alternatywa (przetwarzanie serwerowe / OCR w chmurze)*: Wymagałaby transferu gigabajtów danych, budziła obawy o poufność i wydłużała czas reakcji.
- **Wykrywanie tablic rejestracyjnych (Zaawansowany silnik RegEx z kontekstem)**:
  - *Wybrane rozwiązanie*: Wielopoziomowy algorytm Regex dopasowujący polskie formaty tablic rejestracyjnych (standardowe 2-3 litery + 4-5 cyfr/liter, tablice indywidualne, zabytkowe) wspierany wyszukiwaniem słów kluczowych w sąsiedztwie ("Nr rej.", "Numer rejestracyjny", "Pojazd", "Marka/Model", "Tablica rejestracyjna").
  - *Obsługa konfliktów*: W przypadku braku tablicy na danej stronie system sprawdza numer polisy lub nadaje bezpieczną nazwę awaryjną (np. `Umowa_Polisa_[NUMER].pdf` lub `Umowa_Strony_[OD]_[DO].pdf`) i pozwala użytkownikowi wpisać poprawny numer jednym kliknięciem.
- **Przycisk Demo / Przykładowy PDF**:
  - Użytkownik bez własnego pliku pod ręką może jednym kliknięciem wygenerować i załadować syntetyczny wielostronicowy plik z 3 różnymi umowami (np. polisy Warta, PZU, Ergo Hestia z różnymi numerami rejestracyjnymi), aby natychmiast przetestować działanie.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Przeglądarka Użytkownika                       │
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │                     Interfejs Aplikacji                      │     │
│   │  - Header & Status (PolisaSplit)                             │     │
│   │  - Strefa Wgrywania Pliku (Dropzone + Generator Demo PDF)   │     │
│   │  - Pasek Postępu & Statystyki                                │     │
│   │  - Tabela Wykrytych Umów (Podgląd, Edycja Nazwy, Miniatura)  │     │
│   │  - Przycisk Pobrania Zbiorczej Paczki ZIP                    │     │
│   └───────────────────────────────┬──────────────────────────────┘     │
│                                   │                                    │
│                                   ▼                                    │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │                 Silnik Przetwarzania PDF                     │     │
│   │                                                              │     │
│   │  1. pdfjs-dist: Ekstrakcja warstwy tekstowej ze stron        │     │
│   │  2. Regex & Boundary Engine:                                 │     │
│   │     - Rozpoznawanie nagłówków ("POLISA", "CERTYFIKAT" itp.)  │     │
│   │     - Wykrywanie rejestracji ("KR 12345", "WA9876A" itp.)    │     │
│   │     - Grupowanie stron należących do tej samej umowy         │     │
│   │  3. pdf-lib:                                                 │     │
│   │     - Kopiowanie stron źródłowych do nowych dokumentów PDF   │     │
│   │     - Serializacja do Uint8Array dla każdej umowy            │     │
│   │  4. jszip: Kompresja do archiwum ZIP i wyzwolenie pobrania   │     │
│   └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

#### Kluczowy model danych
```typescript
interface PolicyContract {
  id: string;
  contractIndex: number;
  registrationNumber: string; // np. "KR 12345"
  sanitizedFilename: string;   // np. "KR_12345.pdf"
  policyNumber?: string;       // np. "POL-2024-998811"
  insurerName?: string;        // np. "PZU SA", "Warta", "Ergo Hestia"
  pageIndices: number[];       // np. [0, 1] (strony 1 i 2)
  pageCount: number;
  pdfBlob?: Blob;
  pdfBytes?: Uint8Array;
  firstPagePreviewUrl?: string; // miniatura
  detectedConfidence: 'high' | 'medium' | 'manual';
  notes?: string;
}
```

#### Mapowanie interakcji i stanów
1. `onDrop / onFileSelect`: Walidacja pliku (typ MIME `application/pdf`, rozmiar), odczyt `ArrayBuffer`.
2. `parseDocument`: Pętla asynchroniczna przez strony PDF z aktualizacją stanu postępu (`progress: { current, total, step }`).
3. `updateRegistrationNumber(contractId, newNumber)`: Natychmiastowa aktualizacja nazwy pliku w docelowym archiwum ZIP.
4. `downloadZip`: Kompilacja wszystkich wygenerowanych umów do struktury ZIP z paskiem postępu i wywołanie natywnego pobierania pliku `Umowy_Ubezpieczeniowe.zip`.
