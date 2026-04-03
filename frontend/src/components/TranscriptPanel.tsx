/**
 * TranscriptPanel - Display realtime streaming transcripts
 * Shows either input (my words) or output (translated words)
 */

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { TranscriptLane } from '@/hooks/useTranscripts';

interface TranscriptPanelProps {
  title: string;
  languageName: string;
  transcript: TranscriptLane;
  onClear: () => void;
  className?: string;
}

export function TranscriptPanel({
  title,
  languageName,
  transcript,
  onClear,
  className = '',
}: TranscriptPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages or partialText changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [transcript.messages, transcript.partialText]);

  return (
    <div className={`flex flex-col h-full border border-border rounded-lg bg-background ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{languageName}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 w-8 p-0"
          title="Clear transcript"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Transcript Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {transcript.messages.length === 0 && !transcript.partialText && (
          <div className="flex items-center justify-center h-full text-center">
            <p className="text-sm text-muted-foreground">
              No transcript yet
            </p>
          </div>
        )}

        {/* Finalized messages */}
        {transcript.messages.map((message) => (
          <div
            key={message.id}
            className="text-sm text-foreground leading-relaxed"
          >
            {message.text}
          </div>
        ))}

        {/* Partial text (streaming) */}
        {transcript.partialText && (
          <div className="text-sm text-muted-foreground italic leading-relaxed flex items-start gap-1">
            <span>{transcript.partialText}</span>
            <span className="inline-block w-0.5 h-4 bg-primary animate-pulse cursor-blink" />
          </div>
        )}
      </div>
    </div>
  );
}
