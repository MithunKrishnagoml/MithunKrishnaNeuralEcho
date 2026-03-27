# NeuralEcho - Real-time Bilingual Translation System Architecture

## System Overview

NeuralEcho is a real-time voice translation system enabling seamless conversations between English and French speakers using OpenAI's Realtime API. The system combines WebSocket communication for session management with WebRTC for low-latency audio processing.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NeuralEcho System                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐│
│  │   Browser A  │         │   Backend    │         │   Browser B  ││
│  │  (English)   │◄───────►│   (Node.js)  │◄───────►│   (French)   ││
│  └──────┬───────┘         └──────┬───────┘         └──────┬───────┘│
│         │                        │                        │         │
│         │    WebSocket (Session, Audio Relay)            │         │
│         └────────────────────────┼────────────────────────┘         │
│                                  │                                  │
│                                  ▼                                  │
│                         ┌─────────────────┐                         │
│                         │  OpenAI Realtime │                         │
│                         │      API         │                         │
│                         └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS + shadcn/ui
- WebRTC for audio streaming
- AudioWorklet for low-latency processing

### Backend
- Node.js 18+ with ES Modules
- Express.js for HTTP server
- ws library for WebSocket
- OpenAI Realtime API integration

### Deployment
- Frontend: Vercel
- Backend: Render
- Database: Supabase (optional)

## Project Structure

```
neuralecho/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatroomInterface.tsx    # Main translation UI
│   │   │   ├── TranscriptPanel.tsx      # Message history
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   ├── useRealtimeVoice.ts      # OpenAI Realtime API
│   │   │   ├── useChatroomConnection.ts # WebSocket to backend
│   │   │   └── usePerformanceOptimization.ts
│   │   ├── utils/
│   │   │   ├── RealtimeAudioTap.ts      # AI audio capture
│   │   │   └── StreamingAudioPlayer.ts  # Audio playback
│   │   ├── audio/
│   │   │   └── FifoAudioQueue.ts        # Audio buffering
│   │   └── pages/
│   │       └── Index.tsx                # Main app page
│   ├── public/
│   │   ├── mic-input-processor.js       # Mic capture worklet
│   │   └── audio-tap-processor.js       # AI audio tap worklet
│   └── package.json
├── backend/
│   ├── index.js                         # Main server
│   └── package.json
└── README.md
```

## Core Components

### Frontend Components

#### 1. useRealtimeVoice Hook
Manages WebRTC connection to OpenAI Realtime API.

**Responsibilities:**
- Establish peer connection to OpenAI
- Stream microphone audio via DataChannel
- Receive AI audio via remote track
- Handle voice activity detection
- Process transcripts and translations

#### 2. useChatroomConnection Hook
Manages WebSocket connection to backend server.

**Responsibilities:**
- Join/leave translation sessions
- Send/receive bilingual messages
- Broadcast audio chunks to other participants
- Handle session events and history
- Manage participant state

#### 3. RealtimeAudioTap
Captures AI audio from OpenAI's remote track for relay.

**Responsibilities:**
- Tap into WebRTC remote audio track
- Extract PCM16 audio chunks (~100ms)
- Convert to base64 for transmission
- Send to backend via WebSocket

#### 4. StreamingAudioPlayer
Plays translated audio with buffering and queue management.

**Responsibilities:**
- Queue incoming audio chunks
- Handle autoplay policy
- Smooth playback with FIFO queue
- Manage AudioContext lifecycle

### Backend Components

#### 1. WebSocket Server
Handles real-time client connections and session management.

**Responsibilities:**
- Accept client WebSocket connections
- Route messages to appropriate sessions
- Broadcast events to participants
- Manage connection lifecycle

#### 2. TranslationSession Class
Manages individual translation sessions.

```javascript
class TranslationSession {
  sessionId: string
  participants: Map<userId, ParticipantData>
  messageHistory: ChatroomMessage[]
  transcriptHistory: TranscriptMessage[]
  isRecording: boolean
  recordingData: any[]
}
```

**Key Methods:**
- `addParticipant()` - Register new participant
- `removeParticipant()` - Cleanup on disconnect
- `getOtherParticipant()` - Find conversation partner
- `addMessage()` - Store translation
- `addTranscriptMessage()` - Record transcript

