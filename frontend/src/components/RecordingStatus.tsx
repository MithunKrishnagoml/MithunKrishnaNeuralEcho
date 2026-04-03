import { Circle, Mic } from "lucide-react";
import { RecordingState } from "@/hooks/useCallRecording";

interface RecordingStatusProps {
  recordingState: RecordingState;
}

export function RecordingStatus({ recordingState }: RecordingStatusProps) {
  const { isRecording, duration } = recordingState;

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isRecording) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-red-600 text-sm">
      {/* Pulsing red dot */}
      <div className="relative">
        <Circle className="w-3 h-3 fill-current animate-pulse" />
        <Circle className="w-3 h-3 fill-current absolute inset-0 animate-ping opacity-75" />
      </div>
      
      {/* Recording icon */}
      <Mic className="w-3 h-3" />
      
      {/* Duration */}
      <span className="font-mono font-medium">
        REC {formatDuration(duration)}
      </span>
    </div>
  );
}