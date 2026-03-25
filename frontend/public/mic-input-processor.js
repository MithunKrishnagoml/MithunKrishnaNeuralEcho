/**
 * AudioWorklet processor for capturing microphone input
 * Converts Float32 PCM to Int16 and sends to main thread for OpenAI
 */
class MicInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isCapturing = false;
    this.chunkSize = 2400; // 100ms at 24kHz
    this.buffer = [];
    
    this.port.onmessage = (event) => {
      if (event.data.type === 'START_CAPTURE') {
        this.isCapturing = true;
        this.buffer = [];
        console.log('[MicInputProcessor] Started capturing');
      } else if (event.data.type === 'STOP_CAPTURE') {
        this.isCapturing = false;
        this.buffer = [];
        console.log('[MicInputProcessor] Stopped capturing');
      }
    };
  }
  
  process(inputs, outputs, parameters) {
    if (!this.isCapturing) {
      return true;
    }
    
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) {
      return true;
    }
    
    const inputChannel = input[0];
    const frameCount = inputChannel.length;
    
    if (frameCount === 0) {
      return true;
    }
    
    // Add frames to buffer
    for (let i = 0; i < frameCount; i++) {
      this.buffer.push(inputChannel[i]);
    }
    
    // Send chunks when buffer is full
    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.splice(0, this.chunkSize);
      
      // Convert Float32 to Int16 PCM
      const int16Array = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const sample = Math.max(-1, Math.min(1, chunk[i]));
        int16Array[i] = Math.round(sample * 32767);
      }
      
      // Send to main thread
      this.port.postMessage({
        type: 'AUDIO_CHUNK',
        data: int16Array.buffer,
        sampleCount: chunk.length,
        timestamp: currentTime
      }, [int16Array.buffer]);
    }
    
    return true;
  }
}

registerProcessor('mic-input-processor', MicInputProcessor);
