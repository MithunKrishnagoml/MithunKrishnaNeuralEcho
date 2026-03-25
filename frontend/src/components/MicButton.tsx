import { Mic, MicOff, Hand, Zap } from "lucide-react";
import { AppStatus } from "@/lib/constants";
import { VoiceMode } from "@/hooks/useRealtimeVoice";

interface MicButtonProps {
  status: AppStatus;
  voiceMode: VoiceMode;
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
  audioLevel?: number | null;
  dbThreshold?: number;
  onToggleMode?: () => void;
  showModeToggle?: boolean;
}

export function MicButton({ 
  status, 
  voiceMode, 
  onPress, 
  onRelease, 
  disabled = false, 
  audioLevel = null,
  dbThreshold = -50,
  onToggleMode,
  showModeToggle = false
}: MicButtonProps) {
  const isActive = status === "listening";
  const isTranslating = status === "translating";
  const isHandsFree = voiceMode === "hands-free";

  // Calculate audio level for visualization (0-1 scale)
  const normalizedLevel = audioLevel !== null 
    ? Math.max(0, Math.min(1, (audioLevel + 100) / 100)) 
    : 0;
  
  // Check if audio is above threshold
  const isAboveThreshold = audioLevel !== null && audioLevel > dbThreshold;

  const handleClick = () => {
    if (isHandsFree) {
      // Toggle: start or stop
      if (isActive || isTranslating) {
        onRelease();
      } else {
        onPress();
      }
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center gap-3">
      {/* Pulse rings when active */}
      {isActive && (
        <>
          <span className="absolute w-28 h-28 rounded-full bg-primary/20 animate-pulse-ring" />
          <span className="absolute w-28 h-28 rounded-full bg-primary/10 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
        </>
      )}

      {/* Audio level visualization */}
      {isActive && audioLevel !== null && (
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

      {/* Audio level indicator ring */}
      {isActive && audioLevel !== null && (
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
        // Push-to-talk: press and hold. Hands-free: click to toggle
        onMouseDown={isHandsFree ? undefined : onPress}
        onMouseUp={isHandsFree ? undefined : onRelease}
        onTouchStart={isHandsFree ? undefined : onPress}
        onTouchEnd={isHandsFree ? undefined : onRelease}
        onClick={isHandsFree ? handleClick : undefined}
        disabled={disabled || (isTranslating && !isHandsFree)}
        className={`
          relative z-10 w-20 h-20 rounded-full flex items-center justify-center
          transition-all duration-300 select-none
          ${disabled
            ? "bg-secondary opacity-40 cursor-not-allowed"
            : isActive
              ? `bg-primary shadow-[0_0_40px_hsl(var(--live-glow)/0.5)] animate-mic-breathe ${
                  isAboveThreshold ? "shadow-[0_0_60px_hsl(var(--primary)/0.8)]" : ""
                }`
              : isTranslating
                ? "bg-secondary cursor-wait"
                : "bg-secondary hover:bg-muted active:scale-95"
          }
        `}
        aria-label={
          isHandsFree
            ? isActive ? "Tap to stop" : "Tap to start hands-free"
            : isActive ? "Release to stop" : "Press and hold to speak"
        }
      >
        {isActive ? (
          <Mic className={`w-8 h-8 text-primary-foreground ${isAboveThreshold ? "animate-pulse" : ""}`} />
        ) : (
          <MicOff className="w-8 h-8 text-muted-foreground" />
        )}
      </button>
      
      {/* Audio level debug info (only in development) */}
      {process.env.NODE_ENV === 'development' && audioLevel !== null && (
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-muted-foreground font-mono">
          {Math.round(audioLevel)}dB
        </div>
      )}
      
      {/* Mode Toggle Button */}
      {showModeToggle && onToggleMode && (
        <button
          onClick={onToggleMode}
          disabled={disabled}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Switch to ${isHandsFree ? 'push-to-talk' : 'hands-free'} mode`}
        >
          {isHandsFree ? (
            <>
              <Hand className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Switch to Push-to-Talk</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground">Switch to Hands-Free</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
