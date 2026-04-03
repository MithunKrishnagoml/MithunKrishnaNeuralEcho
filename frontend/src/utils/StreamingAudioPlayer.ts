/**
 * StreamingAudioPlayer - AudioWorklet-based continuous streaming audio player
 * Maintains a single continuous playback timeline across all incoming chunks
 */

export interface AudioChunk {
  id: string;
  data: string; // base64 encoded audio data
  timestamp: number;
  sequenceNumber?: number;
  responseId: string;
}

export interface StreamingAudioPlayerOptions {
  /** Sample rate for audio context (default: 24000 Hz for OpenAI Realtime API) */
  sampleRate?: number;
  /** Maximum number of chunks to keep in queue (default: 150) */
  maxQueueChunks?: number;
  /** Minimum chunks to buffer before starting playback (default: 3) */
  minBufferChunks?: number;
  /** Minimum milliseconds to buffer before starting playback (default: 80ms) */
  minBufferMs?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Callback when playback starts */
  onPlaybackStart?: () => void;
  /** Callback when playback ends */
  onPlaybackEnd?: () => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
}

export class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private pendingChunks: AudioChunk[] = [];
  private reorderBuffer: Map<number, AudioChunk> = new Map();
  private nextExpectedSequence: number = 0;
  private reorderTimeout: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private isDestroyed: boolean = false;
  private options: Required<StreamingAudioPlayerOptions>;
  private userGestureReceived: boolean = false;
  private currentResponseId: string | null = null;
  private hasStartedPlayback: boolean = false;
  private bufferedChunks: AudioChunk[] = [];
  private bufferHealthInterval: NodeJS.Timeout | null = null;
  private lastBufferHealthLog: number = 0;
  private visibilityChangeHandler: (() => void) | null = null;

  constructor(options: StreamingAudioPlayerOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate || 24000,
      maxQueueChunks: options.maxQueueChunks || 150,
      minBufferChunks: options.minBufferChunks || 3,
      minBufferMs: options.minBufferMs || 80,
      debug: options.debug || false,
      onPlaybackStart: options.onPlaybackStart || (() => {}),
      onPlaybackEnd: options.onPlaybackEnd || (() => {}),
      onError: options.onError || ((error) => console.error('[StreamingAudioPlayer]', error))
    };

    this.initializeAudioWorklet();
    this.setupVisibilityHandler();
    this.startBufferHealthMonitoring();
  }

  private async initializeAudioWorklet(): Promise<void> {
    try {
      // Create AudioContext with specified sample rate (locked to 24kHz)
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.options.sampleRate
      });

      // Verify sample rate - some browsers may refuse 24kHz
      if (this.audioContext.sampleRate !== this.options.sampleRate) {
        console.warn(`[StreamingAudioPlayer] Browser refused ${this.options.sampleRate}Hz, using ${this.audioContext.sampleRate}Hz instead`);
        // TODO: Implement resampler if needed for mobile browsers
      }

      if (this.options.debug) {
        console.log('[StreamingAudioPlayer] AudioContext created:', {
          sampleRate: this.audioContext.sampleRate,
          state: this.audioContext.state
        });
      }

      // Load AudioWorklet processor
      await this.audioContext.audioWorklet.addModule('/audio-streaming-processor.js');

      // Create AudioWorkletNode
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-streaming-processor');
      
      // Create gain node for volume control and clipping prevention
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0.8; // Set to 80% to prevent clipping
      
      // Connect: worklet -> gain -> destination
      this.workletNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      // Initialize the worklet
      this.workletNode.port.postMessage({ type: 'INIT' });

      this.isInitialized = true;

      if (this.options.debug) {
        console.log('[StreamingAudioPlayer] AudioWorklet initialized with gain control');
      }

      // Process any pending chunks
      this.processPendingChunks();

    } catch (error) {
      this.options.onError(new Error(`Failed to initialize AudioWorklet: ${error}`));
    }
  }

  /**
   * Setup visibility change handler to resume AudioContext when tab becomes visible
   */
  private setupVisibilityHandler(): void {
    this.visibilityChangeHandler = async () => {
      if (document.visibilityState === 'visible') {
        await this.ensureAudioContextResumed();
        if (this.options.debug) {
          console.log('[StreamingAudioPlayer] Tab became visible - AudioContext resumed');
        }
      }
    };
    
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  /**
   * Start monitoring buffer health
   */
  private startBufferHealthMonitoring(): void {
    this.bufferHealthInterval = setInterval(() => {
      const now = Date.now();
      if (now - this.lastBufferHealthLog >= 2000) {
        this.logBufferHealth();
        this.lastBufferHealthLog = now;
      }
    }, 2000);
  }

  /**
   * Log buffer health metrics
   */
  private logBufferHealth(): void {
    if (!this.hasStartedPlayback) return;
    
    const currentDepth = this.bufferedChunks.length + this.pendingChunks.length;
    const targetDepth = this.options.minBufferChunks;
    const health = Math.min(100, Math.round((currentDepth / targetDepth) * 100));
    
    console.log(`📊 Buffer health: ${health}% (queue: ${currentDepth} chunks)`);
  }

  /**
   * Ensure AudioContext is resumed (handle autoplay policy)
   */
  private async ensureAudioContextResumed(): Promise<void> {
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        if (this.options.debug) {
          console.log('[StreamingAudioPlayer] AudioContext resumed, state:', this.audioContext.state);
        }
      } catch (error) {
        this.options.onError(new Error(`Failed to resume AudioContext: ${error}`));
      }
    } else if (this.options.debug) {
      console.log('[StreamingAudioPlayer] AudioContext state:', this.audioContext.state);
    }
  }

  /**
   * Call this on first user gesture to handle autoplay policy
   */
  public async handleUserGesture(): Promise<void> {
    if (this.options.debug) {
      console.log('[StreamingAudioPlayer] handleUserGesture called, current state:', this.audioContext?.state);
    }
    
    this.userGestureReceived = true;
    await this.ensureAudioContextResumed();
    
    if (this.options.debug && this.audioContext) {
      console.log('[StreamingAudioPlayer] After handleUserGesture, state:', this.audioContext.state);
      console.log('[StreamingAudioPlayer] AudioContext ready for playback:', this.audioContext.state === 'running');
    }
  }

  /**
   * Add an audio chunk to the playback queue with reordering support
   */
  public async addChunk(chunk: AudioChunk): Promise<void> {
    if (this.isDestroyed) {
      if (this.options.debug) {
        console.warn('[StreamingAudioPlayer] Ignoring chunk - player destroyed');
      }
      return;
    }

    // Always ensure AudioContext is resumed before queuing
    await this.ensureAudioContextResumed();

    if (!this.isInitialized) {
      // Queue chunk until worklet is ready
      this.pendingChunks.push(chunk);
      if (this.options.debug) {
        console.log('[StreamingAudioPlayer] Chunk queued (worklet not ready):', chunk.id);
      }
      return;
    }

    // Handle sequence number reordering
    if (chunk.sequenceNumber !== undefined) {
      await this.handleReordering(chunk);
    } else {
      // No sequence number - process immediately
      await this.bufferChunk(chunk);
    }
  }

  /**
   * Handle out-of-order chunk reordering with resilience to resets
   */
  private async handleReordering(chunk: AudioChunk): Promise<void> {
    const seq = chunk.sequenceNumber!;

    // Detect sequence reset (new response starting)
    if (this.currentResponseId !== chunk.responseId) {
      console.log(`🔢 Sequence reset detected — restarting sequence tracking (new response: ${chunk.responseId})`);
      this.reorderBuffer.clear();
      this.nextExpectedSequence = 0;
      this.currentResponseId = chunk.responseId;
      if (this.reorderTimeout) {
        clearTimeout(this.reorderTimeout);
        this.reorderTimeout = null;
      }
    }

    // If chunk is way behind (>5 behind expected), it might be a reset we missed
    if (seq === 0 && this.nextExpectedSequence > 5) {
      console.log(`🔢 Sequence reset detected — restarting sequence tracking (seq=0 after ${this.nextExpectedSequence})`);
      this.reorderBuffer.clear();
      this.nextExpectedSequence = 0;
      if (this.reorderTimeout) {
        clearTimeout(this.reorderTimeout);
        this.reorderTimeout = null;
      }
    }

    // Check if this is the next expected chunk
    if (seq === this.nextExpectedSequence) {
      // Process this chunk
      await this.bufferChunk(chunk);
      this.nextExpectedSequence++;

      // Process any buffered chunks that are now in sequence
      while (this.reorderBuffer.has(this.nextExpectedSequence)) {
        const nextChunk = this.reorderBuffer.get(this.nextExpectedSequence)!;
        this.reorderBuffer.delete(this.nextExpectedSequence);
        await this.bufferChunk(nextChunk);
        this.nextExpectedSequence++;
      }
    } else if (seq > this.nextExpectedSequence) {
      // Future chunk - buffer it
      this.reorderBuffer.set(seq, chunk);

      // Set timeout to skip missing chunks after 40ms
      if (!this.reorderTimeout) {
        this.reorderTimeout = setTimeout(() => {
          // Check for gaps
          while (this.reorderBuffer.has(this.nextExpectedSequence + 1)) {
            console.warn(`⚠️ Dropped out-of-order chunk #${this.nextExpectedSequence}`);
            this.nextExpectedSequence++;

            // Process the next available chunk
            const nextChunk = this.reorderBuffer.get(this.nextExpectedSequence)!;
            this.reorderBuffer.delete(this.nextExpectedSequence);
            this.bufferChunk(nextChunk);
            this.nextExpectedSequence++;
          }
          this.reorderTimeout = null;
        }, 40);
      }
    } else {
      // Old chunk - only skip if it's more than 5 behind (prevents single reset from silencing session)
      const gap = this.nextExpectedSequence - seq;
      if (gap > 5) {
        if (this.options.debug) {
          console.warn(`[StreamingAudioPlayer] Skipping old chunk #${seq} (expected #${this.nextExpectedSequence}, gap: ${gap})`);
        }
      } else {
        // Close enough - accept it anyway to be resilient
        console.log(`[StreamingAudioPlayer] Accepting slightly old chunk #${seq} (expected #${this.nextExpectedSequence}, gap: ${gap})`);
        await this.bufferChunk(chunk);
      }
    }
  }

  /**
   * Buffer chunk and start playback when ready
   */
  private async bufferChunk(chunk: AudioChunk): Promise<void> {
    this.bufferedChunks.push(chunk);

    // Check queue overflow
    if (this.bufferedChunks.length > this.options.maxQueueChunks) {
      const dropped = this.bufferedChunks.shift();
      console.warn(`⚠️ Queue overflow — dropping old chunks (dropped chunk: ${dropped?.id})`);
    }

    // Start playback when buffer is ready
    if (!this.hasStartedPlayback) {
      const shouldStart = 
        this.bufferedChunks.length >= this.options.minBufferChunks ||
        this.getBufferedMs() >= this.options.minBufferMs;

      if (shouldStart) {
        this.hasStartedPlayback = true;
        console.log(`🎬 Starting playback with ${this.bufferedChunks.length} chunks buffered (${this.getBufferedMs()}ms)`);
        this.options.onPlaybackStart();
        
        // Start draining buffer
        this.drainBuffer();
      }
    } else {
      // Already playing - check for starvation
      if (this.bufferedChunks.length < 2) {
        console.warn(`⚠️ Queue starvation — buffer running low (${this.bufferedChunks.length} chunks)`);
        // TODO: Implement playback rate nudge (0.98x) for 50ms
      }
    }
  }

  /**
   * Drain buffered chunks to worklet
   */
  private async drainBuffer(): Promise<void> {
    while (this.bufferedChunks.length > 0 && !this.isDestroyed) {
      const chunk = this.bufferedChunks.shift()!;
      await this.processChunk(chunk);
    }
  }

  /**
   * Get buffered duration in milliseconds
   */
  private getBufferedMs(): number {
    // Estimate: assume ~20ms per chunk (typical for streaming)
    return this.bufferedChunks.length * 20;
  }

  /**
   * Process pending chunks once worklet is initialized
   */
  private async processPendingChunks(): Promise<void> {
    if (this.pendingChunks.length === 0) return;

    if (this.options.debug) {
      console.log('[StreamingAudioPlayer] Processing', this.pendingChunks.length, 'pending chunks');
    }

    const chunks = [...this.pendingChunks];
    this.pendingChunks = [];

    for (const chunk of chunks) {
      await this.processChunk(chunk);
    }
  }

  /**
   * Process a single audio chunk
   */
  private async processChunk(chunk: AudioChunk): Promise<void> {
    if (!this.audioContext || !this.workletNode || this.isDestroyed) {
      return;
    }

    try {
      // Detect new response for fade-in
      const isNewResponse = this.currentResponseId !== null && this.currentResponseId !== chunk.responseId;
      
      // Handle responseId changes for overlapping streams
      if (this.currentResponseId !== null && 
          this.currentResponseId !== chunk.responseId &&
          chunk.sequenceNumber !== undefined &&
          chunk.sequenceNumber > 2) {
        console.log('🧹 [StreamingAudioPlayer] ResponseId CHANGED with gap - clearing old queue:', {
          previous: this.currentResponseId,
          current: chunk.responseId,
          sequenceGap: chunk.sequenceNumber
        });
        this.clearQueue();
      }
      
      // Log responseId for debugging
      if (this.currentResponseId !== chunk.responseId) {
        console.log('[StreamingAudioPlayer] New responseId:', chunk.responseId);
      }
      this.currentResponseId = chunk.responseId;

      // Ensure AudioContext is resumed (critical for backgrounded tabs)
      await this.ensureAudioContextResumed();

      let samples: Float32Array;

      // Check if this is PCM data (from real-time streaming) or WebM blob (fallback)
      if (chunk.data.length < 1000 && chunk.sequenceNumber !== undefined) {
        // This is likely PCM data from real-time streaming
        console.log('[StreamingAudioPlayer] Processing PCM chunk:', chunk.id);
        
        // Decode base64 to Int16 PCM
        const binaryString = atob(chunk.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Create Int16Array from bytes (little-endian)
        const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
        
        // Convert Int16 to Float32 with proper normalization
        samples = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          // Normalize to [-1, 1] range with proper handling of edge cases
          const sample = int16Array[i];
          samples[i] = sample < 0 ? sample / 32768.0 : sample / 32767.0;
        }
        
      } else {
        // This is WebM blob data (fallback path)
        console.log('[StreamingAudioPlayer] Processing WebM blob chunk:', chunk.id);
        
        // Decode base64 to ArrayBuffer
        const binaryString = atob(chunk.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Decode audio data to AudioBuffer
        let audioBuffer;
        try {
          audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer.slice(0));
        } catch (decodeError: any) {
          // CRITICAL: Never swallow decode errors silently
          console.error('[StreamingAudioPlayer] decodeAudioData FAILED:', {
            chunkId: chunk.id,
            dataSize: bytes.length,
            error: decodeError.message,
            errorName: decodeError.name,
            audioContextState: this.audioContext.state,
            sampleRate: this.audioContext.sampleRate
          });
          this.options.onError(new Error(`Audio decode failed for chunk ${chunk.id}: ${decodeError.message}`));
          return;
        }

        // Convert AudioBuffer to Float32Array samples
        if (audioBuffer.numberOfChannels === 1) {
          // Mono audio
          samples = new Float32Array(audioBuffer.getChannelData(0));
        } else {
          // Stereo or multi-channel - mix down to mono
          const leftChannel = audioBuffer.getChannelData(0);
          const rightChannel = audioBuffer.getChannelData(1) || leftChannel;
          samples = new Float32Array(leftChannel.length);
          
          for (let i = 0; i < leftChannel.length; i++) {
            samples[i] = (leftChannel[i] + rightChannel[i]) / 2;
          }
        }
      }

      // Send samples to worklet (create a copy to avoid transfer issues)
      const samplesCopy = new Float32Array(samples);
      this.workletNode.port.postMessage({
        type: 'ADD_SAMPLES',
        data: samplesCopy,
        isNewResponse: isNewResponse
      });
      
      // Log when we add samples
      if (this.options.debug) {
        console.log('[StreamingAudioPlayer] Added', samples.length, 'samples to worklet');
      }

    } catch (error: any) {
      this.options.onError(new Error(`Failed to process chunk ${chunk.id}: ${error}`));
    }
  }

  /**
   * Clear all queued audio
   */
  public clearQueue(): void {
    if (this.workletNode && !this.isDestroyed) {
      this.workletNode.port.postMessage({ type: 'CLEAR_QUEUE' });
    }
    this.pendingChunks = [];
    this.bufferedChunks = [];
    this.reorderBuffer.clear();
    this.hasStartedPlayback = false;
    this.nextExpectedSequence = 0;
    
    if (this.reorderTimeout) {
      clearTimeout(this.reorderTimeout);
      this.reorderTimeout = null;
    }

    if (this.options.debug) {
      console.log('[StreamingAudioPlayer] Queue cleared');
    }
  }

  /**
   * Get current queue size
   */
  public async getQueueSize(): Promise<number> {
    if (!this.workletNode || this.isDestroyed) {
      return this.pendingChunks.length;
    }

    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'QUEUE_SIZE_RESPONSE') {
          this.workletNode!.port.removeEventListener('message', handleMessage);
          resolve(event.data.size + this.pendingChunks.length);
        }
      };

      this.workletNode.port.addEventListener('message', handleMessage);
      this.workletNode.port.postMessage({ type: 'GET_QUEUE_SIZE' });
    });
  }

  /**
   * Test the audio system with a simple tone
   */
  public async testAudio(): Promise<void> {
    if (!this.audioContext || !this.workletNode || this.isDestroyed) {
      console.error('[StreamingAudioPlayer] Cannot test - not initialized');
      return;
    }

    await this.ensureAudioContextResumed();

    // Generate a 1-second 440Hz sine wave test tone
    const sampleRate = this.audioContext.sampleRate;
    const duration = 1; // 1 second
    const frequency = 440; // A4 note
    const samples = new Float32Array(sampleRate * duration);

    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.1; // Low volume
    }

    // Send test samples to worklet
    this.workletNode.port.postMessage({
      type: 'ADD_SAMPLES',
      data: samples
    });

    console.log('[StreamingAudioPlayer] Test tone sent to worklet');
  }

  /**
   * Check if player is ready to accept chunks
   */
  public isReady(): boolean {
    return this.isInitialized && !this.isDestroyed;
  }

  /**
   * Dispose of the player and clean up resources
   */
  public dispose(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    if (this.reorderTimeout) {
      clearTimeout(this.reorderTimeout);
      this.reorderTimeout = null;
    }

    if (this.bufferHealthInterval) {
      clearInterval(this.bufferHealthInterval);
      this.bufferHealthInterval = null;
    }

    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.pendingChunks = [];
    this.bufferedChunks = [];
    this.reorderBuffer.clear();
    this.isInitialized = false;
    this.currentResponseId = null;
    this.hasStartedPlayback = false;

    if (this.options.debug) {
      console.log('[StreamingAudioPlayer] Disposed');
    }

    this.options.onPlaybackEnd();
  }
}