/**
 * Microphone Input Processor
 * Captures microphone audio and converts to PCM16 for OpenAI Realtime API
 */

class MicInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isCapturing = false;
    
    this.port.onmessage = (event) => {
      const { type } = event.data;
      
      if (type === 'START_CAPTURE') {
        this.isCapturing = true;
        console.log('[MicInputProcessor] Started capturing');
      } else if (type === 'STOP_CAPTURE') {
        this.isCapturing = false;
        console.log('[MicInputProcessor] Stopped capturing');
      }
    };
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

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // Only process if we have input and are capturing
    if (!this.isCapturing || !input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputChannel = input[0]; // Mono channel
    
    // Convert Float32 to Int16 PCM
    const pcm16 = this.float32ToInt16(inputChannel);
    
    // Send PCM data to main thread
    this.port.postMessage({
      type: 'AUDIO_DATA',
      data: pcm16.buffer
    }, [pcm16.buffer]); // Transfer ownership for efficiency

    return true;
  }
}

registerProcessor('mic-input-processor', MicInputProcessor);
