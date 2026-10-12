export interface PageAnalysis {
  pageIndex: number; // 0-based
  pageNumber: number; // 1-based
  text: string;
  detectedPlates: string[];
  bestPlate?: string;
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
  hasHeader: boolean;
  pageHeaderInfo?: string;
  isFirstPageOfPolicy: boolean;
  previewDataUrl?: string;
  plateSource?: 'text' | 'ocr' | 'annotation' | 'manual';
  isOcrUsed?: boolean;
  ocrText?: string;
  suggestedPlates?: string[];
  pageOfDoc?: { current: number; total: number };
  isClauseOrTermsPage?: boolean;
  clauseTitle?: string;
  isContinuationPage?: boolean;
  isStrongPolicyStart?: boolean;
}

export interface PolicyContract {
  id: string;
  contractIndex: number;
  registrationNumber: string;
  customFilename: string; // strictly alphanumeric + .pdf, e.g. KR7890X.pdf
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
  pageIndices: number[]; // 0-based indices from original document
  pageCount: number;
  pdfBytes?: Uint8Array;
  pdfBlob?: Blob;
  previewUrl?: string;
  detectionConfidence: 'high' | 'medium' | 'fallback';
  isEdited?: boolean;
  plateSource?: 'text' | 'ocr' | 'annotation' | 'manual';
  isNonTextOrScanned?: boolean;
  suggestedPlates?: string[];
  hasInformationClause?: boolean;
}

export type ProcessingErrorCategory =
  | 'not_pdf'
  | 'corrupted'
  | 'password_protected'
  | 'scanned_no_text'
  | 'no_policies_found'
  | 'empty_file'
  | 'generic';

export interface ProcessingErrorDetails {
  title: string;
  reason: string;
  solution: string;
  category: ProcessingErrorCategory;
  rawError?: string;
  fileName?: string;
  fileSize?: number;
}

export interface ProcessingProgress {
  stage: 'idle' | 'reading' | 'analyzing' | 'ocr' | 'splitting' | 'zipping' | 'completed' | 'error';
  current: number;
  total: number;
  message: string;
  error?: string;
  errorDetails?: ProcessingErrorDetails;
}

export interface UploadedFileMetadata {
  name: string;
  size: number;
  totalPages: number;
  loadedAt: Date;
}
