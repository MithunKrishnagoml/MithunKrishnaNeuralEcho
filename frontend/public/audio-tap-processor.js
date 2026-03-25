/**
 * AudioWorklet processor for real-time PCM extraction from WebRTC audio track
 * Converts Float32 PCM to Int16 and sends chunks immediately over WebSocket
 */
class AudioTapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.isCapturing = false;
    this.currentResponseId = null;
    this.sequenceNumber = 0;
    this.chunkSize = 1024; // Samples per chunk (about 43ms at 24kHz)
    this.processCallCount = 0; // Track how many times process() is called
    
    console.log('[AudioTapProcessor] Constructor called - worklet initialized');
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      const { type, responseId } = event.data;
      
      switch (type) {
        case 'START_CAPTURE':
          this.isCapturing = true;
          this.currentResponseId = responseId;
          this.sequenceNumber = 0;
          console.log('[AudioTapProcessor] ✅ Started capturing for response:', responseId);
          break;
          
        case 'STOP_CAPTURE':
          this.isCapturing = false;
          console.log('[AudioTapProcessor] ⏹️ Stopped capturing. Total chunks sent:', this.sequenceNumber);
          break;
      }
    };
  }
  
  process(inputs, outputs, parameters) {
    // Log first few process calls to confirm worklet is running
    if (this.processCallCount < 5) {
      console.log(`[AudioTapProcessor] process() call #${this.processCallCount}, isCapturing: ${this.isCapturing}`);
    }
    this.processCallCount++;
    
    if (!this.isCapturing || !this.currentResponseId) {
      return true;
    }
    
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) {
      return true;
    }
    
    // Get mono channel (mix down if stereo)
    const inputChannel = input[0];
    const frameCount = inputChannel.length;
    
    if (frameCount === 0) {
      return true;
    }
    
    // Check if audio is actually non-zero (detect silence)
    let hasNonZeroSamples = false;
    let maxAmplitude = 0;
    for (let i = 0; i < frameCount; i++) {
      const absValue = Math.abs(inputChannel[i]);
      if (absValue > 0.001) { // Threshold for "non-zero"
        hasNonZeroSamples = true;
      }
      maxAmplitude = Math.max(maxAmplitude, absValue);
    }
    
    // Log every 100th chunk to avoid spam
    if (this.sequenceNumber % 100 === 0) {
      console.log(`[AudioTapProcessor] Chunk #${this.sequenceNumber}: hasAudio=${hasNonZeroSamples}, maxAmp=${maxAmplitude.toFixed(4)}, frames=${frameCount}`);
    }
    
    // Convert Float32 PCM to Int16 PCM
    const int16Samples = new Int16Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      // Clamp to [-1, 1] and convert to Int16
      const sample = Math.max(-1, Math.min(1, inputChannel[i]));
      int16Samples[i] = Math.round(sample * 32767);
    }
    
    // Send raw ArrayBuffer to main thread for base64 encoding
    // btoa is not available in AudioWorklet scope, so we send raw data
    this.port.postMessage({
      type: 'PCM_CHUNK',
      data: int16Samples.buffer, // Send raw ArrayBuffer
      responseId: this.currentResponseId,
      sequenceNumber: this.sequenceNumber++,
      sampleCount: frameCount,
      timestamp: currentTime,
      hasAudio: hasNonZeroSamples,
      maxAmplitude: maxAmplitude
    }, [int16Samples.buffer]); // Transfer ownership for performance
    
    return true;
  }
}

registerProcessor('audio-tap-processor', AudioTapProcessor);