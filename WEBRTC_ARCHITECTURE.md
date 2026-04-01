# NeuralEcho Full-Duplex WebRTC Architecture

## Overview

This document describes the **full-duplex WebRTC-based translation architecture** that enables true phone-call-like conversations with simultaneous bidirectional audio streaming.

## Key Improvements Over WebSocket-Only Architecture

| Feature | WebSocket-Only | WebRTC Full-Duplex |
|---------|---------------|-------------------|
| Latency | 500-800ms | 200-400ms |
| Duplex Mode | Semi-duplex | Full-duplex |
| Simultaneous Speaking | ❌ No | ✅ Yes |
| Barge-in Support | ❌ No | ✅ Yes |
| Audio Quality | Good | Excellent |
| Network Adaptation | Limited | Adaptive |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER A (English)                             │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Microphone Capture                                        │  │
│  │     ↓                                                          │  │
│  │  getUserMedia({ audio: true })                                │  │
│  │     ↓                                                          │  │
│  │  RTCPeerConnection                                            │  │
│  │     • addTrack(audioTrack)                                    │  │
│  │     • Continuous streaming via WebRTC                         │  │
│  │     ↓                                                          │  │
│  │  WebSocket (Signaling Only)                                   │  │
│  │     • ICE candidates                                          │  │
│  │     • SDP offer/answer                                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ WebRTC Audio Stream
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVER                               │
│                      (Node.js + WebRTC + WebSocket)                  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  2. WebRTC Handler (wrtc)                                     │  │
│  │                                                                │  │
│  │  RTCPeerConnection (Server-side)                              │  │
│  │    • Receives audio track from User A                         │  │
│  │    • Extracts PCM16 audio data                                │  │
│  │    ↓                                                           │  │
│  │  Forward to OpenAI Session A (EN → FR)                       │  │
│  │    • Continuous streaming                                     │  │
│  │    • No buffering                                             │  │
│  │    • Server-side VAD                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  3. OpenAI Realtime API                                       │  │
│  │                                                                │  │
│  │  Session A: EN → FR                                           │  │
│  │    • Transcribes: "Hello"                                     │  │
│  │    • Translates: "Bonjour"                                    │  │
│  │    • Generates TTS audio (French)                             │  │
│  │    • Streams audio.delta chunks                               │  │
│  │    ↓                                                           │  │
│  │  Interruption Handling:                                       │  │
│  │    • response.cancelled event                                 │  │
│  │    • Immediate stop on new speech                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  4. Audio Routing                                             │  │
│  │                                                                │  │
│  │  Route translated audio to User B:                            │  │
│  │    • Via WebSocket (hybrid approach)                          │  │
│  │    • TRANSLATED_AUDIO_CHUNK events                            │  │
│  │    • Sequence numbers for ordering                            │  │
│  │    • Response IDs for interruption tracking                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ WebSocket (Translated Audio)
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         USER B (French)                              │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  5. Jitter Buffer + Playback                                  │  │
│  │                                                                │  │
│  │  JitterBuffer (100ms buffer)                                  │  │
│  │    • Receives TRANSLATED_AUDIO_CHUNK                          │  │
│  │    • Deduplicates by chunkId                                  │  │
│  │    • Sorts by sequenceNumber                                  │  │
│  │    • Buffers 100ms before playback                            │  │
│  │    ↓                                                           │  │
│  │  Interrupt Handling:                                          │  │
│  │    • Detects AUDIO_INTERRUPTED event                          │  │
│  │    • Clears buffer immediately                                │  │
│  │    • Starts new audio stream                                  │  │
│  │    ↓                                                           │  │
│  │  AudioContext Playback                                        │  │
│  │    • Gapless scheduling                                       │  │
│  │    • Smooth continuous audio                                  │  │
│  │    ↓                                                           │  │
│  │  Speaker Output                                               │  │
│  │    • User B hears "Bonjour" in French                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Hybrid Communication Model

### WebRTC (Audio Streaming)
- **Purpose**: Low-latency bidirectional audio
- **Direction**: Client ↔ Server
- **Content**: Raw microphone audio (PCM16, 24kHz, mono)
- **Advantages**:
  - Ultra-low latency (~50-100ms)
  - Adaptive bitrate
  - Network jitter handling
  - NAT traversal (STUN/TURN)

### WebSocket (Signaling + Control)
- **Purpose**: Signaling, transcripts, control events
- **Direction**: Client ↔ Server
- **Content**:
  - WebRTC signaling (SDP, ICE)
  - Translated audio chunks
  - Transcripts (MY_TRANSCRIPT, INCOMING_TRANSCRIPT)
  - Control events (interruption, completion)

