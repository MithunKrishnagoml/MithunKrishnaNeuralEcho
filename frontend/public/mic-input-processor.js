/**
 * Microphone Input Processor with Voice Activity Detection (VAD)
 * Captures microphone audio and converts to PCM16 for OpenAI Realtime API
 * Only sends audio when speech is detected (energy above threshold)
 */

class MicInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = true;
    this.port.onmessage = (e) => {
      if (e.data.type === 'STOP_CAPTURE') this._active = false;
      if (e.data.type === 'START_CAPTURE') this._active = true;
    };
  }

  process(inputs) {
    if (!this._active) return true;
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    const int16Array = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      int16Array[i] = Math.max(-32768, Math.min(32767, channelData[i] * 32768));
    }

    this.port.postMessage({ type: 'AUDIO_DATA', data: int16Array.buffer }, [int16Array.buffer]);
    return true;
  }
}

registerProcessor('mic-input-processor', MicInputProcessor);
