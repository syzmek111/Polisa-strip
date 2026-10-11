// Moduł OCR do rozpoznawania tekstu z obrazów, skanów i rastrów za pomocą Tesseract.js
// Rozwiązuje problem, gdy numery rejestracyjne lub dane polis nie są w formacie cyfrowego tekstu

import { createWorker, Worker } from 'tesseract.js';
import { analyzePageText, formatPlateDisplay, isValidPolishPlate } from './plateExtractor';

let workerPromise: Promise<Worker> | null = null;

/**
 * Inicjalizuje pojedynczą instancję Tesseract Worker dla wydajności (singleton)
 */
export async function getOcrWorker(
  onProgress?: (progress: { status: string; progress: number }) => void
): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        // Używamy języka polskiego i angielskiego (angielski jest idealny dla znaków alfanumerycznych, tablic i VIN)
        const worker = await createWorker('pol+eng', 1, {
          logger: (m) => {
            if (onProgress && typeof m.progress === 'number') {
              onProgress({
                status: m.status || 'OCR',
                progress: Math.min(Math.max(m.progress, 0), 1)
              });
            }
          }
        });
        return worker;
      } catch (err) {
        console.warn('Błąd inicjalizacji worker pol+eng, próba inicjalizacji z eng:', err);
        // Fallback do czystego eng (mniejszy, szybszy, wystarcza dla tablic rejestracyjnych i VIN)
        const worker = await createWorker('eng', 1, {
          logger: (m) => {
            if (onProgress && typeof m.progress === 'number') {
              onProgress({
                status: m.status || 'OCR',
                progress: Math.min(Math.max(m.progress, 0), 1)
              });
            }
          }
        });
        return worker;
      }
    })();
  }
  return workerPromise;
}

/**
 * Zwalnia zasoby workera OCR (np. po zakończeniu przetwarzania dokumentu)
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    try {
      const worker = await workerPromise;
      await worker.terminate();
    } catch (e) {
      console.warn('Błąd zamykania OCR worker:', e);
    } finally {
      workerPromise = null;
    }
  }
}

/**
 * Normalizuje błędy optyczne (OCR confusions) typowe dla polskich tablic rejestracyjnych
 * Wyróżnik powiatu (pierwsze 2-3 znaki) to ZAWSZE litery (np. KR, WA, PO, DW).
 * Końcówka to zwykle cyfry i litery.
 */
export function normalizeOcrPlateCandidates(rawCandidates: string[]): string[] {
  const result: string[] = [];

  for (const raw of rawCandidates) {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length < 4 || clean.length > 8) continue;

    // Próba bezpośrednia
    if (isValidPolishPlate(clean)) {
      result.push(clean);
      continue;
    }

    // Korekta typowych pomyłek OCR:
    // Jeśli na 1. pozycji jest 0 zamiast O, 1 zamiast I, 2 zamiast Z, itp.
    let correctedPrefix = clean;
    if (clean.length >= 4) {
      const chars = clean.split('');
      // Pierwszy i drugi znak tablicy w Polsce to ZAWSZE litery!
      if (chars[0] === '0') chars[0] = 'O';
      if (chars[0] === '1') chars[0] = 'I';
      if (chars[0] === '2') chars[0] = 'Z';
      if (chars[0] === '5') chars[0] = 'S';
      if (chars[0] === '8') chars[0] = 'B';

      if (chars[1] === '0') chars[1] = 'O';
      if (chars[1] === '1') chars[1] = 'I';
      if (chars[1] === '2') chars[1] = 'Z';
      if (chars[1] === '5') chars[1] = 'S';
      if (chars[1] === '8') chars[1] = 'B';

      correctedPrefix = chars.join('');
      if (isValidPolishPlate(correctedPrefix)) {
        result.push(correctedPrefix);
      }
    }
  }

  return [...new Set(result)];
}

/**
 * Wykonuje rozpoznanie OCR z elementu Canvas (lub Data URL) i zwraca wyekstrahowane dane
 */
export async function performOcrOnCanvas(
  canvasOrDataUrl: HTMLCanvasElement | string,
  onProgress?: (progress: number) => void
): Promise<{
  text: string;
  detectedPlates: string[];
  bestPlate?: string;
  suggestedPlates: string[];
  policyNumber?: string;
  vin?: string;
  insurerName?: string;
  vehicleModel?: string;
  insurancePeriod?: string;
}> {
  try {
    const worker = await getOcrWorker((p) => {
      if (onProgress) onProgress(p.progress);
    });

    const ret = await worker.recognize(canvasOrDataUrl);
    const ocrText = ret.data.text || '';

    // Analiza tekstu rozpoznanego przez OCR
    const pageData = analyzePageText(ocrText);

    // Szukamy również potencjalnych kandydatów na tablice w surowym tekście OCR
    const tokens = ocrText
      .split(/[\s,\n\r;:]+/)
      .map((t) => t.toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .filter((t) => t.length >= 4 && t.length <= 8);

    const normalizedCandidates = normalizeOcrPlateCandidates(tokens);

    // Połączenie wyników analizy i znormalizowanych tokenów
    const allPlates = [...new Set([...pageData.plates, ...normalizedCandidates.map(formatPlateDisplay)])];

    let bestPlate = pageData.bestPlate;
    if (!bestPlate && normalizedCandidates.length > 0) {
      bestPlate = formatPlateDisplay(normalizedCandidates[0]);
    }

    return {
      text: ocrText,
      detectedPlates: allPlates,
      bestPlate,
      suggestedPlates: allPlates,
      policyNumber: pageData.policyNumber,
      vin: pageData.vin,
      insurerName: pageData.insurerName,
      vehicleModel: pageData.vehicleModel,
      insurancePeriod: pageData.insurancePeriod
    };
  } catch (err) {
    console.warn('Błąd podczas wykonywania OCR:', err);
    return {
      text: '',
      detectedPlates: [],
      suggestedPlates: []
    };
  }
}
