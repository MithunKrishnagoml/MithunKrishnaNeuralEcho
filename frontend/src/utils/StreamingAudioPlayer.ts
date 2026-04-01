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
  isComplete?: boolean; // Mark when response is complete
}

export interface StreamingAudioPlayerOptions {
  /** Sample rate for audio context (default: 24000 Hz for OpenAI Realtime API) */
  sampleRate?: number;
  /** Maximum number of samples to keep in queue */
  maxQueueSize?: number;
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
  private isInitialized: boolean = false;
  private isDestroyed: boolean = false;
  private options: Required<StreamingAudioPlayerOptions>;
  private userGestureReceived: boolean = false;
  private keepAliveIntervalId: number | null = null;
  private readonly KEEP_ALIVE_INTERVAL = 25000; // 25 seconds

  constructor(options: StreamingAudioPlayerOptions = {}) {
    this.options = {
      sampleRate: 24000, // ✅ MUST be 24000 Hz for OpenAI Realtime API PCM16 format
      maxQueueSize: options.maxQueueSize || 48000 * 10, // 10 seconds at 48kHz
      debug: options.debug || false,
      onPlaybackStart: options.onPlaybackStart || (() => {}),
      onPlaybackEnd: options.onPlaybackEnd || (() => {}),
      onError: options.onError || ((error) => console.error('[StreamingAudioPlayer]', error))
    };

    this.initializeAudioWorklet();
    this.setupVisibilityHandler();
  }

  private async initializeAudioWorklet(): Promise<void> {
    try {
      // Create AudioContext with specified sample rate
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.options.sampleRate
      });

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

      // Start keep-alive mechanism
      this.startKeepAlive();

