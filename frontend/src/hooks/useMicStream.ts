import { useRef, useCallback, useEffect } from 'react';

interface UseMicStreamOptions {
  onAudioData: (base64: string) => void;
  onCommitAudio?: () => void; // Signal to commit audio buffer
  enabled: boolean;
}

/**
 * TRUE STREAMING mic hook - sends audio in ~20ms chunks
 * NO BATCHING - immediate transmission for <500ms latency
 * Backend handles all OpenAI connections
 */
export function useMicStream({ onAudioData, onCommitAudio, enabled }: UseMicStreamOptions) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);

  const start = useCallback(async () => {
    // Prevent concurrent start operations
    if (isStartingRef.current) {
      console.log('🎤 [MicStream] Start already in progress, skipping');
      return;
    }
    
    // Check if already running with a valid context
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      console.log('🎤 [MicStream] Already running');
      return; // already running
    }

    isStartingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
          channelCount: 1
        }
      });

      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = ctx;

      // Ensure context is running before adding worklet
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      await ctx.audioWorklet.addModule('/mic-input-processor.js');
      const worklet = new AudioWorkletNode(ctx, 'mic-input-processor');
      workletRef.current = worklet;

      worklet.port.onmessage = (e) => {
        if (e.data.type === 'AUDIO_DATA') {
          // ✅ CRITICAL: Send immediately - no batching
          const uint8 = new Uint8Array(e.data.data);
          // Convert to base64
          let binary = '';
          uint8.forEach(b => binary += String.fromCharCode(b));
          const base64 = btoa(binary);
          
          // Send immediately for low latency
          onAudioData(base64);
        } else if (e.data.type === 'COMMIT_AUDIO') {
          // Silence detected - signal backend to commit audio buffer
          onCommitAudio?.();
        }
      };

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(worklet);
      // Do NOT connect worklet to destination — prevents mic feedback

      // Start capturing
      worklet.port.postMessage({ type: 'START_CAPTURE' });

      console.log('🎤 [MicStream] Started');
    } catch (error) {
      console.error('❌ [MicStream] Failed to start:', error);
      // Clean up on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [onAudioData, onCommitAudio]);

  const stop = useCallback(() => {
    // Prevent concurrent stop operations
    if (isStoppingRef.current) {
      console.log('🎤 [MicStream] Stop already in progress, skipping');
      return;
    }
    
    isStoppingRef.current = true;
    
    try {
      if (workletRef.current) {
        workletRef.current.port.postMessage({ type: 'STOP_CAPTURE' });
        workletRef.current.disconnect();
        workletRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {
          // Ignore close errors
        });
        audioCtxRef.current = null;
      }
      console.log('🎤 [MicStream] Stopped');
    } finally {
      isStoppingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return () => stop();
  }, [enabled, start, stop]);

  return { start, stop };
}
