/**
 * AudioWorklet processor for continuous streaming audio playback
 * Maintains a single continuous timeline across all incoming chunks
 */
// Start playback once we have a modest buffer, then keep draining continuously.
// 2048 samples ~= 85ms at 24kHz, which balances stability and latency.
const MIN_BUFFER_THRESHOLD = 2048;
// Hard cap to prevent runaway latency if producer outruns consumer.
const MAX_QUEUE_SAMPLES = 8192;
// Crossfade duration: 5-10ms at 24kHz = 120-240 samples
const CROSSFADE_SAMPLES = 180; // 7.5ms at 24kHz
// Fade-in duration for new response: 15ms at 24kHz = 360 samples
const FADE_IN_SAMPLES = 360;
// Fade-out duration when clearing: 10ms at 24kHz = 240 samples
const FADE_OUT_SAMPLES = 240;

class AudioStreamingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // PCM sample queue (Float32Array samples)
    this.sampleQueue = [];
    this.isInitialized = false;
    this.hasPrimed = false;
    
    // Crossfade state
    this.lastChunkTail = null; // Store last N samples of previous chunk
    this.currentChunkSamples = 0; // Track samples in current chunk for crossfade
    
    // Fade-in state for new responses
    this.fadeInRemaining = 0;
    this.fadeInTotal = 0;
    
    // Fade-out state for clearing
    this.fadeOutRemaining = 0;
    this.fadeOutTotal = 0;
    this.lastSampleValue = 0;
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      
      switch (type) {
        case 'INIT':
          this.isInitialized = true;
          break;
          
        case 'ADD_SAMPLES':
          // Receive Float32Array samples from main thread
          if (data && data.length > 0) {
            const isNewResponse = event.data.isNewResponse || false;
            
            // Apply crossfade between consecutive chunks (eliminates clicks)
            if (this.lastChunkTail && this.lastChunkTail.length > 0 && !isNewResponse) {
              const crossfadeLength = Math.min(CROSSFADE_SAMPLES, this.lastChunkTail.length, data.length);
              
              // Crossfade: linear blend between tail of previous chunk and head of new chunk
              for (let i = 0; i < crossfadeLength; i++) {
                const alpha = i / crossfadeLength; // 0 → 1
                const tailIdx = this.lastChunkTail.length - crossfadeLength + i;
                const blended = this.lastChunkTail[tailIdx] * (1 - alpha) + data[i] * alpha;
                data[i] = blended;
              }
            }
            
            // Store tail of this chunk for next crossfade
            if (data.length >= CROSSFADE_SAMPLES) {
              this.lastChunkTail = data.slice(-CROSSFADE_SAMPLES);
            } else {
              this.lastChunkTail = data.slice();
            }
            
            // Apply fade-in for new response (prevents onset pop)
            if (isNewResponse) {
              this.fadeInRemaining = FADE_IN_SAMPLES;
              this.fadeInTotal = FADE_IN_SAMPLES;
              this.lastChunkTail = null; // Reset crossfade on new response
            }
            
            // Add samples to queue safely
            for (let i = 0; i < data.length; i++) {
              this.sampleQueue.push(data[i]);
            }

            // Keep latency bounded by dropping oldest samples if queue grows too large.
            if (this.sampleQueue.length > MAX_QUEUE_SAMPLES) {
              const samplesDropped = this.sampleQueue.length - MAX_QUEUE_SAMPLES;
              this.sampleQueue.splice(0, samplesDropped);
              console.warn(`[AudioWorklet] Queue overflow - dropped ${samplesDropped} old samples, queue capped at ${this.sampleQueue.length}`);
            }

            console.log(`[AudioWorklet] Added ${data.length} samples, queue size: ${this.sampleQueue.length}, isNewResponse: ${isNewResponse}`);
          }
          break;
          
        case 'CLEAR_QUEUE':
          const clearedSize = this.sampleQueue.length;
          
          // Apply fade-out before clearing (prevents harsh cut)
          if (clearedSize > 0 && this.lastSampleValue !== 0) {
            this.fadeOutRemaining = FADE_OUT_SAMPLES;
            this.fadeOutTotal = FADE_OUT_SAMPLES;
          } else {
            // If already silent, clear immediately
            this.sampleQueue = [];
            this.hasPrimed = false;
            this.lastChunkTail = null;
          }
          
          console.log(`[AudioWorklet] CLEAR_QUEUE executed - cleared ${clearedSize} samples`);
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

    // Prime once at startup/reset, then keep playback continuous.
    if (!this.hasPrimed) {
      if (this.sampleQueue.length < MIN_BUFFER_THRESHOLD) {
        for (let channel = 0; channel < output.length; channel++) {
          output[channel].fill(0);
        }
        return true;
      }
      this.hasPrimed = true;
      console.log(`[AudioWorklet] Buffer primed: ${this.sampleQueue.length} samples (target ${MIN_BUFFER_THRESHOLD})`);
    }

    const queueSize = this.sampleQueue.length;
    const samplesToPlay = Math.min(queueSize, frameCount);

    for (let i = 0; i < samplesToPlay; i++) {
      let sample = this.sampleQueue.shift();
      
      // Apply fade-in if active (new response)
      if (this.fadeInRemaining > 0) {
        const fadeInProgress = 1 - (this.fadeInRemaining / this.fadeInTotal);
        sample *= fadeInProgress; // Linear fade from 0 → 1
        this.fadeInRemaining--;
      }
      
      // Apply fade-out if active (clearing queue)
      if (this.fadeOutRemaining > 0) {
        const fadeOutProgress = this.fadeOutRemaining / this.fadeOutTotal;
        sample *= fadeOutProgress; // Linear fade from 1 → 0
        this.fadeOutRemaining--;
        
        if (this.fadeOutRemaining === 0) {
          // Fade-out complete, now clear queue
          this.sampleQueue = [];
          this.hasPrimed = false;
          this.lastChunkTail = null;
        }
      }

      // Soft clipping to prevent distortion
      if (sample > 1.0) sample = 1.0;
      if (sample < -1.0) sample = -1.0;
      
      // Track last sample value for fade-out
      this.lastSampleValue = sample;

      // Fill all output channels with the same sample (mono to stereo)
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = sample;
      }
    }

    // Fill remaining frame with silence to avoid crackling on partial frames.
    for (let i = samplesToPlay; i < frameCount; i++) {
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = 0;
      }
    }

    if (samplesToPlay > 0) {
      console.log(`[AudioWorklet] Playing ${samplesToPlay}/${frameCount} samples (render quantum), queue remaining: ${this.sampleQueue.length}, target buffer: ${MIN_BUFFER_THRESHOLD}`);
    }
    
    return true;
  }
}

registerProcessor('audio-streaming-processor', AudioStreamingProcessor);