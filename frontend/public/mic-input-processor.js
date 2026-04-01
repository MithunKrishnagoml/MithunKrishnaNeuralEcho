/**
 * Microphone Input Processor - TRUE STREAMING (20ms chunks)
 * Captures microphone audio and converts to PCM16 for OpenAI Realtime API
 * 
 * CRITICAL: Sends audio immediately in ~20ms chunks for low latency
 * NO BATCHING - each process() call sends immediately
 */

class MicInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = true;
    this._chunkCount = 0;
    this._lastSilenceLog = 0;
    
    // Speech detection for silence-based segmentation
    this._silenceThreshold = 0.01; // RMS threshold
    this._silenceDuration = 0;
    this._maxSilenceDuration = 300; // 300ms silence triggers commit
    this._isSpeaking = false;
    
    this.port.onmessage = (e) => {
      if (e.data.type === 'STOP_CAPTURE') this._active = false;
      if (e.data.type === 'START_CAPTURE') {
        this._active = true;
        this._chunkCount = 0;
        this._silenceDuration = 0;
        this._isSpeaking = false;
      }
    };
  }

  /**
   * Calculate RMS energy for speech detection
   */
  _calculateRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  process(inputs) {
    if (!this._active) return true;
    
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    
    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    // Calculate RMS for speech detection
    const rms = this._calculateRMS(channelData);
    const isSpeech = rms > this._silenceThreshold;
    
    // Track silence duration for segmentation
    const chunkDurationMs = (channelData.length / sampleRate) * 1000;
    
    if (!isSpeech) {
      this._silenceDuration += chunkDurationMs;
      
      // Log silence detection periodically (not every chunk)
      const now = Date.now();
      if (now - this._lastSilenceLog > 1000) {
        this._lastSilenceLog = now;
        // Silence detected - will trigger commit on backend
      }
    } else {
      // Speech detected - reset silence counter
      if (this._silenceDuration > 0) {
        this._silenceDuration = 0;
      }
      if (!this._isSpeaking) {
        this._isSpeaking = true;
        // Speech started
      }
    }
    
    // Check if we should signal end of utterance
    const shouldCommit = this._isSpeaking && this._silenceDuration >= this._maxSilenceDuration;
    if (shouldCommit) {
      this._isSpeaking = false;
      this._silenceDuration = 0;
      // Send commit signal
      this.port.postMessage({ 
        type: 'COMMIT_AUDIO',
        timestamp: Date.now()
      });
    }

    // Convert Float32 to Int16 PCM
    const int16Array = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const sample = channelData[i];
      int16Array[i] = Math.max(-32768, Math.min(32767, sample * 32768));
    }

    // ✅ CRITICAL: Send IMMEDIATELY - no batching, no waiting
    // This is the key to low latency (<500ms)
    this.port.postMessage({ 
      type: 'AUDIO_DATA', 
      data: int16Array.buffer,
      chunkIndex: this._chunkCount++,
      rms: rms,
      isSpeech: isSpeech,
      timestamp: Date.now()
    }, [int16Array.buffer]);
    
    return true;
  }
}

registerProcessor('mic-input-processor', MicInputProcessor);
