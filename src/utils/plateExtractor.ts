// Narzędzie do analizy tekstu stron PDF i zaawansowanego wykrywania polskich tablic rejestracyjnych oraz wszystkich parametrów polis

const VOIVODESHIP_CODES = new Set([
  'B', 'C', 'D', 'E', 'F', 'G', 'K', 'L', 'N', 'O', 'P', 'R', 'S', 'T', 'W', 'Z'
]);

const CAR_BRANDS = [
  'TOYOTA', 'VOLKSWAGEN', 'SKODA', 'BMW', 'AUDI', 'FORD', 'MERCEDES', 'MERCEDES-BENZ',
  'OPEL', 'KIA', 'HYUNDAI', 'RENAULT', 'PEUGEOT', 'VOLVO', 'FIAT', 'SEAT', 'DACIA',
  'NISSAN', 'HONDA', 'MAZDA', 'SUZUKI', 'CITROEN', 'CHEVROLET', 'JEEP', 'LEXUS',
  'ALFA ROMEO', 'MITSUBISHI', 'CUPRA', 'PORSCHE', 'MINI', 'LAND ROVER', 'TESLA',
  'MAN', 'SCANIA', 'IVECO', 'DAF', 'WIELTON', 'SCHMITZ', 'KRONE', 'KOEGEL', 'ZASLAW'
];

const INSURERS = [
  { name: 'PZU SA', pattern: /\b(PZU(?:\s+SA)?|POWSZECHNY\s+ZAK[LŁ]AD\s+UBEZPIECZE[NŃ])\b/i },
  { name: 'TUiR Warta', pattern: /\b(WARTA|TUiR\s+WARTA|TOWARZYSTWO\s+UBEZPIECZE[NŃ]\s+I\s+REASEKURACJI\s+WARTA)\b/i },
  { name: 'ERGO Hestia', pattern: /\b(ERGO\s+HESTIA|HESTIA|STU\s+ERGO\s+HESTIA|SOPOCKIE\s+TOWARZYSTWO\s+UBEZPIECZE[NŃ])\b/i },
  { name: 'Generali', pattern: /\b(GENERALI|GENERALI\s+T\.?U\.?|GENERALI\s+TOWARZYSTWO\s+UBEZPIECZE[NŃ])\b/i },
  { name: 'Allianz', pattern: /\b(ALLIANZ|TUiR\s+ALLIANZ|TOWARZYSTWO\s+UBEZPIECZE[NŃ]\s+ALLIANZ)\b/i },
  { name: 'UNIQA', pattern: /\b(UNIQA|UNIQA\s+TU|UNIQA\s+TOWARZYSTWO\s+UBEZPIECZE[NŃ])\b/i },
  { name: 'Compensa', pattern: /\b(COMPENSA|COMPENSA\s+TU|COMPENSA\s+VIENNA\s+INSURANCE)\b/i },
  { name: 'Wiener', pattern: /\b(WIENER|WIENER\s+TU|WIENER\s+VIENNA\s+INSURANCE)\b/i },
  { name: 'InterRisk', pattern: /\b(INTERRISK|INTER\s+RISK|INTERRISK\s+VIENNA\s+INSURANCE)\b/i },
  { name: 'LINK4', pattern: /\b(LINK4|LINK\s+4|LINK4\s+TU)\b/i },
  { name: 'TUZ Ubezpieczenia', pattern: /\b(TUZ|TUZ\s+UBEZPIECZENIA|TOWARZYSTWO\s+UBEZPIECZE[NŃ]\s+WZAJEMNYCH\s+TUZ)\b/i },
  { name: 'TUW', pattern: /\b(TUW|TOWARZYSTWO\s+UBEZPIECZE[NŃ]\s+WZAJEMNYCH)\b/i },
  { name: 'Proama', pattern: /\b(PROAMA)\b/i },
  { name: 'Balcia', pattern: /\b(BALCIA|BALCIA\s+INSURANCE)\b/i },
  { name: 'Triglav', pattern: /\b(TRIGLAV)\b/i },
  { name: 'HDI', pattern: /\b(HDI|HDI\s+ASEKURACJA)\b/i },
  { name: 'MTU', pattern: /\b(MTU|MOJE\s+TOWARZYSTWO\s+UBEZPIECZE[NŃ])\b/i }
];

