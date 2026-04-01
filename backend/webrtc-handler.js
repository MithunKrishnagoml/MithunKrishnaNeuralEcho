/**
 * WebRTC Handler for Full-Duplex Audio Streaming
 * Manages peer connections and routes audio to OpenAI
 */

import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'wrtc';
import { PassThrough } from 'stream';

export class WebRTCHandler {
  constructor(sessionId, userId, openaiWs) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.openaiWs = openaiWs;
    this.peerConnection = null;
    this.audioStream = new PassThrough();
    this.isConnected = false;
    
    // Audio processing
    this.audioBuffer = [];
    this.sampleRate = 24000;
    this.channelCount = 1;
    
    console.log(`🎙️ [WebRTC] Handler created for user ${userId} in session ${sessionId}`);
  }

  /**
   * Initialize RTCPeerConnection
   */
  async initialize() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Handle incoming audio track
    this.peerConnection.ontrack = (event) => {
      console.log(`🎵 [WebRTC] Received audio track from ${this.userId}`);
      const [remoteStream] = event.streams;
      this.handleIncomingAudio(remoteStream);
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 [WebRTC] ICE candidate generated for ${this.userId}`);
        // Will be sent via WebSocket signaling
        this.onIceCandidate?.(event.candidate);
      }
    };

    // Connection state monitoring
    this.peerConnection.onconnectionstatechange = () => {
      console.log(`🔌 [WebRTC] Connection state: ${this.peerConnection.connectionState}`);
      this.isConnected = this.peerConnection.connectionState === 'connected';
    };

    console.log(`✅ [WebRTC] Peer connection initialized for ${this.userId}`);
  }

  /**
   * Handle incoming audio from WebRTC track
   * Convert to PCM16 and stream to OpenAI
   */
  handleIncomingAudio(stream) {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      console.error('❌ [WebRTC] No audio track found');
      return;
    }

    console.log(`🎤 [WebRTC] Processing audio track: ${audioTrack.label}`);

    // Create MediaStreamTrackProcessor (modern API)
    // Note: In Node.js with wrtc, we need to handle this differently
    // We'll use a workaround with RTCRtpReceiver
    
    const receiver = this.peerConnection.getReceivers().find(r => r.track === audioTrack);
    if (!receiver) {
      console.error('❌ [WebRTC] No receiver found for track');
      return;
    }

    // Process audio chunks and forward to OpenAI
    this.streamAudioToOpenAI(audioTrack);
  }

  /**
   * Stream audio from WebRTC to OpenAI Realtime API
   * Continuous streaming with no buffering
   */
  async streamAudioToOpenAI(audioTrack) {
    console.log(`📡 [WebRTC→OpenAI] Starting audio stream for ${this.userId}`);

    // In a real implementation, we'd use MediaStreamTrackProcessor
    // For Node.js, we'll simulate with a custom audio processor
    
    // This is a simplified version - in production, use proper audio processing
    const processAudio = setInterval(() => {
      if (!this.isConnected || !this.openaiWs || this.openaiWs.readyState !== 1) {
        clearInterval(processAudio);
        return;
      }

      // In real implementation, extract PCM16 from WebRTC track
      // For now, this is a placeholder that shows the structure
      
      // The actual audio data would come from the WebRTC track
      // and be converted to PCM16 base64
      
    }, 20); // Process every 20ms (~480 samples at 24kHz)

    audioTrack.onended = () => {
      console.log(`🛑 [WebRTC] Audio track ended for ${this.userId}`);
      clearInterval(processAudio);
    };
  }

  /**
   * Create WebRTC offer
   */
  async createOffer() {
    if (!this.peerConnection) {
      await this.initialize();
    }

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false
    });

    await this.peerConnection.setLocalDescription(offer);
    console.log(`📤 [WebRTC] Offer created for ${this.userId}`);
    
    return offer;
  }

  /**
   * Handle WebRTC answer from client
   */
  async handleAnswer(answer) {
    const remoteDesc = new RTCSessionDescription(answer);
    await this.peerConnection.setRemoteDescription(remoteDesc);
    console.log(`📥 [WebRTC] Answer processed for ${this.userId}`);
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate) {
    if (candidate) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`🧊 [WebRTC] ICE candidate added for ${this.userId}`);
    }
  }

  /**
   * Send translated audio back to client via WebRTC
   * This creates an outbound audio track
   */
  async sendTranslatedAudio(audioData) {
    // In production, create an RTCRtpSender with audio track
    // For now, we'll use WebSocket as fallback for translated audio
    // True WebRTC audio injection requires MediaStream API
    
    console.log(`🔊 [WebRTC] Sending translated audio to ${this.userId}`);
    
    // This would be implemented with proper audio track creation
    // For the hybrid approach, we'll send via WebSocket
  }

  /**
   * Close connection and cleanup
   */
  close() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.isConnected = false;
    console.log(`🔌 [WebRTC] Connection closed for ${this.userId}`);
  }
}

/**
 * WebRTC Session Manager
 * Manages multiple peer connections in a translation session
 */
export class WebRTCSessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> { userA: WebRTCHandler, userB: WebRTCHandler }
  }

  /**
   * Create WebRTC handler for a user
   */
  createHandler(sessionId, userId, openaiWs) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {});
    }

    const handler = new WebRTCHandler(sessionId, userId, openaiWs);
    this.sessions.get(sessionId)[userId] = handler;
    
    console.log(`✅ [WebRTC Manager] Handler created for ${userId} in session ${sessionId}`);
    return handler;
  }

  /**
   * Get handler for a user
   */
  getHandler(sessionId, userId) {
    return this.sessions.get(sessionId)?.[userId];
  }

  /**
   * Get all handlers in a session
   */
  getSessionHandlers(sessionId) {
    return this.sessions.get(sessionId) || {};
  }

  /**
   * Remove handler
   */
  removeHandler(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      const handler = session[userId];
      if (handler) {
        handler.close();
        delete session[userId];
      }

      // Clean up empty sessions
      if (Object.keys(session).length === 0) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Close all connections in a session
   */
  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.values(session).forEach(handler => handler.close());
      this.sessions.delete(sessionId);
    }
  }
}
