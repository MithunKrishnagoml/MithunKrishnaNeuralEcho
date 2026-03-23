export type DocumentTranslationState = "idle" | "extracting" | "translating" | "completed" | "error";

export interface DocumentTranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  fileName: string;
  wordCount: number;
  processingTime: number;
}

export interface DocumentStructureElement {
  type: 'title' | 'header' | 'section' | 'paragraph' | 'signature' | 'blank';
  content: string;
  level?: number;
  isBold?: boolean;
  isCenter?: boolean;
  isUpperCase?: boolean;
}