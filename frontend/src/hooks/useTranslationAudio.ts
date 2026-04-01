import { useRef, useCallback } from 'react';

/**
 * Handles playback of translated audio chunks from backend
 * Replaces PCM16Player with simpler implementation
 */
export function useTranslationAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const seenChunkIds = useRef<Set<string>>(new Set());

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext({ sampleRate: 24000 });
      nextStartTimeRef.current = 0;
    }
    return ctxRef.current;
  }, []);

  const resume = useCallback(async () => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
      console.log('🔊 [TranslationAudio] Resumed audio context');
    }
  }, [getCtx]);

  const enqueueChunk = useCallback((base64Audio: string, chunkId: string) => {
    // Deduplicate
    if (seenChunkIds.current.has(chunkId)) {
      console.log(`⚠️ [TranslationAudio] Duplicate chunk: ${chunkId}`);
      return;
    }
    seenChunkIds.current.add(chunkId);
    
    // Limit set size to prevent memory leak
    if (seenChunkIds.current.size > 300) {
      const first = seenChunkIds.current.values().next().value;
      seenChunkIds.current.delete(first);
    }

    const ctx = getCtx();
    const now = ctx.currentTime;

    // Queue overflow protection — drop if more than 600ms ahead
    const queueAheadMs = (nextStartTimeRef.current - now) * 1000;
    if (queueAheadMs > 600) {
      console.warn(`⚠️ [TranslationAudio] Queue overflow (${queueAheadMs.toFixed(0)}ms), dropping chunk`);
      // Hard reset if critically behind
      if (queueAheadMs > 1200) {
        console.warn('⚠️ [TranslationAudio] Critical overflow, resetting queue');
        nextStartTimeRef.current = 0;
      }
      return;
    }

    try {
      // Decode base64 → PCM16 → Float32
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      // Create audio buffer
      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);

      // Create source and schedule playback
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const startAt = Math.max(now + 0.01, nextStartTimeRef.current);
      source.start(startAt);
      nextStartTimeRef.current = startAt + buffer.duration;

      console.log(`✅ [TranslationAudio] Enqueued chunk ${chunkId}, queue: ${queueAheadMs.toFixed(0)}ms`);
    } catch (error) {
      console.error('❌ [TranslationAudio] Failed to enqueue chunk:', error);
    }
  }, [getCtx]);

  const flush = useCallback(() => {
    nextStartTimeRef.current = 0;
    seenChunkIds.current.clear();
    console.log('🧹 [TranslationAudio] Flushed queue');
  }, []);

  return { enqueueChunk, resume, flush };
}
