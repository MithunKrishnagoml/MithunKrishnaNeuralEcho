import { useCallback, useState } from "react";
import { DocumentTranslationState, DocumentTranslationResult } from '../types/document';
import { analyzeDocumentStructure } from '../utils/documentStructure';

export function useDocumentTranslation() {
  const [state, setState] = useState<DocumentTranslationState>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<DocumentTranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // PDF text extraction using PDF.js
  const extractTextFromPDF = useCallback(async (file: File): Promise<string> => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress((i / pdf.numPages) * 50); // 50% for extraction
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';
      }

      return fullText.trim();
    } catch (error) {
      throw new Error("Failed to extract text from PDF. Try converting to TXT format.");
    }
  }, []);

  // TXT file reading
  const extractTextFromTXT = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error("Failed to read text file"));
      reader.readAsText(file);
    });
  }, []);

  // Language detection algorithm
  const detectLanguage = useCallback((text: string): string => {
    const frenchWords = ['le', 'la', 'les', 'de', 'du', 'des', 'et', '', 'un', 'une', 'dans', 'pour', 'avec', 'contrat', 'socit', 'article'];
    const englishWords = ['the', 'and', 'of', 'to', 'a', 'in', 'for', 'is', 'on', 'that', 'by', 'this', 'with', 'contract', 'company', 'agreement'];
    
    const words = text.toLowerCase().split(/\s+/).slice(0, 100);
    let frenchScore = 0, englishScore = 0;

    words.forEach(word => {
      if (frenchWords.includes(word)) frenchScore++;
      if (englishWords.includes(word)) englishScore++;
    });

    return frenchScore > englishScore ? 'fr' : 'en';
  }, []);

  // OpenAI translation with legal document specialization
  const translateText = useCallback(async (text: string, sourceLang: string, targetLang: string): Promise<string> => {
    const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured");

    const isLegalDocument = /\b(contract|agreement|whereas|therefore|party|parties|terms|conditions|clause|article|section)\b/i.test(text);
    
    const systemPrompt = isLegalDocument ? 
      `You are a professional legal translator specializing in ${sourceLang === 'en' ? 'English to French' : 'French to English'} legal document translation.

CRITICAL REQUIREMENTS:
- Maintain legal terminology precision and formal register
- Preserve document structure and formatting
- Use appropriate legal expressions for the target language
- Ensure gender agreement and proper legal forms
- Maintain the same level of formality (formal/ceremonial legal language)
- Preserve numbered sections, clauses, and legal hierarchy
- Use contextually appropriate legal phrases, not literal translations

For French legal documents, use:
- "ATTENDU QUE" for "WHEREAS"
- "EN CONSQUENCE" for "NOW, THEREFORE"  
- "EN FOI DE QUOI" for "IN WITNESS WHEREOF"
- Proper gender agreements for roles and titles
- French legal document structure and conventions

For English legal documents, use:
- Standard Anglo-American legal terminology
- Proper legal document structure
- Formal legal register and ceremonial language

Output ONLY the translation - no explanations, notes, or meta-commentary.` :
      `You are a professional translator specializing in ${sourceLang === 'en' ? 'English to French' : 'French to English'} translation.

Provide accurate, contextual translation that:
- Maintains the original tone and style
- Uses natural, fluent language in the target language
- Preserves formatting and structure
- Adapts cultural references appropriately
- Maintains professional terminology when present

Output ONLY the translation without any explanations or notes.`;

    // Chunked processing for large documents
    const maxChunkSize = 3000;
    const chunks = [];
    for (let i = 0; i < text.length; i += maxChunkSize) {
      chunks.push(text.slice(i, i + maxChunkSize));
    }

    let translatedText = '';
    for (let i = 0; i < chunks.length; i++) {
      setProgress(50 + (i / chunks.length) * 50); // 50-100% for translation
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Translate the following text:\n\n${chunks[i]}` }
          ],
          temperature: 0.1, // Low temperature for consistent translation
          max_tokens: 4000,
        }),
      });

      if (!response.ok) throw new Error(`Translation failed: ${response.status}`);
      
      const data = await response.json();
      translatedText += data.choices[0].message.content + '\n\n';
    }

    return translatedText.trim();
  }, []);

  // Main document processing function
  const processDocument = useCallback(async (file: File): Promise<void> => {
    const startTime = Date.now();
    
    try {
      setState("extracting");
      setProgress(0);
      setError(null);

      // Extract text based on file type
      let extractedText: string;
      if (file.type === 'application/pdf') {
        extractedText = await extractTextFromPDF(file);
      } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        extractedText = await extractTextFromTXT(file);
      } else {
        throw new Error("Unsupported file type. Please upload PDF or TXT files.");
      }

      if (!extractedText.trim()) {
        throw new Error("No text could be extracted from the document.");
      }

      setState("translating");

      // Detect language and translate
      const sourceLanguage = detectLanguage(extractedText);
      const targetLanguage = sourceLanguage === 'en' ? 'fr' : 'en';
      const translatedText = await translateText(extractedText, sourceLanguage, targetLanguage);

      const processingTime = Date.now() - startTime;
      const wordCount = extractedText.split(/\s+/).length;

      setResult({
        originalText: extractedText,
        translatedText,
        sourceLanguage,
        targetLanguage,
        fileName: file.name,
        wordCount,
        processingTime,
      });

      setState("completed");
      setProgress(100);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Translation failed");
      setState("error");
    }
  }, [extractTextFromPDF, extractTextFromTXT, detectLanguage, translateText]);

  // Download as formatted PDF with structure preservation
  const downloadTranslationAsPDF = useCallback(async (result: DocumentTranslationResult) => {
    try {
      const jsPDF = (await import('jspdf')).default;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 25;
      const maxWidth = pageWidth - (margin * 2);
      let yPosition = margin;

      const translatedStructure = analyzeDocumentStructure(result.translatedText);

      // Add structured text with proper formatting
      const addStructuredText = (structure: ReturnType<typeof analyzeDocumentStructure>) => {
        structure.forEach((element) => {
          const estimatedHeight = element.type === 'blank' ? 5 : 
                                 element.type === 'title' ? 15 : 
                                 element.type === 'header' ? 12 : 8;

          if (yPosition + estimatedHeight > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
          }

          switch (element.type) {
            case 'blank':
              yPosition += 5;
              break;
            case 'title':
              doc.setFontSize(16);
              doc.setFont('helvetica', 'bold');
              const titleLines = doc.splitTextToSize(element.content, maxWidth);
              const titleX = element.isCenter ? pageWidth / 2 : margin;
              doc.text(titleLines, titleX, yPosition, { align: element.isCenter ? 'center' : 'left' });
              yPosition += titleLines.length * 6 + 10;
              break;
            case 'header':
              doc.setFontSize(12);
              doc.setFont('helvetica', 'bold');
              const headerLines = doc.splitTextToSize(element.content, maxWidth);
              doc.text(headerLines, margin, yPosition);
              yPosition += headerLines.length * 5 + 8;
              break;
            case 'section':
              doc.setFontSize(11);
              doc.setFont('helvetica', 'bold');
              const sectionLines = doc.splitTextToSize(element.content, maxWidth);
              doc.text(sectionLines, margin, yPosition);
              yPosition += sectionLines.length * 4.5 + 6;
              break;
            case 'signature':
              doc.setFontSize(10);
              doc.setFont('helvetica', 'normal');
              const sigLines = doc.splitTextToSize(element.content, maxWidth);
              const sigX = element.isCenter ? pageWidth / 2 : margin;
              doc.text(sigLines, sigX, yPosition, { align: element.isCenter ? 'center' : 'left' });
              yPosition += sigLines.length * 4 + 5;
              break;
            default:
              doc.setFontSize(10);
              doc.setFont('helvetica', 'normal');
              const paraLines = doc.splitTextToSize(element.content, maxWidth);
              doc.text(paraLines, margin, yPosition);
              yPosition += paraLines.length * 4 + 5;
              break;
          }
        });
      };

      // Add document header with metadata
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPosition - 5, maxWidth, 20, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      
      const langNames = { 'en': 'English', 'fr': 'Franais' };
      const headerText = `${result.fileName}  Translated to ${langNames[result.targetLanguage as keyof typeof langNames]}  ${result.wordCount} words  ${new Date().toLocaleDateString()}`;
      doc.text(headerText, pageWidth / 2, yPosition + 7, { align: 'center' });
      yPosition += 25;

      addStructuredText(translatedStructure);

      // Add professional footer
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(128, 128, 128);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
        doc.text(`Page ${i} of ${totalPages}`, margin, pageHeight - 8);
        doc.text('Document Translation System', pageWidth - margin, pageHeight - 8, { align: 'right' });
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const langSuffix = result.targetLanguage === 'fr' ? 'FR' : 'EN';
      const originalName = result.fileName.replace(/\.[^/.]+$/, "");
      const filename = `${originalName}-translated-${langSuffix}-${timestamp}.pdf`;

      doc.save(filename);
    } catch (error) {
      console.error("PDF generation failed:", error);
      downloadTranslation(result); // Fallback to text download
    }
  }, []);

  // Download as plain text file
  const downloadTranslation = useCallback((result: DocumentTranslationResult) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const langSuffix = result.targetLanguage === 'fr' ? 'FR' : 'EN';
    const originalName = result.fileName.replace(/\.[^/.]+$/, "");
    
    const content = `# Document Translation

**Original File**: ${result.fileName}
**Source Language**: ${result.sourceLanguage.toUpperCase()}
**Target Language**: ${result.targetLanguage.toUpperCase()}
**Word Count**: ${result.wordCount}
**Processing Time**: ${Math.round(result.processingTime / 1000)}s
**Translated**: ${new Date().toLocaleString()}

---

## Translated Text

${result.translatedText}

---

*Translated by Document Translation System*`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${originalName}-translated-${langSuffix}-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setProgress(0);
    setResult(null);
    setError(null);
  }, []);

  return {
    state,
    progress,
    result,
    error,
    processDocument,
    downloadTranslation,
    downloadTranslationAsPDF,
    reset,
  };
}