import { useRef, useCallback } from 'react';

/**
 * Real-time conversation audio player
 * Handles playback of translated audio chunks with interruption support
 * 
 * Key differences from streaming player:
 * - Interrupts old audio when new speech arrives
 * - Keeps queue minimal (200ms max)
 * - Prioritizes latest audio over complete playback
 * - Detects speech boundaries via timestamp gaps
 */
export function useTranslationAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const seenChunkIds = useRef<Set<string>>(new Set());
  const lastChunkTimestampRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const lastSpeakerIdRef = useRef<string>('');

  // Real-time conversation mode: 200ms max queue (not 600ms)
  const MAX_QUEUE_MS = 200;
  const SPEECH_GAP_MS = 300; // Detect new sentence/utterance

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

  // CRITICAL: Stop all currently playing audio (barge-in)
  const stopAllSources = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Already stopped
      }
    });
    activeSourcesRef.current = [];
  }, []);

  // CRITICAL: Interrupt playback when new speech starts
  const interruptPlayback = useCallback(() => {
    const ctx = getCtx();
    stopAllSources();
    nextStartTimeRef.current = ctx.currentTime;
    console.log('🔥 [TranslationAudio] INTERRUPTED - new speech detected');
  }, [getCtx, stopAllSources]);

  const enqueueChunk = useCallback((base64Audio: string, chunkId: string, timestamp?: number) => {
    // Deduplicate
    if (seenChunkIds.current.has(chunkId)) {
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
    const chunkTimestamp = timestamp || Date.now();

    // Extract speaker ID from chunkId (format: chunk_speakerId_seq)
    const speakerId = chunkId.split('_')[1] || '';

    // CRITICAL: Detect new speech (speaker change OR time gap)
    const timeSinceLastChunk = chunkTimestamp - lastChunkTimestampRef.current;
    const isSpeakerChange = speakerId && speakerId !== lastSpeakerIdRef.current;
    const isNewSpeech = timeSinceLastChunk > SPEECH_GAP_MS || isSpeakerChange;

    if (isNewSpeech && lastChunkTimestampRef.current > 0) {
      console.log(`🔥 [TranslationAudio] New speech detected (gap: ${timeSinceLastChunk}ms, speaker: ${speakerId})`);
      interruptPlayback();
    }

    lastChunkTimestampRef.current = chunkTimestamp;
    lastSpeakerIdRef.current = speakerId;

    // CRITICAL: Check queue size BEFORE dropping
    const queueAheadMs = (nextStartTimeRef.current - now) * 1000;
    
    // Real-time mode: Drop if queue exceeds 200ms
    if (queueAheadMs > MAX_QUEUE_MS) {
      console.warn(`⚠️ [TranslationAudio] Queue overflow (${queueAheadMs.toFixed(0)}ms) - INTERRUPTING`);
      interruptPlayback();
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

      // CRITICAL: Use Math.max to prevent time accumulation issues
      const startAt = Math.max(now + 0.01, nextStartTimeRef.current);
      source.start(startAt);
      nextStartTimeRef.current = startAt + buffer.duration;

      // Track active source for interruption
      activeSourcesRef.current.push(source);
      source.onended = () => {
        const idx = activeSourcesRef.current.indexOf(source);
        if (idx > -1) activeSourcesRef.current.splice(idx, 1);
      };

      const newQueueMs = (nextStartTimeRef.current - now) * 1000;
      console.log(`✅ [TranslationAudio] Playing chunk ${chunkId}, queue: ${newQueueMs.toFixed(0)}ms`);
    } catch (error) {
      console.error('❌ [TranslationAudio] Failed to enqueue chunk:', error);
    }
  }, [getCtx, interruptPlayback]);

  const flush = useCallback(() => {
    stopAllSources();
    nextStartTimeRef.current = 0;
    seenChunkIds.current.clear();
    lastChunkTimestampRef.current = 0;
    lastSpeakerIdRef.current = '';
    console.log('🧹 [TranslationAudio] Flushed queue and stopped all audio');
  }, [stopAllSources]);

  return { enqueueChunk, resume, flush, interrupt: interruptPlayback };
}
