/**
 * RealtimeAudioTap - Intercepts raw PCM from WebRTC audio track for real-time relay
 * Replaces MediaRecorder for streaming audio chunks instead of full blobs
 */

export interface AudioChunkCallback {
  (pcmData: string, responseId: string, sequenceNumber: number): void;
}

export interface AudioStreamEndCallback {
  (responseId: string): void;
}

export class RealtimeAudioTap {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isCapturing: boolean = false;
  private currentResponseId: string | null = null;
  private sequenceNumber: number = 0;
  private onAudioChunk: AudioChunkCallback | null = null;
  private onStreamEnd: AudioStreamEndCallback | null = null;

  constructor(
    onAudioChunk: AudioChunkCallback,
    onStreamEnd: AudioStreamEndCallback
  ) {
    this.onAudioChunk = onAudioChunk;
    this.onStreamEnd = onStreamEnd;
  }

  /**
   * Initialize the audio tap on a WebRTC audio track
   */
  async initialize(audioTrack: MediaStreamTrack): Promise<void> {
    try {
      // Create AudioContext with 24kHz to match OpenAI Realtime output
      this.audioContext = new AudioContext({ sampleRate: 24000 });

      // Create MediaStream from track
      const stream = new MediaStream([audioTrack]);
      const source = this.audioContext.createMediaStreamSource(stream);

      // Load the audio tap worklet
      await this.audioContext.audioWorklet.addModule('/audio-tap-processor.js');

      // Create worklet node for PCM extraction
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-tap-processor');

      // Connect source to worklet (worklet doesn't connect to destination - no playback)
      source.connect(this.workletNode);
      
      // CRITICAL: Connect worklet to destination to ensure audio graph processes
      // Even though we don't want playback, the graph needs to be connected for processing
      this.workletNode.connect(this.audioContext.destination);
      
      console.log('🎤 [RealtimeAudioTap] Audio graph connected: source → worklet → destination');

      // Listen for PCM chunks from worklet
      this.workletNode.port.onmessage = (event) => {
        const { type, data, responseId, sequenceNumber, hasAudio, maxAmplitude } = event.data;
        
        if (type === 'PCM_CHUNK' && this.isCapturing && this.onAudioChunk) {
          // Log every 50th chunk to monitor audio flow
          if (this.sequenceNumber % 50 === 0) {
            console.log(`🎵 [RealtimeAudioTap] Chunk #${this.sequenceNumber}: hasAudio=${hasAudio}, maxAmp=${maxAmplitude?.toFixed(4)}`);
          }
          
          // Convert raw ArrayBuffer to base64 in main thread (btoa available here)
          const uint8Array = new Uint8Array(data);
          let binaryString = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i]);
          }
          const base64Data = btoa(binaryString);
          
          // Send with incremented sequence number
          this.onAudioChunk(base64Data, this.currentResponseId || responseId, this.sequenceNumber);
          this.sequenceNumber++; // Increment after sending
        }
      };

      console.log('🎤 [RealtimeAudioTap] Initialized on audio track');
    } catch (error) {
      console.error('❌ [RealtimeAudioTap] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Start capturing audio chunks for a response
   */
  startCapture(responseId: string): void {
    if (!this.workletNode) {
      console.warn('⚠️ [RealtimeAudioTap] Cannot start capture - not initialized');
      return;
    }

    this.currentResponseId = responseId;
    this.sequenceNumber = 0;
    this.isCapturing = true;

    // Tell worklet to start capturing
    this.workletNode.port.postMessage({
      type: 'START_CAPTURE',
      responseId: responseId
    });

    console.log('🎵 [RealtimeAudioTap] Started capture for response:', responseId);
  }

  /**
   * Stop capturing and signal stream end
   */
  stopCapture(): void {
    if (!this.isCapturing || !this.currentResponseId) {
      return;
    }

    const responseId = this.currentResponseId;
    this.isCapturing = false;

    // Tell worklet to stop capturing
    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'STOP_CAPTURE'
      });
    }

    // Signal stream end
    if (this.onStreamEnd) {
      this.onStreamEnd(responseId);
    }

    console.log('⏹️ [RealtimeAudioTap] Stopped capture for response:', responseId);
    this.currentResponseId = null;
    this.sequenceNumber = 0;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopCapture();
    
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.onAudioChunk = null;
    this.onStreamEnd = null;
  }
}