/**
 * WebRTC Connection Hook for Full-Duplex Audio
 * Replaces WebSocket audio streaming with WebRTC
 */

import { useRef, useCallback, useEffect, useState } from 'react';

interface UseWebRTCConnectionProps {
  roomId: string;
  userId: string;
  onRemoteTrack: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  wsRef: React.MutableRefObject<WebSocket | null>;
}

export function useWebRTCConnection({
  roomId,
  userId,
  onRemoteTrack,
  onConnectionStateChange,
  wsRef
}: UseWebRTCConnectionProps) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');

  /**
   * Initialize WebRTC peer connection
   */
  const initializePeerConnection = useCallback(() => {
    if (pcRef.current) {
      console.log('⚠️ [WebRTC] Peer connection already exists');
      return pcRef.current;
    }

    console.log('🔧 [WebRTC] Initializing peer connection');

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('🧊 [WebRTC] Sending ICE candidate');
        wsRef.current.send(JSON.stringify({
          type: 'webrtc_ice_candidate',
          roomId,
          userId,
          candidate: event.candidate.toJSON()
        }));
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`🔌 [WebRTC] Connection state: ${state}`);
      setConnectionState(state);
      setIsConnected(state === 'connected');
      onConnectionStateChange(state);
    };

    // Handle ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 [WebRTC] ICE connection state: ${pc.iceConnectionState}`);
    };

    // Handle remote track (translated audio from other user)
    pc.ontrack = (event) => {
      console.log('🎵 [WebRTC] Received remote track');
      const [remoteStream] = event.streams;
      onRemoteTrack(remoteStream);
    };

    pcRef.current = pc;
    console.log('✅ [WebRTC] Peer connection initialized');
    return pc;
  }, [roomId, userId, onRemoteTrack, onConnectionStateChange, wsRef]);

  /**
   * Start local audio capture and add to peer connection
   */
  const startLocalAudio = useCallback(async () => {
    try {
      console.log('🎤 [WebRTC] Starting local audio capture');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
          channelCount: 1
        },
        video: false
      });

      localStreamRef.current = stream;

      // Add audio track to peer connection
      const pc = pcRef.current || initializePeerConnection();
      const audioTrack = stream.getAudioTracks()[0];
      
      if (audioTrack) {
        pc.addTrack(audioTrack, stream);
        console.log('✅ [WebRTC] Local audio track added to peer connection');
      }

      return stream;
    } catch (error) {
      console.error('❌ [WebRTC] Failed to start local audio:', error);
      throw error;
    }
  }, [initializePeerConnection]);

  /**
   * Create and send WebRTC offer
   */
  const createOffer = useCallback(async () => {
    try {
      const pc = pcRef.current || initializePeerConnection();
      
      console.log('📤 [WebRTC] Creating offer');
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      await pc.setLocalDescription(offer);
      console.log('✅ [WebRTC] Local description set');

      // Send offer via WebSocket
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'webrtc_offer',
          roomId,
          userId,
          offer: offer
        }));
        console.log('📤 [WebRTC] Offer sent via WebSocket');
      }
    } catch (error) {
      console.error('❌ [WebRTC] Failed to create offer:', error);
      throw error;
    }
  }, [roomId, userId, initializePeerConnection, wsRef]);

  /**
   * Handle WebRTC answer from server
   */
  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    try {
      const pc = pcRef.current;
      if (!pc) {
        console.error('❌ [WebRTC] No peer connection to handle answer');
        return;
      }

      console.log('📥 [WebRTC] Handling answer');
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('✅ [WebRTC] Remote description set');
    } catch (error) {
      console.error('❌ [WebRTC] Failed to handle answer:', error);
      throw error;
    }
  }, []);

  /**
   * Handle ICE candidate from server
   */
  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    try {
      const pc = pcRef.current;
      if (!pc) {
        console.error('❌ [WebRTC] No peer connection to add ICE candidate');
        return;
      }

      console.log('🧊 [WebRTC] Adding ICE candidate');
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('✅ [WebRTC] ICE candidate added');
    } catch (error) {
      console.error('❌ [WebRTC] Failed to add ICE candidate:', error);
    }
  }, []);

  /**
   * Stop local audio
   */
  const stopLocalAudio = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('🛑 [WebRTC] Stopped local audio track');
      });
      localStreamRef.current = null;
    }
  }, []);

  /**
   * Close peer connection
   */
  const closePeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
      console.log('🔌 [WebRTC] Peer connection closed');
    }
    stopLocalAudio();
    setIsConnected(false);
    setConnectionState('closed');
  }, [stopLocalAudio]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      closePeerConnection();
    };
  }, [closePeerConnection]);

  return {
    isConnected,
    connectionState,
    localStream: localStreamRef.current,
    startLocalAudio,
    createOffer,
    handleAnswer,
    handleIceCandidate,
    closePeerConnection
  };
}
