export const LANGUAGES = [
  { code: "en-US", label: "English", region: "US", countryCode: "US" },
  { code: "fr-CA", label: "Canadien français", region: "Canada", countryCode: "CA" },
] as const;

/**
 * Helper function to get flag emoji from country code
 * Used for places where React components can't be used (e.g., select options)
 */
export function getFlagEmoji(countryCode: string): string {
  const flagMap: Record<string, string> = {
    US: "",
    CA: "",
  };
  return flagMap[countryCode] || "";
}

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export type AppStatus = "idle" | "listening" | "translating" | "error" | "success";

export const SPEAKER_COLORS = [
  "hsl(24, 95%, 53%)",   // orange (primary)
  "hsl(200, 80%, 55%)",  // blue
  "hsl(142, 72%, 45%)",  // green
  "hsl(280, 70%, 55%)",  // purple
  "hsl(340, 75%, 55%)",  // pink
  "hsl(45, 90%, 50%)",   // yellow
  "hsl(170, 70%, 45%)",  // teal
  "hsl(10, 80%, 55%)",   // red-orange
] as const;

export const SPEAKER_NAMES = [
  "Speaker A", "Speaker B", "Speaker C", "Speaker D",
  "Speaker E", "Speaker F", "Speaker G", "Speaker H",
] as const;

export interface Speaker {
  id: number;
  name: string;
  language: LanguageCode;
  /** Language this speaker prefers to read translations in (defaults to their language) */
  viewLanguage: LanguageCode;
  color: string;
}

export interface ConversationMessage {
  id: string;
  speakerId: number;
  sourceText: string;
  sourceLang: LanguageCode;
  /** Map of languageCode  translated text for each target speaker */
  translations: Record<string, string>;
  timestamp: number;
  latency?: number;
  confidence?: number;
}

export interface SessionInsights {
  avgTranslationLatency: number;
  avgSynthesisLatency: number;
  avgNetworkDelay: number;
  errorRate: number;
  avgConfidence: number;
  totalMessages: number;
  sessionDuration: number;
}

export const STATUS_MESSAGES: Record<AppStatus, string> = {
  idle: "Tap the mic and speak in your language",
  listening: "Listening speak naturally",
  translating: "Translating",
  error: "Couldn't catch that  please try again",
  success: "Translation complete",
};

export const OPENAI_VOICES = [
  { id: "alloy", label: "Alloy", description: "Neutral & balanced" },
  { id: "ash", label: "Ash", description: "Warm & confident" },
  { id: "ballad", label: "Ballad", description: "Soft & expressive" },
  { id: "coral", label: "Coral", description: "Clear & friendly" },
  { id: "echo", label: "Echo", description: "Smooth & calm" },
  { id: "sage", label: "Sage", description: "Wise & measured" },
  { id: "shimmer", label: "Shimmer", description: "Bright & energetic" },
  { id: "verse", label: "Verse", description: "Rich & articulate" },
  { id: "marin", label: "Marin", description: "Fresh & approachable" },
  { id: "cedar", label: "Cedar", description: "Grounded & steady" },
] as const;

export type OpenAIVoice = (typeof OPENAI_VOICES)[number]["id"];

export const VOICE_PROMPTS = {
  ready: "Ready. Press the mic and speak.",
  listening: "I'm listening",
  translating: "One moment, translating now.",
  error: "Sorry, I didn't catch that. Please try again.",
  done: "Here's your translation.",
};

export const ADMIN_LABELS = {
  autoDetect: "Auto-detect language",
  autoDetectTooltip: "Automatically identify the spoken language instead of selecting it manually",
  translationToggle: "Live translation",
  translationToggleTooltip: "Enable real-time speech-to-speech translation",
  captionsToggle: "Show captions",
  captionsToggleTooltip: "Display text captions for both original and translated speech",
  voiceFeedback: "Voice feedback",
  voiceFeedbackTooltip: "Play audio confirmation when translation is ready",
  sourceLanguage: "You speak",
  targetLanguage: "Translate to",
  sensitivity: "Mic sensitivity",
  sensitivityTooltip: "Adjust how sensitive the microphone is to ambient noise",
  dbThreshold: "Voice detection threshold",
  dbThresholdTooltip: "Minimum audio level (dB) required to trigger transcription. Lower values are more sensitive.",
  speakerCount: "Number of speakers",
  speakerCountTooltip: "How many speakers are in this conversation",
  showInsights: "Show insights",
  showInsightsTooltip: "Display real-time performance metrics for the session",
};
