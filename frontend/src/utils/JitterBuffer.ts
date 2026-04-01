/**
 * Jitter Buffer for Smooth Audio Playback
 * Handles network jitter and ensures smooth continuous playback
 */

interface AudioChunk {
  id: string;
  audioData: string; // base64 PCM16
  timestamp: number;
  sequenceNumber: number;
}

export class JitterBuffer {
  private buffer: AudioChunk[] = [];
  private audioContext: AudioContext;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private bufferDelayMs: number = 100; // 100ms jitter buffer
  private seenChunkIds: Set<string> = new Set();
  private maxBufferSize: number = 50; // Max chunks in buffer
  private playbackStarted: boolean = false;

  constructor(sampleRate: number = 24000) {
    this.audioContext = new AudioContext({ sampleRate });
    console.log('🎵 [JitterBuffer] Initialized with', sampleRate, 'Hz');
  }

  /**
   * Add audio chunk to buffer
   */
  enqueue(chunk: AudioChunk): void {
    // Deduplicate
    if (this.seenChunkIds.has(chunk.id)) {
      console.log(`⚠️ [JitterBuffer] Duplicate chunk: ${chunk.id}`);
      return;
    }
    this.seenChunkIds.add(chunk.id);

    // Limit seen IDs set size
    if (this.seenChunkIds.size > 300) {
      const first = Array.from(this.seenChunkIds)[0];
      this.seenChunkIds.delete(first);
    }

    // Add to buffer
    this.buffer.push(chunk);
    
    // Sort by sequence number
    this.buffer.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    // Limit buffer size
    if (this.buffer.length > this.maxBufferSize) {
      console.warn(`⚠️ [JitterBuffer] Buffer overflow, dropping oldest chunk`);
      this.buffer.shift();
    }

    console.log(`📥 [JitterBuffer] Enqueued chunk ${chunk.id}, buffer size: ${this.buffer.length}`);

    // Start playback if buffer has enough data
    if (!this.playbackStarted && this.buffer.length >= 3) {
      this.startPlayback();
    }
  }

  /**
   * Start playback from buffer
   */
  private async startPlayback(): Promise<void> {
    if (this.playbackStarted) return;
    
    this.playbackStarted = true;
    console.log('▶️ [JitterBuffer] Starting playback');

    // Resume audio context if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Initialize next start time
    this.nextStartTime = this.audioContext.currentTime + (this.bufferDelayMs / 1000);

    // Start processing buffer
    this.processBuffer();
  }

  /**
   * Process buffer and schedule audio playback
   */
  private processBuffer(): void {
    if (!this.playbackStarted) return;

    const processInterval = setInterval(() => {
      if (this.buffer.length === 0) {
        // Buffer empty, continue waiting
        return;
      }

      // Get next chunk
      const chunk = this.buffer.shift();
      if (!chunk) return;

      try {
        this.playChunk(chunk);
      } catch (error) {
        console.error('❌ [JitterBuffer] Failed to play chunk:', error);
      }

      // Stop processing if playback stopped
      if (!this.playbackStarted) {
        clearInterval(processInterval);
      }
    }, 20); // Check every 20ms
  }

  /**
   * Play a single audio chunk
   */
  private playChunk(chunk: AudioChunk): void {
    try {
      // Decode base64 → PCM16 → Float32
      const binary = atob(chunk.audioData);
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
      const audioBuffer = this.audioContext.createBuffer(
        1, // mono
        float32.length,
        this.audioContext.sampleRate
      );
      audioBuffer.copyToChannel(float32, 0);

      // Create source and schedule playback
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      const now = this.audioContext.currentTime;
      const startAt = Math.max(now + 0.01, this.nextStartTime);
      
      source.start(startAt);
      this.nextStartTime = startAt + audioBuffer.duration;

      const queueAheadMs = (this.nextStartTime - now) * 1000;
      console.log(`🔊 [JitterBuffer] Playing chunk ${chunk.id}, queue: ${queueAheadMs.toFixed(0)}ms`);

    } catch (error) {
      console.error('❌ [JitterBuffer] Failed to decode/play chunk:', error);
    }
  }

  /**
   * Interrupt current playback and clear buffer
   * Used for barge-in scenarios
   */
  interrupt(): void {
    console.log('⚠️ [JitterBuffer] Interrupting playback');
    
    // Clear buffer
    this.buffer = [];
    
    // Reset timing
    this.nextStartTime = this.audioContext.currentTime;
    
    // Note: We can't stop already-scheduled audio sources
    // They will play out, but new audio will start immediately after
  }

  /**
   * Flush buffer and reset
   */
  flush(): void {
    console.log('🧹 [JitterBuffer] Flushing buffer');
    this.buffer = [];
    this.seenChunkIds.clear();
    this.nextStartTime = 0;
    this.playbackStarted = false;
  }

  /**
   * Resume audio context (for autoplay policy)
   */
  async resume(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('▶️ [JitterBuffer] Audio context resumed');
    }
  }

  /**
   * Get current buffer status
   */
  getStatus(): {
    bufferSize: number;
    queueAheadMs: number;
    isPlaying: boolean;
  } {
    const now = this.audioContext.currentTime;
    const queueAheadMs = (this.nextStartTime - now) * 1000;

    return {
      bufferSize: this.buffer.length,
      queueAheadMs: Math.max(0, queueAheadMs),
      isPlaying: this.playbackStarted
    };
  }

  /**
   * Close and cleanup
   */
  close(): void {
    this.flush();
    this.audioContext.close();
    console.log('🔌 [JitterBuffer] Closed');
  }
}