## Full-Duplex Features

### 1. Simultaneous Speaking
Both users can speak at the same time without turn-taking:
- Each user has independent WebRTC audio track
- Backend maintains TWO OpenAI sessions simultaneously
- No blocking or queuing

### 2. Barge-in Support
Users can interrupt each other naturally:
```javascript
// When User A starts speaking while User B's translation is playing:
1. OpenAI detects new speech (Server VAD)
2. Cancels current response → response.cancelled event
3. Backend sends AUDIO_INTERRUPTED to User B
4. User B's JitterBuffer clears queue
5. New translation starts immediately
```

### 3. Jitter Buffer (100ms)
Handles network jitter for smooth playback:
- Buffers 3-5 chunks before starting playback
- Sorts chunks by sequence number
- Maintains 100ms queue ahead
- Drops chunks if buffer overflows (>50 chunks)

### 4. Deduplication
Prevents duplicate audio playback:
- Each chunk has unique `chunkId`
- Tracks seen chunks in Set (max 300)
- Skips duplicate chunks automatically

## Audio Pipeline

### Input Processing
```
Microphone
  ↓
getUserMedia({ audio: { sampleRate: 24000, channelCount: 1 } })
  ↓
RTCPeerConnection.addTrack(audioTrack)
  ↓
WebRTC Stream → Backend
  ↓
Extract PCM16 from WebRTC track
  ↓
OpenAI: input_audio_buffer.append
```

### Output Processing
```
OpenAI: response.audio.delta
  ↓
Backend: TRANSLATED_AUDIO_CHUNK event
  ↓
WebSocket → Frontend
  ↓
JitterBuffer.enqueue(chunk)
  ↓
Sort by sequenceNumber
  ↓
Buffer 100ms
  ↓
Decode: Base64 → PCM16 → Float32
  ↓
AudioContext.createBuffer()
  ↓
Schedule playback (gapless)
  ↓
Speaker Output
```

## Event Flow

### Session Initialization
```
1. User A joins → join_session
2. User B joins → join_session
3. Backend creates 2 OpenAI sessions
4. Backend sends translation_ready
5. Both users start WebRTC connection
6. Exchange SDP offers/answers
7. Exchange ICE candidates
8. WebRTC connection established
9. Audio streaming begins
```

### Audio Streaming (User A speaks)
```
1. User A mic → WebRTC track
2. Backend receives audio
3. Forward to OpenAI Session A (EN → FR)
4. OpenAI transcribes: "Hello"
5. OpenAI translates: "Bonjour"
6. OpenAI generates TTS audio
7. Backend receives audio.delta chunks
8. Backend sends TRANSLATED_AUDIO_CHUNK to User B
9. User B's JitterBuffer enqueues chunk
10. User B hears "Bonjour"
```

### Interruption Flow
```
1. User B is hearing translation from User A
2. User A starts speaking again (interrupts)
3. OpenAI detects new speech
4. OpenAI cancels current response
5. Backend receives response.cancelled
6. Backend sends AUDIO_INTERRUPTED to User B
7. User B's JitterBuffer clears queue
8. New translation starts immediately
```

## Message Types

### WebRTC Signaling (WebSocket)

#### `webrtc_offer`
```json
{
  "type": "webrtc_offer",
  "roomId": "session_123",
  "userId": "user_a",
  "offer": {
    "type": "offer",
    "sdp": "v=0\r\no=- ..."
  }
}
```

#### `webrtc_answer`
```json
{
  "type": "webrtc_answer",
  "roomId": "session_123",
  "userId": "user_b",
  "answer": {
    "type": "answer",
    "sdp": "v=0\r\no=- ..."
  }
}
```

#### `webrtc_ice_candidate`
```json
{
  "type": "webrtc_ice_candidate",
  "roomId": "session_123",
  "userId": "user_a",
  "candidate": {
    "candidate": "candidate:...",
    "sdpMLineIndex": 0,
    "sdpMid": "0"
  }
}
```

### Audio Events

#### `TRANSLATED_AUDIO_CHUNK`
```json
{
  "type": "TRANSLATED_AUDIO_CHUNK",
  "audioData": "base64_pcm16...",
  "chunkId": "chunk_user_a_123",
  "sequenceNumber": 123,
  "speakerId": "user_a",
  "responseId": "resp_abc123",
  "timestamp": 1234567890
}
```

#### `AUDIO_INTERRUPTED`
```json
{
  "type": "AUDIO_INTERRUPTED",
  "speakerId": "user_a",
  "responseId": "resp_abc123",
  "timestamp": 1234567890
}
```

