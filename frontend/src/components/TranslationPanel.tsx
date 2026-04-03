import { MicButton } from "@/components/MicButton";
import { ConversationThread } from "@/components/ConversationThread";
import { StatusBar } from "@/components/StatusBar";
import { useAppState } from "@/contexts/AppContext";
import { MessageSquare, Zap, TrendingUp, AlertCircle } from "lucide-react";
import { LANGUAGES } from "@/lib/constants";
import { CountryFlag } from "@/components/CountryFlag";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";

interface TranslationPanelProps {
  /** Which language perspective this panel represents */
  langCode: "en-US" | "fr-CA";
}

export function TranslationPanel({ langCode }: TranslationPanelProps) {
  const t = useAppState();
  const [qualityScore, setQualityScore] = useState(0.85);
  const [audioLevel, setAudioLevel] = useState(-60);
  const [processingTime, setProcessingTime] = useState(0);

  const isEnglish = langCode === "en-US";
  const speakerId = isEnglish ? 0 : 1;
  const isActive = t.activeSpeakerId === speakerId;
  const speaker = t.speakers.find(s => s.id === speakerId);
  const lang = LANGUAGES.find(l => l.code === langCode);
  const otherLangCode = isEnglish ? "fr-CA" : "en-US";
  const otherLang = LANGUAGES.find(l => l.code === otherLangCode);

  const isSessionActive = t.voiceMode === "hands-free" && (t.status === "listening" || t.status === "translating");

  // Simulate real-time quality metrics (in production, these would come from the AI system)
  useEffect(() => {
    if (isActive && t.status === "listening") {
      const interval = setInterval(() => {
        setAudioLevel(t.currentDbLevel || -60);
        setQualityScore(0.8 + Math.random() * 0.2); // Simulate quality between 80-100%
        setProcessingTime(800 + Math.random() * 1200); // Simulate 0.8-2s processing
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [isActive, t.status, t.currentDbLevel]);

  const handleActivate = () => {
    if (!isSessionActive) {
      t.setActiveSpeakerId(speakerId);
    }
  };

  const getQualityColor = (score: number): string => {
    if (score >= 0.8) return 'text-orange-400';
    if (score >= 0.6) return 'text-orange-300';
    return 'text-orange-200';
  };

  const getQualityBadgeVariant = (score: number) => {
    if (score >= 0.8) return 'default';
    if (score >= 0.6) return 'secondary';
    return 'destructive';
  };

  return (
    <div
      className={`flex flex-col h-full border-r last:border-r-0 border-border/50 transition-all ${
        isActive ? "bg-background" : "bg-background/80"
      }`}
    >
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-border/50">
        <button
          onClick={handleActivate}
          disabled={isSessionActive}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm font-medium ${
            isActive
              ? "border-primary/40 bg-primary/10 text-primary"
              : isSessionActive
                ? "border-border bg-secondary opacity-50 cursor-not-allowed text-muted-foreground"
                : "border-border bg-secondary hover:bg-muted text-muted-foreground"
          }`}
        >
          <CountryFlag countryCode={lang?.countryCode || "US"} size={20} />
          <span>{lang?.label}</span>
          {isActive && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
        </button>
      </div>

      {/* Enhanced Language info with AI quality indicators */}
      <div className="px-4 py-2 border-b border-border/50 bg-card/30">
        <div className="flex items-center justify-between text-xs mb-2">
          <div>
            <span className="text-muted-foreground uppercase tracking-wider">Speaker speaks</span>
            <div className="flex items-center gap-1.5 mt-1">
              <CountryFlag countryCode={lang?.countryCode || "US"} size={18} />
              <span className="text-foreground text-sm font-medium">{lang?.region}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-500" />
            <span className="text-orange-500 font-medium">AI Enhanced</span>
          </div>
          <div className="text-right">
            <span className="text-muted-foreground uppercase tracking-wider">Others hear</span>
            <div className="flex items-center gap-1.5 mt-1 justify-end">
              <CountryFlag countryCode={otherLang?.countryCode || "CA"} size={18} />
              <span className="text-foreground text-sm font-medium">{otherLang?.region}</span>
            </div>
          </div>
        </div>

        {/* Real-time quality indicators */}
        {isActive && (t.status === "listening" || t.status === "translating") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Quality:</span>
                <Badge variant={getQualityBadgeVariant(qualityScore)} className="text-xs">
                  {Math.round(qualityScore * 100)}%
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Audio:</span>
                <span className="text-xs font-mono">{Math.round(audioLevel)}dB</span>
              </div>
            </div>
            
            {/* Audio level progress bar */}
            <div className="space-y-1">
              <Progress 
                value={Math.max(0, Math.min(100, (audioLevel + 60) * 2))} 
                className="h-1"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Audio Level</span>
                <span>{processingTime > 0 ? `${processingTime}ms` : ''}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Conversation or empty state */}
      {t.messages.length > 0 ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ConversationThread
            messages={t.messages}
            speakers={t.speakers}
            activeSpeakerId={speakerId}
            captionsEnabled={t.captionsEnabled}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center gap-4 px-4 py-6">
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2 mb-2">
              <MessageSquare className="w-7 h-7 text-primary/30" />
              <Zap className="w-5 h-5 text-orange-500" />
            </div>
            <p className="text-sm text-muted-foreground">
              Enhanced AI Translation Ready
            </p>
            <p className="text-sm text-muted-foreground/60">
              Select <span className="text-primary font-medium">{speaker?.name}</span> and press the mic
            </p>
            <p className="text-xs text-muted-foreground/40 mt-1">
              Mode: {t.voiceMode === "push-to-talk" ? "Press & Talk" : "Hands Free"}  AI Enhanced
            </p>
            <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <span>Noise Suppression</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                <span>Echo Cancellation</span>
              </div>
            </div>
          </div>

          {/* Enhanced session state indicators */}
          {t.sessionState === "connecting" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 animate-fade-in">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-primary font-medium">Initializing Enhanced AI</span>
            </div>
          )}
          {t.sessionState === "ready" && t.status === "idle" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/30 border border-accent/40 animate-fade-in">
              <Zap className="w-3 h-3 text-orange-500" />
              <span className="text-xs text-accent-foreground font-medium">Enhanced AI Ready</span>
            </div>
          )}

          <StatusBar status={t.status} />
          <MicButton
            status={isActive ? t.status : "idle"}
            voiceMode={t.voiceMode}
            onPress={() => {
              if (!isActive) t.setActiveSpeakerId(speakerId);
              t.startListening();
            }}
            onRelease={t.stopListening}
            disabled={t.sessionState !== "ready" || (!isActive && isSessionActive)}
          />
          <p className="text-xs text-muted-foreground text-center">
            {t.sessionState === "connecting"
              ? "Warming up Enhanced AI"
              : t.sessionState !== "ready"
                ? "Select a voice mode for AI enhancement"
                : t.status === "idle"
                  ? t.voiceMode === "push-to-talk" ? "Press and hold to speak (AI Enhanced)" : "Tap to start enhanced listening"
                  : t.status === "listening" && isActive
                    ? t.voiceMode === "push-to-talk" ? "Release to stop (Processing with AI)" : "Tap to stop (AI Processing)"
                    : ""}
          </p>
        </div>
      )}

      {/* Bottom bar with mic when there are messages */}
      {t.messages.length > 0 && (
        <div className="border-t border-primary/20 bg-card/50 px-4 py-2.5">
          <div className="flex items-center justify-center gap-4">
            <div className="flex-1 text-right">
              <StatusBar status={isActive ? t.status : "idle"} />
            </div>
            <MicButton
              status={isActive ? t.status : "idle"}
              voiceMode={t.voiceMode}
              onPress={() => {
                if (!isActive) t.setActiveSpeakerId(speakerId);
                t.startListening();
              }}
              onRelease={t.stopListening}
              disabled={!isActive && isSessionActive}
            />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">
                {isActive && t.status === "idle"
                  ? `As ${speaker?.name}`
                  : isActive && t.status === "listening"
                    ? "Listening"
                    : ""}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
