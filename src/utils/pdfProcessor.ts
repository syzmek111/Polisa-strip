import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  PageAnalysis,
  PolicyContract,
  ProcessingErrorCategory,
  ProcessingErrorDetails,
  ProcessingProgress
} from '../types/policy';
import { pdfjsLib } from './pdfjsWrapper';
import { analyzePageText, sanitizePlateForFilename } from './plateExtractor';
import { performOcrOnCanvas, terminateOcrWorker } from './ocrProcessor';

/**
 * Klasa błędu przetwarzania pliku PDF zawierająca precyzyjną diagnozę problemu
 */
export class PdfProcessingError extends Error implements ProcessingErrorDetails {
  title: string;
  reason: string;
  solution: string;
  category: ProcessingErrorCategory;
  rawError?: string;
  fileName?: string;
  fileSize?: number;

  constructor(
    title: string,
    reason: string,
    solution: string,
    category: ProcessingErrorCategory,
    rawError?: string,
    fileName?: string,
    fileSize?: number
  ) {
    super(reason);
    this.name = 'PdfProcessingError';
    this.title = title;
    this.reason = reason;
    this.solution = solution;
    this.category = category;
    this.rawError = rawError;
    this.fileName = fileName;
    this.fileSize = fileSize;
  }
}

/**
 * Renderuje stronę PDF do elementu Canvas lub Data URL w przeglądarce
 */
async function renderPageCanvas(
  pdfPage: any,
  scale = 1.5
): Promise<{ canvas: HTMLCanvasElement; dataUrl: string } | null> {
  try {
    if (typeof document === 'undefined') return null;
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    await pdfPage.render({
      canvasContext: ctx,
      viewport
    }).promise;

    return {
      canvas,
      dataUrl: canvas.toDataURL('image/png')
    };
  } catch (err) {
    console.warn('Błąd renderowania strony do canvas:', err);
    return null;
  }
}

/**
 * Bezpieczne renderowanie miniatury pierwszej strony
 */
async function renderPageThumbnail(pdfPage: any, scale = 0.4): Promise<string> {
  try {
    const rendered = await renderPageCanvas(pdfPage, scale);
    return rendered?.dataUrl || '';
  } catch {
    return '';
  }
}

/**
 * Główna funkcja analizy i podziału pliku PDF na poszczególne umowy.
 * Obsługuje zarówno cyfrowy tekst, jak i dane w formacie graficznym/skanowanym za pomocą OCR.
 */
