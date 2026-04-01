/**
 * AudioWorklet processor for continuous streaming audio playback
 * Maintains a single continuous timeline across all incoming chunks
 * Includes jitter buffer and underrun detection
 */
class AudioStreamingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // PCM sample queue (Float32Array samples)
    this.sampleQueue = [];
    this.isInitialized = false;
    this.isBuffering = false;
    this.currentResponseId = null;
    
    // Jitter buffer settings — 3 chunks pre-roll (~130ms at 24kHz/1024 chunks)
    this.MIN_BUFFER_CHUNKS = 3;
    this.MIN_BUFFER_SAMPLES = 1024 * this.MIN_BUFFER_CHUNKS; // ~3072 samples
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      const { type, data, isKeepAlive, responseId } = event.data;
      
      switch (type) {
        case 'INIT':
          this.isInitialized = true;
          this.isBuffering = true; // Start in buffering mode
          console.log('[AudioWorklet] Initialized - starting in buffering mode');
          break;
          
        case 'ADD_SAMPLES':
          // Receive Float32Array samples from main thread
          if (data && data.length > 0) {
            // Skip keep-alive samples - they're just to keep AudioContext alive
            if (isKeepAlive) {
              break;
            }
            
            // Track response ID changes
            if (responseId && responseId !== this.currentResponseId) {
              console.log(`[AudioWorklet] New response detected: ${responseId} (was: ${this.currentResponseId})`);
              this.currentResponseId = responseId;
              this.isBuffering = true; // Start buffering for new response
            }
            
            // Add samples to queue safely
            for (let i = 0; i < data.length; i++) {
              this.sampleQueue.push(data[i]);
            }
            
            // Check if we should exit buffering mode
            if (this.isBuffering && this.sampleQueue.length >= this.MIN_BUFFER_SAMPLES) {
              this.isBuffering = false;
              console.log(`[AudioWorklet] Jitter buffer filled (${this.sampleQueue.length} samples) - starting playback`);
            }
            
            if (!isKeepAlive) {
              console.log(`[AudioWorklet] Added ${data.length} samples, queue size: ${this.sampleQueue.length}, buffering: ${this.isBuffering}`);
            }
          }
          break;
          
        case 'CLEAR_QUEUE':
          const clearedSize = this.sampleQueue.length;
          this.sampleQueue = [];
          this.isBuffering = true; // Return to buffering mode
          console.log(`[AudioWorklet] CLEAR_QUEUE executed - cleared ${clearedSize} samples, back to buffering`);
          break;
          
        case 'RESET_BUFFER':
          // Re-enter buffering state without clearing — used after CLEAR_QUEUE
          this.isBuffering = true;
          console.log('[AudioWorklet] RESET_BUFFER - re-entering buffering mode');
          break;
          
        case 'GET_QUEUE_SIZE':
          this.port.postMessage({
            type: 'QUEUE_SIZE_RESPONSE',
            size: this.sampleQueue.length
          });
          break;
      }
    };
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    
    if (!output || output.length === 0) {
      return true;
    }
    
    const frameCount = output[0].length;
    
    if (!this.isInitialized) {
      // Fill all channels with silence until initialized
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].fill(0);
      }
      return true;
    }
    
    // If buffering, output silence and wait for jitter buffer to fill
    if (this.isBuffering) {
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].fill(0);
      }
      return true;
    }
    
    // If queue ran dry, re-enter buffering immediately
    if (this.sampleQueue.length === 0) {
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].fill(0);
      }
      this.isBuffering = true; // Re-enter buffering if we run dry
      return true;
    }
    
    let samplesPlayed = 0;
    
    // Fill output buffer with samples from queue
    for (let i = 0; i < frameCount; i++) {
      let sample = 0;
      
      if (this.sampleQueue.length > 0) {
        sample = this.sampleQueue.shift();
        
        // Soft clipping to prevent distortion
        if (sample > 1.0) sample = 1.0;
        if (sample < -1.0) sample = -1.0;
        
        if (sample !== 0) {
          samplesPlayed++;
        }
      }
      // else: sample stays 0 (silence for remaining frames)
      
      // Fill all output channels with the same sample (mono to stereo)
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = sample;
      }
    }
    
    // Debug log when we're actually playing samples
    if (samplesPlayed > 0) {
      console.log(`[AudioWorklet] Playing ${samplesPlayed}/${frameCount} samples, queue remaining: ${this.sampleQueue.length}`);
    }
    
    return true;
  }
}

registerProcessor('audio-streaming-processor', AudioStreamingProcessor);