class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.paused = false;
    // 100ms chunks at 24kHz = 2400 samples
    this.chunkSize = 2400;

    this.port.onmessage = (e) => {
      if (e.data.paused !== undefined) {
        this.paused = e.data.paused;
        if (this.paused) this.buffer = []; // flush buffer on pause
      }
    };
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input || this.paused) return true;

    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      this.buffer.push(s < 0 ? s * 32768 : s * 32767);
    }

    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.splice(0, this.chunkSize);
      const int16 = new Int16Array(chunk);
      const bytes = new Uint8Array(int16.buffer);

      // Base64 encode
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      this.port.postMessage({ base64Chunk: btoa(binary) });
    }

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
