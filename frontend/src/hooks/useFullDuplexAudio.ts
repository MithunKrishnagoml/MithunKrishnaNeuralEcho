/**
 * Full-Duplex Audio Hook
 * Manages bidirectional audio streaming with WebRTC + OpenAI
 * Supports simultaneous speaking and barge-in
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import { JitterBuffer } from '@/utils/JitterBuffer';

interface UseFullDuplexAudioProps {
  remoteStream: MediaStream | null;
  onAudioChunk?: (chunk: any) => void;
}

export function useFullDuplexAudio({ remoteStream, onAudioChunk }: UseFullDuplexAudioProps) {
  const jitterBufferRef = useRef<JitterBuffer | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const currentSpeakerRef = useRef<string | null>(null);

  /**
   * Initialize jitter buffer
   */
  useEffect(() => {
    if (!jitterBufferRef.current) {
      jitterBufferRef.current = new JitterBuffer(24000);
      console.log('✅ [FullDuplex] Jitter buffer initialized');
    }

    return () => {
      if (jitterBufferRef.current) {
        jitterBufferRef.current.close();
        jitterBufferRef.current = null;
      }
    };
  }, []);

  /**
   * Handle remote stream (WebRTC audio from other user)
   * This is the RAW audio, not translated
   */
  useEffect(() => {
    if (!remoteStream) return;

    console.log('🎵 [FullDuplex] Setting up remote stream playback');

    // Create audio element for remote stream
    if (!remoteAudioRef.current) {
      remoteAudioRef.current = new Audio();
      remoteAudioRef.current.autoplay = true;
    }

    remoteAudioRef.current.srcObject = remoteStream;

    return () => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
      }
    };
  }, [remoteStream]);

  /**
   * Enqueue translated audio chunk
   * This comes from OpenAI via WebSocket
   */
  const enqueueTranslatedAudio = useCallback((audioData: string, chunkId: string, sequenceNumber: number, speakerId: string) => {
    if (!jitterBufferRef.current) {
      console.error('❌ [FullDuplex] Jitter buffer not initialized');
      return;
    }

    // Check for speaker change (barge-in detection)
    if (currentSpeakerRef.current && currentSpeakerRef.current !== speakerId) {
      console.log('⚠️ [FullDuplex] Speaker changed - interrupting previous audio');
      jitterBufferRef.current.interrupt();
    }
    currentSpeakerRef.current = speakerId;

    // Enqueue chunk
    jitterBufferRef.current.enqueue({
      id: chunkId,
      audioData,
      timestamp: Date.now(),
      sequenceNumber
    });

    setIsPlaying(true);
  }, []);

  /**
   * Handle voice activity detection
   */
  const handleVoiceActivity = useCallback((speaking: boolean, speakerId: string) => {
    console.log(`🎤 [FullDuplex] Voice activity: ${speaking ? 'started' : 'stopped'} for ${speakerId}`);
    
    if (speaking) {
      setIsSpeaking(true);
      
      // If someone else starts speaking, interrupt current playback
      if (currentSpeakerRef.current && currentSpeakerRef.current !== speakerId) {
        console.log('⚠️ [FullDuplex] Barge-in detected - interrupting');
        jitterBufferRef.current?.interrupt();
      }
      
      currentSpeakerRef.current = speakerId;
    } else {
      setIsSpeaking(false);
    }
  }, []);

  /**
   * Resume audio context (for autoplay policy)
   */
  const resumeAudio = useCallback(async () => {
    if (jitterBufferRef.current) {
      await jitterBufferRef.current.resume();
    }
    if (remoteAudioRef.current) {
      try {
        await remoteAudioRef.current.play();
      } catch (error) {
        console.warn('⚠️ [FullDuplex] Failed to play remote audio:', error);
      }
    }
  }, []);

  /**
   * Stop all audio
   */
  const stopAudio = useCallback(() => {
    if (jitterBufferRef.current) {
      jitterBufferRef.current.flush();
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    setIsPlaying(false);
    setIsSpeaking(false);
    currentSpeakerRef.current = null;
  }, []);

  /**
   * Get buffer status
   */
  const getBufferStatus = useCallback(() => {
    return jitterBufferRef.current?.getStatus() || {
      bufferSize: 0,
      queueAheadMs: 0,
      isPlaying: false
    };
  }, []);

  return {
    isPlaying,
    isSpeaking,
    enqueueTranslatedAudio,
    handleVoiceActivity,
    resumeAudio,
    stopAudio,
    getBufferStatus
  };
}