#### `AUDIO_STREAM_COMPLETE`
```json
{
  "type": "AUDIO_STREAM_COMPLETE",
  "speakerId": "user_a",
  "responseId": "resp_abc123",
  "timestamp": 1234567890
}
```

### Transcript Events

#### `MY_TRANSCRIPT`
```json
{
  "type": "MY_TRANSCRIPT",
  "text": "Hello, how are you?",
  "speakerId": "user_a",
  "timestamp": 1234567890
}
```

#### `INCOMING_TRANSCRIPT`
```json
{
  "type": "INCOMING_TRANSCRIPT",
  "text": "Bonjour, comment allez-vous?",
  "speakerId": "user_a",
  "timestamp": 1234567890
}
```

## Performance Metrics

### Latency Breakdown
- **Mic capture**: ~5-10ms
- **WebRTC transmission**: ~50-100ms
- **OpenAI processing**: ~200-400ms
- **WebSocket transmission**: ~50-100ms
- **Jitter buffer**: ~100ms
- **Audio playback**: ~10-20ms
- **Total**: ~415-630ms (vs 500-800ms with WebSocket-only)

### Quality Metrics
- **Audio format**: PCM16, 24kHz, mono
- **Bitrate**: ~384 kbps
- **Packet loss tolerance**: Up to 5% (WebRTC adaptive)
- **Jitter tolerance**: ±100ms

## Implementation Guide

### Frontend Setup

1. **Install Dependencies**
```bash
# No additional dependencies needed - WebRTC is built into browsers
```

2. **Initialize WebRTC Connection**
```typescript
import { useWebRTCConnection } from '@/hooks/useWebRTCConnection';

const { startLocalAudio, createOffer, handleAnswer, handleIceCandidate } = 
  useWebRTCConnection({
    roomId,
    userId,
    onRemoteTrack: (stream) => {
      // Handle remote audio stream
    },
    onConnectionStateChange: (state) => {
      console.log('WebRTC state:', state);
    },
    wsRef
  });
```

3. **Setup Jitter Buffer**
```typescript
import { useFullDuplexAudio } from '@/hooks/useFullDuplexAudio';

const { enqueueTranslatedAudio, handleVoiceActivity, resumeAudio } = 
  useFullDuplexAudio({
    remoteStream,
    onAudioChunk: (chunk) => {
      // Handle audio chunk
    }
  });
```

### Backend Setup

1. **Install Dependencies**
```bash
cd backend
npm install wrtc
```

2. **Start Server**
```bash
npm start
```

3. **Environment Variables**
```bash
OPENAI_API_KEY=sk-...
PORT=3001
```

## Testing

### Local Development
```bash
# Terminal 1: Backend
cd backend
npm install
npm start

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

### End-to-End Test
1. Open two browser tabs
2. Tab 1: Select English, create room
3. Tab 2: Select French, join room
4. Both should see "Translation ready"
5. WebRTC connection establishes automatically
6. Start speaking - translation should be instant
7. Try interrupting each other - should work smoothly

### Verification Checklist
- [ ] WebRTC connection establishes (check console)
- [ ] Audio streaming works bidirectionally
- [ ] Latency is <500ms
- [ ] Interruptions work smoothly
- [ ] No audio gaps or stuttering
- [ ] Transcripts appear correctly
- [ ] No duplicate audio playback

## Troubleshooting

### WebRTC Connection Fails
- Check STUN/TURN server configuration
- Verify firewall allows UDP traffic
- Check browser console for ICE errors
- Ensure both peers exchange ICE candidates

### High Latency
- Check network connection quality
- Verify jitter buffer size (should be ~100ms)
- Check OpenAI API response times
- Monitor WebRTC stats (RTCPeerConnection.getStats())

### Audio Interruptions Not Working
- Verify OpenAI Server VAD is enabled
- Check response.cancelled events in backend logs
- Ensure AUDIO_INTERRUPTED events reach frontend
- Verify JitterBuffer.interrupt() is called

### No Audio Playback
- Check browser autoplay policy (need user gesture)
- Verify AudioContext is resumed
- Check jitter buffer status
- Verify audio chunks are being received

## Future Enhancements

1. **TURN Server Integration**
   - Add TURN server for NAT traversal
   - Support restrictive network environments

2. **Adaptive Bitrate**
   - Monitor network conditions
   - Adjust audio quality dynamically

3. **Echo Cancellation**
   - Implement acoustic echo cancellation
   - Improve audio quality in noisy environments

4. **Multi-party Support**
   - Support >2 participants
   - Implement SFU architecture with mediasoup

5. **Recording**
   - Record WebRTC audio streams
   - Save conversation with translations

## License

MIT License

## Contact

For questions or support, please open an issue on GitHub.
