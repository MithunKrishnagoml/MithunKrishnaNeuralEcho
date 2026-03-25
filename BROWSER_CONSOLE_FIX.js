/**
 * TEMPORARY FIX: Paste this in browser console to relay audio
 * This intercepts the RealtimeAudioTap and connects it to WebSocket
 * 
 * INSTRUCTIONS:
 * 1. Open browser console (F12)
 * 2. Paste this entire script
 * 3. Press Enter
 * 4. Speak and check if audio is relayed
 */

(function() {
  console.log('🔧 [AUDIO RELAY FIX] Installing audio relay patch...');
  
  // Wait for WebSocket and session to be ready
  const checkAndInstall = setInterval(() => {
    // Try to find the room WebSocket
    const wsDebugElement = document.querySelector('[data-websocket-state]');
    if (!wsDebugElement) return;
    
    // Access the WebSocket from window (it might be stored globally)
    const roomWs = window.roomWebSocket || window.ws;
    if (!roomWs || roomWs.readyState !== WebSocket.OPEN) {
      console.log('⏳ [AUDIO RELAY FIX] Waiting for WebSocket...');
      return;
    }
    
    // Get session info from localStorage or window
    const sessionId = localStorage.getItem('currentSessionId') || window.currentSessionId;
    const participantId = localStorage.getItem('participantId') || window.participantId;
    
    if (!sessionId || !participantId) {
      console.log('⏳ [AUDIO RELAY FIX] Waiting for session info...');
      return;
    }
    
    console.log('✅ [AUDIO RELAY FIX] Found WebSocket and session info');
    console.log(`   Session: ${sessionId}`);
    console.log(`   Participant: ${participantId}`);
    
    // Try to find the peer connection
    const pc = window.peerConnection;
    if (!pc) {
      console.log('⏳ [AUDIO RELAY FIX] Waiting for peer connection...');
      return;
    }
    
    // Get the remote audio track
    const receivers = pc.getReceivers();
    const audioReceiver = receivers.find(r => r.track && r.track.kind === 'audio');
    
    if (!audioReceiver || !audioReceiver.track) {
      console.log('⏳ [AUDIO RELAY FIX] Waiting for remote audio track...');
      return;
    }
    
    console.log('✅ [AUDIO RELAY FIX] Found remote audio track');
    
    // Stop checking
    clearInterval(checkAndInstall);
    
    // Create audio context and worklet
    const audioContext = new AudioContext({ sampleRate: 24000 });
    const stream = new MediaStream([audioReceiver.track]);
    const source = audioContext.createMediaStreamSource(stream);
    
    // Load the audio tap processor
    audioContext.audioWorklet.addModule('/audio-tap-processor.js')
      .then(() => {
        const workletNode = new AudioWorkletNode(audioContext, 'audio-tap-processor');
        source.connect(workletNode);
        
        let chunkCount = 0;
        
        // Handle PCM chunks from worklet
        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'PCM_CHUNK') {
            // Convert ArrayBuffer to base64
            const uint8Array = new Uint8Array(event.data.data);
            let binaryString = '';
            for (let i = 0; i < uint8Array.length; i++) {
              binaryString += String.fromCharCode(uint8Array[i]);
            }
            const base64Data = btoa(binaryString);
            
            // Send to backend WebSocket
            if (roomWs.readyState === WebSocket.OPEN) {
              roomWs.send(JSON.stringify({
                type: 'RELAY_AUDIO_CHUNK',
                chunk: base64Data,
                responseId: event.data.responseId,
                fromParticipant: participantId,
                sessionId: sessionId,
                seq: event.data.sequenceNumber,
                timestamp: Date.now()
              }));
              
              chunkCount++;
              if (chunkCount % 10 === 0) {
                console.log(`🎤 [AUDIO RELAY FIX] Sent ${chunkCount} chunks to backend`);
              }
            }
          }
        };
        
        // Start capturing
        const responseId = `response_${Date.now()}`;
        workletNode.port.postMessage({
          type: 'START_CAPTURE',
          responseId: responseId
        });
        
        console.log('✅ [AUDIO RELAY FIX] Audio relay is now active!');
        console.log('🎤 Speak now and audio should be relayed to the backend');
        
        // Store for cleanup
        window.audioRelayFix = {
          audioContext,
          workletNode,
          stop: () => {
            workletNode.port.postMessage({ type: 'STOP_CAPTURE' });
            workletNode.disconnect();
            audioContext.close();
            console.log('⏹️ [AUDIO RELAY FIX] Stopped');
          }
        };
      })
      .catch(error => {
        console.error('❌ [AUDIO RELAY FIX] Failed to load worklet:', error);
      });
    
  }, 1000);
  
  // Stop checking after 30 seconds
  setTimeout(() => {
    clearInterval(checkAndInstall);
    console.log('⏱️ [AUDIO RELAY FIX] Timeout - could not install patch');
  }, 30000);
  
  console.log('🔧 [AUDIO RELAY FIX] Patch installer running...');
  console.log('   Waiting for WebSocket, session, and audio track...');
})();

// To stop the relay later, run: window.audioRelayFix.stop()
