# NeuralEcho - Real-Time Translation Architecture

## Overview

NeuralEcho is a real-time voice translation application that enables phone-call-like conversations between two participants speaking different languages (English ↔ French). The system uses a **backend-managed architecture** where the server handles all OpenAI connections and audio routing.

## Technology Stack

### Frontend
- **React + TypeScript** - UI framework
- **Vite** - Build tool
- **WebSocket** - Real-time bidirectional communication
- **Web Audio API** - Microphone capture and audio playback
  - `AudioWorkletNode` - Low-latency audio processing
  - `AudioContext` - Audio playback and scheduling

### Backend
- **Node.js + Express** - HTTP server
- **ws** - WebSocket server
- **OpenAI Realtime API** - Speech-to-speech translation
  - Transcription (speech → text)
  - Translation (text → text)
  - Text-to-Speech (text → audio)

### Deployment
- **Frontend**: Vercel
- **Backend**: Render.com
- **Environment**: Production-ready with CORS and WebSocket support

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER A (English)                             │
│                                                                       │
│  Browser                                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Microphone Capture                                        │  │
│  │     ↓                                                          │  │
│  │  useMicStream Hook                                            │  │
│  │     • AudioWorkletNode (mic-input-processor.js)              │  │
│  │     • Converts Float32 → PCM16                                │  │
│  │     • Encodes to Base64                                       │  │
│  │     ↓                                                          │  │
│  │  WebSocket Client                                             │  │
│  │     • Sends: { type: 'MIC_AUDIO', audioData: 'base64...' }  │  │
│  │     • Every ~5ms (continuous streaming)                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ WebSocket
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVER                               │
│                      (Node.js + Express + ws)                        │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  2. Session Management                                        │  │
│  │                                                                │  │
│  │  When User A joins:                                           │  │
│  │    • Create session                                           │  │
│  │    • Store participant info                                   │  │
│  │                                                                │  │
│  │  When User B joins (2nd participant):                         │  │
│  │    • Initialize OpenAI Session A (EN → FR)                   │  │
│  │    • Initialize OpenAI Session B (FR → EN)                   │  │
│  │    • Send 'translation_ready' to both participants           │  │
│  │    • Mic auto-starts on frontend                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  3. Audio Routing                                             │  │
│  │                                                                │  │
│  │  Receive MIC_AUDIO from User A:                              │  │
│  │    ↓                                                           │  │
│  │  Forward to OpenAI Session A (EN → FR)                       │  │
│  │    • OpenAI transcribes: "Hello"                              │  │
│  │    • OpenAI translates: "Bonjour"                             │  │
│  │    • OpenAI generates TTS audio (French voice)                │  │
│  │    ↓                                                           │  │
│  │  Receive from OpenAI:                                         │  │
│  │    • response.audio.delta (audio chunks)                      │  │
│  │    • conversation.item.input_audio_transcription.completed    │  │
│  │    • response.audio_transcript.done                           │  │
│  │    ↓                                                           │  │
│  │  Route to correct participant:                                │  │
│  │    • TRANSLATED_AUDIO_CHUNK → User B (French audio)          │  │
│  │    • MY_TRANSCRIPT → User A ("Hello")                         │  │
│  │    • INCOMING_TRANSCRIPT → User B ("Bonjour")                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ WebSocket
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         USER B (French)                              │
│                                                                       │
│  Browser                                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  4. Audio Playback                                            │  │
│  │                                                                │  │
│  │  WebSocket Client receives:                                   │  │
│  │    { type: 'TRANSLATED_AUDIO_CHUNK',                         │  │
│  │      audioData: 'base64...',                                  │  │
│  │      chunkId: 'chunk_A_123',                                  │  │
│  │      speakerId: 'user_a' }                                    │  │
│  │    ↓                                                           │  │
│  │  useTranslationAudio Hook                                     │  │
│  │    • Decodes Base64 → PCM16 → Float32                        │  │
│  │    • Deduplicates using chunkId                               │  │
│  │    • Queues audio with AudioContext                           │  │
│  │    • Plays smoothly without gaps                              │  │
│  │    ↓                                                           │  │
│  │  Speaker Output                                               │  │
│  │    • User B hears "Bonjour" in French                         │  │
│  │                                                                │  │
│  │  5. Transcript Display                                        │  │
│  │                                                                │  │
│  │  Receives: { type: 'INCOMING_TRANSCRIPT',                    │  │
│  │             text: 'Bonjour',                                  │  │
│  │             speakerId: 'user_a' }                             │  │
│  │    ↓                                                           │  │
│  │  useChatroomConnection Hook                                   │  │
│  │    • Pairs transcripts by speakerId + timestamp               │  │
│  │    • Displays in chat bubble                                  │  │
│  │    • User B sees "Bonjour" (translation)                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Pipeline

