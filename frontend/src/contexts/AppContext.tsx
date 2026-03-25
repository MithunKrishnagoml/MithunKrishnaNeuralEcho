import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { toast } from "sonner";
import {
  AppStatus,
  LanguageCode,
  Speaker,
  ConversationMessage,
  SessionInsights,
  SPEAKER_COLORS,
  SPEAKER_NAMES,
  LANGUAGES,
  OpenAIVoice,
  OPENAI_VOICES,
} from "@/lib/constants";
import { useRealtimeVoice, VoiceMode, SessionState, RealtimeStreamingCallbacks } from "@/hooks/useRealtimeVoice";
import { useCallRecording, RecordingState } from "@/hooks/useCallRecording";
import { useTranscriptDownload, TranscriptData } from "@/hooks/useTranscriptDownload";

const DEFAULT_LANGUAGES: LanguageCode[] = ["en-US", "fr-CA"];

/**
 * STRICT VALIDATION: ONLY English and French allowed
 * Returns true if text contains ANY non-Latin characters (Arabic, Chinese, Hindi, etc.)
 */
function containsNonEnglishFrenchCharacters(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  
  // Remove common punctuation, numbers, and whitespace for analysis
  const cleaned = text.replace(/[0-9\s.,!?;:'"()\-]/g, '');
  if (cleaned.length === 0) return false;
  
  // STRICT PATTERN 1: Reject ANY non-Latin script immediately
  const nonLatinPattern = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0E00-\u0E7F\u0E80-\u0EFF\u0F00-\u0FFF\u1000-\u109F\u10A0-\u10FF\u1100-\u11FF\u1200-\u137F\u13A0-\u13FF\u1400-\u167F\u1680-\u169F\u16A0-\u16FF\u1700-\u171F\u1720-\u173F\u1740-\u175F\u1760-\u177F\u1780-\u17FF\u1800-\u18AF\u1900-\u194F\u1950-\u197F\u1980-\u19DF\u19E0-\u19FF\u1A00-\u1A1F\u1A20-\u1AAF\u1AB0-\u1AFF\u1B00-\u1B7F\u1B80-\u1BBF\u1BC0-\u1BFF\u1C00-\u1C4F\u1C50-\u1C7F\u1C80-\u1C8F\u1CC0-\u1CCF\u1CD0-\u1CFF\u1D00-\u1D7F\u1D80-\u1DBF\u1DC0-\u1DFF\u1E00-\u1EFF\u1F00-\u1FFF\u2000-\u206F\u2070-\u209F\u20A0-\u20CF\u20D0-\u20FF\u2100-\u214F\u2150-\u218F\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF\u2400-\u243F\u2440-\u245F\u2460-\u24FF\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\u27C0-\u27EF\u27F0-\u27FF\u2800-\u28FF\u2900-\u297F\u2980-\u29FF\u2A00-\u2AFF\u2B00-\u2BFF\u2C00-\u2C5F\u2C60-\u2C7F\u2C80-\u2CFF\u2D00-\u2D2F\u2D30-\u2D7F\u2D80-\u2DDF\u2DE0-\u2DFF\u2E00-\u2E7F\u2E80-\u2EFF\u2F00-\u2FDF\u2FF0-\u2FFF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3100-\u312F\u3130-\u318F\u3190-\u319F\u31A0-\u31BF\u31C0-\u31EF\u31F0-\u31FF\u3200-\u32FF\u3300-\u33FF\u3400-\u4DBF\u4DC0-\u4DFF\u4E00-\u9FFF\uA000-\uA48F\uA490-\uA4CF\uA4D0-\uA4FF\uA500-\uA63F\uA640-\uA69F\uA6A0-\uA6FF\uA700-\uA71F\uA720-\uA7FF\uA800-\uA82F\uA830-\uA83F\uA840-\uA87F\uA880-\uA8DF\uA8E0-\uA8FF\uA900-\uA92F\uA930-\uA95F\uA960-\uA97F\uA980-\uA9DF\uA9E0-\uA9FF\uAA00-\uAA5F\uAA60-\uAA7F\uAA80-\uAADF\uAAE0-\uAAFF\uAB00-\uAB2F\uAB30-\uAB6F\uAB70-\uABBF\uABC0-\uABFF\uAC00-\uD7AF\uD7B0-\uD7FF\uF900-\uFAFF\uFB00-\uFB4F\uFB50-\uFDFF\uFE00-\uFE0F\uFE10-\uFE1F\uFE20-\uFE2F\uFE30-\uFE4F\uFE50-\uFE6F\uFE70-\uFEFF\uFF00-\uFFEF]/;
  
  if (nonLatinPattern.test(text)) {
    console.error('🚫 [LANGUAGE BLOCK] REJECTED - Contains non-Latin script:', text);
    return true;
  }
  
  // STRICT PATTERN 2: Detect WELSH - common words only (avoid false positives with English words like "hello")
  // Welsh uses unique word patterns, but be careful not to block common English/French words
  const welshWordPatterns = [
    /\b(diolch|wylio|gweld|yma|mae|gan|neu|hefyd|rydw|ydych|cymru|cymraeg|bore da|nos da|hwyl)\b/i,  // Common Welsh words
  ];
  
  // Common English/French words that might look like Welsh patterns but aren't
  const commonEnglishFrench = /\b(hello|hallo|yellow|follow|million|brilliant|well|will|shall|hello|bonjour|merci|oui|non|comment|vous|nous)\b/i;
  
  // Only check Welsh patterns if it's not a common English/French word
  if (!commonEnglishFrench.test(text)) {
    for (const pattern of welshWordPatterns) {
      if (pattern.test(text)) {
        console.error('🚫 [LANGUAGE BLOCK] REJECTED - Welsh detected:', text);
        return true;
      }
    }
  }
  
  // STRICT PATTERN 3: Detect SPANISH - ñ and unique patterns
  if (/[ñ¿¡]/.test(text) || /\b(señor|señora|gracias|hola|buenos|días|noches|cómo|está|qué|dónde|cuándo)\b/i.test(text)) {
    console.error('🚫 [LANGUAGE BLOCK] REJECTED - Spanish detected:', text);
    return true;
  }
  
  // STRICT PATTERN 4: Detect GERMAN - ß and umlauts in German-specific contexts
  if (/ß/.test(text) || /\b(ich|du|sie|wir|sind|haben|guten|tag|danke|bitte|deutschland)\b/i.test(text)) {
    console.error('🚫 [LANGUAGE BLOCK] REJECTED - German detected:', text);
    return true;
  }
  
  // STRICT PATTERN 5: Detect ITALIAN - common words
  if (/\b(ciao|grazie|prego|buongiorno|buonasera|signore|signora|come|sta|cosa|quando|dove)\b/i.test(text)) {
    console.error('🚫 [LANGUAGE BLOCK] REJECTED - Italian detected:', text);
    return true;
  }
  
  // STRICT PATTERN 6: Detect PORTUGUESE - unique patterns
  if (/[ãõ]/.test(text) || /\b(obrigado|obrigada|olá|bom|dia|noite|você|está|quando|onde|como)\b/i.test(text)) {
    console.error('🚫 [LANGUAGE BLOCK] REJECTED - Portuguese detected:', text);
    return true;
  }
  
  console.log('✅ [LANGUAGE CHECK] Passed - Text appears to be English or French:', text);
  return false;
}

/**
 * Clean and validate French transcripts from Whisper
 * French transcription sometimes picks up extra words or other languages
 */
function cleanFrenchTranscript(text: string, expectedLanguage: string): string | null {
  if (!text || text.trim().length === 0) return null;
  
  // FIRST CHECK: Reject non-English/French languages IMMEDIATELY
  // This prevents any processing of unsupported languages
  if (containsNonEnglishFrenchCharacters(text)) {
    console.error('🚫 [TRANSCRIPT CLEAN] REJECTED - Non-English/French language detected:', text);
    return null; // Stop processing immediately
  }
  
  console.log('🧹 [TRANSCRIPT CLEAN] Input (passed language check):', text);
  
  // Remove common Whisper hallucinations and artifacts
  let cleaned = text
    // Remove "Sous-titres par la communauté d'Amara.org" and similar Amara subtitles
    .replace(/sous-titres?\s+(par|réalisés?\s+par|créés?\s+par).*amara\.org/gi, '')
    // Remove "Merci d'avoir regardé" and similar endings
    .replace(/merci\s+d'avoir\s+(regardé|écouté)/gi, '')
    // Remove "Thank you for watching" type endings
    .replace(/(thank you|thanks)\s+for\s+(watching|listening)/gi, '')
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    // Remove repeated punctuation
    .replace(/[.!?]{2,}/g, '.')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // Only reject if transcript is EXTREMELY long (obvious hallucination)
  const wordCount = cleaned.split(/\s+/).length;
  if (wordCount > 200) {
    console.error('🚫 [TRANSCRIPT CLEAN] REJECTED - Too long (hallucination):', wordCount, 'words');
    return null;
  }
  
  // Only reject if it's obviously subtitle artifacts or social media prompts
  const obviousHallucinations = [
    /\b(whatsapp)\b/i,
    /\b(subscribe|like and comment|hit the bell)\b/i,
    /sous-titres.*amara/i,
  ];
  
  for (const pattern of obviousHallucinations) {
    if (pattern.test(cleaned)) {
      console.error('🚫 [TRANSCRIPT CLEAN] REJECTED - Obvious hallucination detected:', cleaned);
      return null;
    }
  }
  
  console.log('✅ [TRANSCRIPT CLEAN] Output:', cleaned);
  return cleaned;
}

function createSpeakers(count: number, existing: Speaker[] = []): Speaker[] {
  return Array.from({ length: count }, (_, i) => {
    if (existing[i]) return existing[i];
    const lang = DEFAULT_LANGUAGES[i] || "en-US";
    return {
      id: i,
      name: SPEAKER_NAMES[i] || `Speaker ${i + 1}`,
      language: lang,
      viewLanguage: lang,
      color: SPEAKER_COLORS[i] || SPEAKER_COLORS[0],
    };
  });
}

function buildTranslationInstructions(activeSpeaker: Speaker, otherSpeakers: Speaker[]): string {
  const sourceLang = LANGUAGES.find((l) => l.code === activeSpeaker.language);
  const targetLangs = [...new Set(otherSpeakers.map((s) => s.language))];
  const targetLang = LANGUAGES.find((l) => l.code === targetLangs[0]);

  return `You are a strict bilingual translator between English and French only.

Task:
Translate from ${sourceLang?.label || activeSpeaker.language} to ${targetLang?.label || targetLangs[0]}.

Hard constraints:
1. Output translation only. No preface, no explanation, no markdown.
2. Preserve meaning exactly. Do not paraphrase, summarize, embellish, or infer intent.
3. Keep sentence structure close to source when possible.
4. Keep names, numbers, dates, and factual details unchanged except required grammar agreement.
5. Do not add greetings, politeness, or conversational filler.
6. If source contains multiple clauses, translate all clauses; do not drop any part.
7. If a token is unclear, keep it as-is rather than inventing content.
8. If input is not English or French, return an empty string.
9. Never output text in a third language.

Anti-drift examples:
Input: "Aujourd'hui est une tres belle journee et j'aimerais que tu sois la avec moi."
Bad: "Hello, I'm happy you're here with me."
Good: "Today is a very beautiful day and I would like you to be here with me."

Input: "Hello, how are you?"
Bad: "Hi there, I hope you're doing great today!"
Good: "Bonjour, comment allez-vous ?"`;
}

/**
 * Validates translation output to prevent hallucination
 */
function validateTranslation(sourceText: string, translatedText: string): boolean {
  if (!sourceText || !translatedText) return false;
  
  // FIRST: Validate that translation is in English or French ONLY
  if (containsNonEnglishFrenchCharacters(translatedText)) {
    console.error('🚫 [Translation Validation] Translation contains non-English/French language:', translatedText);
    return false;
  }
  
  // Check if translation is reasonable length (not more than 2x source)
  const sourceWords = sourceText.trim().split(/\s+/).length;
  const translatedWords = translatedText.trim().split(/\s+/).length;
  
  // Allow some flexibility for language differences, but prevent excessive hallucination
  if (translatedWords > sourceWords * 2.5) {
    console.warn('[Translation Validation] Translation too long, possible hallucination:', {
      source: sourceText,
      translation: translatedText,
      sourceWords,
      translatedWords
    });
    return false;
  }
  
  // Check for common hallucination patterns
  const hallucinations = [
    'thank you for asking',
    'how can I help',
    'is there anything else',
    'let me know if',
    'feel free to',
    'please let me know',
    'merci de demander',
    'comment puis-je aider',
    'y a-t-il autre chose'
  ];
  
  const lowerTranslation = translatedText.toLowerCase();
  for (const pattern of hallucinations) {
    if (lowerTranslation.includes(pattern)) {
      console.warn('[Translation Validation] Detected hallucination pattern:', pattern, 'in:', translatedText);
      return false;
    }
  }
  
  return true;
}

interface AppContextType {
  status: AppStatus;
  speakers: Speaker[];
  speakerCount: number;
  activeSpeakerId: number;
  setActiveSpeakerId: (id: number) => void;
  updateSpeakerCount: (count: number) => void;
  updateSpeakerLanguage: (speakerId: number, lang: LanguageCode) => void;
  updateSpeakerViewLanguage: (speakerId: number, lang: LanguageCode) => void;
  messages: ConversationMessage[];
  clearHistory: () => void;
  startListening: () => void;
  stopListening: () => void;
  autoDetect: boolean;
  setAutoDetect: (v: boolean) => void;
  translationEnabled: boolean;
  setTranslationEnabled: (v: boolean) => void;
  captionsEnabled: boolean;
  setCaptionsEnabled: (v: boolean) => void;
  voiceFeedback: boolean;
  setVoiceFeedback: (v: boolean) => void;
  voiceMode: VoiceMode;
  setVoiceModeAndInit: (m: VoiceMode) => void;
  selectedVoice: OpenAIVoice;
  setSelectedVoice: (v: OpenAIVoice) => void;
  insights: SessionInsights;
  resetInsights: () => void;
  sessionState: SessionState;
  dbThreshold: number;
  setDbThreshold: (threshold: number) => void;
  currentDbLevel: number | null;
  // Recording functionality
  recordingState: RecordingState;
  downloadRecording: () => void;
  downloadTranscript: () => void;
  showDownloadPanel: boolean;
  setShowDownloadPanel: (show: boolean) => void;
  // Room audio callback
  setTranslatedAudioCallback: (callback: ((audioData: string, originalText: string, translatedText: string) => void) | null) => void;
  // Room transcript callback
  setTranscriptCallback: (callback: ((transcript: string, language: 'en-US' | 'fr-CA') => void) | null) => void;
  // Room realtime streaming callbacks
  setRealtimeStreamingCallbacks: (callbacks: RealtimeStreamingCallbacks | null) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be inside AppProvider");
  return ctx;
}

const EMPTY_INSIGHTS: SessionInsights = {
  avgTranslationLatency: 0,
  avgSynthesisLatency: 0,
  avgNetworkDelay: 0,
  errorRate: 0,
  avgConfidence: 0,
  totalMessages: 0,
  sessionDuration: 0,
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus>("idle");
  const [activeSpeakerId, setActiveSpeakerId] = useState(0);
  const translatedAudioCallbackRef = useRef<((audioData: string, originalText: string, translatedText: string) => void) | null>(null);
  const realtimeStreamingCallbacksRef = useRef<RealtimeStreamingCallbacks | null>(null);
  const transcriptCallbackRef = useRef<((transcript: string, language: 'en-US' | 'fr-CA') => void) | null>(null);
  const [speakerCount, setSpeakerCount] = useState(2);
  const [speakers, setSpeakers] = useState<Speaker[]>(() => createSpeakers(2));
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesRef = useRef<ConversationMessage[]>([]); // Keep current messages for callbacks
  const [autoDetect, setAutoDetect] = useState(false);
  const [translationEnabled, setTranslationEnabled] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [voiceFeedback, setVoiceFeedback] = useState(true);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("push-to-talk");
  const [selectedVoiceRaw, setSelectedVoiceRaw] = useState<OpenAIVoice>("ballad");
  const setSelectedVoice = useCallback((v: OpenAIVoice) => {
    const valid = OPENAI_VOICES.some((voice) => voice.id === v);
    setSelectedVoiceRaw(valid ? v : "ballad");
  }, []);
  const [insights, setInsights] = useState<SessionInsights>(EMPTY_INSIGHTS);
  const [dbThreshold, setDbThresholdState] = useState<number>(-50); // Default: -50 dB
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const sessionStart = useRef(Date.now());
  const startTimeRef = useRef(0);
  const currentMessageIdRef = useRef<string | null>(null); // Track current message being processed

  const { initSession, attachCallbacks, stopSession, commitTurn, enableMic, disableMic, isConnected, sessionState, currentDbLevel, setDbThreshold: setDbThresholdHook, getMediaStreams } = useRealtimeVoice();

  // Recording hooks
  const { recordingState, startRecording, stopRecording, downloadRecording: downloadRecordingFile, clearRecording } = useCallRecording();
  const { downloadTranscript: downloadTranscriptFile, createTranscriptData } = useTranscriptDownload();

  // Keep refs for use in callbacks
  const speakersRef = useRef(speakers);
  speakersRef.current = speakers;
  const activeSpeakerIdRef = useRef(activeSpeakerId);
  activeSpeakerIdRef.current = activeSpeakerId;
  const selectedVoiceRef = useRef(selectedVoiceRaw);
  selectedVoiceRef.current = selectedVoiceRaw;
  const voiceModeRef = useRef(voiceMode);
  voiceModeRef.current = voiceMode;
  const reinitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /** Rebuild session with current speaker/voice config */
  const reinitSession = useCallback(() => {
    const mode = voiceModeRef.current;
    if (mode === "push-to-talk" || mode === "hands-free") {
      // Clear any pending reinit
      if (reinitTimeoutRef.current) {
        clearTimeout(reinitTimeoutRef.current);
      }
      
      console.log('[Translation Setup] Reinitializing session with current speaker config');
      stopSession();
      
      // Wait a bit for cleanup to complete before reinitializing
      reinitTimeoutRef.current = setTimeout(() => {
        const currentSpeakers = speakersRef.current;
        const currentActiveSpeakerId = activeSpeakerIdRef.current;
        const activeSpeaker = currentSpeakers[currentActiveSpeakerId];
        const otherSpeakers = currentSpeakers.filter((s) => s.id !== currentActiveSpeakerId);
        if (!activeSpeaker) return;
        
        const instructions = buildTranslationInstructions(activeSpeaker, otherSpeakers);
        
        console.log('[Translation Setup] Reinit - Active speaker:', activeSpeaker);
        console.log('[Translation Setup] Reinit - Other speakers:', otherSpeakers);
        console.log('[Translation Setup] Reinit - Minimal instructions:', instructions);
        
        initSession(
          { 
            instructions, 
            voiceMode: mode, 
            voice: selectedVoiceRef.current, 
            dbThreshold,
            language: activeSpeaker.language === 'en-US' ? 'en' : 'fr' // Pass language hint to Whisper
          },
          (err) => {
            console.error("[Realtime] Session reinit error:", err);
            setStatus("error");
            setTimeout(() => setStatus("idle"), 2000);
          }
        );
      }, 250); // Increased delay to ensure cleanup completes
    }
  }, [stopSession, initSession, dbThreshold]);

  /** Switch active speaker and reconnect session with new translation instructions */
  const switchActiveSpeaker = useCallback((id: number) => {
    console.log('[Translation Setup] Switching active speaker to:', id);
    setActiveSpeakerId(id);
    // Update ref immediately so reinit uses new value
    activeSpeakerIdRef.current = id;
    
    // 🔥 CRITICAL FIX: Don't reinitialize session on speaker switch
    // The session can handle speaker changes without reconnecting
    // Reinitializing breaks the WebRTC connection and data channel
    console.log('⚠️ [Translation Setup] Speaker switched but NOT reinitializing to preserve connection');
  }, []);

  const updateSpeakerCount = useCallback((count: number) => {
    setSpeakerCount(count);
    setSpeakers((prev) => createSpeakers(count, prev));
    setActiveSpeakerId((prev) => (prev >= count ? 0 : prev));
  }, []);

  const updateSpeakerLanguage = useCallback((speakerId: number, lang: LanguageCode) => {
    console.log('[Translation Setup] Updating speaker language:', speakerId, 'to', lang);
    setSpeakers((prev) => prev.map((s) => (s.id === speakerId ? { ...s, language: lang } : s)));
    
    // 🔥 CRITICAL FIX: Don't reinitialize session on language update
    // The session can handle language changes without reconnecting
    // Reinitializing breaks the WebRTC connection and data channel
    // If language change is needed, it should be done via session.update message, not full reinit
    console.log('⚠️ [Translation Setup] Language updated but NOT reinitializing to preserve connection');
  }, []);

  const updateSpeakerViewLanguage = useCallback((speakerId: number, lang: LanguageCode) => {
    setSpeakers((prev) => prev.map((s) => (s.id === speakerId ? { ...s, viewLanguage: lang } : s)));
  }, []);

  const setDbThreshold = useCallback((threshold: number) => {
    setDbThresholdState(threshold);
    setDbThresholdHook(threshold);
  }, [setDbThresholdHook]);

  /** Update an existing message (for real-time translation updates) */
  const updateMessage = useCallback((messageId: string, updates: Partial<ConversationMessage>) => {
    setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg)));
  }, []);

  /** Add a new message to the conversation */
  const addMessage = useCallback((message: ConversationMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setInsights(EMPTY_INSIGHTS);
    sessionStart.current = Date.now();
    clearRecording();
  }, [clearRecording]);

  const resetInsights = useCallback(() => {
    setInsights(EMPTY_INSIGHTS);
    sessionStart.current = Date.now();
  }, []);

  const startListening = useCallback(() => {
    console.log('🎤 [startListening] Called with sessionState:', sessionState);
    
    const activeSpeaker = speakers[activeSpeakerId];
    const otherSpeakers = speakers.filter((s) => s.id !== activeSpeakerId);
    if (!activeSpeaker) return;

    // If session is already ready, just enable the mic
    if (sessionState === 'ready') {
      console.log('✅ [startListening] Session already ready, just enabling mic');
      setStatus("listening");
      enableMic();
      
      // Start recording if not already recording
      if (!recordingState.isRecording) {
        startRecording();
      }
      return;
    }

    // Otherwise, initialize a new session
    const instructions = buildTranslationInstructions(activeSpeaker, otherSpeakers);
    
    console.log('🔧 [startListening] Initializing new session - Active speaker:', activeSpeaker);
    console.log('🔧 [startListening] Initializing new session - Other speakers:', otherSpeakers);
    console.log('🔧 [startListening] Initializing new session - Instructions:', instructions);

    setStatus("connecting");
    startTimeRef.current = Date.now();

    initSession(
      { 
        instructions, 
        voiceMode, 
        voice: selectedVoiceRaw, 
        dbThreshold,
        language: activeSpeaker.language === 'en-US' ? 'en' : 'fr' // Pass language hint to Whisper
      },
      (err) => {
        console.error("❌ [startListening] Session init error:", err);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 2000);
      }
    );

    // Start recording when session starts
    if (!recordingState.isRecording) {
      startRecording();
    }
  }, [speakers, activeSpeakerId, voiceMode, selectedVoiceRaw, dbThreshold, initSession, recordingState, startRecording, sessionState, enableMic]);

  const stopListening = useCallback(() => {
    console.log('🛑 [stopListening] Called with sessionState:', sessionState, 'voiceMode:', voiceMode);
    
    // For push-to-talk mode, just disable the mic and return to ready state
    // Don't tear down the entire session
    if (voiceMode === 'push-to-talk' && sessionState === 'ready') {
      console.log('✅ [stopListening] Push-to-talk mode, disabling mic and committing turn');
      disableMic();
      
      // Commit the turn to tell OpenAI to process the audio
      console.log('📤 [stopListening] Calling commitTurn to process audio');
      commitTurn();
      
      setStatus("ready");
      // Don't stop recording - keep it running for the session
      return;
    }
    
    // For hands-free mode or when session isn't ready, fully stop the session
    console.log('🛑 [stopListening] Stopping entire session');
    setStatus("idle");
    stopSession();
    
    // Stop recording when session stops
    if (recordingState.isRecording) {
      stopRecording();
    }
  }, [stopSession, recordingState, stopRecording, sessionState, voiceMode, disableMic, commitTurn]);

  const setVoiceModeAndInit = useCallback((mode: VoiceMode) => {
    console.log('🔄 [setVoiceModeAndInit] Called with mode:', mode, 'current sessionState:', sessionState);
    setVoiceMode(mode);
    voiceModeRef.current = mode;
    
    // 🔥 CRITICAL FIX: Don't reinitialize if session is already ready or connecting
    // This prevents the "Data channel closed" issue
    if (sessionState === "ready" || sessionState === "connecting") {
      console.log('⚠️ [setVoiceModeAndInit] Session already active (state:', sessionState, '), skipping reinit to prevent connection break');
      return;
    }
    
    // Only initialize if session is disconnected or in error state
    if (sessionState === "disconnected" || sessionState === "error") {
      console.log('🔄 [setVoiceModeAndInit] Session disconnected/error, initializing new session');
      // Initialize a new session when disconnected
      const activeSpeaker = speakersRef.current[activeSpeakerIdRef.current];
      const otherSpeakers = speakersRef.current.filter((s) => s.id !== activeSpeakerIdRef.current);
      if (activeSpeaker) {
        const instructions = buildTranslationInstructions(activeSpeaker, otherSpeakers);
        console.log('🔄 [setVoiceModeAndInit] Initializing with instructions:', instructions);
        
        initSession(
          { 
            instructions, 
            voiceMode: mode, 
            voice: selectedVoiceRef.current, 
            dbThreshold,
            language: activeSpeaker.language === 'en-US' ? 'en' : 'fr' // Pass language hint to Whisper
          },
          (err) => {
            console.error("❌ [setVoiceModeAndInit] Session init error:", err);
            setStatus("error");
            setTimeout(() => setStatus("idle"), 2000);
          }
        );
      }
    }
  }, [sessionState, dbThreshold, initSession]);

  const downloadRecording = useCallback(() => {
    downloadRecordingFile();
  }, [downloadRecordingFile]);

  const downloadTranscript = useCallback(() => {
    const transcriptData: TranscriptData = {
      messages: messages.map(msg => {
        const translation = Object.values(msg.translations || {})[0];  // Get first translation
        return {
          timestamp: msg.timestamp,
          speaker: speakers.find(s => s.id === msg.speakerId)?.name || `Speaker ${msg.speakerId + 1}`,
          language: speakers.find(s => s.id === msg.speakerId)?.language || 'en-US',
          text: msg.sourceText,
          translation: translation || undefined
        };
      }),
      sessionDuration: insights.sessionDuration,
      totalMessages: insights.totalMessages,
      avgConfidence: insights.avgConfidence
    };
    
    downloadTranscriptFile(transcriptData);
  }, [messages, speakers, insights, downloadTranscriptFile]);

  // Attach callbacks when session state changes
  useEffect(() => {
    console.log('🔄 [AppContext] Session state changed to:', sessionState);
    
    if (sessionState === "ready") {
      console.log('✅ [AppContext] Session is ready, setting status and attaching callbacks');
      setStatus("ready");
      
      attachCallbacks(
        // onTranscript - Called when speech is transcribed
        (transcript: string, speakerId: number) => {
          console.log('🎤 ═══════════════════════════════════════════════════════');
          console.log('📝 [onTranscript] RAW WHISPER TRANSCRIPT:', transcript);
          console.log('📝 [onTranscript] Length:', transcript.length, 'chars');
          console.log('📝 [onTranscript] Speaker ID:', speakerId);
          console.log('🎤 ═══════════════════════════════════════════════════════');

          const hasDisallowedScript = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(transcript || '');
          if (hasDisallowedScript) {
            console.warn('⚠️ [onTranscript] Ignoring transcript with disallowed script for en/fr session:', transcript);
            return;
          }
          
          // TRUST WHISPER COMPLETELY - No validation, use transcript as-is
          // Whisper is configured for en-US and fr-CA, so output should be correct
          
          const activeSpeaker = speakersRef.current[speakerId];
          const now = Date.now();
          const MERGE_WINDOW_MS = 3000; // Merge if within 3 seconds of last message
          
          // Check if we should merge with the last message
          const currentMessages = messagesRef.current;
          const lastMessage = currentMessages[currentMessages.length - 1];
          
          console.log('🔍 [onTranscript] Merge check:', {
            hasLastMessage: !!lastMessage,
            lastMessageSpeaker: lastMessage?.speakerId,
            currentSpeaker: speakerId,
            timeSinceLastMessage: lastMessage ? now - lastMessage.timestamp : null,
            mergeWindow: MERGE_WINDOW_MS,
            lastMessageText: lastMessage?.sourceText
          });
          
          const shouldMerge = lastMessage && 
            lastMessage.speakerId === speakerId && 
            (now - lastMessage.timestamp) < MERGE_WINDOW_MS &&
            !lastMessage.translations[activeSpeaker.language === 'en-US' ? 'fr-CA' : 'en-US']; // Only merge if translation not yet received
          
          if (shouldMerge) {
            console.log('🔗 [onTranscript] ✅ MERGING with previous message');
            console.log('🔗 [onTranscript] Previous text:', lastMessage.sourceText);
            console.log('🔗 [onTranscript] New text:', transcript);
            
            // Merge transcripts with a space
            const mergedText = lastMessage.sourceText + ' ' + transcript;
            console.log('✅ [onTranscript] FINAL MERGED TEXT:', mergedText);
            
            // Update the existing message
            updateMessage(lastMessage.id, {
              sourceText: mergedText,
              timestamp: now
            });
            currentMessageIdRef.current = lastMessage.id;
          } else {
            console.log('📨 [onTranscript] ✅ CREATING NEW MESSAGE (no merge)');
            console.log('📨 [onTranscript] Reason:', !lastMessage ? 'No previous message' : 
              lastMessage.speakerId !== speakerId ? 'Different speaker' :
              (now - lastMessage.timestamp) >= MERGE_WINDOW_MS ? 'Outside merge window' :
              'Translation already received');
            
            // Create new message
            const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            currentMessageIdRef.current = messageId;
            
            const message: ConversationMessage = {
              id: messageId,
              speakerId,
              sourceText: transcript,  // Use raw transcript from Whisper
              sourceLang: activeSpeaker.language,
              translations: {},  // Will be filled when translation arrives
              timestamp: now,
            };
            
            console.log('✅ [onTranscript] NEW MESSAGE CREATED:', { 
              id: messageId, 
              sourceText: transcript,
              sourceLang: activeSpeaker.language
            });
            addMessage(message);
            
            // Send transcript to backend via registered callback
            if (transcriptCallbackRef.current) {
              console.log('📤 [onTranscript] Sending transcript to backend via callback');
              transcriptCallbackRef.current(transcript, activeSpeaker.language);
            } else {
              console.warn('⚠️ [onTranscript] No transcript callback registered - not sent to backend');
            }
          }
        },
        
        // onTranslation - Called when translation is complete
        (translation: string, originalText: string) => {
          const sanitizedTranslation = (translation || '')
            .replace(/^ERROR:\s*Only English and French supported\s*/i, '')
            .trim();

          if (!sanitizedTranslation) {
            console.warn('⚠️ [onTranslation] Empty translation after sanitization, skipping update');
            return;
          }

          console.log('🌐 ═══════════════════════════════════════════════════════');
          console.log('🔄 [onTranslation] TRANSLATION RECEIVED');
          console.log('🔄 [onTranslation] Original text:', originalText);
          console.log('🔄 [onTranslation] Translated text:', sanitizedTranslation);
          console.log('🔄 [onTranslation] Translation length:', sanitizedTranslation.length, 'chars');
          console.log('🌐 ═══════════════════════════════════════════════════════');
          
          // Don't reject translations - let them through even if imperfect
          // OpenAI should handle the translation quality
          // Filter on display side if needed
          
          if (currentMessageIdRef.current) {
            // Get the other speaker's language for translation key
            const otherLanguage = speakersRef.current.find(s => s.id !== activeSpeakerIdRef.current)?.language || 'fr-CA';
            updateMessage(currentMessageIdRef.current, {
              translations: { [otherLanguage]: sanitizedTranslation }
            });
            console.log('✅ [onTranslation] Updated message with translation:', { 
              id: currentMessageIdRef.current, 
              otherLanguage,
              translationPreview: sanitizedTranslation.substring(0, 100) 
            });
          } else {
            console.warn('⚠️ [onTranslation] No currentMessageIdRef - translation orphaned!');
          }
          
          // Update insights
          const processingTime = Date.now() - startTimeRef.current;
          setInsights((prev) => ({
            ...prev,
            avgTranslationLatency: (prev.avgTranslationLatency + processingTime) / 2,
            totalMessages: prev.totalMessages + 1,
            sessionDuration: Date.now() - sessionStart.current,
          }));
        },
        
        // onError - Called when an error occurs
        (error: Error) => {
          console.error('⚠️ [onError] Session error:', error.message);
          
          // Handle specific error types
          if (error.message === "DUPLICATE_TRANSCRIPT") {
            console.log('🔄 [DUPLICATE] Duplicate transcript detected, ignoring');
            setStatus("idle");
            toast.info("Duplicate detected, please try again.");
            return;
          }
          
          // Handle other errors normally
          setStatus("error");
          setTimeout(() => setStatus("idle"), 3000);
        },
        
        // onTranslatedAudio - Called when translated audio is ready to send to other participant
        (audioData: string, originalText: string, translatedText: string) => {
          console.log(' [onTranslatedAudio] Received translated audio for room sharing');
          console.log(' [onTranslatedAudio] Original:', originalText);
          console.log(' [onTranslatedAudio] Translated:', translatedText);
          console.log(' [onTranslatedAudio] Audio data length:', audioData?.length);
          
          // Send translated audio to room via registered callback
          if (translatedAudioCallbackRef.current) {
            console.log('✅ [onTranslatedAudio] Calling registered callback to send audio to room');
            translatedAudioCallbackRef.current(audioData, originalText, translatedText);
          } else {
            console.warn('⚠️ [onTranslatedAudio] No callback registered - audio not sent to room');
          }
        },
        {
          onVoiceActivityStarted: () => {
            realtimeStreamingCallbacksRef.current?.onVoiceActivityStarted?.();
          },
          onVoiceActivityStopped: () => {
            realtimeStreamingCallbacksRef.current?.onVoiceActivityStopped?.();
          },
          onPartialTranscript: (delta: string, itemId: string) => {
            realtimeStreamingCallbacksRef.current?.onPartialTranscript?.(delta, itemId);
          },
          onTranslationDelta: (delta: string, responseId: string) => {
            realtimeStreamingCallbacksRef.current?.onTranslationDelta?.(delta, responseId);
          },
          onAudioChunk: (audioData: string, responseId: string) => {
            realtimeStreamingCallbacksRef.current?.onAudioChunk?.(audioData, responseId);
          },
          onSilenceDetected: () => {
            console.log('ℹ️ [SILENCE] No speech detected');
            setStatus("idle");
            toast.info("Nothing detected — please speak while holding the mic button");
          }
        }
      );
    } else if (sessionState === "disconnected") {
      console.log('⚠️ [AppContext] Session disconnected');
      setStatus("idle");
    } else if (sessionState === "connecting") {
      console.log('⏳ [AppContext] Session connecting...');
      setStatus("connecting");
    } else if (sessionState === "error") {
      console.error('❌ [AppContext] Session error state');
      setStatus("error");
    }
  }, [sessionState, attachCallbacks, addMessage, updateMessage]);

  const setTranslatedAudioCallback = useCallback((callback: ((audioData: string, originalText: string, translatedText: string) => void) | null) => {
    console.log('🔧 [AppContext] Registering translated audio callback:', callback ? 'REGISTERED' : 'CLEARED');
    translatedAudioCallbackRef.current = callback;
  }, []);

  const setTranscriptCallback = useCallback((callback: ((transcript: string, language: 'en-US' | 'fr-CA') => void) | null) => {
    console.log('🔧 [AppContext] Registering transcript callback:', callback ? 'REGISTERED' : 'CLEARED');
    transcriptCallbackRef.current = callback;
  }, []);

  const setRealtimeStreamingCallbacks = useCallback((callbacks: RealtimeStreamingCallbacks | null) => {
    console.log('🔧 [AppContext] Registering realtime streaming callbacks:', callbacks ? 'REGISTERED' : 'CLEARED');
    realtimeStreamingCallbacksRef.current = callbacks;
  }, []);

  const value: AppContextType = {
    status,
    speakers,
    speakerCount,
    activeSpeakerId,
    setActiveSpeakerId: switchActiveSpeaker,
    updateSpeakerCount,
    updateSpeakerLanguage,
    updateSpeakerViewLanguage,
    messages,
    clearHistory,
    startListening,
    stopListening,
    autoDetect,
    setAutoDetect,
    translationEnabled,
    setTranslationEnabled,
    captionsEnabled,
    setCaptionsEnabled,
    voiceFeedback,
    setVoiceFeedback,
    voiceMode,
    setVoiceModeAndInit,
    selectedVoice: selectedVoiceRaw,
    setSelectedVoice,
    insights,
    resetInsights,
    sessionState,
    dbThreshold,
    setDbThreshold,
    currentDbLevel,
    recordingState,
    downloadRecording,
    downloadTranscript,
    showDownloadPanel,
    setShowDownloadPanel,
    setTranslatedAudioCallback,
    setTranscriptCallback,
    setRealtimeStreamingCallbacks,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;

}