export async function processPdfDocument(
  fileBytes: Uint8Array,
  fileName = 'dokument.pdf',
  onProgress?: (progress: ProcessingProgress) => void
): Promise<{ contracts: PolicyContract[]; totalPages: number }> {
  // 1. Weryfikacja podstawowa: czy plik nie jest pusty
  if (!fileBytes || fileBytes.length === 0) {
    throw new PdfProcessingError(
      'Pusty plik (0 bajtów)',
      'Wskazany plik nie zawiera żadnych danych (jego rozmiar wynosi 0 B).',
      'Upewnij się, że plik został poprawnie zapisany lub pobrany na dysk komputera i wybierz prawidłowy dokument PDF.',
      'empty_file',
      undefined,
      fileName,
      0
    );
  }

  // 2. Weryfikacja sygnatury nagłówka PDF (%PDF)
  const headerSlice = fileBytes.slice(0, Math.min(fileBytes.length, 1024));
  let headerText = '';
  try {
    headerText = new TextDecoder('latin1').decode(headerSlice);
  } catch {
    headerText = String.fromCharCode(...Array.from(headerSlice));
  }

  if (!headerText.includes('%PDF')) {
    let guessedType = 'nieznany format binarny';
    if (headerText.startsWith('PK\x03\x04')) {
      guessedType = 'archiwum ZIP lub plik pakietu MS Office (.docx, .xlsx)';
    } else if (headerText.startsWith('\xFF\xD8\xFF')) {
      guessedType = 'obraz JPEG (.jpg)';
    } else if (headerText.startsWith('\x89PNG')) {
      guessedType = 'obraz PNG (.png)';
    } else if (headerText.startsWith('<!doctype html') || headerText.startsWith('<html')) {
      guessedType = 'strona internetowa HTML (.html)';
    }

    throw new PdfProcessingError(
      'Nieprawidłowy plik lub brak nagłówka PDF',
      `Wskazany plik nie jest dokumentem w formacie PDF (wykryto: ${guessedType}). Rozszerzenie pliku może być mylące lub plik został uszkodzony przed zapisaniem.`,
      'Wybierz rzeczywisty dokument PDF (.pdf). Jeśli posiadasz plik w innym formacie (np. Word lub JPG), zapisz go lub wyeksportuj do formatu PDF.',
      'not_pdf',
      undefined,
      fileName,
      fileBytes.length
    );
  }

  onProgress?.({
    stage: 'reading',
    current: 0,
    total: 100,
    message: 'Wczytywanie struktury pliku PDF...'
  });

  // Klonujemy bufory danych, aby zapobiec odłączeniu (detachment) bufora przez Web Worker pdfjs
  const bytesForPdfLib = new Uint8Array(fileBytes).slice();
  const bytesForPdfJs = new Uint8Array(fileBytes).slice();

  // 3. Ładowanie do pdf-lib
  let sourcePdfDoc: PDFDocument;
  try {
    sourcePdfDoc = await PDFDocument.load(bytesForPdfLib, { ignoreEncryption: true });
  } catch (err: any) {
    const raw = String(err?.message || err);
    if (/password|encrypt|decrypt/i.test(raw)) {
      throw new PdfProcessingError(
        'Dokument PDF zabezpieczony hasłem',
        'Wczytany dokument PDF jest zaszyfrowany i chroniony hasłem dostępu.',
        'Aplikacja przetwarza pliki w Twojej przeglądarce i nie może odszyfrować pliku bez hasła. Otwórz plik w przeglądarce, wydrukuj go do nowego pliku PDF (Drukuj -> Zapisz jako PDF) lub usuń hasło i wgraj plik ponownie.',
        'password_protected',
        raw,
        fileName,
        fileBytes.length
      );
    }
    throw new PdfProcessingError(
      'Uszkodzona struktura pliku PDF',
      'Plik PDF posiada błędy w strukturze tabeli obiektów lub został ucięty podczas pobierania.',
      'Pobierz dokument z portalu ubezpieczeniowego lub poczty e-mail ponownie i upewnij się, że plik otwiera się poprawnie w przeglądarce dokumentów.',
      'corrupted',
      raw,
      fileName,
      fileBytes.length
    );
  }

  const totalPages = sourcePdfDoc.getPageCount();
  if (totalPages === 0) {
    throw new PdfProcessingError(
      'Dokument nie zawiera żadnych stron',
      'Plik PDF jest poprawny technicznie, ale liczba jego stron wynosi 0.',
      'Wybierz dokument zawierający strony z umowami ubezpieczenia.',
      'corrupted',
      undefined,
      fileName,
      fileBytes.length
    );
  }

  onProgress?.({
    stage: 'analyzing',
    current: 0,
    total: totalPages,
    message: `Analizowanie stron dokumentu (łącznie ${totalPages} stron)...`
  });

  // 4. Ekstrakcja tekstu, formularzy i miniaturek za pomocą pdfjs-dist
  let pdfJsDoc: any;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: bytesForPdfJs,
      verbosity: 0
    });
    pdfJsDoc = await loadingTask.promise;
  } catch (err: any) {
    const raw = String(err?.message || err);
    if (/password|encrypt/i.test(raw)) {
      throw new PdfProcessingError(
        'Dokument PDF zabezpieczony hasłem',
        'Wczytany dokument PDF jest zaszyfrowany i chroniony hasłem dostępu.',
        'Usuń hasło przed wgraniem (np. wydrukuj dokument do nowego PDF w przeglądarce).',
        'password_protected',
        raw,
        fileName,
        fileBytes.length
      );
    }
    throw new PdfProcessingError(
      'Błąd odczytu warstwy wizualnej PDF',
      'Nie udało się zainicjalizować silnika renderowania stron dla tego dokumentu.',
      'Upewnij się, że plik nie jest uszkodzony.',
      'corrupted',
      raw,
      fileName,
      fileBytes.length
    );
  }

  const pageAnalyses: PageAnalysis[] = [];
  let totalExtractedChars = 0;
  let ocrRecognizedCount = 0;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfJsDoc.getPage(i);

    // Pobieramy warstwę tekstu cyfrowego
    const textContent = await page.getTextContent();
    let pageText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');

    // Pobieramy wartości z interaktywnych pól formularza PDF (AcroForms / adnotacje)
    try {
      const annotations = await page.getAnnotations();
      if (Array.isArray(annotations) && annotations.length > 0) {
        const annotText = annotations
          .map((a: any) =>
            [a.fieldValue, a.contents, a.buttonValue, a.alternativeText]
              .filter(Boolean)
              .join(' ')
          )
          .filter(Boolean)
          .join(' ');
        if (annotText.trim()) {
          pageText += ` ${annotText}`;
        }
      }
    } catch {
      // Ignorujemy brak adnotacji
    }

    const cleanLength = pageText.trim().length;
    totalExtractedChars += cleanLength;

    // Podstawowa analiza tekstu cyfrowego
    let analysis = analyzePageText(pageText);
    let plateSource: 'text' | 'ocr' | 'annotation' | 'manual' = analysis.bestPlate ? 'text' : 'manual';
    let isOcrUsed = false;
    let ocrText: string | undefined;
    let suggestedPlates: string[] = analysis.plates;

    // Renderujemy canvas strony do miniatury lub OCR
    let pageCanvasObj: { canvas: HTMLCanvasElement; dataUrl: string } | null = null;
    let previewDataUrl: string | undefined;

    // ROZWIĄZANIE DLA DANYCH NIETEKSTOWYCH:
    // Jeśli numer rejestracyjny NIE ZOSTAŁ odnaleziony w warstwie tekstowej (np. jest grafiką, skanem, pieczątką)
    // LUB cała strona nie posiada tekstu cyfrowego (skan dokumentu):
    // -> Uruchamiamy silnik OCR na wyrenderowanym obrazie strony!
    const needsOcr = !analysis.bestPlate || cleanLength < 60;

    if (typeof document !== 'undefined' && needsOcr) {
      onProgress?.({
        stage: 'ocr',
        current: i,
        total: totalPages,
        message: `Odczytywanie danych z obrazu strony ${i} z ${totalPages} (OCR: poszukiwanie nr rej. w grafice)...`
      });

      pageCanvasObj = await renderPageCanvas(page, 1.5);
      if (pageCanvasObj) {
        previewDataUrl = pageCanvasObj.dataUrl;

        try {
          const ocrResult = await performOcrOnCanvas(pageCanvasObj.canvas);
          if (ocrResult.text.trim()) {
            isOcrUsed = true;
            ocrText = ocrResult.text;
            ocrRecognizedCount++;

            // Jeśli OCR znalazł numer rejestracyjny w grafice / skanie:
            if (ocrResult.bestPlate) {
              analysis.bestPlate = ocrResult.bestPlate;
              plateSource = 'ocr';
            }

            // Uzupełniamy brakujące parametry z OCR
            if (!analysis.policyNumber && ocrResult.policyNumber) {
              analysis.policyNumber = ocrResult.policyNumber;
            }
            if (!analysis.vin && ocrResult.vin) {
              analysis.vin = ocrResult.vin;
            }
            if (!analysis.insurerName && ocrResult.insurerName) {
              analysis.insurerName = ocrResult.insurerName;
            }
            if (!analysis.vehicleModel && ocrResult.vehicleModel) {
              analysis.vehicleModel = ocrResult.vehicleModel;
            }
            if (!analysis.insurancePeriod && ocrResult.insurancePeriod) {
              analysis.insurancePeriod = ocrResult.insurancePeriod;
            }

            suggestedPlates = [...new Set([...suggestedPlates, ...ocrResult.suggestedPlates])];
          }
        } catch (ocrErr) {
          console.warn(`OCR pominięte dla strony ${i}:`, ocrErr);
        }
      }
    }

    if (!previewDataUrl && (i === 1 || analysis.hasHeader || analysis.isFirstPage || analysis.bestPlate)) {
      previewDataUrl = await renderPageThumbnail(page, 0.4);
    }

    pageAnalyses.push({
      pageIndex: i - 1,
      pageNumber: i,
      text: pageText,
      detectedPlates: suggestedPlates,
      bestPlate: analysis.bestPlate,
      policyNumber: analysis.policyNumber,
      insurerName: analysis.insurerName,
      policyHolder: analysis.policyHolder,
      vehicleModel: analysis.vehicleModel,
      vin: analysis.vin,
      productionYear: analysis.productionYear,
      insurancePeriod: analysis.insurancePeriod,
      coverageTypes: analysis.coverageTypes,
      totalPremium: analysis.totalPremium,
      issueDate: analysis.issueDate,
      hasHeader: analysis.hasHeader,
      pageHeaderInfo: analysis.headerSnippet,
      isFirstPageOfPolicy: analysis.isFirstPage,
      previewDataUrl,
      plateSource,
      isOcrUsed,
      ocrText,
      suggestedPlates
    });

    onProgress?.({
      stage: 'analyzing',
      current: i,
      total: totalPages,
      message: `Przetworzono dane ze strony ${i} z ${totalPages}${isOcrUsed ? ' (użyto OCR)' : ''}...`
    });
  }

  // Zwalniamy zasoby workera OCR po zakończeniu analizy
  terminateOcrWorker().catch(() => {});

  // 5. Weryfikacja: ochrona przed zupełnie pustymi plikami graficznymi (brak tekstu i brak OCR)
  if (totalExtractedChars < 10 && ocrRecognizedCount === 0) {
    throw new PdfProcessingError(
      'Brak czytelnej zawartości (pusty lub nieczytelny skan)',
      `Plik PDF ma ${totalPages} stron, lecz nie zawiera warstwy tekstowej, a na obrazach stron nie udało się odczytać żadnych znaków.`,
      'Upewnij się, że skany są czytelne i nie są uszkodzone, lub wgraj oryginalny dokument PDF pobrany z portalu ubezpieczeniowego.',
      'scanned_no_text',
      undefined,
      fileName,
      fileBytes.length
    );
  }

  // 6. Grupowanie stron w poszczególne umowy
  onProgress?.({
    stage: 'splitting',
    current: 0,
    total: totalPages,
    message: 'Precyzyjne grupowanie stron w odrębne umowy ubezpieczenia...'
  });

  interface ContractDraft {
    registrationNumber?: string;
    policyNumber?: string;
    insurerName?: string;
    policyHolder?: string;
    vehicleModel?: string;
    vin?: string;
    productionYear?: string;
    insurancePeriod?: string;
    coverageTypes?: string[];
    totalPremium?: string;
    issueDate?: string;
    pageIndices: number[];
    confidence: 'high' | 'medium' | 'fallback';
    plateSource?: 'text' | 'ocr' | 'annotation' | 'manual';
    isNonTextOrScanned?: boolean;
    suggestedPlates?: string[];
  }

  const drafts: ContractDraft[] = [];
  let currentDraft: ContractDraft | null = null;

  for (let i = 0; i < pageAnalyses.length; i++) {
    const page = pageAnalyses[i];
    const isVeryFirstPage = i === 0;

    let shouldStartNewContract = false;

    if (isVeryFirstPage) {
      shouldStartNewContract = true;
    } else if (page.bestPlate && currentDraft?.registrationNumber && page.bestPlate !== currentDraft.registrationNumber) {
      // Wyraźna zmiana numeru rejestracyjnego pomiędzy stronami -> nowa umowa
      shouldStartNewContract = true;
    } else if (page.vin && currentDraft?.vin && page.vin !== currentDraft.vin) {
      // Wyraźna zmiana numeru VIN -> nowa umowa
      shouldStartNewContract = true;
    } else if (page.policyNumber && currentDraft?.policyNumber && page.policyNumber !== currentDraft.policyNumber) {
      // Zmiana numeru polisy -> nowa umowa
      shouldStartNewContract = true;
    } else if (page.hasHeader && page.isFirstPageOfPolicy && !page.bestPlate && currentDraft?.registrationNumber) {
      // Wyraźny nowy nagłówek bez numeru rejestracyjnego, gdy strona nie jest kontynuacją (strona 2/3)
      if (!/\b(strona\s+[2-9]|str\.\s*[2-9])/i.test(page.text)) {
        shouldStartNewContract = true;
      }
    }

    if (shouldStartNewContract || !currentDraft) {
      if (currentDraft && currentDraft.pageIndices.length > 0) {
        drafts.push(currentDraft);
      }

      currentDraft = {
        registrationNumber: page.bestPlate,
        policyNumber: page.policyNumber,
        insurerName: page.insurerName,
        policyHolder: page.policyHolder,
        vehicleModel: page.vehicleModel,
        vin: page.vin,
        productionYear: page.productionYear,
        insurancePeriod: page.insurancePeriod,
        coverageTypes: page.coverageTypes,
        totalPremium: page.totalPremium,
        issueDate: page.issueDate,
        pageIndices: [page.pageIndex],
        confidence: page.bestPlate ? (page.plateSource === 'ocr' ? 'medium' : 'high') : 'fallback',
        plateSource: page.plateSource,
        isNonTextOrScanned: page.isOcrUsed || !page.bestPlate,
        suggestedPlates: page.suggestedPlates
      };
    } else {
      currentDraft.pageIndices.push(page.pageIndex);

      if (!currentDraft.registrationNumber && page.bestPlate) {
        currentDraft.registrationNumber = page.bestPlate;
        currentDraft.confidence = page.plateSource === 'ocr' ? 'medium' : 'high';
        currentDraft.plateSource = page.plateSource;
      }
      if (!currentDraft.policyNumber && page.policyNumber) {
        currentDraft.policyNumber = page.policyNumber;
      }
      if (!currentDraft.insurerName && page.insurerName) {
        currentDraft.insurerName = page.insurerName;
      }
      if (!currentDraft.policyHolder && page.policyHolder) {
        currentDraft.policyHolder = page.policyHolder;
      }
      if (!currentDraft.vehicleModel && page.vehicleModel) {
        currentDraft.vehicleModel = page.vehicleModel;
      }
      if (!currentDraft.vin && page.vin) {
        currentDraft.vin = page.vin;
      }
      if (!currentDraft.productionYear && page.productionYear) {
        currentDraft.productionYear = page.productionYear;
      }
      if (!currentDraft.insurancePeriod && page.insurancePeriod) {
        currentDraft.insurancePeriod = page.insurancePeriod;
      }
      if (!currentDraft.coverageTypes && page.coverageTypes) {
        currentDraft.coverageTypes = page.coverageTypes;
      }
      if (!currentDraft.totalPremium && page.totalPremium) {
        currentDraft.totalPremium = page.totalPremium;
      }
      if (!currentDraft.issueDate && page.issueDate) {
        currentDraft.issueDate = page.issueDate;
      }
      if (page.suggestedPlates && page.suggestedPlates.length > 0) {
        currentDraft.suggestedPlates = [
          ...new Set([...(currentDraft.suggestedPlates || []), ...page.suggestedPlates])
        ];
      }
    }
  }

  if (currentDraft && currentDraft.pageIndices.length > 0) {
    drafts.push(currentDraft);
  }

  // 7. Weryfikacja: czy znaleziono jakiekolwiek cechy polis / stron
  const anyPlateDetected = drafts.some((d) => !!d.registrationNumber);
  const anyPolicyDetected = drafts.some((d) => !!d.policyNumber || !!d.insurerName || !!d.vin);

  if (!anyPlateDetected && !anyPolicyDetected && drafts.length === 0) {
    throw new PdfProcessingError(
      'Brak danych polis komunikacyjnych w dokumencie',
      `Przeanalizowano ${totalPages} stron pliku, lecz w dokumencie nie odnaleziono polskich tablic rejestracyjnych pojazdów ani danych polis ubezpieczeniowych. Prawdopodobnie wgrano inny dokument (np. fakturę, ogólne warunki OWU lub umowę handlową).`,
      'Upewnij się, że wgrywany plik to polisy ubezpieczeniowe pojazdów (np. certyfikaty OC/AC, polisy flotowe).',
      'no_policies_found',
      undefined,
      fileName,
      fileBytes.length
    );
  }

  // 8. Cięcie i generowanie osobnych plików PDF (czyste nazwy bez dodatkowych znaków)
  const usedFilenamesCount: Record<string, number> = {};
  const contracts: PolicyContract[] = [];

  for (let idx = 0; idx < drafts.length; idx++) {
    const draft = drafts[idx];
    const contractIndex = idx + 1;

    // Gdy numer rejestracyjny został odnaleziony (tekstowo lub przez OCR):
    // Czyste nazewnictwo: WYŁĄCZNIE litery i cyfry numeru rejestracyjnego (np. KR7890X.pdf)
    // Gdy numer nie został rozpoznany (dane graficzne do uzupełnienia):
    // Czysta nazwa zastępcza bez znaków specjalnych: POLISA1.pdf, POLISA2.pdf
    const cleanReg = draft.registrationNumber
      ? draft.registrationNumber.replace(/[^A-Z0-9]/g, '')
      : `POLISA${contractIndex}`;

    const baseFilename = sanitizePlateForFilename(cleanReg);

    let finalFilename = baseFilename;
    const cleanBase = baseFilename.replace(/\.pdf$/i, '');
    if (usedFilenamesCount[cleanBase]) {
      usedFilenamesCount[cleanBase] += 1;
      finalFilename = `${cleanBase}${usedFilenamesCount[cleanBase]}.pdf`;
    } else {
      usedFilenamesCount[cleanBase] = 1;
    }

    const subDoc = await PDFDocument.create();
    const copiedPages = await subDoc.copyPages(sourcePdfDoc, draft.pageIndices);
    copiedPages.forEach((p) => subDoc.addPage(p));

    const subPdfBytes = await subDoc.save();
    const subPdfBlob = new Blob([subPdfBytes as any], { type: 'application/pdf' });

    const firstPageIndex = draft.pageIndices[0];
    const firstPageAnalysis = pageAnalyses[firstPageIndex];
    let previewUrl = firstPageAnalysis?.previewDataUrl;

    if (!previewUrl) {
      try {
        const p = await pdfJsDoc.getPage(firstPageIndex + 1);
        previewUrl = await renderPageThumbnail(p, 0.4);
      } catch {
        previewUrl = undefined;
      }
    }

    contracts.push({
      id: `contract-${contractIndex}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      contractIndex,
      registrationNumber: draft.registrationNumber || cleanReg,
      customFilename: finalFilename,
      policyNumber: draft.policyNumber,
      insurerName: draft.insurerName,
      policyHolder: draft.policyHolder,
      vehicleModel: draft.vehicleModel,
      vin: draft.vin,
      productionYear: draft.productionYear,
      insurancePeriod: draft.insurancePeriod,
      coverageTypes: draft.coverageTypes,
      totalPremium: draft.totalPremium,
      issueDate: draft.issueDate,
      pageIndices: draft.pageIndices,
      pageCount: draft.pageIndices.length,
      pdfBytes: subPdfBytes,
      pdfBlob: subPdfBlob,
      previewUrl,
      detectionConfidence: draft.registrationNumber ? draft.confidence : 'fallback',
      plateSource: draft.plateSource,
      isNonTextOrScanned: draft.isNonTextOrScanned || !draft.registrationNumber,
      suggestedPlates: draft.suggestedPlates
    });

    onProgress?.({
      stage: 'splitting',
      current: contractIndex,
      total: drafts.length,
      message: `Wygenerowano plik ${contractIndex} z ${drafts.length} (${finalFilename})...`
    });
  }

  onProgress?.({
    stage: 'completed',
    current: drafts.length,
    total: drafts.length,
    message: `Pomyślnie wyodrębniono ${drafts.length} umów ubezpieczeniowych!`
  });

  return { contracts, totalPages };
}

/**
 * Pakowanie wyodrębnionych umów do archiwum ZIP ze wszystkimi parametrami
 */
export async function generateAndDownloadZip(
  contracts: PolicyContract[],
  originalFilename = 'umowy',
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Blob> {
  onProgress?.({
    stage: 'zipping',
    current: 0,
    total: contracts.length,
    message: 'Pakowanie plików PDF do archiwum ZIP...'
  });

  const zip = new JSZip();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const folder = zip.folder(`Umowy_${dateStr}`) || zip;

  const assignedNames = new Set<string>();

  for (let i = 0; i < contracts.length; i++) {
    const c = contracts[i];
    let fileName = c.customFilename.trim().replace(/[^A-Za-z0-9.]/g, '');
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      fileName += '.pdf';
    }

    let finalName = fileName;
    let counter = 2;
    while (assignedNames.has(finalName)) {
      const base = fileName.replace(/\.pdf$/i, '');
      finalName = `${base}${counter}.pdf`;
      counter++;
    }
    assignedNames.add(finalName);

    if (c.pdfBytes) {
      folder.file(finalName, c.pdfBytes);
    }

    onProgress?.({
      stage: 'zipping',
      current: i + 1,
      total: contracts.length,
      message: `Dodawanie do archiwum: ${finalName}...`
    });
  }

  // 1. Raport tekstowy
  const summaryLines = [
    `ZESTAWIENIE WYODRĘBNIONYCH UMÓW UBEZPIECZENIOWYCH`,
    `Data wygenerowania: ${new Date().toLocaleString('pl-PL')}`,
    `Źródłowy plik: ${originalFilename}`,
    `Łączna liczba umów: ${contracts.length}`,
    '='.repeat(80),
    '',
    ...contracts.map((c, i) => {
      const pagesStr = c.pageIndices.map((p) => p + 1).join(', ');
      const sourceStr =
        c.plateSource === 'ocr'
          ? 'Odczyt optyczny z grafiki (OCR)'
          : c.plateSource === 'annotation'
            ? 'Pole formularza PDF'
            : c.plateSource === 'text'
              ? 'Warstwa tekstowa'
              : 'Wprowadzony ręcznie';

      return [
        `[${i + 1}] Plik PDF:            ${c.customFilename}`,
        `    Nr rejestracyjny:    ${c.registrationNumber}`,
        `    Źródło danych:       ${sourceStr}`,
        `    Towarzystwo:         ${c.insurerName || 'Nie określono'}`,
        `    Nr polisy / wniosku: ${c.policyNumber || 'Nie wykryto'}`,
        `    Nr VIN nadwozia:     ${c.vin || 'Brak danych'}`,
        `    Pojazd (marka/model):${c.vehicleModel || 'Nie określono'}${c.productionYear ? ` (rok: ${c.productionYear})` : ''}`,
        `    Ubezpieczający:      ${c.policyHolder || 'Nie określono'}`,
        `    Okres ubezpieczenia: ${c.insurancePeriod || 'Brak danych'}`,
        `    Zakres ochrony:      ${c.coverageTypes ? c.coverageTypes.join(', ') : 'Nie określono'}`,
        `    Łączna składka:      ${c.totalPremium || 'Brak danych'}`,
        `    Data wystawienia:    ${c.issueDate || 'Brak danych'}`,
        `    Zakres stron:        Strony ${pagesStr} (łącznie ${c.pageCount} str.)`,
        ''
      ].join('\n');
    }),
    '='.repeat(80),
    'Wygenerowano za pomocą PolisaSplit'
  ];

  folder.file('Raport_zestawienie_polis.txt', summaryLines.join('\n'));

  // 2. Arkusz CSV z polskimi znakami (BOM UTF-8)
  const csvEscape = (val?: string) => `"${(val || '').replace(/"/g, '""')}"`;
  const csvRows = [
    [
      'Nr',
      'Plik PDF',
      'Nr rejestracyjny',
      'Zrodlo danych',
      'Towarzystwo',
      'Nr polisy',
      'VIN',
      'Pojazd',
      'Rok prod.',
      'Ubezpieczajacy',
      'Okres ubezpieczenia',
      'Zakres',
      'Skladka',
      'Data wystawienia',
      'Liczba stron',
      'Strony w oryginale'
    ].join(';'),
    ...contracts.map((c, i) => [
      i + 1,
      csvEscape(c.customFilename),
      csvEscape(c.registrationNumber),
      csvEscape(
        c.plateSource === 'ocr'
          ? 'OCR (obraz/skan)'
          : c.plateSource === 'annotation'
            ? 'Formularz'
            : c.plateSource === 'text'
              ? 'Tekst cyfrowy'
              : 'Recznie'
      ),
      csvEscape(c.insurerName),
      csvEscape(c.policyNumber),
      csvEscape(c.vin),
      csvEscape(c.vehicleModel),
      csvEscape(c.productionYear),
      csvEscape(c.policyHolder),
      csvEscape(c.insurancePeriod),
      csvEscape(c.coverageTypes?.join(', ')),
      csvEscape(c.totalPremium),
      csvEscape(c.issueDate),
      c.pageCount,
      csvEscape(c.pageIndices.map((p) => p + 1).join(', '))
    ].join(';'))
  ];

  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  folder.file('Zestawienie_polis.csv', csvContent);

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    },
    (metadata) => {
      onProgress?.({
        stage: 'zipping',
        current: Math.round(metadata.percent),
        total: 100,
        message: `Kompresja archiwum ZIP: ${Math.round(metadata.percent)}%...`
      });
    }
  );

  return zipBlob;
}

export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
