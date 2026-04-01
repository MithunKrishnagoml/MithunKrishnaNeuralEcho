/**
 * PCM16Player - High-quality gapless audio playback for OpenAI Realtime API
 * 
 * Fixes:
 * 1. Sample rate mismatch (forces 24000 Hz)
 * 2. Chunk boundary clicks/pops (gapless scheduling)
 * 3. Int16 byte order (DataView with little-endian)
 * 4. Float32 clipping (proper clamping)
 */

export class PCM16Player {
  private ctx: AudioContext;
  private nextStartTime: number = 0;
  private gainNode: GainNode;

  constructor() {
    // CRITICAL: Must be exactly 24000 Hz to match OpenAI Realtime API output
    this.ctx = new AudioContext({ sampleRate: 24000 });
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1.0;
    this.gainNode.connect(this.ctx.destination);
  }

  /**
   * Enqueue a PCM16 audio chunk for gapless playback
   * @param base64chunk - Base64-encoded PCM16 audio data from OpenAI
   */
  enqueue(base64chunk: string): void {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Step 1: base64 → bytes
    const binary = atob(base64chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Step 2: bytes → Int16 using DataView (guaranteed little-endian)
    const view = new DataView(bytes.buffer);
    const sampleCount = Math.floor(bytes.length / 2);
    const float32 = new Float32Array(sampleCount);
    
    for (let i = 0; i < sampleCount; i++) {
      const int16 = view.getInt16(i * 2, true); // true = little-endian
      // Clamp to prevent clipping on -32768
      float32[i] = Math.max(-1, int16 / 32768);
    }

    // Step 3: create AudioBuffer at EXACTLY 24000 Hz
    const buffer = this.ctx.createBuffer(1, sampleCount, 24000);
    buffer.copyToChannel(float32, 0);

    // Step 4: schedule gaplessly
    const now = this.ctx.currentTime;
    const startAt = this.nextStartTime > now 
      ? this.nextStartTime 
      : now + 0.02; // 20ms lookahead on first chunk only
    
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);
    source.start(startAt);
    
    this.nextStartTime = startAt + buffer.duration;

    console.log('[PCM16Player] chunk scheduled', {
      sampleCount,
      durationMs: (buffer.duration * 1000).toFixed(1),
      startAt: startAt.toFixed(3),
      nextStartTime: this.nextStartTime.toFixed(3),
      queueAheadMs: ((this.nextStartTime - now) * 1000).toFixed(1)
    });
  }

  /**
   * Flush the audio context and reset for new playback
   */
  flush(): void {
    this.ctx.close().catch(() => {});
    this.ctx = new AudioContext({ sampleRate: 24000 });
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1.0;
    this.gainNode.connect(this.ctx.destination);
    this.nextStartTime = 0;
  }

  /**
   * Set playback volume
   * @param v - Volume level (0.0 to 1.0)
   */
  setVolume(v: number): void {
    this.gainNode.gain.value = Math.max(0, Math.min(1, v));
  }

  /**
   * Resume audio context (for autoplay policy)
   */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Get current audio context state
   */
  getState(): AudioContextState {
    return this.ctx.state;
  }

  /**
   * Dispose of the player
   */
  dispose(): void {
    this.ctx.close().catch(() => {});
  }
}
