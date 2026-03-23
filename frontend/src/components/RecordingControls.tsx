/**
 * Recording Controls Component
 * Manages session recording and transcript downloads
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Play, 
  Square, 
  Download, 
  FileText, 
  Mic, 
  Clock,
  Users,
  MessageCircle,
  FileJson,
  FileType,
  Loader2
} from 'lucide-react';
import { SessionRecording } from '@/types/chatroom';
import { toast } from 'sonner';

interface RecordingControlsProps {
  // Recording state
  recording: SessionRecording | null;
  isRecording: boolean;
  recordingDuration: number;
  
  // Recording controls
  onStartRecording: () => Promise<string>;
  onStopRecording: () => void;
  onDownloadRecording: () => void;
  
  // Transcript controls
  onDownloadTranscriptTXT: () => void;
  onDownloadTranscriptJSON: () => void;
  
  // Session stats
  sessionStats: {
    totalMessages: number;
    userMessages: number;
    otherMessages: number;
    avgProcessingTime: number;
    avgConfidence: number;
    sessionDuration: number;
    hasRecording: boolean;
  };
  
  // Utilities
  formatDuration: (ms: number) => string;
  
  className?: string;
}

export function RecordingControls({
  recording,
  isRecording,
  recordingDuration,
  onStartRecording,
  onStopRecording,
  onDownloadRecording,
  onDownloadTranscriptTXT,
  onDownloadTranscriptJSON,
  sessionStats,
  formatDuration,
  className = ""
}: RecordingControlsProps) {
  const [isStartingRecording, setIsStartingRecording] = useState(false);

  const handleStartRecording = async () => {
    setIsStartingRecording(true);
    try {
      await onStartRecording();
      toast.success('Recording started successfully');
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast.error('Failed to start recording. Please check microphone permissions.');
    } finally {
      setIsStartingRecording(false);
    }
  };

  const handleStopRecording = () => {
    onStopRecording();
    toast.success('Recording stopped');
  };

  const handleDownloadRecording = () => {
    onDownloadRecording();
    toast.success('Recording download started');
  };

  const handleDownloadTranscriptTXT = () => {
    onDownloadTranscriptTXT();
    toast.success('Transcript (TXT) download started');
  };

  const handleDownloadTranscriptJSON = () => {
    onDownloadTranscriptJSON();
    toast.success('Transcript (JSON) download started');
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mic className="w-5 h-5 text-primary" />
          Session Recording & Transcript
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Recording Controls */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">Recording</h4>
            {isRecording && (
              <Badge variant="destructive" className="animate-pulse">
                <div className="w-2 h-2 rounded-full bg-white mr-1" />
                Recording
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {!isRecording ? (
              <Button
                onClick={handleStartRecording}
                disabled={isStartingRecording}
                className="flex-1"
                variant="default"
              >
                {isStartingRecording ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Recording
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleStopRecording}
                variant="destructive"
                className="flex-1"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop Recording
              </Button>
            )}
            
            {recording?.recordingUrl && (
              <Button
                onClick={handleDownloadRecording}
                variant="outline"
                size="sm"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
          </div>
          
          {isRecording && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Duration: {formatDuration(recordingDuration)}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Transcript Downloads */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Download Transcript</h4>
          
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleDownloadTranscriptTXT}
              variant="outline"
              size="sm"
              disabled={sessionStats.totalMessages === 0}
              className="flex items-center gap-2"
            >
              <FileType className="w-4 h-4" />
              TXT
            </Button>
            
            <Button
              onClick={handleDownloadTranscriptJSON}
              variant="outline"
              size="sm"
              disabled={sessionStats.totalMessages === 0}
              className="flex items-center gap-2"
            >
              <FileJson className="w-4 h-4" />
              JSON
            </Button>
          </div>
        </div>

        <Separator />

        {/* Session Statistics */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Session Statistics</h4>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{sessionStats.totalMessages}</div>
                <div className="text-xs text-muted-foreground">Total Messages</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{sessionStats.userMessages}/{sessionStats.otherMessages}</div>
                <div className="text-xs text-muted-foreground">You/Other</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{formatDuration(sessionStats.sessionDuration)}</div>
                <div className="text-xs text-muted-foreground">Session Time</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{Math.round(sessionStats.avgConfidence * 100)}%</div>
                <div className="text-xs text-muted-foreground">Avg Confidence</div>
              </div>
            </div>
          </div>
          
          {sessionStats.avgProcessingTime > 0 && (
            <div className="text-xs text-muted-foreground">
              Average processing time: {Math.round(sessionStats.avgProcessingTime)}ms
            </div>
          )}
        </div>

        {/* Recording Status */}
        {recording && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Recording Status</h4>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={recording.status === 'ready' ? 'default' : 'secondary'}>
                    {recording.status}
                  </Badge>
                </div>
                {recording.duration && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration:</span>
                    <span>{formatDuration(recording.duration)}</span>
                  </div>
                )}
                {recording.size && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size:</span>
                    <span>{Math.round(recording.size / 1024 / 1024 * 100) / 100} MB</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}