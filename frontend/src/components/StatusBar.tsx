import { AppStatus, STATUS_MESSAGES } from "@/lib/constants";
import { AudioLines, XCircle } from "lucide-react";

interface StatusBarProps {
  status: AppStatus;
}

function WaveformIcon({ animate, className }: { animate?: boolean; className?: string }) {
  const bars = [0.4, 0.7, 1, 0.7, 0.4];
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      {bars.map((scale, i) => {
        const x = 4 + i * 4;
        const height = 14 * scale;
        const y = 12 - height / 2;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width="2.5"
            rx="1.25"
            height={height}
            fill="currentColor"
            className={animate ? "animate-waveform-bar" : ""}
            style={animate ? { animationDelay: `${i * 0.1}s` } : undefined}
          />
        );
      })}
    </svg>
  );
}

export function StatusBar({ status }: StatusBarProps) {
  const statusColor = {
    idle: "text-muted-foreground",
    listening: "text-primary",
    translating: "text-primary",
    error: "text-destructive",
    success: "text-success",
  }[status];

  const isAnimating = status === "listening" || status === "translating";

  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {status === "error" ? (
        <XCircle className={`w-4 h-4 ${statusColor} transition-colors`} />
      ) : (
        <WaveformIcon animate={isAnimating} className={`w-4 h-4 ${statusColor} transition-colors`} />
      )}
      <span className={`text-sm font-medium ${statusColor} transition-colors`}>
        {STATUS_MESSAGES[status]}
      </span>
      {status === "listening" && (
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
      )}
    </div>
  );
}
