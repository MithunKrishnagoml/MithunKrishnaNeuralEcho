# NeuralEcho Architecture

## System Overview

NeuralEcho is a real-time bilingual translation system that enables seamless voice conversations between English and French speakers. The system uses WebRTC for direct browser-to-OpenAI connections, with a Node.js backend for session management and audio relay.

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
│         │                        │                        │         │
│         └────────────────────────┼────────────────────────┘         │
│                                  │                                  │
│                                  ▼                                  │
│                         ┌─────────────────┐                         │
│                         │  OpenAI Realtime │                         │
│                         │      API         │                         │
│                         └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Frontend (React + TypeScript)

**Location**: `frontend/src/`

#### Core Components

- **ChatroomInterface.tsx**: Main UI for translation sessions
- **AppContext.tsx**: Global state management for translation
- **useRealtimeVoice.ts**: WebRTC connection to OpenAI Realtime API
- **useRoomTranslation.ts**: Room-based translation coordination
- **useChatroomConnection.ts**: WebSocket connection to backend

#### Audio Pipeline

```
Microphone Input
      ↓
AudioWorklet (mic-input-processor.js)
      ↓
Float32 → Int16 PCM conversion
      ↓
Base64 encoding
      ↓
WebRTC DataChannel → OpenAI
```

#### AI Audio Relay Pipeline

```
OpenAI Response (WebRTC Remote Track)
      ↓
RealtimeAudioTap (audio-tap-processor.js)
      ↓
PCM16 audio chunks (~100ms)
      ↓
Base64 encoding
      ↓
WebSocket → Backend → Broadcast to ALL participants
      ↓
FifoAudioQueue → AudioContext → Speakers
```

### 2. Backend (Node.js + Express + WebSocket)

**Location**: `backend/index.js`

#### Responsibilities

1. **Session Management**
   - Create/join translation sessions
   - Track participants and their languages
   - Maintain message and transcript history

2. **Audio Relay**
   - Broadcast AI audio chunks to all participants
   - Ensure both users hear translated voice

3. **Message Coordination**
   - Relay transcripts between participants
   - Broadcast bilingual messages
   - Synchronize streaming events

4. **Recording & Transcripts**
   - Store conversation history
   - Provide transcript downloads (TXT/JSON)
   - Track session statistics

## Complete Translation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ User A speaks English                                                │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 1. MICROPHONE CAPTURE                                                │
│    - AudioWorklet captures mic input                                 │
│    - Convert Float32 → Int16 PCM                                     │
│    - Base64 encode                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. SEND TO OPENAI (WebRTC DataChannel)                              │
│    - type: "input_audio_buffer.append"                              │
│    - audio: base64_pcm16_data                                        │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. OPENAI PROCESSING                                                 │
│    - Whisper transcribes: "Hello, how are you?"                      │
│    - Translates to French: "Bonjour, comment allez-vous ?"          │
│    - TTS generates French audio                                      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 4. RECEIVE FROM OPENAI (WebRTC Remote Track)                        │
│    - Transcript: "Hello, how are you?"                              │
│    - Translation: "Bonjour, comment allez-vous ?"                   │
│    - Audio: French TTS audio stream                                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 5. RELAY AI AUDIO (Critical for both users to hear)                 │
│    - RealtimeAudioTap captures AI audio from remote track           │
│    - Split into ~100ms chunks                                        │
│    - Send to backend via WebSocket                                   │
│    - Backend broadcasts to ALL participants                          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 6. PLAYBACK ON BOTH BROWSERS                                         │
│    - User A hears: French AI voice ✅                                │
│    - User B hears: French AI voice ✅                                │
│    - FifoAudioQueue ensures smooth playback                          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 7. SEND TRANSCRIPT TO BACKEND                                        │
│    - Original: "Hello, how are you?"                                 │
│    - Translation: "Bonjour, comment allez-vous ?"                   │
│    - Backend stores in session history                               │
│    - Backend broadcasts to other participant                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Technical Decisions

### 1. WebRTC Direct Connection

**Why**: Lowest latency for real-time voice translation

**Trade-off**: Backend doesn't see audio stream, requires relay mechanism

**Solution**: RealtimeAudioTap captures and relays AI audio to backend

### 2. Audio Worklet for Mic Capture

**Why**: Low-latency audio processing in separate thread

**Alternative**: ScriptProcessorNode (deprecated, higher latency)

**Implementation**: `mic-input-processor.js` converts Float32 → Int16 PCM

### 3. AI Audio Relay Architecture

**Problem**: WebRTC connects each browser directly to OpenAI, so other participant can't hear AI voice

**Solution**: 
- Capture AI audio from WebRTC remote track
- Send to backend via WebSocket
- Backend broadcasts to ALL participants
- Both users hear the same AI voice

## Performance Characteristics

### Latency Breakdown

| Stage | Latency | Notes |
|-------|---------|-------|
| Mic capture | ~5ms | AudioWorklet processing |
| WebRTC to OpenAI | ~50-100ms | Network + WebRTC overhead |
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
| WebSocket messages | ~5 KB/s | Transcripts, deltas, events |
| **Total per user** | **~150 KB/s** | During active translation |

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Production Deployment                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────┐              ┌──────────────────────┐    │
│  │   Vercel (Frontend)  │              │  Render (Backend)    │    │
│  │                      │              │                      │    │
│  │  - React SPA         │◄────────────►│  - Node.js + Express │    │
│  │  - Static assets     │   WebSocket  │  - WebSocket server  │    │
│  │  - Auto-deploy       │              │  - Session mgmt      │    │
│  │  - CDN distribution  │              │  - Audio relay       │    │
│  └──────────┬───────────┘              └──────────────────────┘    │
│             │                                                        │
│             │ WebRTC (Direct)                                        │
│             │                                                        │
│             ▼                                                        │
│  ┌──────────────────────┐                                           │
│  │  OpenAI Realtime API │                                           │
│  │                      │                                           │
│  │  - Speech-to-Text    │                                           │
│  │  - Translation       │                                           │
│  │  - Text-to-Speech    │                                           │
│  └──────────────────────┘                                           │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
neuralecho/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatroomInterface.tsx    # Main UI
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   ├── useRealtimeVoice.ts      # WebRTC to OpenAI
│   │   │   ├── useRoomTranslation.ts    # Room coordination
│   │   │   └── useChatroomConnection.ts # WebSocket to backend
│   │   ├── contexts/
│   │   │   └── AppContext.tsx           # Global state
│   │   ├── audio/
│   │   │   └── FifoAudioQueue.ts        # Audio playback
│   │   └── utils/
│   │       └── RealtimeAudioTap.ts      # AI audio capture
│   ├── public/
│   │   ├── mic-input-processor.js       # Mic capture worklet
│   │   └── audio-tap-processor.js       # AI audio tap worklet
│   └── package.json
├── backend/
│   ├── index.js                         # Main server
│   └── package.json
└── ARCHITECTURE.md                      # This file
```

---

**Last Updated**: 2026-03-25  
**Version**: 2.0 (AI Audio Relay)