export interface ExtractedPageData {
  plates: string[];
  bestPlate?: string;
  hasHeader: boolean;
  isFirstPage: boolean;
  headerSnippet?: string;
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
  confidence: 'high' | 'medium' | 'fallback';
}

export function cleanText(raw: string): string {
  return raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ');
}

export function isValidPolishPlate(candidate: string): boolean {
  const norm = candidate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (norm.length < 4 || norm.length > 8) return false;
  if (!VOIVODESHIP_CODES.has(norm[0])) return false;
  // Każda polska tablica rejestracyjna musi zawierać co najmniej jedną cyfrę
  if (!/[0-9]/.test(norm)) return false;

  const blacklist = new Set([
    'POLSKA', 'POLISA', 'POLISY', 'STRONA', 'KODEKS', 'UMOWA', 'WARTO', 'OGOLNE',
    'SERIA', 'NUMER', 'PESEL', 'REGON', 'KODPOC', 'WARUNKI', 'DOWOD',
    'POJAZD', 'DANYCH', 'TERMIN', 'SKLADKA', 'KOSZTY', 'SUMAUB', 'RAZEM',
    'BRUTTO', 'NETTO', 'MARKA', 'MODEL', 'UBEZP', 'KONTO', 'AGENT', 'BIURO',
    'ZAKRES', 'OCHRONY', 'PRZEDM', 'UBEZPI', 'RODZAJ', 'SKLADK', 'PODPIS', 'DOKUME',
    'CERTYF', 'KOMUNI', 'UBEZPO', 'DEPART', 'UBEZPIECZEN'
  ]);
  if (blacklist.has(norm)) return false;
  if (norm.startsWith('POL')) return false;
  if (norm.startsWith('UBEZ')) return false;

  const standard2_5 = /^[A-Z]{2}[0-9A-Z]{5}$/;
  const standard3_5 = /^[A-Z]{3}[0-9A-Z]{5}$/;
  const standard3_4 = /^[A-Z]{3}[0-9A-Z]{4}$/;
  const standard2_4 = /^[A-Z]{2}[0-9A-Z]{4}$/;
  const custom = /^[A-Z][0-9][A-Z0-9]{3,5}$/;
  const vintage = /^[A-Z]{2,3}[0-9]{2,3}[A-Z]$/;

  return (
    standard2_5.test(norm) ||
    standard3_5.test(norm) ||
    standard3_4.test(norm) ||
    standard2_4.test(norm) ||
    custom.test(norm) ||
    vintage.test(norm)
  );
}

export function formatPlateDisplay(plate: string): string {
  const clean = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return '';

  if (/^[A-Z][0-9][A-Z0-9]+$/.test(clean)) {
    return `${clean.slice(0, 2)} ${clean.slice(2)}`;
  }

  if (/^[A-Z]{3}[0-9A-Z]+$/.test(clean)) {
    return `${clean.slice(0, 3)} ${clean.slice(3)}`;
  }

  if (/^[A-Z]{2}[0-9A-Z]+$/.test(clean)) {
    return `${clean.slice(0, 2)} ${clean.slice(2)}`;
  }

  return clean;
}

/**
 * Zwraca czystą nazwę pliku BEZ żadnych dodatkowych znaków:
 * wyłączne wielkie litery i cyfry numeru rejestracyjnego + .pdf (np. KR7890X.pdf, WA54321.pdf).
 * Żadnych spacji, myślników, podkreśleń ani znaków specjalnych.
 */
export function sanitizePlateForFilename(plate: string): string {
  const clean = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean ? `${clean}.pdf` : 'DOKUMENT.pdf';
}