## Complete Translation Flow

### Step-by-Step Process

```
1. User A speaks English
   ↓
2. Microphone Capture (AudioWorklet)
   - Float32 → Int16 PCM conversion
   - Base64 encoding
   ↓
3. Send to OpenAI (WebRTC DataChannel)
   - type: "input_audio_buffer.append"
   - audio: base64_pcm16_data
   ↓
4. OpenAI Processing
   - Whisper transcribes: "Hello, how are you?"
   - Translates to French: "Bonjour, comment allez-vous?"
   - TTS generates French audio
   ↓
5. Receive from OpenAI (WebRTC Remote Track)
   - Transcript: "Hello, how are you?"
   - Translation: "Bonjour, comment allez-vous?"
   - Audio: French TTS audio stream
   ↓
6. AI Audio Relay (Critical)
   - RealtimeAudioTap captures AI audio
   - Split into ~100ms chunks
   - Send to backend via WebSocket
   - Backend broadcasts to ALL participants
   ↓
7. Playback on Both Browsers
   - User A hears: French AI voice ✅
   - User B hears: French AI voice ✅
   - StreamingAudioPlayer manages playback
   ↓
8. Send Transcript to Backend
   - Original + Translation stored
   - Broadcast to other participant
   - Added to session history
```

## Audio Processing Pipeline

### Microphone Input Pipeline

```
Microphone
    ↓
getUserMedia()
    ↓
AudioWorklet (mic-input-processor.js)
    ↓
Float32 → Int16 PCM conversion
    ↓
Base64 encoding
    ↓
WebRTC DataChannel → OpenAI
```

### AI Audio Relay Pipeline

```
OpenAI Response (WebRTC Remote Track)
    ↓
RealtimeAudioTap (audio-tap-processor.js)
    ↓
PCM16 audio chunks (~100ms)
    ↓
Base64 encoding
    ↓
WebSocket → Backend
    ↓
Backend broadcasts to ALL participants
    ↓
StreamingAudioPlayer (FifoAudioQueue)
    ↓
AudioContext → Speakers
```

## WebSocket Event Types

### Client → Server Events

| Event Type | Purpose | Payload |
|------------|---------|---------|
| `join_session` | Join translation session | sessionId, userId, language, name |
| `SPEECH_TRANSCRIPT` | Send transcript | transcript, language, messageId |
| `BILINGUAL_MESSAGE` | Send translated message | originalText, translatedText, languages |
| `AUDIO_CHUNK` | Relay AI audio chunk | audioData, responseId, chunkId |
| `ROOM_AUDIO_DATA` | Send mic audio | audioData, participantId |
| `START_RECORDING` | Start session recording | - |
| `STOP_RECORDING` | Stop session recording | - |

### Server → Client Events

| Event Type | Purpose | Payload |
|------------|---------|---------|
| `CONNECTION_ESTABLISHED` | Confirm connection | message |
| `USER_JOINED_ROOM` | Participant joined | userId, participantCount, language |
| `translation_ready` | Both participants ready | participantCount |
| `BILINGUAL_MESSAGE` | Translated message | message object |
| `AUDIO_CHUNK` | AI audio chunk | audioData, participantId, chunkId |
| `TRANSLATED_AUDIO` | Complete audio | audioData, fromParticipant |
| `VOICE_ACTIVITY_STARTED` | Speech detected | participantId |
| `VOICE_ACTIVITY_STOPPED` | Speech ended | participantId |
| `translation_error` | Translation failed | error, retryable |

## State Management

### Frontend State (useChatroomConnection)

```typescript
{
  isConnected: boolean
  room: Chatroom | null
  messages: ChatroomMessage[]
  otherParticipant: ChatroomParticipant | null
  lastTranslation: string
}
```

### Backend State (TranslationSession)

```javascript
{
  sessionId: string
  participants: Map<userId, {
    userId: string
    language: 'en-US' | 'fr-CA'
    socket: WebSocket
    name: string
    openaiWs: WebSocket
    lastRequestTime: number
  }>
  messageHistory: ChatroomMessage[]
  transcriptHistory: TranscriptMessage[]
  isRecording: boolean
}
```

