/**
 * Audio utility functions for debugging and analysis
 */

/**
 * Compute RMS (Root Mean Square) energy of audio samples
 */
export function computeRMS(float32Array: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < float32Array.length; i++) {
    sum += float32Array[i] ** 2;
  }
  return Math.sqrt(sum / float32Array.length);
}

/**
 * Compute peak amplitude of audio samples
 */
export function computePeak(float32Array: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < float32Array.length; i++) {
    const abs = Math.abs(float32Array[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

/**
 * Write string to DataView for WAV encoding
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Encode Float32 audio samples as WAV file
 */
export function encodeWAV(int16Array: Int16Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = int16Array.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples
  const offset = 44;
  for (let i = 0; i < int16Array.length; i++) {
    view.setInt16(offset + i * 2, int16Array[i], true);
  }

  return buffer;
}

/**
 * Save Float32 audio samples as downloadable WAV file
 */
export function saveAsWav(
  float32Array: Float32Array,
  sampleRate: number,
  index: number
): void {
  // Convert Float32 to Int16
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, float32Array[i] * 32767));
  }

  // Encode as WAV
  const wavBuffer = encodeWAV(int16, sampleRate);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);

  // Trigger download
  const a = document.createElement('a');
  a.href = url;
  a.download = `pre-openai-utterance-${index}-${Date.now()}.wav`;
  a.click();

  console.log('[PRE-OPENAI AUDIO] WAV saved', {
    utteranceIndex: index,
    sampleCount: float32Array.length,
    durationMs: (float32Array.length / sampleRate * 1000).toFixed(0),
    filename: a.download
  });

  URL.revokeObjectURL(url);
}
