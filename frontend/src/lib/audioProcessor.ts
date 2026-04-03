/**
 * Enhanced Audio Processing for Seamless Communication
 * Provides noise suppression, echo cancellation, and audio optimization
 */

export interface AudioProcessorConfig {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  sampleRate?: number;
  channelCount?: number;
}

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private outputStream: MediaStream | null = null;
  private config: AudioProcessorConfig;

  constructor(config: AudioProcessorConfig = {
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    sampleRate: 16000,
    channelCount: 1
  }) {
    this.config = config;
  }

  /**
   * Initialize audio processing with enhanced constraints
   */
  async initializeAudio(): Promise<MediaStream> {
    try {
      // Enhanced audio constraints for better quality
      const constraints: MediaStreamConstraints = {
        audio: {
          noiseSuppression: this.config.noiseSuppression,
          echoCancellation: this.config.echoCancellation,
          autoGainControl: this.config.autoGainControl,
          sampleRate: this.config.sampleRate || 16000,
          channelCount: this.config.channelCount || 1,
          // Additional constraints for better audio quality
          latency: 0.005, // 5ms latency for real-time processing (reduced from 10ms)
          volume: 1.0,
          // Browser-specific enhancements
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
          googAudioMirroring: false
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.processAudioStream(stream);
    } catch (error) {
      console.error('Failed to initialize enhanced audio:', error);
      // Fallback to basic audio if enhanced features fail
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }

  /**
   * Process audio stream with advanced filtering and enhancement
   */
  private processAudioStream(inputStream: MediaStream): MediaStream {
    try {
      // Create audio context with optimal settings
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate || 16000,
        latencyHint: 'interactive' // Optimize for low latency
      });

      // Create source node from input stream
      this.sourceNode = this.audioContext.createMediaStreamSource(inputStream);

      // Create processing chain for audio enhancement
      this.setupAudioProcessingChain();

      // Create output stream
      const destination = this.audioContext.createMediaStreamDestination();
      this.connectProcessingChain(destination);
      
      this.outputStream = destination.stream;
      return this.outputStream;
    } catch (error) {
      console.error('Audio processing failed, using original stream:', error);
      return inputStream;
    }
  }

  /**
   * Setup advanced audio processing chain
   */
  private setupAudioProcessingChain(): void {
    if (!this.audioContext || !this.sourceNode) return;

    // 1. High-pass filter to remove low-frequency noise
    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = 'highpass';
    this.filterNode.frequency.setValueAtTime(80, this.audioContext.currentTime); // Remove frequencies below 80Hz
    this.filterNode.Q.setValueAtTime(0.7, this.audioContext.currentTime);

    // 2. Dynamic range compressor for consistent volume
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.setValueAtTime(-24, this.audioContext.currentTime);
    this.compressorNode.knee.setValueAtTime(30, this.audioContext.currentTime);
    this.compressorNode.ratio.setValueAtTime(12, this.audioContext.currentTime);
    this.compressorNode.attack.setValueAtTime(0.001, this.audioContext.currentTime); // Reduced from 0.003 for faster response
    this.compressorNode.release.setValueAtTime(0.15, this.audioContext.currentTime); // Reduced from 0.25 for lower latency

    // 3. Gain control for optimal levels
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.setValueAtTime(1.2, this.audioContext.currentTime); // Slight boost

    // 4. Analyser for real-time audio monitoring
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.5; // Reduced from 0.8 for faster response
  }

  /**
   * Connect the audio processing chain
   */
  private connectProcessingChain(destination: MediaStreamAudioDestinationNode): void {
    if (!this.sourceNode || !this.filterNode || !this.compressorNode || 
        !this.gainNode || !this.analyserNode) return;

    // Connect processing chain: source -> filter -> compressor -> gain -> analyser -> destination
    this.sourceNode
      .connect(this.filterNode)
      .connect(this.compressorNode)
      .connect(this.gainNode)
      .connect(this.analyserNode)
      .connect(destination);
  }

  /**
   * Get real-time audio level in dB
   */
  getAudioLevel(): number {
    if (!this.analyserNode) return -100;

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(dataArray);

    // Calculate RMS for more accurate level
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    
    // Convert to dB
    const normalized = rms / 255;
    return normalized > 0 ? 20 * Math.log10(normalized) : -100;
  }

  /**
   * Adjust gain dynamically based on audio level
   */
  adjustGain(targetLevel: number = -20): void {
    if (!this.gainNode || !this.audioContext) return;

    const currentLevel = this.getAudioLevel();
    const difference = targetLevel - currentLevel;
    
    // Gradual adjustment to avoid audio artifacts
    const adjustment = Math.max(-6, Math.min(6, difference * 0.1)); // Limit adjustment range
    const newGain = Math.max(0.1, Math.min(3.0, this.gainNode.gain.value + adjustment));
    
    this.gainNode.gain.exponentialRampToValueAtTime(
      newGain, 
      this.audioContext.currentTime + 0.1
    );
  }

  /**
   * Enable/disable noise suppression dynamically
   */
  setNoiseSuppression(enabled: boolean): void {
    this.config.noiseSuppression = enabled;
    // Note: This requires reinitializing the audio stream for full effect
    // In practice, you'd call initializeAudio() again
  }

  /**
   * Get audio quality metrics
   */
  getAudioMetrics(): {
    level: number;
    isClipping: boolean;
    signalToNoise: number;
    frequency: number;
  } {
    if (!this.analyserNode) {
      return { level: -100, isClipping: false, signalToNoise: 0, frequency: 0 };
    }

    const level = this.getAudioLevel();
    const isClipping = level > -3; // Consider clipping if above -3dB
    
    // Simple SNR estimation (this is a basic implementation)
    const signalToNoise = Math.max(0, level + 60); // Rough estimate
    
    // Dominant frequency detection
    const frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(frequencyData);
    
    let maxIndex = 0;
    let maxValue = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      if (frequencyData[i] > maxValue) {
        maxValue = frequencyData[i];
        maxIndex = i;
      }
    }
    
    const frequency = (maxIndex * (this.audioContext?.sampleRate || 16000)) / (2 * frequencyData.length);

    return { level, isClipping, signalToNoise, frequency };
  }

  /**
   * Cleanup audio processing resources
   */
  cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }
    
    this.sourceNode = null;
    this.gainNode = null;
    this.compressorNode = null;
    this.filterNode = null;
    this.analyserNode = null;
    this.outputStream = null;
  }

  /**
   * Get the processed audio stream
   */
  getProcessedStream(): MediaStream | null {
    return this.outputStream;
  }
}

/**
 * Utility function to create an enhanced audio processor
 */
export function createAudioProcessor(config?: Partial<AudioProcessorConfig>): AudioProcessor {
  return new AudioProcessor({
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    sampleRate: 16000,
    channelCount: 1,
    ...config
  });
}