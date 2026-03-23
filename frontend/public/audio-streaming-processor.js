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
    this.consecutiveSilentFrames = 0;
    this.currentResponseId = null;
    
    // Jitter buffer settings - reduced for faster playback start
    this.JITTER_BUFFER_SIZE = 480; // 20ms at 24kHz (was 100ms, too long)
    this.SILENCE_THRESHOLD_FRAMES = 480; // 10ms of silence at 48kHz sample rate
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      const { type, data, isBuffering, isKeepAlive, responseId } = event.data;
      
      switch (type) {
        case 'INIT':
          this.isInitialized = true;
          this.isBuffering = true; // Start in buffering mode
          console.log('[AudioWorklet] Initialized - starting in buffering mode');
          break;
          
        case 'ADD_SAMPLES':
          // Receive Float32Array samples from main thread
          if (data && data.length > 0) {
            // Track response ID changes
            if (responseId && responseId !== this.currentResponseId) {
              console.log(`[AudioWorklet] New response detected: ${responseId} (was: ${this.currentResponseId})`);
              this.currentResponseId = responseId;
              this.isBuffering = true; // Start buffering for new response
              this.consecutiveSilentFrames = 0;
            }
            
            // Add samples to queue safely
            for (let i = 0; i < data.length; i++) {
              this.sampleQueue.push(data[i]);
            }
            
            // Check if we should exit buffering mode
            if (this.isBuffering && this.sampleQueue.length >= this.JITTER_BUFFER_SIZE) {
              this.isBuffering = false;
              this.consecutiveSilentFrames = 0;
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
          this.consecutiveSilentFrames = 0;
          console.log(`[AudioWorklet] CLEAR_QUEUE executed - cleared ${clearedSize} samples, back to buffering`);
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
      // Log buffering status periodically
      if (Math.random() < 0.01) { // Log ~1% of frames to avoid spam
        console.log(`[AudioWorklet] Still buffering... queue: ${this.sampleQueue.length}/${this.JITTER_BUFFER_SIZE}`);
      }
      return true;
    }
    
    let samplesPlayed = 0;
    let silentSamplesThisFrame = 0;
    
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
          this.consecutiveSilentFrames = 0; // Reset silence counter when we get audio
        } else {
          silentSamplesThisFrame++;
        }
      } else {
        // Queue is empty - this is normal silence between utterances
        silentSamplesThisFrame++;
        this.consecutiveSilentFrames++;
        
        // Only go back to buffering if we've had sustained silence AND queue is still empty
        // This prevents false positives during normal inter-utterance gaps
        if (this.consecutiveSilentFrames >= this.SILENCE_THRESHOLD_FRAMES && this.sampleQueue.length === 0) {
          // Check if we should wait for more data
          if (this.consecutiveSilentFrames >= this.SILENCE_THRESHOLD_FRAMES * 2) {
            console.log(`[AudioWorklet] Extended silence detected (${this.consecutiveSilentFrames} frames) - returning to buffering mode`);
            this.isBuffering = true;
            this.consecutiveSilentFrames = 0;
          }
        }
      }
      
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