export function analyzePageText(text: string): ExtractedPageData {
  const norm = cleanText(text);

  // 1. Wykrywanie Towarzystwa Ubezpieczeniowego
  let insurerName: string | undefined;
  for (const ins of INSURERS) {
    if (ins.pattern.test(norm)) {
      insurerName = ins.name;
      break;
    }
  }

  // 2. Wykrywanie nagłówka umowy ubezpieczeniowej
  const headerPatterns = [
    /\b(CERTYFIKAT\s+POLISY(?:\s+NR)?|CERTYFIKAT\s+UBEZPIECZENIA|CERTYFIKAT\s+OC|CERTYFIKAT\s+KOMUNIKACYJNY)\b/i,
    /\b(POLISA\s+UBEZPIECZENIOWA|POLISA\s+UBEZPIECZENIA|POLISA\s+KOMUNIKACYJNA|POLISA\s+NR|POLISA\s+SERIA)\b/i,
    /\b(UMOWA\s+UBEZPIECZENIA|DOKUMENT\s+UBEZPIECZENIA|POTWIERDZENIE\s+ZAWARCIA\s+UMOWY)\b/i,
    /\b(WNIOSEK\s*-\s*POLISA|KARTA\s+POLISY|UBEZPIECZENIE\s+KOMUNIKACYJNE)\b/i
  ];

  let hasHeader = false;
  let headerSnippet: string | undefined;
  for (const pat of headerPatterns) {
    const match = norm.match(pat);
    if (match) {
      hasHeader = true;
      headerSnippet = match[0].toUpperCase();
      break;
    }
  }

  const firstPagePattern = /\b(STRONA\s+1\s*(?:Z|\/)\s*[0-9]+|STR\.\s*1\s*(?:Z|\/)\s*[0-9]+|1\s+Z\s+[0-9]+\s+STRON)\b/i;
  const isFirstPage = hasHeader || firstPagePattern.test(norm);

  // 3. Wykrywanie numeru polisy
  let policyNumber: string | undefined;
  const policyNumMatch = norm.match(/(?:certyfikat(?:\s+polisy)?(?:\s+ubezpieczeniowej|\s+ubezpieczenia(?:\s+komunikacyjnego|\s+oc|\s+ac)?)?\s+nr|certyfikat\s+nr|numer\s+polisy|nr\s+polisy|polisa(?:\s+ubezpieczeniowa|\s+komunikacyjna)?\s+nr|seria\s+i\s+nr(?:\s+polisy)?|dokument\s+nr|nr\s+umowy)[:\s]+([A-Z0-9\/-]{5,30})/i);
  if (policyNumMatch && policyNumMatch[1]) {
    const candidate = policyNumMatch[1].trim();
    if (!/^(dnia|data|rok|godz|od|do|komunikacyjna)$/i.test(candidate)) {
      policyNumber = candidate;
    }
  }

  // 4. Wykrywanie marki i modelu pojazdu
  let vehicleModel: string | undefined;
  const directVehicleMatch = norm.match(/(?:marka\s*(?:i\s*model|\/typ\/model|\/model)?|pojazd|typ\s*pojazdu)[:\s]+([A-Z0-9-]{2,20}(?:\s+[A-Z0-9-]{1,20}){1,3})/i);
  if (directVehicleMatch && directVehicleMatch[1]) {
    let candidate = directVehicleMatch[1].trim().toUpperCase();
    candidate = candidate.replace(/\s+(?:ROK|PROD|NR|VIN|REJ|TYP|SILNIK|POJEMNOSC|MOC)[\s\S]*$/i, '').trim();
    if (!/^(UBEZPIECZONY|OSOBOWY|CIEZAROWY|SAMOCHOD|POJAZD|NUMER|TABLICA)/.test(candidate)) {
      vehicleModel = candidate;
    }
  }

  if (!vehicleModel) {
    for (const brand of CAR_BRANDS) {
      const brandRegex = new RegExp(`\\b${brand}\\b\\s*([A-Za-z0-9-]+(?:\\s+[A-Za-z0-9-]+)?)?`, 'i');
      const brandMatch = norm.match(brandRegex);
      if (brandMatch) {
        let candidate = brandMatch[0].trim().toUpperCase();
        candidate = candidate.replace(/\s+(?:ROK|PROD|NR|VIN|REJ|TYP|SILNIK|POJEMNOSC|MOC)[\s\S]*$/i, '').trim();
        vehicleModel = candidate;
        break;
      }
    }
  }

  // 5. Wykrywanie Ubezpieczającego / Właściciela pojazdu
  let policyHolder: string | undefined;
  const holderMatch = norm.match(/(?:UBEZPIECZAJ[AĄ]CY[\s\S]*?Imi[eę]\s+i\s+Nazwisko\s*\/\s*Nazwa|Imi[eę]\s+i\s+Nazwisko\s*\/\s*Nazwa|Ubezpieczaj[aą]cy|W[lł]a[sś]ciciel\s*pojazdu|Ubezpieczony)[:\s]+([^,\n\r]+?)(?:\s+(?:Adres|ul\.|PESEL|NIP|REGON|2\.|\d+\.))/i);
  if (holderMatch && holderMatch[1]) {
    const cleanHolder = holderMatch[1].replace(/^(?:Imi[eę]\s+i\s+Nazwisko\s*\/\s*Nazwa|Nazwa|Adres)[:\s]*/i, '').trim();
    if (cleanHolder.length >= 3 && cleanHolder.length <= 60) {
      policyHolder = cleanHolder;
    }
  }

  // 6. Wykrywanie numeru VIN (dokładnie 17 znaków wg normy ISO)
  let vin: string | undefined;
  const vinMatch = norm.match(/(?:Nr\s+VIN|VIN|Numer\s+nadwozia|Nr\s+nadwozia)[:\s.]+([A-HJ-NPR-Z0-9]{17})\b/i);
  if (vinMatch && vinMatch[1]) {
    vin = vinMatch[1].trim().toUpperCase();
  }

  // 7. Wykrywanie roku produkcji pojazdu
  let productionYear: string | undefined;
  const yearMatch = norm.match(/(?:Rok\s+produkcji|Rok\s+prod\.?)[:\s]+(19[89][0-9]|20[0-3][0-9])\b/i);
  if (yearMatch && yearMatch[1]) {
    productionYear = yearMatch[1].trim();
  }

  // 8. Wykrywanie okresu ubezpieczenia (Od - Do)
  let insurancePeriod: string | undefined;
  const periodMatch1 = norm.match(/(?:okres\s+ubezpieczenia|okres\s+ochrony|wa[zż]no[sś][cć]\s+polisy|czas\s+trwania\s+ochrony)[:\s]+(?:od\s*)?(\d{2}[.-]\d{2}[.-]\d{4})\s*(?:do|-)\s*(\d{2}[.-]\d{2}[.-]\d{4})/i);
  if (periodMatch1 && periodMatch1[1] && periodMatch1[2]) {
    insurancePeriod = `${periodMatch1[1]} – ${periodMatch1[2]}`;
  } else {
    const periodMatch2 = norm.match(/\bod\s+(\d{2}[.-]\d{2}[.-]\d{4})\s+do\s+(\d{2}[.-]\d{2}[.-]\d{4})\b/i);
    if (periodMatch2 && periodMatch2[1] && periodMatch2[2]) {
      insurancePeriod = `${periodMatch2[1]} – ${periodMatch2[2]}`;
    }
  }

  // 9. Wykrywanie zakresu ochrony (OC, AC, NNW, Assistance itp.)
  const coverageTypes: string[] = [];
  if (/\bOC\b/i.test(norm)) coverageTypes.push('OC');
  if (/\bAC\b|\bAutocasco\b/i.test(norm)) coverageTypes.push('AC');
  if (/\bNNW\b/i.test(norm)) coverageTypes.push('NNW');
  if (/\bAssistance\b/i.test(norm)) coverageTypes.push('Assistance');
  if (/\bGAP\b/i.test(norm)) coverageTypes.push('GAP');
  if (/\bSzyby\b/i.test(norm)) coverageTypes.push('Szyby');
  if (/\bOpony\b/i.test(norm)) coverageTypes.push('Opony');
  if (/\bBLS\b/i.test(norm)) coverageTypes.push('BLS');

  // 10. Wykrywanie łącznej składki
  let totalPremium: string | undefined;
  const premMatch = norm.match(/(?:[LŁ][aą]czna\s+sk[lł]adka(?:\s+do\s+zap[lł]aty)?|Sk[lł]adka\s+[lł][aą]czna|Razem\s+do\s+zap[lł]aty|Do\s+zap[lł]aty|Sk[lł]adka\s+przypisana)[:\s]+([\d\s]+(?:,\d{2})?\s*(?:PLN|z[lł]))/i);
  if (premMatch && premMatch[1]) {
    totalPremium = premMatch[1].trim();
  }

  // 11. Wykrywanie daty wystawienia / zawarcia
  let issueDate: string | undefined;
  const dateMatch = norm.match(/(?:Data\s+wystawienia|Wystawiono\s+dnia|Data\s+zawarcia|Data\s+podpisania)[:\s]+(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})/i);
  if (dateMatch && dateMatch[1]) {
    issueDate = dateMatch[1].trim();
  }

  // 12. Wykrywanie numeru rejestracyjnego
  const highConfidencePlates: string[] = [];
  const mediumConfidencePlates: string[] = [];

  // Kontekstowe: "Nr Rejestracyjny WA 12345", "Nr Rej: KR 54321", "Tablica rejestracyjna: DW 9876A"
  const contextualRegex = /(?:nr\s*rej(?:estracyjny)?(?:\s*pojazdu)?|numer\s*rejestracyjny|tablica\s*rej(?:estracyjna)?|rejestracja|pojazd\s*o\s*nr\s*rej)[:\s.]+([A-Z0-9\s-]{4,10})/gi;
  let ctxMatch: RegExpExecArray | null;

  while ((ctxMatch = contextualRegex.exec(norm)) !== null) {
    const rawVal = ctxMatch[1].trim().split(/\s+/).slice(0, 2).join(' ');
    const stripped = rawVal.replace(/[^A-Za-z0-9]/g, '');
    if (isValidPolishPlate(stripped)) {
      highConfidencePlates.push(formatPlateDisplay(stripped));
    }
  }

  // Wzorce ogólne dla tablic 2-3 literowych z wyróżnikiem województwa
  const generalRegex = /\b([A-Z]{2,3})[\s-]?([0-9A-Z]{4,5})\b/g;
  let genMatch: RegExpExecArray | null;

  while ((genMatch = generalRegex.exec(norm)) !== null) {
    const full = `${genMatch[1]}${genMatch[2]}`;
    if (isValidPolishPlate(full)) {
      const formatted = formatPlateDisplay(full);
      if (!highConfidencePlates.includes(formatted) && !mediumConfidencePlates.includes(formatted)) {
        mediumConfidencePlates.push(formatted);
      }
    }
  }

  const customRegex = /\b([A-Z][0-9])[\s-]?([A-Z0-9]{3,5})\b/g;
  let custMatch: RegExpExecArray | null;
  while ((custMatch = customRegex.exec(norm)) !== null) {
    const full = `${custMatch[1]}${custMatch[2]}`;
    if (isValidPolishPlate(full)) {
      const formatted = formatPlateDisplay(full);
      if (!highConfidencePlates.includes(formatted) && !mediumConfidencePlates.includes(formatted)) {
        mediumConfidencePlates.push(formatted);
      }
    }
  }

  const allDetected = [...new Set([...highConfidencePlates, ...mediumConfidencePlates])];

  let bestPlate: string | undefined;
  let confidence: 'high' | 'medium' | 'fallback' = 'fallback';

  if (highConfidencePlates.length > 0) {
    bestPlate = highConfidencePlates[0];
    confidence = 'high';
  } else if (mediumConfidencePlates.length > 0) {
    bestPlate = mediumConfidencePlates[0];
    confidence = 'medium';
  }

  return {
    plates: allDetected,
    bestPlate,
    hasHeader,
    isFirstPage,
    headerSnippet,
    policyNumber,
    insurerName,
    policyHolder,
    vehicleModel,
    vin,
    productionYear,
    insurancePeriod,
    coverageTypes: coverageTypes.length > 0 ? coverageTypes : undefined,
    totalPremium,
    issueDate,
    confidence
  };
}
