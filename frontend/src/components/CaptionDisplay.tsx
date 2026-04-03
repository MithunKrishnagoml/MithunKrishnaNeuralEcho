import { AppStatus } from "@/lib/constants";

interface CaptionDisplayProps {
  sourceText: string;
  translatedText: string;
  status: AppStatus;
  captionsEnabled: boolean;
}

export function CaptionDisplay({ sourceText, translatedText, status, captionsEnabled }: CaptionDisplayProps) {
  if (!captionsEnabled) return null;

  const showSource = sourceText.length > 0;
  const showTranslated = translatedText.length > 0;
  const isListening = status === "listening";

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {/* Source caption */}
      <div className={`min-h-[60px] rounded-xl px-5 py-4 bg-secondary/60 transition-all duration-300 ${isListening ? "border border-primary/30" : "border border-transparent"}`}>
        {showSource ? (
          <p className="text-caption-muted text-sm animate-fade-up">{sourceText}</p>
        ) : (
          <p className="text-muted-foreground text-sm italic">
            {isListening ? "Listening" : "Original speech will appear here"}
          </p>
        )}
      </div>

      {/* Translated caption */}
      <div className="min-h-[60px] rounded-xl px-5 py-4 bg-card border border-border">
        {showTranslated ? (
          <p className="text-caption font-medium text-base animate-fade-up font-mono-display">{translatedText}</p>
        ) : (
          <p className="text-muted-foreground text-sm italic">
            {status === "translating" ? (
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Translating
              </span>
            ) : (
              "Translation will appear here"
            )}
          </p>
        )}
      </div>
    </div>
  );
}
