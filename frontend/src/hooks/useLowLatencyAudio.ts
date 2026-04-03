import { useRef, useCallback, useEffect } from 'react';

/**
 * Low-Latency Audio Hook - TRUE STREAMING PLAYBACK
 * 
 * Features:
 * - 50-100ms jitter buffer (not 600ms+)
 * - Automatic barge-in on speech boundaries
 * - Queue overflow protection
 * - <500ms end-to-end latency
 */

interface AudioChunk {
  data: string; // base64 PCM16
  responseId: string;
  timestamp: number;
  chunkId: string;
}

export function useLowLatencyAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isInitializedRef = useRef(false);
  const userGestureReceivedRef = useRef(false);

  /**
   * Initialize audio system
   */
  const initialize = useCallback(async () => {
    if (isInitializedRef.current) return;

    try {
      // Create AudioContext with 24kHz sample rate (OpenAI Realtime API)
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      // Load low-latency processor
      await audioContext.audioWorklet.addModule('/low-latency-audio-processor.js');

      // Create worklet node
      const workletNode = new AudioWorkletNode(audioContext, 'low-latency-audio-processor');
      workletNodeRef.current = workletNode;

      // Create gain node for volume control
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.8; // 80% volume to prevent clipping
      gainNodeRef.current = gainNode;

      // Connect: worklet -> gain -> destination
      workletNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Listen for worklet messages
      workletNode.port.onmessage = (e) => {
        const { type } = e.data;
        
        switch (type) {
          case 'PLAYBACK_STARTED':
            console.log('🎵 [LowLatencyAudio] Playback started');
            break;
            
          case 'PLAYBACK_ENDED':
            console.log('🎵 [LowLatencyAudio] Playback ended');
            break;
            
          case 'QUEUE_OVERFLOW':
            console.warn('⚠️ [LowLatencyAudio] Queue overflow - dropped chunks:', e.data.droppedChunks);
            break;
            
          case 'UTTERANCE_BOUNDARY':
            console.log('🎵 [LowLatencyAudio] Utterance boundary detected - interrupted old playback');
            break;
            
          case 'INTERRUPTED':
            console.log('🎵 [LowLatencyAudio] Playback interrupted');
            break;
        }
      };

      isInitializedRef.current = true;
      console.log('✅ [LowLatencyAudio] Initialized with 24kHz sample rate');

    } catch (error) {
      console.error('❌ [LowLatencyAudio] Failed to initialize:', error);
    }
  }, []);

  /**
   * Resume AudioContext (handle autoplay policy)
   */
  const resume = useCallback(async () => {
    if (!audioContextRef.current) {
      await initialize();
    }

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        userGestureReceivedRef.current = true;
        console.log('✅ [LowLatencyAudio] AudioContext resumed');
      } catch (error) {
        console.error('❌ [LowLatencyAudio] Failed to resume:', error);
      }
    }
  }, [initialize]);

  /**
   * Enqueue audio chunk for playback
   * ✅ CRITICAL: Chunks play immediately with minimal buffering
   */
  const enqueueChunk = useCallback((data: string, chunkId: string, timestamp: number, responseId: string = 'default') => {
    if (!workletNodeRef.current) {
      console.warn('⚠️ [LowLatencyAudio] Worklet not initialized, initializing now...');
      initialize();
      return;
    }

    // Ensure AudioContext is running
    if (audioContextRef.current?.state === 'suspended') {
      resume();
    }

    // Send chunk to worklet for immediate playback
    workletNodeRef.current.port.postMessage({
      type: 'ADD_CHUNK',
      data,
      responseId,
      timestamp,
      chunkId
    });
  }, [initialize, resume]);

  /**
   * Clear queue (for interruption)
   */
  const clearQueue = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'CLEAR_QUEUE' });
    }
  }, []);

  /**
   * Interrupt current playback (barge-in)
   */
  const interrupt = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'INTERRUPT' });
    }
  }, []);

  /**
   * Get playback stats
   */
  const getStats = useCallback((): Promise<any> => {
    return new Promise((resolve) => {
      if (!workletNodeRef.current) {
        resolve(null);
        return;
      }

      const handleMessage = (e: MessageEvent) => {
        if (e.data.type === 'STATS') {
          workletNodeRef.current!.port.removeEventListener('message', handleMessage);
          resolve(e.data);
        }
      };

      workletNodeRef.current.port.addEventListener('message', handleMessage);
      workletNodeRef.current.port.postMessage({ type: 'GET_STATS' });
    });
  }, []);

  /**
   * Cleanup
   */
  const dispose = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    isInitializedRef.current = false;
    console.log('🎵 [LowLatencyAudio] Disposed');
  }, []);

  // Initialize on mount
  useEffect(() => {
    initialize();
    return () => dispose();
  }, [initialize, dispose]);

  return {
    enqueueChunk,
    clearQueue,
    interrupt,
    resume,
    getStats,
    dispose
  };
}
