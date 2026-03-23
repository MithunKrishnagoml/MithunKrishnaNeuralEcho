import { DocumentStructureElement } from '../types/document';

export function analyzeDocumentStructure(text: string): DocumentStructureElement[] {
  const lines = text.split('\n');
  const structure: DocumentStructureElement[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    if (!trimmed) {
      structure.push({ type: 'blank', content: '' });
      return;
    }

    // Document title (first non-empty line, all caps)
    if (index === 0 || (index < 3 && trimmed === trimmed.toUpperCase() && trimmed.length > 5)) {
      structure.push({
        type: 'title',
        content: trimmed,
        isBold: true,
        isCenter: true,
        isUpperCase: true
      });
      return;
    }

    // Legal headers (WHEREAS, etc.)
    if (/^(WHEREAS|NOW,?\s*THEREFORE|IN\s+WITNESS\s+WHEREOF|ATTENDU\s+QUE|EN\s+CONSQUENCE|EN\s+FOI\s+DE\s+QUOI)/i.test(trimmed)) {
      structure.push({
        type: 'header',
        content: trimmed,
        isBold: true,
        isUpperCase: trimmed === trimmed.toUpperCase()
      });
      return;
    }

    // Numbered sections
    if (/^\d+\.\s+/.test(trimmed)) {
      structure.push({
        type: 'section',
        content: trimmed,
        level: 1,
        isBold: true
      });
      return;
    }

    // Signature lines
    if (/^_{5,}/.test(trimmed) || (/^[A-Za-z\s]+:?\s*$/.test(trimmed) && trimmed.length < 50)) {
      structure.push({
        type: 'signature',
        content: trimmed,
        isCenter: true
      });
      return;
    }

    // Regular paragraph
    structure.push({
      type: 'paragraph',
      content: trimmed
    });
  });

  return structure;
}