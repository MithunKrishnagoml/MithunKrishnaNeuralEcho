/**
 * Complete implementation for real-time audio streaming to OpenAI
 * Add this to your useRealtimeVoice.ts or similar hook
 */

import { useRef, useCallback } from 'react';

// ============================================================================
// 1. MICROPHONE AUDIO CAPTURE & STREAMING
// ============================================================================

interface AudioStreamManager {
  audioContext: AudioContext | null;
  micWorklet: AudioWorkletNode | null;
  micStream: MediaStream | null;
  dataChannel: RTCDataChannel | null;
  isStreaming: boolean;
}

const audioManager = useRef<AudioStreamManager>({
  audioContext: null,
  micWorklet: null,
  micStream: null,
  dataChannel: null,
  isStreaming: false
});

/**
 * Initialize microphone capture with AudioWorklet
 */
const initializeMicCapture = useCallback(async (dataChannel: RTCDataChannel) => {
  try {
    // Get microphone stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 24000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    console.log('🎤 [MIC] Stream obtained:', stream.getAudioTracks()[0].getSettings());
    
    // Create AudioContext
    const audioContext = new AudioContext({ sampleRate: 24000 });
    const source = audioContext.createMediaStreamSource(stream);
    
    // Load and create worklet
    await audioContext.audioWorklet.addModule('/mic-input-processor.js');
    const micWorklet = new AudioWorkletNode(audioContext, 'mic-input-processor');
    
    // Connect source to worklet
    source.connect(micWorklet);
    
    // Handle audio chunks from worklet
    micWorklet.port.onmessage = (event) => {
      if (event.data.type === 'AUDIO_CHUNK') {
        sendAudioToOpenAI(event.data.data, dataChannel);
      }
    };
    
    // Store references
    audioManager.current = {
      audioContext,
      micWorklet,
      micStream: stream,
      dataChannel,
      isStreaming: false
    };
    
    console.log('✅ [MIC] Capture initialized');
    
  } catch (error) {
    console.error('❌ [MIC] Failed to initialize:', error);
    throw error;
  }
}, []);

/**
 * Send audio chunk to OpenAI via DataChannel
 */
const sendAudioToOpenAI = (audioBuffer: ArrayBuffer, dataChannel: RTCDataChannel) => {
  if (dataChannel.readyState !== 'open') {
    console.warn('⚠️ [AUDIO] DataChannel not open');
    return;
  }
  
  try {
    // Convert ArrayBuffer to base64
    const uint8Array = new Uint8Array(audioBuffer);
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i]);
    }
    const base64Audio = btoa(binaryString);
    
    // Send to OpenAI
    dataChannel.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    }));
    
    console.log(`📤 [AUDIO] Sent chunk: ${base64Audio.length} bytes`);
    
  } catch (error) {
    console.error('❌ [AUDIO] Failed to send:', error);
  }
};

/**
 * Start streaming audio to OpenAI
 */
const startAudioStreaming = useCallback(() => {
  const { micWorklet, dataChannel } = audioManager.current;
  
  if (!micWorklet || !dataChannel) {
    console.error('❌ [AUDIO] Not initialized');
    return;
  }
  
  // Clear any existing audio buffer
  dataChannel.send(JSON.stringify({
    type: 'input_audio_buffer.clear'
  }));
  
  // Start capturing
  micWorklet.port.postMessage({ type: 'START_CAPTURE' });
  audioManager.current.isStreaming = true;
  
  console.log('🎙️ [AUDIO] Started streaming');
}, []);

/**
 * Stop streaming and commit audio buffer
 */
const stopAudioStreaming = useCallback(() => {
  const { micWorklet, dataChannel } = audioManager.current;
  
  if (!micWorklet || !dataChannel) {
    return;
  }
  
  // Stop capturing
  micWorklet.port.postMessage({ type: 'STOP_CAPTURE' });
  audioManager.current.isStreaming = false;
  
  // Commit audio buffer to trigger OpenAI response
  if (dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify({
      type: 'input_audio_buffer.commit'
    }));
    
    // Request response generation
    dataChannel.send(JSON.stringify({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio']
      }
    }));
    
    console.log('✅ [AUDIO] Committed and requested response');
  }
}, []);