### 1. Session Initialization

```
User A joins room
  ↓
Frontend → Backend: { type: 'join_session', userId, language: 'en-US' }
  ↓
Backend: Store participant A in session
  ↓
Backend → Frontend A: { type: 'USER_JOINED_ROOM', participantCount: 1 }

User B joins same room
  ↓
Frontend → Backend: { type: 'join_session', userId, language: 'fr-CA' }
  ↓
Backend: Store participant B in session
  ↓
Backend: Initialize TWO OpenAI WebSocket sessions:
  • Session A: EN → FR (for User A's speech)
  • Session B: FR → EN (for User B's speech)
  ↓
Backend → Frontend A & B: { type: 'translation_ready', participantCount: 2 }
  ↓
Frontend: Auto-start microphone streaming
```

### 2. Audio Streaming (User A speaks English)

```
User A Microphone
  ↓
AudioWorkletNode (mic-input-processor.js)
  • Captures audio at 24kHz, mono
  • Converts Float32 → Int16 (PCM16)
  • Runs every ~128 samples (~5ms)
  ↓
useMicStream Hook
  • Receives PCM16 buffer
  • Encodes to Base64
  • Sends via WebSocket
  ↓
Frontend → Backend: { type: 'MIC_AUDIO', audioData: 'base64...' }
  ↓
Backend: Decode Base64 → PCM16
  ↓
Backend → OpenAI Session A: { type: 'input_audio_buffer.append', audio: 'base64...' }
```

### 3. OpenAI Processing

```
OpenAI Realtime API (Session A: EN → FR)
  ↓
1. Speech-to-Text (Transcription)
   • Listens to audio stream
   • Detects speech boundaries
   • Transcribes: "Hello, how are you?"
   ↓
   Event: conversation.item.input_audio_transcription.completed
   { transcript: "Hello, how are you?" }
   ↓
2. Translation
   • System prompt: "Translate English to French"
   • Translates: "Bonjour, comment allez-vous?"
   ↓
   Event: response.audio_transcript.done
   { transcript: "Bonjour, comment allez-vous?" }
   ↓
3. Text-to-Speech (TTS)
   • Generates French audio
   • Streams in chunks
   ↓
   Events: response.audio.delta (multiple)
   { delta: 'base64_audio_chunk...' }
```

### 4. Backend Routing

```
Backend receives from OpenAI Session A:
  ↓
Event: response.audio.delta
  ↓
Backend → Frontend B (User B): 
  { type: 'TRANSLATED_AUDIO_CHUNK',
    audioData: 'base64...',
    chunkId: 'chunk_A_123',
    speakerId: 'user_a',
    timestamp: 1234567890 }
  ↓
Event: conversation.item.input_audio_transcription.completed
  ↓
Backend → Frontend A (User A):
  { type: 'MY_TRANSCRIPT',
    text: 'Hello, how are you?',
    speakerId: 'user_a',
    timestamp: 1234567890 }
  ↓
Event: response.audio_transcript.done
  ↓
Backend → Frontend B (User B):
  { type: 'INCOMING_TRANSCRIPT',
    text: 'Bonjour, comment allez-vous?',
    speakerId: 'user_a',
    timestamp: 1234567890 }
```

### 5. Frontend Playback (User B)

```
Frontend B receives: TRANSLATED_AUDIO_CHUNK
  ↓
useTranslationAudio Hook
  ↓
1. Deduplication
   • Check if chunkId already seen
   • Skip if duplicate
   ↓
2. Decode Audio
   • Base64 → Uint8Array
   • Uint8Array → Int16Array (PCM16)
   • Int16Array → Float32Array (normalize to [-1, 1])
   ↓
3. Create Audio Buffer
   • AudioContext.createBuffer(1 channel, samples, 24000 Hz)
   • Copy Float32Array to buffer
   ↓
4. Schedule Playback
   • AudioBufferSourceNode.start(nextStartTime)
   • Update nextStartTime += buffer.duration
   • Ensures gapless playback
   ↓
User B Speaker
  • Hears "Bonjour, comment allez-vous?" in French
```

### 6. Transcript Display

```
Frontend B receives: INCOMING_TRANSCRIPT
  ↓
useChatroomConnection Hook
  ↓
1. Pair Transcripts
   • Generate msgId: `transcript_${speakerId}_${Math.floor(timestamp / 2000)}`
   • 2-second time window for pairing
   ↓
2. Update Messages State
   • If msgId exists: Update with translation
   • If new: Create new message
   ↓
3. Display in Chat
   • User B sees: "Bonjour, comment allez-vous?"
   • Shown in chat bubble (translated text)
```

