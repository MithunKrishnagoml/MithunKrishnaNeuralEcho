# NeuralEcho - Architecture & Working Pipeline

## Executive Summary

NeuralEcho is a real-time voice translation application enabling phone-call-like conversations between participants speaking different languages (English ↔ French). The system uses a **backend-managed architecture** where the Node.js server orchestrates OpenAI Realtime API connections and routes audio/transcripts between participants.

**Key Features:**
- Real-time speech-to-speech translation (<800ms latency)
- Dual-mode operation: Single-user translation & Multi-user chatroom
- Backend-managed OpenAI sessions for security
- Low-latency audio streaming with AudioWorklet
- Gapless audio playback with automatic interruption
- Live transcript display with bilingual support

---

## Technology Stack

### Frontend
- **React 18 + TypeScript** - UI framework with type safety
- **Vite 7** - Fast build tool and dev server
- **WebSocket (ws)** - Real-time bidirectional communication
- **Web Audio API** - Low-latency audio processing
  - `AudioWorkletNode` - Separate thread for audio processing
  - `AudioContext` - Audio scheduling and playback
  - Custom processors: `mic-input-processor.js`, `audio-tap-processor.js`, `audio-streaming-processor.js`
- **React Router** - Client-side routing
- **Radix UI + Tailwind CSS** - Component library and styling

### Backend
- **Node.js 18+ + Express** - HTTP server
- **ws (WebSocket library)** - WebSocket server
- **OpenAI Realtime API** - Speech-to-speech translation
  - Model: `gpt-4o-realtime-preview-2024-12-17`
  - Transcription: Whisper-1
  - Translation: GPT-4o
  - Text-to-Speech: Built-in TTS

### Deployment
- **Frontend**: Vercel (serverless)
- **Backend**: Render.com (persistent WebSocket server)
- **Environment**: Production-ready with CORS and SSL

---

## System Architecture


### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER A (English)                             │
│  Browser (React + TypeScript)                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Microphone Capture                                        │  │
│  │     • useMicStream Hook                                       │  │
│  │     • AudioWorkletNode (mic-input-processor.js)              │  │
│  │     • Float32 → PCM16 → Base64                                │  │
│  │     • Streams every ~20ms                                     │  │
│  │     ↓                                                          │  │
│  │  2. WebSocket Client                                          │  │
│  │     • Sends: MIC_AUDIO_CHUNK                                  │  │
│  │     • Receives: TRANSLATED_AUDIO_CHUNK, MY_TRANSCRIPT         │  │
│  │     ↓                                                          │  │
│  │  3. Audio Playback                                            │  │
│  │     • useLowLatencyAudio Hook                                 │  │
│  │     • AudioWorkletNode (low-latency-audio-processor.js)      │  │
│  │     • <200ms queue for real-time conversation                │  │
│  │     • Auto-interruption on new speech                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ WebSocket (wss://)
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND SERVER (Node.js)                          │
│                  Render.com - Persistent WebSocket                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Session Management                                           │  │
│  │  • TranslationSession class                                   │  │
│  │  • Participant tracking                                       │  │
│  │  • Message history                                            │  │
│  │  • Recording state                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  OpenAI Session Management                                    │  │
│  │  • Creates 2 WebSocket connections to OpenAI:                │  │
│  │    - Session A: EN → FR (User A's speech)                    │  │
│  │    - Session B: FR → EN (User B's speech)                    │  │
│  │  • Wires outputs to correct participants                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Audio Routing Engine                                         │  │
│  │  • Receives MIC_AUDIO_CHUNK from User A                      │  │
│  │  • Forwards to OpenAI Session A                               │  │
│  │  • Receives translated audio from OpenAI                      │  │
│  │  • Routes TRANSLATED_AUDIO_CHUNK to User B                   │  │
│  │  • Routes MY_TRANSCRIPT to User A                             │  │
│  │  • Routes INCOMING_TRANSCRIPT to User B                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ WebSocket (wss://)
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         USER B (French)                              │
│  Browser (React + TypeScript)                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Audio Playback                                            │  │
│  │     • Receives: TRANSLATED_AUDIO_CHUNK                        │  │
│  │     • useLowLatencyAudio Hook                                 │  │
│  │     • Base64 → PCM16 → Float32                                │  │
│  │     • Plays with <200ms latency                               │  │
│  │     ↓                                                          │  │
│  │  2. Transcript Display                                        │  │
│  │     • Receives: INCOMING_TRANSCRIPT                           │  │
│  │     • useChatroomConnection Hook                              │  │
│  │     • Displays in chat bubble                                 │  │
│  │     ↓                                                          │  │
│  │  3. Microphone Capture                                        │  │
│  │     • Same as User A                                          │  │
│  │     • Sends MIC_AUDIO_CHUNK to backend                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ↓
                    ┌───────────────────────┐
                    │  OpenAI Realtime API  │
                    │  gpt-4o-realtime      │
                    │  • Transcription      │
                    │  • Translation        │
                    │  • Text-to-Speech     │
                    └───────────────────────┘
```

---


## Dual-Mode Operation

NeuralEcho operates in two distinct modes:

### Mode 1: Single-User Translation (/)
**URL**: `http://localhost:5173/` or `https://neuralecho.vercel.app/`

**Purpose**: One person translating their own speech in real-time

**Architecture**:
- Direct WebRTC connection from browser to OpenAI Realtime API
- No backend relay for audio
- Backend only provides ephemeral tokens
- Uses `useRealtimeVoice` hook

**Use Case**: Personal translation, language learning, speech practice

**Components**:
- `Index.tsx` - Main page
- `TranslationPanel.tsx` - Split-screen English/French panels
- `useRealtimeVoice.ts` - WebRTC connection to OpenAI
- `RealtimeAudioTap.ts` - Captures OpenAI audio output
- `StreamingAudioPlayer.ts` - Plays translated audio locally

### Mode 2: Multi-User Chatroom (/chatroom)
**URL**: `http://localhost:5173/chatroom` or `https://neuralecho.vercel.app/chatroom`

**Purpose**: Two people having a translated conversation

**Architecture**:
- WebSocket connection from both browsers to backend
- Backend manages two OpenAI sessions (one per participant)
- Backend routes audio and transcripts between participants
- Uses `useChatroomConnection` hook

**Use Case**: Phone-call-like conversations, business meetings, customer support

**Components**:
- `Chatroom.tsx` - Room creation page
- `JoinRoom.tsx` - Room joining page
- `ChatroomInterface.tsx` - Main conversation UI
- `useChatroomConnection.ts` - WebSocket connection to backend
- `useMicStream.ts` - Microphone capture
- `useLowLatencyAudio.ts` - Audio playback with <200ms latency

---

## Working Pipeline (Chatroom Mode)

### Phase 1: Session Initialization

```
Step 1: User A Creates Room
  ↓
Frontend: Navigate to /chatroom
  ↓
User A: Click "Create Room"
  ↓
Frontend → Backend: POST /api/session/create
  Body: { language: "en-US" }
  ↓
Backend: Create TranslationSession
  • sessionId: "session_1234567890_abc123"
  • participants: Map()
  • messageHistory: []
  • transcriptHistory: []
  ↓
Backend → Frontend: { sessionId, success: true }
  ↓
Frontend: Generate shareable link
  • https://neuralecho.vercel.app/join/session_1234567890_abc123
  ↓
Frontend: Connect WebSocket
  • ws.connect(WS_URL)
  ↓
Frontend → Backend: { type: 'join_session', sessionId, userId, language: 'en-US', name: 'Alice' }
  ↓
Backend: Add User A to session
  • translationSession.addParticipant(userId, 'en-US', ws, 'Alice')
  • participantCount: 1
  ↓
Backend → Frontend A: { type: 'USER_JOINED_ROOM', participantCount: 1 }
  ↓
Frontend A: Display "Waiting for other participant..."

Step 2: User B Joins Room
  ↓
User B: Opens link → /join/session_1234567890_abc123
  ↓
Frontend: Parse sessionId from URL
  ↓
User B: Enter name, select language (fr-CA)
  ↓
Frontend → Backend: POST /api/session/join
  Body: { sessionId, language: "fr-CA" }
  ↓
Backend: Validate session exists and has space
  ↓
Backend → Frontend: { success: true, participantCount: 1 }
  ↓
Frontend: Connect WebSocket
  ↓
Frontend → Backend: { type: 'join_session', sessionId, userId, language: 'fr-CA', name: 'Bob' }
  ↓
Backend: Add User B to session
  • translationSession.addParticipant(userId, 'fr-CA', ws, 'Bob')
  • participantCount: 2
  ↓
Backend: Initialize OpenAI Sessions
  • Session A: createOpenAISession('en', 'fr')
    - Translates User A's English → French for User B
  • Session B: createOpenAISession('fr', 'en')
    - Translates User B's French → English for User A
  ↓
Backend: Wire OpenAI outputs
  • wireOpenAIOutput(sessionA, userB, session, userA.id)
  • wireOpenAIOutput(sessionB, userA, session, userB.id)
  ↓
Backend → Frontend A & B: { type: 'translation_ready', participantCount: 2, otherParticipant: {...} }
  ↓
Frontend A & B: Auto-start microphone
  • setMicEnabled(true)
  • useMicStream starts capturing audio
  ↓
Frontend A & B: Display "Live translation active — speak naturally"
```

### Phase 2: Audio Streaming (User A Speaks)

```
Step 1: Microphone Capture
  ↓
User A: Speaks "Hello, how are you?"
  ↓
Browser: navigator.mediaDevices.getUserMedia({ audio: true })
  ↓
AudioContext: Create MediaStreamSource
  ↓
AudioWorkletNode: mic-input-processor.js
  • Runs on separate audio thread
  • Receives Float32Array (128 samples, ~5ms at 24kHz)
  • Converts Float32 → Int16 (PCM16)
  • Encodes to Base64
  • Posts message to main thread
  ↓
useMicStream Hook: Receives Base64 chunk
  • onAudioData(base64Chunk)
  ↓
useChatroomConnection: Send via WebSocket
  • ws.send({ type: 'MIC_AUDIO_CHUNK', audioData: base64Chunk, timestamp: Date.now() })
  • Sent every ~20ms (continuous streaming)

Step 2: Backend Routing
  ↓
Backend: Receives MIC_AUDIO_CHUNK
  ↓
Backend: Lookup participant
  • connection = activeConnections.get(ws)
  • { sessionId, userId } = connection
  • session = translationSessions.get(sessionId)
  • participant = session.participants.get(userId)
  ↓
Backend: Forward to OpenAI Session A
  • participant.openaiWs.send({ type: 'input_audio_buffer.append', audio: base64Chunk })
  • No batching, immediate forwarding
  ↓
Backend: Track last audio time
  • participant.lastAudioTime = Date.now()

Step 3: OpenAI Processing
  ↓
OpenAI Realtime API: Receives audio stream
  ↓
OpenAI: Server-side VAD detects speech
  • Event: input_audio_buffer.speech_started
  ↓
Backend: Receives speech_started
  ↓
Backend → Frontend A: { type: 'VOICE_ACTIVITY_STARTED', participantId: userA.id }
  ↓
OpenAI: Accumulates audio until silence
  ↓
OpenAI: Transcribes with Whisper-1
  • Input: PCM16 audio stream
  • Output: "Hello, how are you?"
  • Event: conversation.item.input_audio_transcription.completed
  ↓
Backend: Receives transcription
  ↓
Backend → Frontend A: { type: 'MY_TRANSCRIPT', text: 'Hello, how are you?', speakerId: userA.id }
  ↓
OpenAI: Translates with GPT-4o
  • System prompt: "Translate English to French"
  • Input: "Hello, how are you?"
  • Output: "Bonjour, comment allez-vous?"
  ↓
OpenAI: Generates TTS audio
  • Voice: 'shimmer'
  • Format: PCM16, 24kHz, mono
  • Streams in chunks
  • Event: response.audio.delta (multiple times)
  ↓
Backend: Receives audio chunks
  • Event: response.audio.delta
  • Data: { delta: 'base64_audio_chunk...', response_id: 'resp_123' }
  ↓
Backend: Route to User B
  • targetParticipant = session.getOtherParticipant(userA.id)
  • targetParticipant.socket.send({ 
      type: 'TRANSLATED_AUDIO_CHUNK',
      audioData: delta,
      chunkId: `chunk_${userA.id}_${seq++}`,
      speakerId: userA.id,
      timestamp: Date.now()
    })
  ↓
Backend → Frontend B: TRANSLATED_AUDIO_CHUNK (multiple chunks)
  ↓
OpenAI: Transcription complete
  • Event: response.audio_transcript.done
  • Data: { transcript: 'Bonjour, comment allez-vous?' }
  ↓
Backend → Frontend B: { type: 'INCOMING_TRANSCRIPT', text: 'Bonjour, comment allez-vous?', speakerId: userA.id }

Step 4: Audio Playback (User B)
  ↓
Frontend B: Receives TRANSLATED_AUDIO_CHUNK
  ↓
useLowLatencyAudio Hook: Process chunk
  • Check deduplication (chunkId)
  • Decode Base64 → Uint8Array
  • Convert Uint8Array → Int16Array (PCM16)
  • Normalize Int16 → Float32 ([-1, 1])
  ↓
AudioWorkletNode: low-latency-audio-processor.js
  • Enqueue Float32 samples
  • Check queue size (<200ms for real-time mode)
  • If queue >200ms: Interrupt old audio (new speech detected)
  • Schedule playback with AudioContext
  ↓
Speaker: User B hears "Bonjour, comment allez-vous?" in French

Step 5: Transcript Display
  ↓
Frontend A: Receives MY_TRANSCRIPT
  • useChatroomConnection updates messages state
  • Display in chat bubble: "Hello, how are you?" (original)
  ↓
Frontend B: Receives INCOMING_TRANSCRIPT
  • useChatroomConnection updates messages state
  • Display in chat bubble: "Bonjour, comment allez-vous?" (translation)
```

### Phase 3: Bidirectional Conversation

```
User B speaks French → Same pipeline in reverse
  ↓
Mic → useMicStream → WebSocket → Backend → OpenAI Session B (FR→EN) → Backend → User A
  ↓
User A hears English translation
User A sees English transcript
User B sees French transcript (their own words)
```

---


## Key Components Deep Dive

### Frontend Components

#### 1. useMicStream.ts
**Purpose**: Captures microphone audio and streams to backend

**Implementation**:
```typescript
export function useMicStream({ enabled, onAudioData, onCommitAudio }: UseMicStreamOptions) {
  // Setup AudioContext (24kHz)
  // Load AudioWorklet: mic-input-processor.js
  // Create MediaStreamSource from getUserMedia
  // Connect: source → worklet → (muted) destination
  // Worklet posts PCM16 Base64 chunks every ~20ms
  // Call onAudioData(base64) for each chunk
  // Call onCommitAudio() on silence detection
}
```

**Key Features**:
- AudioWorklet runs on separate thread (no main thread blocking)
- Continuous streaming (no buffering)
- Automatic silence detection (500ms threshold)
- PCM16 format (16-bit signed integer)
- Base64 encoding for WebSocket transmission

#### 2. useLowLatencyAudio.ts
**Purpose**: Plays translated audio with <200ms latency

**Implementation**:
```typescript
export function useLowLatencyAudio() {
  // Setup AudioContext (24kHz)
  // Load AudioWorklet: low-latency-audio-processor.js
  // Maintain queue of audio chunks
  // Detect speech boundaries (>300ms gap)
  // Auto-interrupt old audio on new speech
  // Schedule playback with AudioContext.currentTime
}
```

**Key Features**:
- Real-time conversation mode (not streaming mode)
- <200ms queue limit (prevents lag buildup)
- Automatic interruption on new speech
- Speech boundary detection via timestamp gaps
- Gapless playback with scheduled start times
- Deduplication prevents double-playback

**Critical Difference from StreamingAudioPlayer**:
- StreamingAudioPlayer: Buffers audio like music (600ms queue)
- LowLatencyAudio: Interrupts like phone calls (200ms queue)
- Prioritizes latest audio over complete playback

#### 3. useChatroomConnection.ts
**Purpose**: Manages WebSocket connection and event handling

**Implementation**:
```typescript
export function useChatroomConnection({ roomId, participant, onEvent }) {
  // Connect to backend WebSocket
  // Handle events:
  //   - USER_JOINED_ROOM: Update otherParticipant state
  //   - translation_ready: Start mic streaming
  //   - TRANSLATED_AUDIO_CHUNK: Play audio
  //   - MY_TRANSCRIPT: Display own words
  //   - INCOMING_TRANSCRIPT: Display translation
  //   - BILINGUAL_MESSAGE: Update chat history
  // Integrate useMicStream and useLowLatencyAudio
  // Manage messages state with deduplication
}
```

**Key Features**:
- Auto-reconnect on unexpected disconnect
- Event routing to appropriate handlers
- Transcript pairing (prevents duplicate bubbles)
- Message history management
- Participant state tracking

#### 4. RealtimeAudioTap.ts (Single-User Mode)
**Purpose**: Captures OpenAI audio output for relay

**Implementation**:
```typescript
export class RealtimeAudioTap {
  // Initialize on WebRTC audio track
  // Load AudioWorklet: audio-tap-processor.js
  // Extract PCM16 from audio stream
  // Encode to Base64
  // Call onAudioChunk(base64, responseId, seq)
  // Call onStreamEnd(responseId) when done
}
```

**Use Case**: Single-user mode needs to capture OpenAI's audio output to relay to local player

### Backend Components

#### 1. TranslationSession Class
**Purpose**: Manages a translation session between two participants

**Structure**:
```javascript
class TranslationSession {
  sessionId: string
  participants: Map<userId, {
    language: string,
    socket: WebSocket,
    name: string,
    openaiWs: WebSocket | null,
    audioBuffer: [],
    lastAudioTime: number,
    silenceTimer: NodeJS.Timeout | null
  }>
  messageHistory: Array<{
    id, participantId, originalText, translatedText,
    originalLanguage, targetLanguage, timestamp
  }>
  transcriptHistory: Array<{
    messageId, roomId, speakerId, speakerName,
    sourceLanguage, targetLanguage,
    originalTranscript, translatedTranscript,
    timestamp, confidence, processingTime
  }>
  recording: {
    recordingId, roomId, startTime, endTime,
    participants, status, format, duration
  } | null
  createdAt: number
}
```

**Methods**:
- `addParticipant(userId, language, socket, name)` - Add participant to session
- `removeParticipant(userId)` - Remove and cleanup participant
- `getOtherParticipant(userId)` - Get the other participant in the session
- `addMessage(messageData)` - Add message to history
- `addTranscriptMessage(transcriptData)` - Add transcript to history
- `startRecording()` - Start recording session
- `stopRecording()` - Stop recording session

#### 2. createOpenAISession(inputLang, outputLang)
**Purpose**: Creates OpenAI Realtime API WebSocket connection

**Configuration**:
```javascript
{
  model: 'gpt-4o-realtime-preview-2024-12-17',
  modalities: ['text', 'audio'],
  instructions: buildTranslationInstructions(inputLang, outputLang),
  voice: 'shimmer',
  input_audio_format: 'pcm16',
  output_audio_format: 'pcm16',
  input_audio_transcription: {
    model: 'whisper-1',
    language: inputLang
  },
  turn_detection: null  // Disabled to prevent hallucination
}
```

**Translation Instructions**:
```
You are a strict real-time translator for phone-call-like conversations.

Your role:
- Listen to {inputLang} speech
- Translate to {outputLang} in real-time
- Speak the translation naturally with appropriate tone

Rules:
1. Translate ONLY. No explanations, no greetings, no commentary.
2. Preserve meaning and tone exactly as spoken.
3. Keep names, numbers, and dates exactly as heard.
4. Never respond conversationally. You are a translation engine.
5. Speak naturally in {outputLang} with appropriate emotion and pacing.
```

#### 3. wireOpenAIOutput(openaiWs, targetParticipant, session, speakerId)
**Purpose**: Routes OpenAI events to correct frontend participant

**Event Mapping**:
```javascript
// Audio chunks → Listener
if (event.type === 'response.audio.delta') {
  targetParticipant.socket.send({
    type: 'TRANSLATED_AUDIO_CHUNK',
    audioData: event.delta,
    chunkId: `chunk_${speakerId}_${seq++}`,
    speakerId,
    timestamp: Date.now()
  });
}

// Transcription → Speaker (their own words)
if (event.type === 'conversation.item.input_audio_transcription.completed') {
  speakerParticipant.socket.send({
    type: 'MY_TRANSCRIPT',
    text: event.transcript,
    speakerId,
    timestamp: Date.now()
  });
}

// Translation text → Listener
if (event.type === 'response.audio_transcript.done') {
  targetParticipant.socket.send({
    type: 'INCOMING_TRANSCRIPT',
    text: event.transcript,
    speakerId,
    timestamp: Date.now()
  });
}
```

**Keepalive**: Pings OpenAI every 30s to prevent timeout

---

## Message Protocol

### Frontend → Backend

#### join_session
```json
{
  "type": "join_session",
  "sessionId": "session_1234567890_abc123",
  "userId": "participant-uuid",
  "language": "en-US",
  "name": "Alice"
}
```

#### MIC_AUDIO_CHUNK
```json
{
  "type": "MIC_AUDIO_CHUNK",
  "audioData": "base64_pcm16_audio_chunk...",
  "timestamp": 1234567890123
}
```

#### COMMIT_AUDIO_BUFFER
```json
{
  "type": "COMMIT_AUDIO_BUFFER",
  "timestamp": 1234567890123
}
```

#### BILINGUAL_MESSAGE
```json
{
  "type": "BILINGUAL_MESSAGE",
  "message": {
    "id": "msg_uuid",
    "speakerId": "participant-uuid",
    "originalText": "Hello",
    "translatedText": "Bonjour",
    "originalLanguage": "en-US",
    "targetLanguage": "fr-CA",
    "timestamp": 1234567890123
  }
}
```

### Backend → Frontend

#### translation_ready
```json
{
  "type": "translation_ready",
  "message": "Translation session ready",
  "participantCount": 2,
  "otherParticipant": {
    "id": "participant-uuid",
    "name": "Bob",
    "language": "fr-CA"
  }
}
```

#### TRANSLATED_AUDIO_CHUNK
```json
{
  "type": "TRANSLATED_AUDIO_CHUNK",
  "audioData": "base64_pcm16_audio_chunk...",
  "chunkId": "chunk_participant-uuid_123",
  "speakerId": "participant-uuid",
  "timestamp": 1234567890123
}
```

#### MY_TRANSCRIPT
```json
{
  "type": "MY_TRANSCRIPT",
  "text": "Hello, how are you?",
  "speakerId": "participant-uuid",
  "timestamp": 1234567890123
}
```

#### INCOMING_TRANSCRIPT
```json
{
  "type": "INCOMING_TRANSCRIPT",
  "text": "Bonjour, comment allez-vous?",
  "speakerId": "participant-uuid",
  "timestamp": 1234567890123
}
```

#### USER_JOINED_ROOM
```json
{
  "type": "USER_JOINED_ROOM",
  "sessionId": "session_1234567890_abc123",
  "participantCount": 2,
  "userId": "participant-uuid",
  "newParticipantName": "Bob",
  "newParticipantLanguage": "fr-CA"
}
```

---


## Audio Format Specifications

### Microphone Capture
- **Sample Rate**: 24,000 Hz (24 kHz)
- **Channels**: 1 (mono)
- **Format**: PCM16 (16-bit signed integer, little-endian)
- **Encoding**: Base64 string for WebSocket transmission
- **Chunk Size**: ~128 samples (~5.3ms at 24kHz)
- **Streaming**: Continuous, no buffering

### OpenAI Input/Output
- **Sample Rate**: 24,000 Hz (24 kHz)
- **Channels**: 1 (mono)
- **Format**: PCM16 (16-bit signed integer, little-endian)
- **Encoding**: Base64 string
- **Turn Detection**: Server-side VAD (disabled to prevent hallucination)

### Audio Playback
- **Sample Rate**: 24,000 Hz (24 kHz)
- **Channels**: 1 (mono)
- **Format**: Float32 (normalized to [-1.0, 1.0])
- **Buffering**: <200ms queue for real-time conversation
- **Scheduling**: Gapless with AudioContext.currentTime

### Conversion Pipeline
```
Microphone
  ↓
Float32Array (Web Audio API native format)
  ↓
Int16Array (PCM16: sample * 32767)
  ↓
Uint8Array (raw bytes, little-endian)
  ↓
Base64 String (btoa for WebSocket)
  ↓
WebSocket Transmission
  ↓
Base64 String (received)
  ↓
Uint8Array (atob)
  ↓
Int16Array (PCM16)
  ↓
Float32Array (sample / 32768 or sample / 32767)
  ↓
AudioBuffer (Web Audio API)
  ↓
Speaker
```

---

## Latency Optimization

### Frontend Optimizations
1. **AudioWorklet**: Runs on separate audio thread (no main thread blocking)
2. **Continuous Streaming**: No buffering, sends audio every ~20ms
3. **Real-time Playback**: <200ms queue (conversation mode, not streaming mode)
4. **Automatic Interruption**: Stops old audio when new speech arrives
5. **Speech Boundary Detection**: Detects gaps >300ms to identify new utterances
6. **Deduplication**: Prevents processing same chunk twice (chunkId tracking)
7. **Direct Audio Path**: Minimal processing between mic and WebSocket

### Backend Optimizations
1. **Direct Forwarding**: Minimal processing, just route audio
2. **WebSocket**: Low-latency bidirectional communication
3. **Keepalive Ping**: Prevents connection timeouts (every 30s)
4. **Efficient Routing**: O(1) participant lookup with Map
5. **No Batching**: Immediate forwarding of audio chunks
6. **Parallel Sessions**: Two OpenAI sessions run concurrently

### OpenAI Optimizations
1. **Streaming**: Audio processed in real-time chunks
2. **Server VAD**: Automatic speech detection (no client-side processing)
3. **Low-latency Model**: gpt-4o-realtime optimized for real-time use
4. **Concurrent Processing**: Transcription, translation, TTS happen in parallel

### Latency Breakdown
```
Total End-to-End Latency: ~500-800ms

Microphone Capture:           ~5ms
Network (Frontend → Backend): ~50-100ms
Backend Processing:           ~5ms
Network (Backend → OpenAI):   ~50-100ms
OpenAI Processing:            ~300-500ms
  - Transcription:            ~100-150ms
  - Translation:              ~50-100ms
  - TTS Generation:           ~150-250ms
Network (OpenAI → Backend):   ~50-100ms
Backend Routing:              ~5ms
Network (Backend → Frontend): ~50-100ms
Audio Playback:               ~10-20ms
```

### Key Improvements Over Previous Versions
1. **Real-time Conversation Mode**: Prevents lag buildup by interrupting old audio
2. **Reduced Queue Size**: 200ms (was 600ms) - 3x faster response
3. **Speech Boundary Detection**: Identifies new utterances to trigger interruption
4. **Automatic Interruption**: Stops old audio when new speech arrives
5. **Direct Streaming**: No batching or buffering on frontend

---

## Error Handling & Edge Cases

### Connection Errors
**Frontend**:
- Auto-reconnect on unexpected disconnect (3-second delay)
- Retry logic with exponential backoff
- User notification on connection loss

**Backend**:
- Graceful cleanup on client disconnect
- Notify remaining participant when peer leaves
- Session cleanup after all participants leave

**OpenAI**:
- Notify participant if OpenAI session closes
- Attempt reconnection on transient errors
- Fallback to error message if persistent failure

### Audio Errors
**Deduplication**:
- Track chunkId to prevent duplicate playback
- Skip chunks already processed

**Queue Overflow**:
- Monitor queue size (<200ms limit)
- Interrupt old audio if queue exceeds limit
- Log warnings for debugging

**Decode Errors**:
- Catch Base64 decode failures
- Log error and skip chunk
- Continue processing subsequent chunks

**Silence Detection**:
- Validate transcript length (>2 chars)
- Detect duplicate transcripts (5-second window)
- Cancel response if invalid transcript
- Notify callback (not treated as error)

### Session Errors
**Participant Limit**:
- Max 2 participants per room
- Return 400 error if room is full

**Language Validation**:
- Only EN-US and FR-CA supported
- Return 400 error for unsupported languages

**Session Timeout**:
- Cleanup sessions after inactivity
- Notify participants before cleanup

**OpenAI API Errors**:
- Handle rate limits (429)
- Handle authentication errors (401)
- Handle service unavailable (503)
- Display user-friendly error messages

### Browser Compatibility
**Autoplay Policy**:
- Require user gesture before audio playback
- Handle AudioContext.resume() on user interaction
- Display instructions if autoplay blocked

**Microphone Permissions**:
- Request permissions on session start
- Handle permission denied gracefully
- Display instructions for granting permissions

**WebSocket Support**:
- Check for WebSocket support
- Fallback to HTTP polling if unavailable (not implemented)

---

## Deployment

### Frontend Deployment (Vercel)

**Build Configuration**:
```bash
cd frontend
npm install
npm run build
# Output: dist/
```

**Environment Variables**:
```env
VITE_WS_URL=wss://neural-ix2j.onrender.com
VITE_BACKEND_URL=https://neural-ix2j.onrender.com
VITE_APP_BASE_URL=https://neuralecho.vercel.app
```

**Vercel Configuration** (vercel.json):
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

### Backend Deployment (Render.com)

**Build Configuration**:
```bash
cd backend
npm install
npm start
```

**Environment Variables**:
```env
OPENAI_API_KEY=sk-proj-...
PORT=3000
FRONTEND_URL=https://neuralecho.vercel.app
NODE_ENV=production
```

**Render Configuration** (render.yaml):
```yaml
services:
  - type: web
    name: neuralecho-backend
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: OPENAI_API_KEY
        sync: false
      - key: PORT
        value: 3000
    healthCheckPath: /health
```

**CORS Configuration**:
```javascript
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://neuralecho.vercel.app',
      'https://neuralecho1.vercel.app',
      'https://neural-echo.vercel.app'
    ];
    
    // Allow all Vercel preview deployments
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

### Health Checks

**Backend Health Endpoint** (`/health`):
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "activeConnections": 4,
  "translationSessions": 2,
  "activeTranslations": [
    {
      "sessionId": "session_123",
      "participants": 2,
      "languages": ["en-US", "fr-CA"]
    }
  ],
  "openai": {
    "apiKey": "configured"
  }
}
```

---


## Testing & Verification

### Local Development Setup

**Terminal 1: Backend**
```bash
cd backend
npm install
npm start
# Server running on http://localhost:3000
```

**Terminal 2: Frontend**
```bash
cd frontend
npm install
npm run dev
# Dev server running on http://localhost:5173
```

### End-to-End Test (Chatroom Mode)

**Step 1: User A Creates Room**
1. Open browser: `http://localhost:5173/chatroom`
2. Enter name: "Alice"
3. Select language: "English"
4. Click "Create Room"
5. Copy shareable link from toast notification

**Step 2: User B Joins Room**
1. Open new browser tab (or incognito window)
2. Paste shareable link
3. Enter name: "Bob"
4. Select language: "Français"
5. Click "Join Room"

**Step 3: Verify Connection**
- Both users see "Live translation active — speak naturally"
- Participant counter shows "2/2"
- Console logs show:
  - `✅ [WebSocket] Connected to chatroom`
  - `📥 [USER_JOINED_ROOM] Event received`
  - `🚀 [translation_ready] Translation session is ready`

**Step 4: Test Translation**
1. Alice speaks: "Hello, how are you?"
2. Bob hears French audio: "Bonjour, comment allez-vous?"
3. Bob sees transcript: "Bonjour, comment allez-vous?"
4. Alice sees transcript: "Hello, how are you?"

5. Bob speaks: "Je vais bien, merci"
6. Alice hears English audio: "I'm doing well, thank you"
7. Alice sees transcript: "I'm doing well, thank you"
8. Bob sees transcript: "Je vais bien, merci"

### Verification Checklist

**Connection**:
- [ ] WebSocket connects successfully
- [ ] No WebRTC errors in console
- [ ] Both participants see each other
- [ ] "translation_ready" event received

**Audio**:
- [ ] Microphone captures audio
- [ ] Audio chunks sent to backend
- [ ] Translated audio received
- [ ] Audio plays without gaps
- [ ] No duplicate audio playback
- [ ] Audio quality is clear
- [ ] Latency is acceptable (<1 second)

**Transcripts**:
- [ ] Original transcript appears for speaker
- [ ] Translated transcript appears for listener
- [ ] No duplicate transcript bubbles
- [ ] Transcripts paired correctly by speaker

**Performance**:
- [ ] No console errors
- [ ] No memory leaks
- [ ] Audio queue stays <200ms
- [ ] No lag buildup over time

**Edge Cases**:
- [ ] Connection survives network interruptions
- [ ] Graceful handling when participant leaves
- [ ] Proper cleanup on session end
- [ ] Silence detection works correctly

### Console Log Verification

**Expected Logs (Frontend)**:
```
✅ [CONFIG] Backend URL: http://localhost:3000
✅ [CONFIG] WebSocket URL: ws://localhost:3000
🔧 [WebSocket] Using server URL: ws://localhost:3000
✅ [WebSocket] Connected to chatroom: session_123
📤 [WebSocket] Sending join_session message
📨 [WebSocket] Message type: USER_JOINED_ROOM
📥 [USER_JOINED_ROOM] Event received!
📥 [USER_JOINED_ROOM] Participant count: 2
🚀 [translation_ready] Translation session is ready!
🎤 [MIC] Starting microphone capture
🎵 [TranslationAudio] Received chunk: chunk_user_a_0
🎵 [TranslationAudio] Playing chunk, queue: 150ms
📝 [MY_TRANSCRIPT] My own words: Hello
📝 [INCOMING_TRANSCRIPT] Translation: Bonjour
```

**Expected Logs (Backend)**:
```
═══════════════════════════════════════════════════════
📥 [BACKEND] join_session request received
📥 [BACKEND] Session ID: session_123
📥 [BACKEND] User ID: participant-uuid
📥 [BACKEND] Language: en-US
✅ [BACKEND] Session found. Current participants: 1
👤 [BACKEND] Participant added successfully
👤 [BACKEND] Total participants now: 2
🚀 [BACKEND] TWO PARTICIPANTS DETECTED!
🚀 [BACKEND] Initializing OpenAI sessions...
✅ [OpenAI] Session opened for en → fr
✅ [OpenAI] Session opened for fr → en
✅ [BACKEND] OpenAI sessions initialized successfully
📢 [BACKEND] Sending translation_ready to all participants
🎤 [MIC_AUDIO_CHUNK] Received from participant-uuid
🎵 [TRANSLATED_AUDIO_CHUNK] Sent to other participant
```

### Performance Monitoring

**Metrics to Track**:
- WebSocket message rate (messages/second)
- Audio chunk size (bytes)
- Audio queue size (milliseconds)
- End-to-end latency (milliseconds)
- Memory usage (MB)
- CPU usage (%)

**Tools**:
- Chrome DevTools → Performance tab
- Chrome DevTools → Network tab (WebSocket frames)
- Console logs with timestamps
- Backend health endpoint (`/health`)

---

## Troubleshooting

### Issue: No Audio Playback

**Symptoms**: User receives TRANSLATED_AUDIO_CHUNK but hears nothing

**Possible Causes**:
1. Browser autoplay policy blocking audio
2. AudioContext suspended
3. Audio decode errors
4. Speaker muted or disconnected

**Solutions**:
1. Check console for autoplay errors
2. Call `audioContext.resume()` on user gesture
3. Verify Base64 decode succeeds
4. Check browser audio settings

**Verification**:
```javascript
// Check AudioContext state
console.log('AudioContext state:', audioContext.state);
// Should be 'running', not 'suspended'

// Check audio queue
console.log('Audio queue size:', queueSize);
// Should be >0 when audio is playing
```

### Issue: Mic Not Working

**Symptoms**: No MIC_AUDIO_CHUNK messages sent

**Possible Causes**:
1. Microphone permissions denied
2. AudioWorklet failed to load
3. WebSocket not connected
4. `translation_ready` event not received

**Solutions**:
1. Check browser permissions
2. Verify AudioWorklet loaded: `await audioContext.audioWorklet.addModule(...)`
3. Check WebSocket state: `ws.readyState === WebSocket.OPEN`
4. Wait for `translation_ready` before starting mic

**Verification**:
```javascript
// Check mic stream
console.log('Mic stream tracks:', stream.getAudioTracks());
// Should have 1 audio track

// Check AudioWorklet
console.log('AudioWorklet loaded:', !!micWorkletNode);
// Should be true
```

### Issue: High Latency

**Symptoms**: >2 second delay between speech and translation

**Possible Causes**:
1. Network connection slow
2. Backend overloaded
3. OpenAI API slow
4. Audio queue overflow

**Solutions**:
1. Check network speed (ping backend)
2. Check backend health endpoint
3. Check OpenAI API status
4. Monitor audio queue size (<200ms)

**Verification**:
```javascript
// Measure end-to-end latency
const startTime = Date.now();
// ... send audio ...
// ... receive translation ...
const latency = Date.now() - startTime;
console.log('Latency:', latency, 'ms');
// Should be <1000ms
```

### Issue: Duplicate Audio

**Symptoms**: Same audio plays twice

**Possible Causes**:
1. Deduplication not working
2. Multiple WebSocket connections
3. Multiple audio player instances

**Solutions**:
1. Verify chunkId tracking
2. Check only one WebSocket connection exists
3. Ensure only one useLowLatencyAudio instance

**Verification**:
```javascript
// Check deduplication
console.log('Processed chunks:', processedChunkIds.size);
// Should increase by 1 per chunk, not duplicate

// Check WebSocket connections
console.log('Active connections:', activeConnections.size);
// Should be 1 per user
```

### Issue: Queue Overflow / Audio Lag

**Symptoms**: Console shows "Queue overflow" warnings, audio feels delayed

**Root Cause**: Audio chunks arriving faster than playback speed, causing lag buildup

**Solution**: The system now uses real-time conversation mode:
- ✅ Automatically interrupts old audio when new speech arrives
- ✅ Keeps queue minimal (200ms max, not 600ms)
- ✅ Detects speech boundaries via timestamp gaps (>300ms)
- ✅ Prioritizes latest audio over complete playback

**What Changed**:
- Old behavior: Buffer audio like music streaming → lag buildup
- New behavior: Interrupt old audio like phone calls → natural conversation

**Verification**: Check console logs for:
```
🔥 [TranslationAudio] INTERRUPTED - new speech detected
✅ [TranslationAudio] Playing chunk, queue: <200ms
```

### Issue: User A Cannot See User B

**Symptoms**: One user joined but doesn't see the other participant

**Root Cause**: Using wrong interface (single-user mode instead of chatroom mode)

**Solution**: Verify you're on the correct interface:

**✅ Correct Interface (Chatroom Mode)**:
- URL contains `/chatroom` or `/join/session_`
- Header shows "NeuralEcho Chatroom"
- Participants counter shows "1/2" or "2/2"
- Console shows: `🌐🌐🌐 [WebSocket] onmessage` logs
- Console shows: `USER_JOINED_ROOM` events

**❌ Wrong Interface (Single-User Mode)**:
- URL is just `/` (root)
- Header shows "NeuralEcho" with "A GoML Demo App"
- Split screen with English/French panels side-by-side
- Console shows: `[PRE-OPENAI AUDIO]` logs
- NO WebSocket connection logs

**Fix**: Navigate to `/chatroom` and create/join a room

---

## Future Enhancements

### Planned Features

**Multi-language Support**:
- Add more language pairs (Spanish, German, Chinese, etc.)
- Auto-detect source language
- Support for regional dialects

**Group Calls**:
- Support >2 participants
- Multiple translation streams
- Speaker identification

**Recording & Transcripts**:
- Save conversation audio
- Export transcripts (TXT, PDF, JSON)
- Searchable transcript history

**Quality Metrics**:
- Display latency in real-time
- Audio quality indicators
- Network status monitoring

**Mobile Support**:
- Optimize for mobile browsers
- Native mobile apps (iOS, Android)
- Offline mode with caching

### Performance Improvements

**Adaptive Bitrate**:
- Adjust audio quality based on network
- Dynamic sample rate selection
- Compression for slow connections

**Jitter Buffer**:
- Smooth out network variations
- Adaptive buffer size
- Packet loss concealment

**Echo Cancellation**:
- Improve audio quality
- Reduce feedback loops
- Better full-duplex support

**Noise Suppression**:
- Filter background noise
- Enhance speech clarity
- Adaptive noise gate

### Security Enhancements

**End-to-End Encryption**:
- Encrypt audio before transmission
- Secure key exchange
- Zero-knowledge architecture

**Authentication**:
- User accounts
- Session passwords
- OAuth integration

**Rate Limiting**:
- Prevent abuse
- Fair usage policies
- DDoS protection

---

## License

MIT License - See LICENSE file for details

## Contact

For questions or support, please open an issue on GitHub.

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-15  
**Maintained By**: Neuralgo, Inc.

