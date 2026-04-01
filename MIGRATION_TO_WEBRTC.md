# Migration Guide: WebSocket → WebRTC Full-Duplex

This guide explains how to migrate from the current WebSocket-based architecture to the new WebRTC full-duplex system.

## Why Migrate?

| Benefit | Impact |
|---------|--------|
| **Lower Latency** | 200-400ms vs 500-800ms |
| **Full Duplex** | Both users can speak simultaneously |
| **Barge-in Support** | Natural interruptions work |
| **Better Quality** | Adaptive bitrate, jitter handling |
| **Phone-like Experience** | True real-time conversation |

## Migration Steps

### Phase 1: Backend Setup

#### 1.1 Install Dependencies
```bash
cd backend
npm install wrtc
```

#### 1.2 Add WebRTC Handler
The new `webrtc-handler.js` file is already created. It provides:
- `WebRTCHandler` class for managing peer connections
- `WebRTCSessionManager` for session management
- Audio extraction from WebRTC tracks
- Integration with OpenAI

#### 1.3 Update Backend Entry Point
You have two options:

**Option A: Replace existing backend**
```bash
# Backup current backend
cp backend/index.js backend/index-websocket-backup.js

# Use new WebRTC backend
cp backend/index-webrtc.js backend/index.js
```

**Option B: Run side-by-side (recommended for testing)**
```bash
# Keep current backend on port 3001
# Run WebRTC backend on port 3002
PORT=3002 node backend/index-webrtc.js
```

### Phase 2: Frontend Setup

#### 2.1 Add New Hooks
The following hooks are already created:
- `useWebRTCConnection.ts` - WebRTC peer connection management
- `useFullDuplexAudio.ts` - Full-duplex audio handling
- `JitterBuffer.ts` - Jitter buffer for smooth playback

#### 2.2 Update ChatroomInterface Component

Replace the current audio streaming logic:

**Before (WebSocket-based):**
```typescript
// OLD: useMicStream sends audio via WebSocket
useMicStream({
  enabled: micEnabled && isConnected,
  onAudioData: (base64) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'MIC_AUDIO',
        audioData: base64
      }));
    }
  }
});
```

**After (WebRTC-based):**
```typescript
// NEW: WebRTC handles audio streaming
const { 
  startLocalAudio, 
  createOffer, 
  handleAnswer, 
  handleIceCandidate,
  isConnected: webrtcConnected 
} = useWebRTCConnection({
  roomId,
  userId: participant.id,
  onRemoteTrack: (stream) => {
    console.log('Received remote audio stream');
    setRemoteStream(stream);
  },
  onConnectionStateChange: (state) => {
    console.log('WebRTC state:', state);
  },
  wsRef
});

// Start WebRTC when translation is ready
useEffect(() => {
  if (translationReady && !webrtcConnected) {
    startLocalAudio().then(() => {
      createOffer();
    });
  }
}, [translationReady, webrtcConnected]);
```

#### 2.3 Update Audio Playback

**Before (useTranslationAudio):**
```typescript
const translationAudio = useTranslationAudio();

// Handle TRANSLATED_AUDIO_CHUNK
translationAudio.enqueueChunk(data.audioData, data.chunkId);
```

**After (useFullDuplexAudio with JitterBuffer):**
```typescript
const { 
  enqueueTranslatedAudio, 
  handleVoiceActivity,
  resumeAudio 
} = useFullDuplexAudio({
  remoteStream,
  onAudioChunk: (chunk) => {
    console.log('Audio chunk processed');
  }
});

// Handle TRANSLATED_AUDIO_CHUNK with sequence numbers
enqueueTranslatedAudio(
  data.audioData, 
  data.chunkId, 
  data.sequenceNumber,
  data.speakerId
);

// Handle interruptions
if (data.type === 'AUDIO_INTERRUPTED') {
  // JitterBuffer automatically clears on speaker change
}
```

#### 2.4 Handle WebRTC Signaling

Add WebSocket message handlers for WebRTC signaling:

```typescript
// In useChatroomConnection.ts or similar

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'webrtc_offer':
      // Received offer from other peer
      handleWebRTCOffer(data.offer, data.fromUserId);
      break;
      
    case 'webrtc_answer':
      // Received answer from other peer
      handleAnswer(data.answer);
      break;
      
    case 'webrtc_ice_candidate':
      // Received ICE candidate
      handleIceCandidate(data.candidate);
      break;
      
    case 'TRANSLATED_AUDIO_CHUNK':
      // Translated audio from OpenAI
      enqueueTranslatedAudio(
        data.audioData,
        data.chunkId,
        data.sequenceNumber,
        data.speakerId
      );
      break;
      
    case 'AUDIO_INTERRUPTED':
      // Handle interruption (automatic in JitterBuffer)
      console.log('Audio interrupted by', data.speakerId);
      break;
  }
};
```

### Phase 3: Testing

#### 3.1 Local Testing
```bash
# Terminal 1: Start WebRTC backend
cd backend
PORT=3002 node index-webrtc.js

# Terminal 2: Start frontend (update VITE_WS_URL)
cd frontend
VITE_WS_URL=ws://localhost:3002 npm run dev
```

#### 3.2 Test Scenarios

**Test 1: Basic Connection**
1. Open two browser tabs
2. Join same room with different languages
3. Verify WebRTC connection establishes
4. Check console for "WebRTC state: connected"

**Test 2: Audio Streaming**
1. User A speaks English
2. User B should hear French translation
3. Verify latency is <500ms
4. Check for smooth audio playback