// ============================================================================
// 2. DATACHANNEL MESSAGE HANDLER
// ============================================================================

const handleDataChannelMessage = useCallback((event: MessageEvent) => {
  try {
    const message = JSON.parse(event.data);
    console.log('📨 [DataChannel] Received:', message.type);
    
    // ========== ORIGINAL TRANSCRIPT (what user said) ==========
    if (message.type === 'conversation.item.input_audio_transcription.completed') {
      const originalText = message.transcript;
      console.log(`📝 [ORIGINAL] "${originalText}"`);
      
      // Update UI with original transcript
      setOriginalTranscript(originalText);
      
      // Send to backend for relay to other participant
      if (roomWebSocket?.readyState === WebSocket.OPEN) {
        roomWebSocket.send(JSON.stringify({
          type: 'ORIGINAL_TRANSCRIPT',
          text: originalText,
          language: currentUserLanguage,
          fromParticipant: participantId,
          sessionId: sessionId,
          timestamp: Date.now()
        }));
      }
    }
    
    // ========== LIVE TRANSLATED TEXT (streaming) ==========
    if (message.type === 'response.audio_transcript.delta') {
      const delta = message.delta;
      console.log(`📝 [TRANSLATION DELTA] "${delta}"`);
      
      // Append to live transcript
      setTranslatedTranscript(prev => prev + delta);
      
      // Send to backend for relay
      if (roomWebSocket?.readyState === WebSocket.OPEN) {
        roomWebSocket.send(JSON.stringify({
          type: 'TRANSLATED_TRANSCRIPT_DELTA',
          delta: delta,
          fromParticipant: participantId,
          sessionId: sessionId,
          timestamp: Date.now()
        }));
      }
    }
    
    // ========== FINAL TRANSLATED TEXT ==========
    if (message.type === 'response.audio_transcript.done') {
      const translatedText = message.transcript;
      console.log(`✅ [TRANSLATION DONE] "${translatedText}"`);
      
      // Finalize transcript
      setTranslatedTranscript(translatedText);
      
      // Send to backend
      if (roomWebSocket?.readyState === WebSocket.OPEN) {
        roomWebSocket.send(JSON.stringify({
          type: 'TRANSLATED_TRANSCRIPT_DONE',
          text: translatedText,
          targetLanguage: otherUserLanguage,
          fromParticipant: participantId,
          sessionId: sessionId,
          timestamp: Date.now()
        }));
      }
    }
    
    // ========== TRANSLATED AUDIO (for playback) ==========
    if (message.type === 'response.audio.delta') {
      const audioData = message.delta; // base64 PCM16
      console.log(`🔊 [AUDIO DELTA] Received chunk: ${audioData.length} bytes`);
      
      // Send to other participant via WebSocket
      if (roomWebSocket?.readyState === WebSocket.OPEN) {
        roomWebSocket.send(JSON.stringify({
          type: 'RELAY_AUDIO_CHUNK',
          chunk: audioData,
          fromParticipant: participantId,
          sessionId: sessionId,
          timestamp: Date.now()
        }));
      }
      
      // Also play locally if needed (for testing)
      // playAudioChunk(audioData);
    }
    
    // ========== AUDIO DONE ==========
    if (message.type === 'response.audio.done') {
      console.log('✅ [AUDIO] Generation complete');
      
      if (roomWebSocket?.readyState === WebSocket.OPEN) {
        roomWebSocket.send(JSON.stringify({
          type: 'RELAY_AUDIO_END',
          fromParticipant: participantId,
          sessionId: sessionId,
          timestamp: Date.now()
        }));
      }
    }
    
    // ========== RESPONSE COMPLETE ==========
    if (message.type === 'response.done') {
      console.log('✅ [RESPONSE] Complete');
      
      // Add message to history
      addMessageToHistory({
        id: `msg_${Date.now()}`,
        speakerId: participantId,
        originalText: originalTranscript,
        translatedText: translatedTranscript,
        timestamp: Date.now()
      });
      
      // Reset for next turn
      setOriginalTranscript('');
      setTranslatedTranscript('');
    }
    
    // ========== ERROR HANDLING ==========
    if (message.type === 'error') {
      console.error('❌ [OpenAI ERROR]:', message.error);
      toast.error(`Translation error: ${message.error.message}`);
    }
    
  } catch (error) {
    console.error('❌ [DataChannel] Parse error:', error);
  }
}, [roomWebSocket, participantId, sessionId, currentUserLanguage, otherUserLanguage]);

