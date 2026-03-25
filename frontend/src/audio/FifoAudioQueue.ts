/**
 * FifoAudioQueue - Streaming audio playback queue
 * Handles real-time audio chunk playback with sequence ordering
 */

/**
 * Convert base64 PCM16 audio to Int16Array
 */
function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export class FifoAudioQueue {
  private ctx: AudioContext;
  private queue: AudioBuffer[] = [];
  private isPlaying: boolean = false;
  private nextStartTime: number = 0;
  private expectedSeq: number = 0;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 24000 });
  }

  /**
   * Enqueue an audio chunk for playback
   * @param base64chunk - Base64 encoded PCM16 audio data
   * @param seq - Sequence number for ordering
   */
  enqueue(base64chunk: string, seq: number): void {
    // Discard out-of-order chunks
    if (seq !== this.expectedSeq) {
      console.warn(`[FifoAudioQueue] Discarding out-of-order chunk: expected ${this.expectedSeq}, got ${seq}`);
      return;
    }
    
    this.expectedSeq++;

    try {
      // Convert base64 PCM16 to Float32Array
      const int16 = base64ToInt16(base64chunk);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      // Create audio buffer
      const buffer = this.ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);

      this.queue.push(buffer);

      // Start draining if not already playing
      if (!this.isPlaying) {
        this._drain();
      }
    } catch (error) {
      console.error('[FifoAudioQueue] Error enqueueing chunk:', error);
    }
  }

  /**
   * Drain the queue by playing buffered audio
   */
  private _drain(): void {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;

    const buffer = this.queue.shift()!;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    // Schedule playback
    const startAt = Math.max(this.ctx.currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;

    // Continue draining when this chunk finishes
    source.onended = () => this._drain();
  }

  /**
   * Flush the queue and reset state
   * Used when translation is interrupted
   */
  flush(): void {
    console.log('[FifoAudioQueue] Flushing queue');
    this.queue = [];
    this.isPlaying = false;
    this.nextStartTime = 0;
    this.expectedSeq = 0;

    // Close and recreate AudioContext to stop all audio immediately
    this.ctx.close().catch(() => {});
    this.ctx = new AudioContext({ sampleRate: 24000 });
  }

  /**
   * Resume AudioContext (required for browser autoplay policy)
   * Call this on user gesture (e.g., button click)
   */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
      console.log('[FifoAudioQueue] AudioContext resumed');
    }
  }

  /**
   * Get current AudioContext state
   */
  getState(): AudioContextState {
    return this.ctx.state;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.flush();
    this.ctx.close().catch(() => {});
  }
}
