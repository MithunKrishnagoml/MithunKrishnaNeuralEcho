import { useState } from "react";
import { Download, FileText, Mic, X, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCallRecording, RecordingState } from "@/hooks/useCallRecording";
import { useTranscriptDownload, TranscriptData } from "@/hooks/useTranscriptDownload";

interface DownloadPanelProps {
  isVisible: boolean;
  onClose: () => void;
  recordingState: RecordingState;
  transcriptData: TranscriptData | null;
  onDownloadRecording: () => void;
  onDownloadTranscript: () => void;
}

export function DownloadPanel({
  isVisible,
  onClose,
  recordingState,
  transcriptData,
  onDownloadRecording,
  onDownloadTranscript,
}: DownloadPanelProps) {
  const [downloadingRecording, setDownloadingRecording] = useState(false);
  const [downloadingTranscript, setDownloadingTranscript] = useState(false);

  if (!isVisible) return null;

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const handleDownloadRecording = async () => {
    setDownloadingRecording(true);
    try {
      onDownloadRecording();
    } finally {
      setDownloadingRecording(false);
    }
  };

  const handleDownloadTranscript = async () => {
    setDownloadingTranscript(true);
    try {
      onDownloadTranscript();
    } finally {
      setDownloadingTranscript(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">Session Complete</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Session Summary */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Duration: {formatDuration(recordingState.duration)}</span>
            </div>
            {transcriptData && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{transcriptData.messages.length} messages exchanged</span>
              </div>
            )}
          </div>

          <div className="text-sm text-muted-foreground text-center">
            Would you like to download your session data?
          </div>

          {/* Download Options */}
          <div className="space-y-3">
            {/* Call Recording */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Mic className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="font-medium text-sm">Call Recording</div>
                  <div className="text-xs text-muted-foreground">
                    WebM audio file with both voices
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadRecording}
                disabled={!recordingState.hasRecording || downloadingRecording}
                className="min-w-[80px]"
              >
                {downloadingRecording ? (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    <span>Download</span>
                  </div>
                )}
              </Button>
            </div>

            {/* Transcript */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-secondary/50 rounded-lg">
                  <FileText className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <div className="font-medium text-sm">Transcript</div>
                  <div className="text-xs text-muted-foreground">
                    Formatted text with timestamps
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadTranscript}
                disabled={!transcriptData || downloadingTranscript}
                className="min-w-[80px]"
              >
                {downloadingTranscript ? (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    <span>Download</span>
                  </div>
                )}
              </Button>
            </div>
          </div>

          {/* Status Messages */}
          {!recordingState.hasRecording && (
            <div className="text-xs text-muted-foreground text-center">
              No recording available - recording may not have started properly
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Skip Downloads
            </Button>
            {(recordingState.hasRecording || transcriptData) && (
              <Button
                onClick={() => {
                  if (recordingState.hasRecording) handleDownloadRecording();
                  if (transcriptData) handleDownloadTranscript();
                  onClose();
                }}
                className="flex-1"
                disabled={downloadingRecording || downloadingTranscript}
              >
                Download Both
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}