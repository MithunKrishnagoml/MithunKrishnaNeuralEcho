/**
 * AudioWorklet processor for continuous streaming audio playback
 * Maintains a single continuous timeline across all incoming chunks
 */
// Start playback once we have a modest buffer, then keep draining continuously.
// 2048 samples ~= 85ms at 24kHz, which balances stability and latency.
const MIN_BUFFER_THRESHOLD = 2048;
// Hard cap to prevent runaway latency if producer outruns consumer.
const MAX_QUEUE_SAMPLES = 8192;

class AudioStreamingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // PCM sample queue (Float32Array samples)
    this.sampleQueue = [];
    this.isInitialized = false;
    this.hasPrimed = false;
    
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

            console.log(`[AudioWorklet] Added ${data.length} samples, queue size: ${this.sampleQueue.length}`);
          }
          break;
          
        case 'CLEAR_QUEUE':
          const clearedSize = this.sampleQueue.length;
          this.sampleQueue = [];
          this.hasPrimed = false;
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

      // Soft clipping to prevent distortion
      if (sample > 1.0) sample = 1.0;
      if (sample < -1.0) sample = -1.0;

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