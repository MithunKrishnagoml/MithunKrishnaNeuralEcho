/**
 * Microphone Input Processor with Voice Activity Detection (VAD)
 * Captures microphone audio and converts to PCM16 for OpenAI Realtime API
 * Only sends audio when speech is detected (energy above threshold)
 */

class MicInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isCapturing = false;
    
    // VAD Configuration
    this.energyThreshold = 0.01; // RMS threshold for speech detection (0.01 = ~1% of max amplitude)
    this.silenceDurationMs = 600; // How long silence before stopping (600ms allows natural pauses)
    this.preBufferDurationMs = 250; // Buffer 250ms before speech starts to avoid cutting first words
    
    // VAD State
    this.isSpeaking = false; // Are we currently in a speech segment?
    this.silenceStartTime = null; // When did silence start (for duration tracking)
    this.frameCount = 0; // Track frames for smoothing
    
    // Pre-buffer: Circular buffer to store recent audio before speech detection
    // At 48kHz sample rate, 128 samples per frame = ~2.67ms per frame
    // For 250ms buffer: need ~94 frames, round to 100 for safety
    this.preBufferSize = 100; // Number of frames to buffer
    this.preBuffer = []; // Array of Float32Array frames
    this.preBufferIndex = 0; // Current position in circular buffer
    
    // Smoothing: Moving average of energy over last few frames to avoid rapid toggling
    this.energyHistorySize = 5; // Average over last 5 frames (~13ms at 128 samples/frame)
    this.energyHistory = [];
    
    this.port.onmessage = (event) => {
      const { type, config } = event.data;
      
      if (type === 'START_CAPTURE') {
        this.isCapturing = true;
        this.isSpeaking = false;
        this.silenceStartTime = null;
        this.preBuffer = [];
        this.preBufferIndex = 0;
        this.energyHistory = [];
        this.frameCount = 0;
        console.log('[MicInputProcessor] Started capturing with VAD');
      } else if (type === 'STOP_CAPTURE') {
        this.isCapturing = false;
        this.isSpeaking = false;
        this.silenceStartTime = null;
        this.preBuffer = [];
        this.energyHistory = [];
        console.log('[MicInputProcessor] Stopped capturing');
      } else if (type === 'UPDATE_CONFIG' && config) {
        // Allow dynamic configuration updates
        if (config.energyThreshold !== undefined) {
          this.energyThreshold = config.energyThreshold;
          console.log('[MicInputProcessor] Updated energyThreshold:', this.energyThreshold);
        }
        if (config.silenceDurationMs !== undefined) {
          this.silenceDurationMs = config.silenceDurationMs;
          console.log('[MicInputProcessor] Updated silenceDurationMs:', this.silenceDurationMs);
        }
        if (config.preBufferDurationMs !== undefined) {
          this.preBufferDurationMs = config.preBufferDurationMs;
          console.log('[MicInputProcessor] Updated preBufferDurationMs:', this.preBufferDurationMs);
        }
      }
    };
  }

  /**
   * Calculate RMS (Root Mean Square) energy of audio buffer
   * Returns value between 0 and 1
   */
  calculateEnergy(float32Array) {
    let sum = 0;
    for (let i = 0; i < float32Array.length; i++) {
      sum += float32Array[i] * float32Array[i];
    }
    return Math.sqrt(sum / float32Array.length);
  }

  /**
   * Get smoothed energy using moving average over recent frames
   * Reduces false positives from brief noise spikes
   */
  getSmoothedEnergy(currentEnergy) {
    // Add current energy to history
    this.energyHistory.push(currentEnergy);
    
    // Keep only last N frames
    if (this.energyHistory.length > this.energyHistorySize) {
      this.energyHistory.shift();
    }
    
    // Calculate average
    const sum = this.energyHistory.reduce((acc, val) => acc + val, 0);
    return sum / this.energyHistory.length;
  }

  /**
   * Add frame to circular pre-buffer
   * Keeps last ~250ms of audio before speech detection
   */
  addToPreBuffer(float32Array) {
    // Create a copy since the input buffer is reused
    const copy = new Float32Array(float32Array);
    
    if (this.preBuffer.length < this.preBufferSize) {
      // Still filling initial buffer
      this.preBuffer.push(copy);
    } else {
      // Circular buffer: overwrite oldest frame
      this.preBuffer[this.preBufferIndex] = copy;
      this.preBufferIndex = (this.preBufferIndex + 1) % this.preBufferSize;
    }
  }

  /**
   * Get pre-buffered frames in correct chronological order
   * Returns array of Float32Array frames
   */
  getPreBufferedFrames() {
    if (this.preBuffer.length < this.preBufferSize) {
      // Buffer not full yet, return in order
      return this.preBuffer.slice();
    } else {
      // Buffer is full, return from oldest to newest
      // Oldest frame is at preBufferIndex, wrap around
      const frames = [];
      for (let i = 0; i < this.preBufferSize; i++) {
        const index = (this.preBufferIndex + i) % this.preBufferSize;
        frames.push(this.preBuffer[index]);
      }
      return frames;
    }
  }

  /**
   * Convert Float32 audio samples to Int16 PCM
   */
  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] range
      const clamped = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit integer
      int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    }
    return int16Array;
  }

  /**
   * Send audio frame to main thread
   */
  sendAudioFrame(float32Array) {
    const pcm16 = this.float32ToInt16(float32Array);
    this.port.postMessage({
      type: 'AUDIO_DATA',
      data: pcm16.buffer
    }, [pcm16.buffer]); // Transfer ownership for efficiency
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // Only process if we have input and are capturing
    if (!this.isCapturing || !input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputChannel = input[0]; // Mono channel
    this.frameCount++;
    
    // ========================================
    // VOICE ACTIVITY DETECTION (VAD)
    // ========================================
    
    // 1. Calculate energy (RMS) of current frame
    const rawEnergy = this.calculateEnergy(inputChannel);
    
    // 2. Apply smoothing to reduce false positives
    const smoothedEnergy = this.getSmoothedEnergy(rawEnergy);
    
    // 3. Add current frame to pre-buffer (always buffer recent audio)
    this.addToPreBuffer(inputChannel);
    
    // 4. Determine if current frame contains speech
    const isSpeechFrame = smoothedEnergy > this.energyThreshold;
    
    // Log energy levels periodically for debugging (every 100 frames ~267ms)
    if (this.frameCount % 100 === 0) {
      console.log(`[VAD] Energy: ${smoothedEnergy.toFixed(4)}, Threshold: ${this.energyThreshold}, Speaking: ${this.isSpeaking}, Speech: ${isSpeechFrame}`);
    }
    
    // ========================================
    // STATE MACHINE: Speech Start/Stop Detection
    // ========================================
    
    if (!this.isSpeaking && isSpeechFrame) {
      // SPEECH START: Energy rose above threshold
      console.log(`🎤 [VAD] Speech started! Energy: ${smoothedEnergy.toFixed(4)} > ${this.energyThreshold}`);
      this.isSpeaking = true;
      this.silenceStartTime = null;
      
      // Send pre-buffered audio first (last ~250ms before speech)
      // This prevents cutting off the first words
      const preBufferedFrames = this.getPreBufferedFrames();
      console.log(`📦 [VAD] Sending ${preBufferedFrames.length} pre-buffered frames (~${this.preBufferDurationMs}ms)`);
      
      for (const frame of preBufferedFrames) {
        this.sendAudioFrame(frame);
      }
      
      // Then send current frame
      this.sendAudioFrame(inputChannel);
      
    } else if (this.isSpeaking && !isSpeechFrame) {
      // POTENTIAL SPEECH END: Energy dropped below threshold
      
      if (this.silenceStartTime === null) {
        // First silent frame after speech - start silence timer
        this.silenceStartTime = currentTime;
        console.log(`🤫 [VAD] Silence started at ${currentTime.toFixed(3)}s`);
      }
      
      // Check if silence duration exceeded threshold
      const silenceDuration = (currentTime - this.silenceStartTime) * 1000; // Convert to ms
      
      if (silenceDuration >= this.silenceDurationMs) {
        // SPEECH END: Silence lasted long enough
        console.log(`🛑 [VAD] Speech ended! Silence duration: ${silenceDuration.toFixed(0)}ms >= ${this.silenceDurationMs}ms`);
        this.isSpeaking = false;
        this.silenceStartTime = null;
        
        // Do NOT send this silent frame
      } else {
        // Still within silence grace period - keep sending to avoid cutting mid-sentence
        // This allows natural pauses in speech (like between words)
        this.sendAudioFrame(inputChannel);
      }
      
    } else if (this.isSpeaking && isSpeechFrame) {
      // CONTINUING SPEECH: Energy still above threshold
      this.silenceStartTime = null; // Reset silence timer
      this.sendAudioFrame(inputChannel);
      
    } else {
      // NOT SPEAKING and NO SPEECH: Just silence/noise
      // Do NOT send audio - this is the key optimization!
      // Audio is still being added to pre-buffer for next speech start
    }

    return true;
  }
}

registerProcessor('mic-input-processor', MicInputProcessor);