---

## Key Components

### Frontend Hooks

#### `useMicStream.ts`
```typescript
// Captures microphone audio and streams to backend
export function useMicStream({ onAudioData, enabled }: UseMicStreamOptions) {
  // Setup AudioContext and AudioWorklet
  // Capture mic → PCM16 → Base64
  // Call onAudioData(base64) every ~5ms
}
```

**Features:**
- Uses `AudioWorkletNode` for low-latency capture
- Converts Float32 → PCM16 → Base64
- Auto-starts when `enabled` is true
- Continuous streaming (no VAD on frontend)

#### `useTranslationAudio.ts`
```typescript
// Plays translated audio chunks from backend
export function useTranslationAudio() {
  // Decode Base64 → PCM16 → Float32
  // Deduplicate using chunkId
  // Queue and play with AudioContext
}
```

**Features:**
- Deduplication prevents audio doubling
- Queue overflow protection (drops if >600ms ahead)
- Gapless playback using scheduled start times
- Handles Base64 → Float32 conversion

#### `useChatroomConnection.ts`
```typescript
// Manages WebSocket connection and message handling
export function useChatroomConnection({ roomId, participant, onEvent }) {
  // Connect to backend WebSocket
  // Handle events: translation_ready, TRANSLATED_AUDIO_CHUNK, MY_TRANSCRIPT, etc.
  // Integrate useMicStream and useTranslationAudio
  // Manage messages state
}
```

**Features:**
- WebSocket connection management
- Event routing and handling
- Integrates mic streaming and audio playback
- Transcript pairing (prevents duplicates)
- Auto-starts mic on `translation_ready`

### Backend Functions

#### `createOpenAISession(inputLang, outputLang)`
```javascript
// Creates OpenAI Realtime API WebSocket connection
// Configures for speech-to-speech translation
// Returns WebSocket instance
```

**Configuration:**
- Model: `gpt-4o-realtime-preview-2024-12-17`
- Modalities: `['text', 'audio']`
- Voice: `alloy`
- Input audio: PCM16, 24kHz, mono
- Output audio: PCM16, 24kHz, mono
- Turn detection: Server VAD enabled
- Instructions: Translation prompt (EN↔FR)

#### `wireOpenAIOutput(openaiWs, targetParticipant, session, speakerId)`
```javascript
// Routes OpenAI events to correct frontend participant
// Handles: audio.delta, transcription.completed, audio_transcript.done
// Sends: TRANSLATED_AUDIO_CHUNK, MY_TRANSCRIPT, INCOMING_TRANSCRIPT
```

**Event Mapping:**
- `response.audio.delta` → `TRANSLATED_AUDIO_CHUNK` (to listener)
- `conversation.item.input_audio_transcription.completed` → `MY_TRANSCRIPT` (to speaker)
- `response.audio_transcript.done` → `INCOMING_TRANSCRIPT` (to listener)

#### `join_session` Handler
```javascript
// Handles participant joining
// When 2nd participant joins:
//   1. Create OpenAI Session A (participant A's language → participant B's language)
//   2. Create OpenAI Session B (participant B's language → participant A's language)
//   3. Wire outputs to correct participants
//   4. Send translation_ready event
```

#### `MIC_AUDIO` Handler
```javascript
// Receives mic audio from frontend
// Forwards to correct OpenAI session
// Base64 → Buffer → OpenAI WebSocket
```

---

## Message Types

### Frontend → Backend

#### `join_session`
```json
{
  "type": "join_session",
  "sessionId": "room_123",
  "userId": "user_a",
  "language": "en-US",
  "name": "Alice"
}
```

#### `MIC_AUDIO`
```json
{
  "type": "MIC_AUDIO",
  "audioData": "base64_pcm16_audio..."
}
```

### Backend → Frontend

#### `translation_ready`
```json
{
  "type": "translation_ready",
  "message": "Translation session ready",
  "participantCount": 2,
  "otherParticipant": {
    "id": "user_b",
    "name": "Bob",
    "language": "fr-CA"
  }
}
```

#### `TRANSLATED_AUDIO_CHUNK`
```json
{
  "type": "TRANSLATED_AUDIO_CHUNK",
  "audioData": "base64_pcm16_audio...",
  "chunkId": "chunk_user_a_123",
  "speakerId": "user_a",
  "timestamp": 1234567890
}
```

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

---

## Audio Format Specifications

### Microphone Capture
- **Sample Rate**: 24,000 Hz
- **Channels**: 1 (mono)
- **Format**: PCM16 (16-bit signed integer)
- **Encoding**: Base64 string
- **Chunk Size**: ~128 samples (~5ms at 24kHz)

