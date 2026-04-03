import { useState, useCallback, useRef } from 'react';

// Streaming state interfaces
export interface PartialTranscript {
  sessionId: string;
  chunks: string[];
  isComplete: boolean;
  timestamp: number;
}

export interface TranslationStream {
  sessionId: string;
  chunks: string[];
  targetLanguage: string;
  isComplete: boolean;
  timestamp: number;
}

export interface AudioChunk {
  id: string;
  data: string; // base64 audio data
  timestamp: number;
  duration?: number;
  responseId: string;
}

export interface AudioQueue {
  sessionId: string;
  chunks: AudioChunk[];
  isPlaying: boolean;
  currentIndex: number;
}

export interface StreamingState {
  // Current streaming session
  currentSessionId: string | null;
  
  // Partial transcript accumulation
  partialTranscript: PartialTranscript | null;
  
  // Translation streaming
  translationStream: TranslationStream | null;
  
  // Audio chunk queue
  audioQueue: AudioQueue | null;
  
  // UI state
  isOtherSpeaking: boolean;
  showTranslatingIndicator: boolean;
}

const INITIAL_STREAMING_STATE: StreamingState = {
  currentSessionId: null,
  partialTranscript: null,
  translationStream: null,
  audioQueue: null,
  isOtherSpeaking: false,
  showTranslatingIndicator: false,
};

// Buffer size limits
const MAX_TRANSCRIPT_CHUNKS = 100;
const MAX_TRANSLATION_CHUNKS = 100;
const MAX_AUDIO_QUEUE_SIZE = 10;

export function useStreamingState() {
  const [streamingState, setStreamingState] = useState<StreamingState>(INITIAL_STREAMING_STATE);
  const sessionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Start a new streaming session
  const startStreamingSession = useCallback((sessionId: string) => {
    console.log('🚀 [StreamingState] Starting streaming session:', sessionId);
    setStreamingState(prev => ({
      ...prev,
      currentSessionId: sessionId,
      partialTranscript: null,
      translationStream: null,
      audioQueue: null,
      isOtherSpeaking: false,
      showTranslatingIndicator: false,
    }));
  }, []);

  // End the current streaming session
  const endStreamingSession = useCallback(() => {
    console.log('🏁 [StreamingState] Ending streaming session');
    setStreamingState(INITIAL_STREAMING_STATE);
    
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
  }, []);

  // Add partial transcript chunk
  const addPartialTranscript = useCallback((delta: string, itemId: string) => {
    setStreamingState(prev => {
      const existingChunks = prev.partialTranscript?.chunks || [];
      const newChunks = [...existingChunks, delta];
      
      // Limit buffer size
      const limitedChunks = newChunks.slice(-MAX_TRANSCRIPT_CHUNKS);
      
      return {
        ...prev,
        partialTranscript: {
          sessionId: itemId,
          chunks: limitedChunks,
          isComplete: false,
          timestamp: Date.now(),
        },
      };
    });
  }, []);

  // Complete partial transcript
  const completePartialTranscript = useCallback(() => {
    setStreamingState(prev => {
      if (!prev.partialTranscript) return prev;
      
      return {
        ...prev,
        partialTranscript: {
          ...prev.partialTranscript,
          isComplete: true,
        },
      };
    });
  }, []);

  // Add translation delta
  const addTranslationDelta = useCallback((delta: string, responseId: string, targetLanguage: string) => {
    setStreamingState(prev => {
      const existingChunks = prev.translationStream?.chunks || [];
      const newChunks = [...existingChunks, delta];
      
      // Limit buffer size
      const limitedChunks = newChunks.slice(-MAX_TRANSLATION_CHUNKS);
      
      return {
        ...prev,
        translationStream: {
          sessionId: responseId,
          chunks: limitedChunks,
          targetLanguage,
          isComplete: false,
          timestamp: Date.now(),
        },
      };
    });
  }, []);

  // Complete translation stream
  const completeTranslationStream = useCallback(() => {
    setStreamingState(prev => {
      if (!prev.translationStream) return prev;
      
      return {
        ...prev,
        translationStream: {
          ...prev.translationStream,
          isComplete: true,
        },
      };
    });
  }, []);

  // Add audio chunk to queue
  const addAudioChunk = useCallback((audioData: string, responseId: string) => {
    const chunk: AudioChunk = {
      id: `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      data: audioData,
      timestamp: Date.now(),
      responseId,
    };

    setStreamingState(prev => {
      const existingChunks = prev.audioQueue?.chunks || [];
      const newChunks = [...existingChunks, chunk];
      
      // Limit queue size
      const limitedChunks = newChunks.slice(-MAX_AUDIO_QUEUE_SIZE);
      
      return {
        ...prev,
        audioQueue: {
          sessionId: responseId,
          chunks: limitedChunks,
          isPlaying: prev.audioQueue?.isPlaying || false,
          currentIndex: prev.audioQueue?.currentIndex || 0,
        },
      };
    });
  }, []);

  // Update audio queue playback state
  const updateAudioPlaybackState = useCallback((isPlaying: boolean, currentIndex?: number) => {
    setStreamingState(prev => {
      if (!prev.audioQueue) return prev;
      
      return {
        ...prev,
        audioQueue: {
          ...prev.audioQueue,
          isPlaying,
          currentIndex: currentIndex !== undefined ? currentIndex : prev.audioQueue.currentIndex,
        },
      };
    });
  }, []);

  // Set voice activity state
  const setVoiceActivity = useCallback((isOtherSpeaking: boolean) => {
    setStreamingState(prev => ({
      ...prev,
      isOtherSpeaking,
      showTranslatingIndicator: isOtherSpeaking,
    }));

    // Auto-hide translating indicator after timeout if no transcript arrives
    if (isOtherSpeaking) {
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }
      
      sessionTimeoutRef.current = setTimeout(() => {
        setStreamingState(prev => ({
          ...prev,
          showTranslatingIndicator: false,
        }));
      }, 5000); // Hide after 5 seconds if no transcript
    } else {
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
        sessionTimeoutRef.current = null;
      }
    }
  }, []);

  // Hide translating indicator
  const hideTranslatingIndicator = useCallback(() => {
    setStreamingState(prev => ({
      ...prev,
      showTranslatingIndicator: false,
    }));
    
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
  }, []);

  // Get current partial transcript text
  const getPartialTranscriptText = useCallback(() => {
    return streamingState.partialTranscript?.chunks.join('') || '';
  }, [streamingState.partialTranscript]);

  // Get current translation text
  const getTranslationText = useCallback(() => {
    return streamingState.translationStream?.chunks.join('') || '';
  }, [streamingState.translationStream]);

  // Clear completed streams
  const clearCompletedStreams = useCallback(() => {
    setStreamingState(prev => ({
      ...prev,
      partialTranscript: prev.partialTranscript?.isComplete ? null : prev.partialTranscript,
      translationStream: prev.translationStream?.isComplete ? null : prev.translationStream,
    }));
  }, []);

  return {
    streamingState,
    startStreamingSession,
    endStreamingSession,
    addPartialTranscript,
    completePartialTranscript,
    addTranslationDelta,
    completeTranslationStream,
    addAudioChunk,
    updateAudioPlaybackState,
    setVoiceActivity,
    hideTranslatingIndicator,
    getPartialTranscriptText,
    getTranslationText,
    clearCompletedStreams,
  };
}