      // Process any pending chunks
      this.processPendingChunks();

    } catch (error) {
      this.options.onError(new Error(`Failed to initialize AudioWorklet: ${error}`));
    }
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
   * Start keep-alive mechanism to prevent AudioContext suspension
   */
  private startKeepAlive(): void {
    if (this.keepAliveIntervalId !== null) return;

    this.keepAliveIntervalId = window.setInterval(async () => {
      if (!this.audioContext || this.isDestroyed) {
        this.stopKeepAlive();
        return;
      }

      // Resume if suspended
      if (this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
          if (this.options.debug) {
            console.log('[StreamingAudioPlayer] Keep-alive: AudioContext resumed');
          }
        } catch (error) {
          if (this.options.debug) {
            console.log('[StreamingAudioPlayer] Keep-alive: Failed to resume', error);
          }
        }
      }

      // Send silent buffer to keep context active
      if (this.workletNode && this.audioContext.state === 'running') {
        const silentBuffer = new Float32Array(this.options.sampleRate / 10); // 100ms of silence
        this.workletNode.port.postMessage({
          type: 'ADD_SAMPLES',
          data: silentBuffer,
          isKeepAlive: true
        });
      }
    }, this.KEEP_ALIVE_INTERVAL);
  }

  /**
   * Stop keep-alive mechanism
   */
  private stopKeepAlive(): void {
    if (this.keepAliveIntervalId !== null) {
      clearInterval(this.keepAliveIntervalId);
      this.keepAliveIntervalId = null;
    }
  }

  /**
   * Handle visibility changes to resume AudioContext when tab regains focus
   */
  private setupVisibilityHandler(): void {
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) {
        if (this.options.debug) {
          console.log('[StreamingAudioPlayer] Tab hidden');
        }
      } else {
        if (this.options.debug) {
          console.log('[StreamingAudioPlayer] Tab visible - resuming AudioContext');
        }
        await this.ensureAudioContextResumed();
      }
    });
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
   * Add an audio chunk to the playback queue
   */
  public async addChunk(chunk: AudioChunk): Promise<void> {
    if (this.isDestroyed) {
      if (this.options.debug) {
        console.warn('[StreamingAudioPlayer] Ignoring chunk - player destroyed');
      }
      return;
    }

    // CRITICAL: Resume AudioContext on every addChunk call, not just on user gesture
    await this.ensureAudioContextResumed();

    if (!this.isInitialized) {
      // Queue chunk until worklet is ready
      this.pendingChunks.push(chunk);
      if (this.options.debug) {
        console.log('[StreamingAudioPlayer] Chunk queued (worklet not ready):', chunk.id);
      }
      return;
    }

    await this.processChunk(chunk);
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
   * ✅ BUG FIX #2: Direct PCM16 decoding - no more decodeAudioData failures
   */
  private async processChunk(chunk: AudioChunk): Promise<void> {
    if (!this.audioContext || !this.workletNode || this.isDestroyed) {
      return;
    }

    try {
      // CRITICAL: Resume AudioContext before processing any chunk
      await this.ensureAudioContextResumed();

      // ✅ ALL AUDIO IS RAW PCM16 - Decode directly without decodeAudioData
      if (this.options.debug) {
        console.log('[StreamingAudioPlayer] Processing PCM16 chunk:', chunk.id);
      }
      
      // Decode base64 → raw bytes
      const binaryString = atob(chunk.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Interpret as signed 16-bit PCM (little-endian)
      const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
      
      // Convert to Float32 for Web Audio API
      const float32Samples = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        const sample = int16Array[i];
        float32Samples[i] = sample < 0 ? sample / 32768.0 : sample / 32767.0;
      }
      
      // Send directly to worklet for gapless playback
      this.workletNode.port.postMessage({
        type: 'ADD_SAMPLES',
        data: float32Samples,
        responseId: chunk.responseId
      });
      
      if (this.options.debug) {
        console.log('[StreamingAudioPlayer] Sent', float32Samples.length, 'PCM16 samples to worklet');
      }

      // Trigger playback start callback on first chunk
      if (!this.userGestureReceived) {
        this.options.onPlaybackStart();
      }

    } catch (error) {
      this.options.onError(new Error(`Failed to process chunk ${chunk.id}: ${error}`));
    }
  }

  /**
   * DEPRECATED: No longer used - PCM chunks now play immediately
   * Play a complete buffered PCM response
   */
  /*
  private async playBufferedPCMResponse(responseId: string): Promise<void> {
    if (!this.audioContext || !this.workletNode || this.isDestroyed) {
      return;
    }

    const chunks = this.pcmChunkBuffer.get(responseId);
    if (!chunks || chunks.length === 0) {
      return;
    }

    try {
      // Calculate total samples
      let totalSamples = 0;
      for (const chunk of chunks) {
        totalSamples += chunk.length;
      }

      // Combine all chunks into one Float32Array
      const combinedSamples = new Float32Array(totalSamples);
      let offset = 0;
      for (const chunk of chunks) {
        for (let i = 0; i < chunk.length; i++) {
          const sample = chunk[i];
          combinedSamples[offset + i] = sample < 0 ? sample / 32768.0 : sample / 32767.0;
        }
        offset += chunk.length;
      }

      console.log('[StreamingAudioPlayer] Playing complete PCM response:', {
        responseId,
        totalChunks: chunks.length,
        totalSamples: totalSamples,
        duration: `${(totalSamples / this.options.sampleRate).toFixed(2)}s`
      });

      // Send complete audio block to worklet
      this.workletNode.port.postMessage({
        type: 'ADD_SAMPLES',
        data: combinedSamples,
        responseId: responseId
      });

      // Clean up buffered chunks
      this.pcmChunkBuffer.delete(responseId);
      const idx = this.responseIdQueue.indexOf(responseId);
      if (idx > -1) {
        this.responseIdQueue.splice(idx, 1);
      }

    } catch (error) {
      this.options.onError(new Error(`Failed to play buffered PCM response ${responseId}: ${error}`));
    }
  }
  */

  /**
   * Clear all queued audio
   */
  public clearQueue(): void {
    if (this.workletNode && !this.isDestroyed) {
      this.workletNode.port.postMessage({ type: 'CLEAR_QUEUE' });
    }
    this.pendingChunks = [];

    if (this.options.debug) {
      console.log('[StreamingAudioPlayer] Queue cleared');
    }
  }

  /**
   * Called when a NEW response starts — clears leftover audio from previous turn
   * and re-enters buffering state so the jitter buffer pre-fills before playback.
   */
  public onNewResponse(): void {
    if (this.workletNode && !this.isDestroyed) {
      this.workletNode.port.postMessage({ type: 'CLEAR_QUEUE' });
      this.workletNode.port.postMessage({ type: 'RESET_BUFFER' });
    }
    this.pendingChunks = [];

    if (this.options.debug) {
      console.log('[StreamingAudioPlayer] onNewResponse - cleared queue and reset buffer');
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
    this.stopKeepAlive();

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
    this.isInitialized = false;

    if (this.options.debug) {
      console.log('[StreamingAudioPlayer] Disposed');
    }

    this.options.onPlaybackEnd();
  }
}