### OpenAI Input/Output
- **Sample Rate**: 24,000 Hz
- **Channels**: 1 (mono)
- **Format**: PCM16
- **Encoding**: Base64 string
- **Turn Detection**: Server-side VAD

### Audio Playback
- **Sample Rate**: 24,000 Hz
- **Channels**: 1 (mono)
- **Format**: Float32 (normalized to [-1, 1])
- **Buffering**: Gapless scheduling with AudioContext

---

## Latency Optimization

### Frontend
1. **AudioWorklet**: Low-latency audio processing (runs on separate thread)
2. **Continuous Streaming**: No buffering, sends audio every ~5ms
3. **Gapless Playback**: Pre-scheduled audio chunks prevent gaps
4. **Deduplication**: Prevents processing same chunk twice

### Backend
1. **Direct Forwarding**: Minimal processing, just route audio
2. **WebSocket**: Low-latency bidirectional communication
3. **Keepalive Ping**: Prevents connection timeouts (every 30s)
4. **Efficient Routing**: O(1) participant lookup

### OpenAI
1. **Streaming**: Audio processed in real-time chunks
2. **Server VAD**: Automatic speech detection
3. **Low-latency Model**: Optimized for real-time use

**Total Latency**: ~500-800ms (mic → speaker)
- Mic capture: ~5ms
- Network (frontend → backend): ~50-100ms
- OpenAI processing: ~300-500ms
- Network (backend → frontend): ~50-100ms
- Audio playback: ~10-20ms

---

## Error Handling

### Connection Errors
- **Frontend**: Auto-reconnect on unexpected disconnect
- **Backend**: Graceful cleanup on client disconnect
- **OpenAI**: Notify participant if session closes

### Audio Errors
- **Deduplication**: Prevents duplicate audio playback
- **Queue Overflow**: Drops chunks if queue >600ms ahead
- **Decode Errors**: Logged and skipped

### Session Errors
- **Participant Limit**: Max 2 participants per room
- **Language Validation**: Only EN-US and FR-CA supported
- **Session Timeout**: Cleanup after inactivity

---

## Deployment

### Frontend (Vercel)
```bash
cd frontend
npm run build
# Deploy to Vercel
```

**Environment Variables:**
- `VITE_WS_URL`: Backend WebSocket URL (wss://neural-ix2j.onrender.com)
- `VITE_APP_BASE_URL`: Frontend URL for shareable links

### Backend (Render.com)
```bash
cd backend
npm install
npm start
```

**Environment Variables:**
- `OPENAI_API_KEY`: OpenAI API key
- `PORT`: Server port (default: 3000)
- `FRONTEND_URL`: Frontend URL for CORS

**Render Configuration:**
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/health` endpoint

---

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
2. Tab 1: Select English, create/join room
3. Tab 2: Select French, join same room
4. Both see "Live translation active" status
5. English speaker says "Hello" → French speaker hears "Bonjour"
6. French speaker says "Merci" → English speaker hears "Thank you"
7. Transcripts appear correctly in chat bubbles

### Verification Checklist
- [ ] No WebRTC errors in console
- [ ] No duplicate audio playback
- [ ] Transcripts paired correctly (no duplicate bubbles)
- [ ] Audio quality is clear
- [ ] Latency is acceptable (<1 second)
- [ ] Mic auto-starts when both participants join
- [ ] Connection survives network interruptions

---

## Future Enhancements

### Planned Features
1. **Multi-language Support**: Add more language pairs
2. **Group Calls**: Support >2 participants
3. **Recording**: Save conversation transcripts and audio
4. **Quality Metrics**: Display latency and audio quality
5. **Mobile Support**: Optimize for mobile browsers

### Performance Improvements
1. **Adaptive Bitrate**: Adjust audio quality based on network
2. **Jitter Buffer**: Smooth out network variations
3. **Echo Cancellation**: Improve audio quality
4. **Noise Suppression**: Filter background noise

---

## Troubleshooting

### No Audio Playback
- Check browser autoplay policy (user gesture required)
- Verify WebSocket connection is open
- Check console for audio decode errors

### Mic Not Working
- Check browser microphone permissions
- Verify AudioWorklet loaded correctly
- Check `translation_ready` event received

### High Latency
- Check network connection quality
- Verify backend is not overloaded
- Check OpenAI API status

### Duplicate Audio
- Verify deduplication is working (check `chunkId`)
- Check for multiple WebSocket connections
- Verify only one `useTranslationAudio` instance

---

## License

MIT License - See LICENSE file for details

## Contact

For questions or support, please open an issue on GitHub.
