import { useRef, useCallback, useState } from "react";

export interface RecordingState {
  isRecording: boolean;
  duration: number;
  hasRecording: boolean;
}

export interface RecordingData {
  blob: Blob;
  duration: number;
  timestamp: number;
  sessionId: string;
}

/**
 * Hook for recording both microphone input and TTS output in a single WebM file
 * Automatically starts/stops with voice sessions
 */
export function useCallRecording() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const sessionIdRef = useRef<string>("");
  
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    duration: 0,
    hasRecording: false,
  });

  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update duration every second while recording
  const updateDuration = useCallback(() => {
    if (startTimeRef.current > 0) {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setRecordingState(prev => ({ ...prev, duration }));
    }
  }, []);

  /**
   * Start recording both microphone and system audio
   * @param micStream - Microphone MediaStream from WebRTC (optional)
   * @param systemStream - System audio stream (TTS output) (optional)
   */
  const startRecording = useCallback(async (micStream?: MediaStream, systemStream?: MediaStream) => {
    try {
      // Create a new session ID
      sessionIdRef.current = `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      
      // Create a new audio context for recording
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      
      // Add microphone audio
      if (micStream) {
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);
      }
      
      // Add system audio (TTS output) if available
      if (systemStream) {
        const systemSource = audioContext.createMediaStreamSource(systemStream);
        systemSource.connect(destination);
      }
      
      // Expose the destination globally so translated audio can connect to it
      (window as any).recordingAudioDestination = destination;
      (window as any).recordingAudioContext = audioContext;
      
      const combinedStream = destination.stream;
      
      // Create MediaRecorder with WebM format and Opus codec
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];
      startTimeRef.current = Date.now();
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        setRecordingState(prev => ({
          ...prev,
          isRecording: false,
          hasRecording: recordedChunksRef.current.length > 0
        }));
        
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
      };
      
      mediaRecorder.start(1000); // Collect data every second
      
      setRecordingState(prev => ({
        ...prev,
        isRecording: true,
        duration: 0,
        hasRecording: false
      }));
      
      // Start duration timer
      durationIntervalRef.current = setInterval(updateDuration, 1000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }, [updateDuration]);

  /**
   * Stop the current recording
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    
    // Clean up global recording references
    if ((window as any).recordingAudioContext) {
      (window as any).recordingAudioContext.close();
      delete (window as any).recordingAudioContext;
    }
    delete (window as any).recordingAudioDestination;
  }, []);

  /**
   * Get the recorded audio data
   */
  const getRecordingData = useCallback((): RecordingData | null => {
    if (recordedChunksRef.current.length === 0) return null;
    
    const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm;codecs=opus' });
    const duration = recordingState.duration;
    const timestamp = startTimeRef.current;
    const sessionId = sessionIdRef.current;
    
    return { blob, duration, timestamp, sessionId };
  }, [recordingState.duration]);

  /**
   * Download the recording as a WebM file
   */
  const downloadRecording = useCallback(() => {
    const recordingData = getRecordingData();
    if (!recordingData) return;
    
    const { blob, duration, timestamp, sessionId } = recordingData;
    const date = new Date(timestamp);
    const dateStr = date.toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const durationStr = `${Math.floor(duration / 60)}m${duration % 60}s`;
    
    const filename = `neuralecho-call-${dateStr}-${durationStr}-${sessionId}.webm`;
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [getRecordingData]);

  /**
   * Clear the current recording data
   */
  const clearRecording = useCallback(() => {
    recordedChunksRef.current = [];
    setRecordingState({
      isRecording: false,
      duration: 0,
      hasRecording: false
    });
  }, []);

  return {
    recordingState,
    startRecording,
    stopRecording,
    downloadRecording,
    clearRecording,
    getRecordingData,
  };
}