## Performance Characteristics

### Latency Breakdown

| Stage | Latency | Notes |
|-------|---------|-------|
| Mic capture | ~5ms | AudioWorklet processing |
| WebRTC to OpenAI | ~50-100ms | Network overhead |
| OpenAI processing | ~200-500ms | Whisper + Translation + TTS |
| Audio relay | ~20-50ms | WebSocket broadcast |
| Audio playback | ~10-20ms | AudioContext buffering |
| **Total** | **~285-675ms** | End-to-end latency |

### Bandwidth Usage

| Component | Bandwidth | Notes |
|-----------|-----------|-------|
| Mic input to OpenAI | ~48 KB/s | 24kHz PCM16 mono |
| AI audio from OpenAI | ~48 KB/s | 24kHz PCM16 mono |
| AI audio relay | ~48 KB/s | Broadcast to participants |
| WebSocket messages | ~5 KB/s | Transcripts, events |
| **Total per user** | **~150 KB/s** | During active translation |

## Key Technical Decisions

### 1. WebRTC Direct Connection
**Why**: Lowest latency for real-time voice translation  
**Trade-off**: Backend doesn't see audio stream  
**Solution**: RealtimeAudioTap captures and relays AI audio

### 2. AudioWorklet for Processing
**Why**: Low-latency audio processing in separate thread  
**Alternative**: ScriptProcessorNode (deprecated)  
**Implementation**: Separate worklets for mic and AI audio

### 3. AI Audio Relay Architecture
**Problem**: Each browser connects directly to OpenAI, other participant can't hear AI voice  
**Solution**: Capture AI audio from remote track, relay via backend to all participants

### 4. Streaming Audio Playback
**Why**: Smooth playback without waiting for complete audio  
**Implementation**: FifoAudioQueue with chunked playback

## Error Handling

### Frontend Error Handling
- Network errors reported via StreamingErrorHandler
- WebSocket reconnection on unexpected disconnect
- Audio player error recovery
- User-friendly error messages

### Backend Error Handling
- Retryable vs non-retryable error classification
- Graceful degradation on OpenAI failures
- Connection cleanup on errors
- Structured error logging

## Security Considerations

- CORS configuration for allowed origins
- Environment variable protection
- Input validation for audio data
- WebSocket connection authentication (optional)

## Deployment

### Frontend Deployment (Vercel)
1. Connect GitHub repository
2. Set environment variables
3. Deploy from HandsfreeChatBot branch
4. Auto-deploy on push

### Backend Deployment (Render)
1. Connect GitHub repository
2. Set environment variables (OPENAI_API_KEY)
3. Configure build command: `npm install`
4. Configure start command: `npm start`
5. Deploy from HandsfreeChatBot branch

## Environment Variables

### Frontend (.env)
```bash
VITE_BACKEND_URL=https://your-backend.onrender.com
VITE_WS_URL=wss://your-backend.onrender.com
VITE_OPENAI_API_KEY=sk-...
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

### Backend (.env)
```bash
OPENAI_API_KEY=sk-...
PORT=3001
ALLOWED_ORIGINS=https://your-frontend.vercel.app
NODE_ENV=production
```

## Monitoring and Debugging

### Frontend Logging
- WebSocket connection events
- Audio chunk processing
- Translation events
- Performance metrics

### Backend Logging
- Session lifecycle events
- OpenAI API interactions
- Audio relay operations
- Performance tracking

## Performance Optimization

### Latency Reduction
- Persistent WebSocket connections
- Streaming audio processing
- Optimized VAD settings (300ms silence)
- PCM16 format for minimal encoding

### Memory Management
- Efficient audio buffer handling
- Automatic cleanup of completed messages
- Connection state pruning
- Audio player disposal on unmount

## Known Limitations

- Supports only English (en-US) and French (fr-CA)
- Requires modern browser with WebRTC support
- Autoplay policy requires user gesture
- Maximum 2 participants per session

## Future Enhancements

- Multi-language support
- Group translation (3+ participants)
- Recording and playback features
- Advanced transcript export options
- Mobile app support

---

**Version**: 2.0  
**Last Updated**: March 27, 2026  
**Status**: Production Ready
