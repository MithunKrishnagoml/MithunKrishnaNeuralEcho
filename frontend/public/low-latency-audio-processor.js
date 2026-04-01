/**
 * Low-Latency Audio Processor - TRUE STREAMING PLAYBACK
 * 
 * CRITICAL FEATURES:
 * - Jitter buffer: 50-100ms (not 600ms+)
 * - Barge-in support: immediate interruption
 * - Queue limit: drops old audio to prioritize fresh data
 * - Speech boundary detection: smooth transitions
 * 
 * This is the key to <500ms latency and natural conversation flow
 */

class LowLatencyAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Jitter buffer configuration
    this.MAX_BUFFER_MS = 100; // 100ms max buffer (not 600ms!)
    this.MIN_BUFFER_MS = 50;  // 50ms min buffer before playback starts
    this.sampleRate = 24000;  // OpenAI Realtime API sample rate
    
    // Audio queue
    this.queue = [];
    this.queueDuration = 0; // in samples
    this.isPlaying = false;
    this.totalSamplesPlayed = 0;
    
    // Barge-in / interruption support
    this.currentResponseId = null;
    this.lastChunkTimestamp = 0;
    this.SPEECH_BOUNDARY_MS = 300; // 300ms gap = new utterance
    
    // Stats
    this.droppedChunks = 0;
    this.playedChunks = 0;
    
    this.port.onmessage = (e) => {
      const { type, data } = e.data;
      
      switch (type) {
        case 'ADD_CHUNK':
          this.addChunk(e.data);
          break;
          
        case 'CLEAR_QUEUE':
          this.clearQueue();
          break;
          
        case 'INTERRUPT':
          this.interrupt();
          break;
          
        case 'GET_STATS':
          this.sendStats();
          break;
      }
    };
  }

  /**
   * Add audio chunk to queue with intelligent buffering
   */
  addChunk({ data, responseId, timestamp, chunkId }) {
    // Detect speech boundary (new utterance)
    const timeSinceLastChunk = timestamp - this.lastChunkTimestamp;
    const isNewUtterance = timeSinceLastChunk > this.SPEECH_BOUNDARY_MS;
    
    if (isNewUtterance && this.queue.length > 0) {
      // New utterance detected - interrupt old playback
      this.interrupt();
      this.port.postMessage({ type: 'UTTERANCE_BOUNDARY' });
    }
    
    this.lastChunkTimestamp = timestamp;
    this.currentResponseId = responseId;
    
    // Convert base64 to Float32Array
    const samples = this.base64ToFloat32(data);
    
    // Check queue limit - drop old audio if exceeding max buffer
    const maxSamples = (this.MAX_BUFFER_MS / 1000) * this.sampleRate;
    
    if (this.queueDuration + samples.length > maxSamples) {
      // Queue overflow - drop oldest chunks to stay under limit
      while (this.queueDuration + samples.length > maxSamples && this.queue.length > 0) {
        const dropped = this.queue.shift();
        this.queueDuration -= dropped.length;
        this.droppedChunks++;
      }
      
      // Log queue overflow (critical for debugging latency issues)
      if (this.droppedChunks % 10 === 0) {
        this.port.postMessage({ 
          type: 'QUEUE_OVERFLOW',
          droppedChunks: this.droppedChunks,
          queueDurationMs: (this.queueDuration / this.sampleRate) * 1000
        });
      }
    }
    
    // Add new chunk to queue
    this.queue.push(samples);
    this.queueDuration += samples.length;
    
    // Start playback if buffer is filled to minimum
    const minSamples = (this.MIN_BUFFER_MS / 1000) * this.sampleRate;
    if (!this.isPlaying && this.queueDuration >= minSamples) {
      this.isPlaying = true;
      this.port.postMessage({ type: 'PLAYBACK_STARTED' });
    }
  }

  /**
   * Clear all queued audio (for interruption)
   */
  clearQueue() {
    this.queue = [];
    this.queueDuration = 0;
    this.isPlaying = false;
    this.currentResponseId = null;
    this.port.postMessage({ type: 'QUEUE_CLEARED' });
  }

  /**
   * Interrupt current playback (barge-in)
   */
  interrupt() {
    this.clearQueue();
    this.port.postMessage({ type: 'INTERRUPTED' });
  }

  /**
   * Send stats to main thread
   */
  sendStats() {
    this.port.postMessage({
      type: 'STATS',
      queueDurationMs: (this.queueDuration / this.sampleRate) * 1000,
      queueChunks: this.queue.length,
      droppedChunks: this.droppedChunks,
      playedChunks: this.playedChunks,
      isPlaying: this.isPlaying
    });
  }

  /**
   * Convert base64 PCM16 to Float32Array
   */
  base64ToFloat32(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    const float32Array = new Float32Array(int16Array.length);
    
    for (let i = 0; i < int16Array.length; i++) {
      const sample = int16Array[i];
      float32Array[i] = sample < 0 ? sample / 32768.0 : sample / 32767.0;
    }
    
    return float32Array;
  }

  /**
   * Process audio - called by Web Audio API at regular intervals
   */
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    
    const outputChannel = output[0];
    if (!outputChannel) return true;
    
    // If not playing or queue empty, output silence
    if (!this.isPlaying || this.queue.length === 0) {
      outputChannel.fill(0);
      
      // Stop playing if queue is empty
      if (this.isPlaying && this.queue.length === 0) {
        this.isPlaying = false;
        this.port.postMessage({ type: 'PLAYBACK_ENDED' });
      }
      
      return true;
    }
    
    // Fill output buffer from queue
    let outputIndex = 0;
    
    while (outputIndex < outputChannel.length && this.queue.length > 0) {
      const chunk = this.queue[0];
      const remainingInChunk = chunk.length;
      const remainingInOutput = outputChannel.length - outputIndex;
      const samplesToC opy = Math.min(remainingInChunk, remainingInOutput);
      
      // Copy samples from chunk to output
      for (let i = 0; i < samplesToCopy; i++) {
        outputChannel[outputIndex++] = chunk[i];
      }
      
      // Update chunk or remove if fully consumed
      if (samplesToCopy === remainingInChunk) {
        this.queue.shift();
        this.playedChunks++;
      } else {
        // Partial consumption - keep remaining samples
        this.queue[0] = chunk.slice(samplesToCopy);
      }
      
      this.queueDuration -= samplesToCopy;
      this.totalSamplesPlayed += samplesToCopy;
    }
    
    // Fill remaining output with silence if queue exhausted
    while (outputIndex < outputChannel.length) {
      outputChannel[outputIndex++] = 0;
    }
    
    return true;
  }
}

registerProcessor('low-latency-audio-processor', LowLatencyAudioProcessor);
