import { Mic, MicOff } from "lucide-react";
import { AppStatus } from "@/lib/constants";

interface MicButtonProps {
  status: AppStatus;
  isMuted: boolean;
  onToggleMute: () => void;
  disabled?: boolean;
  audioLevel?: number | null;
  dbThreshold?: number;
  isSpeaking?: boolean;
}

export function MicButton({ 
  status, 
  isMuted,
  onToggleMute,
  disabled = false, 
  audioLevel = null,
  dbThreshold = -50,
  isSpeaking = false
}: MicButtonProps) {
  const isActive = status === "listening" || status === "translating";

  // Calculate audio level for visualization (0-1 scale)
  const normalizedLevel = audioLevel !== null 
    ? Math.max(0, Math.min(1, (audioLevel + 100) / 100)) 
    : 0;
  
  // Check if audio is above threshold
  const isAboveThreshold = audioLevel !== null && audioLevel > dbThreshold;

  return (
    <div className="relative flex flex-col items-center justify-center gap-3">
      {/* Pulse rings when speaking (VAD detected) and not muted */}
      {isSpeaking && !isMuted && (
        <>
          <span className="absolute w-28 h-28 rounded-full bg-primary/20 animate-pulse-ring" />
          <span className="absolute w-28 h-28 rounded-full bg-primary/10 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
        </>
      )}

      {/* Audio level visualization when not muted */}
      {!isMuted && audioLevel !== null && (
        <div className="absolute flex items-center gap-1">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const barHeight = Math.max(4, normalizedLevel * 20 + Math.sin(Date.now() / 100 + i) * 2);
            const isBarActive = normalizedLevel > (i / 7);
            return (
              <span
                key={i}
                className={`w-1 rounded-full transition-all duration-100 ${
                  isBarActive && isAboveThreshold 
                    ? "bg-primary" 
                    : isBarActive 
                      ? "bg-primary/40" 
                      : "bg-primary/10"
                }`}
                style={{
                  height: `${barHeight}px`,
                  animation: isBarActive ? `waveform ${0.6 + i * 0.1}s ease-in-out infinite` : 'none',
                  animationDelay: `${i * 0.08}s`,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Audio level indicator ring when not muted */}
      {!isMuted && audioLevel !== null && (
        <div 
          className={`absolute w-24 h-24 rounded-full border-2 transition-all duration-200 ${
            isAboveThreshold 
              ? "border-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)]" 
              : "border-primary/20"
          }`}
          style={{
            transform: `scale(${1 + normalizedLevel * 0.1})`,
          }}
        />
      )}

      <button
        onClick={onToggleMute}
        disabled={disabled}
        className={`
          relative z-10 w-20 h-20 rounded-full flex items-center justify-center
          transition-all duration-300 select-none
          ${disabled
            ? "bg-secondary opacity-40 cursor-not-allowed"
            : isMuted
              ? "bg-destructive hover:bg-destructive/90 active:scale-95"
              : isSpeaking
                ? `bg-primary shadow-[0_0_40px_hsl(var(--live-glow)/0.5)] animate-mic-breathe ${
                    isAboveThreshold ? "shadow-[0_0_60px_hsl(var(--primary)/0.8)]" : ""
                  }`
                : "bg-primary hover:bg-primary/90 active:scale-95"
          }
        `}
        aria-label={isMuted ? "Unmute (M)" : "Mute (M)"}
      >
        {isMuted ? (
          <MicOff className="w-8 h-8 text-primary-foreground" />
        ) : (
          <Mic className={`w-8 h-8 text-primary-foreground ${isSpeaking && isAboveThreshold ? "animate-pulse" : ""}`} />
        )}
      </button>
      
      {/* Audio level debug info (only in development) */}
      {process.env.NODE_ENV === 'development' && audioLevel !== null && (
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-muted-foreground font-mono">
          {Math.round(audioLevel)}dB
        </div>
      )}
    </div>
  );
}
