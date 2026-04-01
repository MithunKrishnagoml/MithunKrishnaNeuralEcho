/**
 * PCM16Player - Direct PCM16 audio playback without decoding
 * Replaces StreamingAudioPlayer to fix robotic/slow/grainy voice issues
 * 
 * Root cause of old player:
 * - decodeAudioData() expects container formats (WebM/MP3/OGG)
 * - Raw PCM16 is NOT a container format
 * - Browser resampling caused slow/chipmunk/robotic playback
 * - Jitter buffer added latency causing voice to get stuck
 */

export class PCM16Player {
  private ctx: AudioContext;
  private nextStartTime: number;
  private gainNode: GainNode;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 24000 });
    this.nextStartTime = 0;
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1.0;
    this.gainNode.connect(this.ctx.destination);
  }

  private getQueueAheadMs(): number {
    const now = this.ctx.currentTime;
    return (this.nextStartTime - now) * 1000;
  }

  enqueue(base64chunk: string): boolean {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // BUG FIX: Check queue size before enqueueing
    const queueAheadMs = this.getQueueAheadMs();
    
    // Critical overflow - flush entire queue and restart
    if (queueAheadMs > 1200) {
      console.warn(`[PCM16Player] CRITICAL overflow (${queueAheadMs.toFixed(0)}ms), flushing queue`);
      this.flush();
      // After flush, queue is empty, continue with enqueue
    } else if (queueAheadMs > 800) {
      // Hard cap - drop this chunk
      console.warn(`[PCM16Player] Queue overflow (${queueAheadMs.toFixed(0)}ms), dropping chunk`);
      return false;
    }

    const binary = atob(base64chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const view = new DataView(bytes.buffer);
    const sampleCount = Math.floor(bytes.length / 2);
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      const int16val = view.getInt16(i * 2, true);
      float32[i] = Math.max(-1, int16val / 32768);
    }

    const buffer = this.ctx.createBuffer(1, sampleCount, 24000);
    buffer.copyToChannel(float32, 0);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    const now = this.ctx.currentTime;
    const startAt = this.nextStartTime > now ? this.nextStartTime : now + 0.02;
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;

    console.log('[PCM16Player] chunk played', {
      sampleCount,
      durationMs: (buffer.duration * 1000).toFixed(1),
      queueAheadMs: ((this.nextStartTime - now) * 1000).toFixed(1)
    });
    
    return true;
  }

  flush(): void {
    this.ctx.close().catch(() => {});
    this.ctx = new AudioContext({ sampleRate: 24000 });
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1.0;
    this.gainNode.connect(this.ctx.destination);
    this.nextStartTime = 0;
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
      console.log('[PCM16Player] AudioContext resumed');
    }
  }

  dispose(): void {
    this.ctx.close().catch(() => {});
  }
}
