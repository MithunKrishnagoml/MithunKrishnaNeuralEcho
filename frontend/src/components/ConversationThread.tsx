import { ConversationMessage, Speaker, LANGUAGES } from "@/lib/constants";
import { Clock } from "lucide-react";
import { useRef, useEffect } from "react";

interface ConversationThreadProps {
  messages: ConversationMessage[];
  speakers: Speaker[];
  activeSpeakerId: number;
  captionsEnabled: boolean;
}

export function ConversationThread({ messages, speakers, activeSpeakerId, captionsEnabled }: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-5">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground text-sm">No messages yet</p>
          <p className="text-muted-foreground/60 text-xs">
            Select a speaker and press the mic to start
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {messages.map((msg) => {
          const speaker = speakers.find(s => s.id === msg.speakerId);
          const bubbleColor = speaker?.color || "hsl(220, 8%, 18%)";
          const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

          const sourceLang = LANGUAGES.find(l => l.code === msg.sourceLang);
          // Don't show translations if there's no actual transcript (silence detected)
          const hasRealTranscript = msg.sourceText && msg.sourceText.trim() !== "(no transcript)" && msg.sourceText.trim().length > 0;
          const translationText = hasRealTranscript ? (msg.translations["ai-response"] || null) : null;

          // Determine the other language
          const otherLangCode = msg.sourceLang === "en-US" ? "fr-CA" : "en-US";
          const otherLang = LANGUAGES.find(l => l.code === otherLangCode);

          // Display order depends on the ACTIVE VIEWER, not the message source
          // Speaker A (en-US viewer): English on top, French on bottom
          // Speaker B (fr-CA viewer): French on top, English on bottom
          const viewerLang = speakers[activeSpeakerId]?.language || "en-US";
          const viewerIsEnglish = viewerLang === "en-US";
          const isEnglishSource = msg.sourceLang === "en-US";

          const topLabel = viewerIsEnglish ? "English" : "French";
          const topText = viewerIsEnglish ? (isEnglishSource ? msg.sourceText : translationText) : (isEnglishSource ? translationText : msg.sourceText);
          const bottomLabel = viewerIsEnglish ? "French" : "English";
          const bottomText = viewerIsEnglish ? (isEnglishSource ? translationText : msg.sourceText) : (isEnglishSource ? msg.sourceText : translationText);

          return (
            <div key={msg.id} className="animate-fade-in">
              {/* Speaker name */}
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-xs font-medium"
                  style={{ color: bubbleColor }}
                >
                  {speaker?.name}
                </span>
              </div>

              {/* Message card */}
              <div
                className="rounded-xl px-5 py-4 border"
                style={{
                  borderColor: `${bubbleColor}25`,
                  backgroundColor: `${bubbleColor}08`,
                }}
              >
                {/* Top section: source language */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {topLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground/30">{time}</span>
                  </div>
                  <p className="text-sm text-foreground/85 mt-1">
                    {topText}
                  </p>
                </div>

                {/* Bottom section: translation */}
                {bottomText && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: `${bubbleColor}15` }}>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: bubbleColor }}
                    >
                      {bottomLabel}
                    </span>
                    <p
                      className="text-sm font-medium mt-1"
                      style={{ color: bubbleColor }}
                    >
                      {bottomText}
                    </p>
                  </div>
                )}
              </div>

              {/* Meta */}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 px-1 mt-1">
                {msg.latency && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {Math.round(msg.latency)}ms
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