// ============================================================================
// 3. VAD INTEGRATION
// ============================================================================

/**
 * When VAD detects speech start
 */
const onVADSpeechStart = useCallback(() => {
  console.log('🎤 [VAD] Speech started');
  startAudioStreaming();
}, [startAudioStreaming]);

/**
 * When VAD detects speech end (silence)
 */
const onVADSpeechEnd = useCallback(() => {
  console.log('🔇 [VAD] Speech ended');
  stopAudioStreaming();
}, [stopAudioStreaming]);

// ============================================================================
// 4. WEBSOCKET MESSAGE HANDLER (for receiving from other participant)
// ============================================================================

const handleWebSocketMessage = useCallback((event: MessageEvent) => {
  try {
    const message = JSON.parse(event.data);
    
    // ========== RECEIVE TRANSLATED AUDIO FROM OTHER PARTICIPANT ==========
    if (message.type === 'translation_audio_chunk') {
      const audioData = message.audio; // base64 PCM16
      const speakerId = message.speakerId;
      
      // Only play if it's from the OTHER participant
      if (speakerId !== participantId) {
        console.log(`🔊 [RECEIVE] Audio chunk from ${speakerId}`);
        
        // Enqueue in FifoAudioQueue
        if (audioQueueRef.current) {
          audioQueueRef.current.enqueue(audioData, message.seq);
        }
      }
    }
    
    // ========== RECEIVE TRANSCRIPTS FROM OTHER PARTICIPANT ==========
    if (message.type === 'ORIGINAL_TRANSCRIPT') {
      console.log(`📝 [RECEIVE] Original: "${message.text}"`);
      // Update UI with other participant's transcript
    }
    
    if (message.type === 'TRANSLATED_TRANSCRIPT_DONE') {
      console.log(`📝 [RECEIVE] Translation: "${message.text}"`);
      // Update UI with translated transcript
    }
    
  } catch (error) {
    console.error('❌ [WebSocket] Parse error:', error);
  }
}, [participantId, audioQueueRef]);

// ============================================================================
// 5. INITIALIZATION
// ============================================================================

/**
 * Initialize the complete pipeline
 */
const initializeRealtimePipeline = useCallback(async (
  dataChannel: RTCDataChannel,
  roomWebSocket: WebSocket
) => {
  try {
    // 1. Initialize microphone capture
    await initializeMicCapture(dataChannel);
    
    // 2. Set up DataChannel message handler
    dataChannel.onmessage = handleDataChannelMessage;
    
    // 3. Set up WebSocket message handler
    roomWebSocket.addEventListener('message', handleWebSocketMessage);
    
    console.log('✅ [PIPELINE] Initialized successfully');
    
  } catch (error) {
    console.error('❌ [PIPELINE] Initialization failed:', error);
    throw error;
  }
}, [initializeMicCapture, handleDataChannelMessage, handleWebSocketMessage]);

// ============================================================================
// 6. CLEANUP
// ============================================================================

const cleanup = useCallback(() => {
  const { audioContext, micWorklet, micStream } = audioManager.current;
  
  if (micWorklet) {
    micWorklet.port.postMessage({ type: 'STOP_CAPTURE' });
    micWorklet.disconnect();
  }
  
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
  }
  
  if (audioContext) {
    audioContext.close();
  }
  
  audioManager.current = {
    audioContext: null,
    micWorklet: null,
    micStream: null,
    dataChannel: null,
    isStreaming: false
  };
  
  console.log('🧹 [CLEANUP] Complete');
}, []);

// ============================================================================
// EXPORT
// ============================================================================

export {
  initializeRealtimePipeline,
  startAudioStreaming,
  stopAudioStreaming,
  onVADSpeechStart,
  onVADSpeechEnd,
  cleanup
};
