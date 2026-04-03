# NeuralEcho - Complete Architecture & End-to-End Pipeline

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Audio Input Pipeline](#audio-input-pipeline)
4. [Audio Preprocessing](#audio-preprocessing)
5. [Translation Pipeline](#translation-pipeline)
6. [Audio Output Pipeline](#audio-output-pipeline)
7. [WebSocket Communication](#websocket-communication)
8. [Data Flow](#data-flow)
9. [Technology Stack](#technology-stack)

---

## System Overview

NeuralEcho is a real-time bilingual voice translation system that enables seamless conversations between English and French speakers. The system captures audio from one user, transcribes it, translates it to the target language, generates translated speech, and plays it to the other user - all in real-time with minimal latency.

### Key Features
- Real-time voice-to-voice translation (English ↔ French)
- Low-latency streaming audio (<500ms end-to-end)
- Voice Activity Detection (VAD) to filter silence
- Hallucination filtering for accurate transcriptions
- Context-aware translations with register detection
- Multi-room support for concurrent translation sessions

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER A (English)                                │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│  │ Microphone   │───▶│ AudioContext │───▶│ AudioWorklet │                 │
│  │ (24kHz)      │    │ (Capture)    │    │ Preprocessor │                 │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                 │
│                                                   │                          │
│                                                   ▼                          │
│                                          ┌────────────────┐                 │
│                                          │ VAD + Noise    │                 │
│                                          │ Suppression    │                 │
│                                          └────────┬───────┘                 │
│                                                   │                          │
│                                                   ▼                          │
│                                          ┌────────────────┐                 │
│                                          │ PCM16 Audio    │                 │
│                                          │ (Base64)       │                 │
│                                          └────────┬───────┘                 │
└──────────────────────────────────────────────────┼──────────────────────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPENAI REALTIME API (WebRTC)                         │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│  │ Audio Buffer │───▶│ Whisper ASR  │───▶│ GPT-4o       │                 │
│  │ (Streaming)  │    │ (Transcribe) │    │ (Translate)  │                 │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                 │
│                                                   │                          │
│                                                   ▼                          │
│                                          ┌────────────────┐                 │
│                                          │ TTS Engine     │                 │
│                                          │ (Voice: Shimmer│                 │
│                                          └────────┬───────┘                 │
│                                                   │                          │
│                                                   ▼                          │
│                                          ┌────────────────┐                 │
│                                          │ PCM16 Audio    │                 │
│                                          │ Chunks         │                 │
│                                          └────────┬───────┘                 │
└──────────────────────────────────────────────────┼──────────────────────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVER (Node.js + WebSocket)                 │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│  │ Session      │    │ Audio Relay  │    │ Message      │                 │
│  │ Management   │    │ (Zero Buffer)│    │ History      │                 │
│  └──────────────┘    └──────┬───────┘    └──────────────┘                 │
│                              │                                               │
│                              ▼                                               │
│                     ┌────────────────┐                                      │
│                     │ WebSocket      │                                      │
│                     │ Broadcast      │                                      │
│                     └────────┬───────┘                                      │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER B (French)                                 │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│  │ WebSocket    │───▶│ Streaming    │───▶│ AudioWorklet │                 │
│  │ Receiver     │    │ Audio Player │    │ Processor    │                 │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                 │
│                                                   │                          │
│                                                   ▼                          │
│                                          ┌────────────────┐                 │
│                                          │ Audio Queue    │                 │
│                                          │ (FIFO Buffer)  │                 │
│                                          └────────┬───────┘                 │
│                                                   │                          │
│                                                   ▼                          │
│                                          ┌────────────────┐                 │
│                                          │ Speaker Output │                 │
│                                          │ (24kHz)        │                 │
│                                          └────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Audio Input Pipeline

### 1. Microphone Capture

**Location**: `frontend/src/hooks/useOpenAIRealtime.ts`

```typescript
// Request microphone access with optimal settings
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    sampleRate: 24000,        // Match OpenAI's expected rate
    channelCount: 1,          // Mono audio
    echoCancellation: true,   // Remove echo
    noiseSuppression: false,  // Handled by custom processor
    autoGainControl: false    // Handled by custom processor
  }
});
```

**Key Points**:
- 24kHz sample rate (OpenAI Realtime API requirement)
- Mono channel to reduce bandwidth
- Echo cancellation enabled at browser level
- Custom noise suppression for better control

### 2. Audio Context Setup

```typescript
const audioCtx = new AudioContext({ sampleRate: 24000 });
await audioCtx.audioWorklet.addModule('/mic-preprocess-processor.js');

const source = audioCtx.createMediaStreamSource(stream);
const preprocessNode = new AudioWorkletNode(audioCtx, 'mic-preprocess-processor');
```

**Purpose**:
- Create audio processing pipeline
- Load custom AudioWorklet processor
- Connect microphone to preprocessing chain

---

## Audio Preprocessing

### 1. Custom AudioWorklet Processor

**Location**: `frontend/public/mic-preprocess-processor.js`

The preprocessing pipeline runs in a separate audio thread for real-time performance:

```javascript
class MicPreprocessProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0][0];  // Get mono channel
    
    // 1. Calculate RMS (volume level)
    const rms = this.calculateRMS(input);
    
    // 2. Voice Activity Detection
    const isVoice = rms > this.vadThreshold;
    
    // 3. Noise Gate (suppress background noise)
    const gated = this.applyNoiseGate(input, rms);
    
    // 4. Dynamic Range Compression
    const compressed = this.applyCompression(gated);
    
    // 5. Detect word and phrase boundaries
    const boundaries = this.detectBoundaries(rms, isVoice);
    
    // Send processed audio + metadata to main thread
    this.port.postMessage({
      pcm: compressed,
      rms: rms,
      wordBoundary: boundaries.word,
      phraseBoundary: boundaries.phrase,
      commitEnergy: this.accumulatedEnergy,
      commitDurationMs: this.speechDuration
    });
    
    return true;
  }
}
```

### 2. Voice Activity Detection (VAD)

**Two-Tier VAD System**:

#### Client-Side VAD (AudioWorklet)
- **Purpose**: Filter silence before sending to OpenAI
- **Threshold**: RMS > 0.0003 (minimum energy)
- **Duration**: Minimum 120ms of speech
- **Benefit**: Reduces API calls and prevents hallucinations

#### Server-Side VAD (OpenAI)
- **Purpose**: Detect turn-taking and sentence boundaries
- **Configuration**:
  ```typescript
  turn_detection: {
    type: 'server_vad',
    threshold: 0.5,              // Voice activity threshold
    prefix_padding_ms: 300,      // Audio before speech starts
    silence_duration_ms: 500     // Silence to end turn
  }
  ```

### 3. Hallucination Filtering

**Location**: `frontend/src/hooks/useOpenAIRealtime.ts`

```typescript
function isHallucination(text: string): boolean {
  const cleaned = text.trim().toLowerCase();
  
  // Filter empty or too short
  if (!cleaned || cleaned.length < 2) return true;
  
  // Filter known Whisper hallucinations
  const hallucinations = [
    "thank you.", "thanks.", "bye.", "bye bye.",
    "you.", "okay.", "ok.", "mm-hmm.", "hmm.",
    "merci.", "au revoir.", "bonjour.", "d'accord."
  ];
  
  if (hallucinations.includes(cleaned)) return true;
  
  // Filter repetition loops
  const words = cleaned.split(" ");
  if (words.length >= 4) {
    const unique = new Set(words);
    if (unique.size === 1) return true;  // All same word
  }
  
  return false;
}
```

### 4. Audio Format Conversion

**PCM16 Encoding**:
```typescript
// Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
const float32 = new Float32Array(pcm);
const int16 = new Int16Array(float32.length);

for (let i = 0; i < float32.length; i++) {
  int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32767));
}

// Encode to Base64 for transmission
const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
```

---

## Translation Pipeline

### 1. Audio Transmission to OpenAI

**WebRTC DataChannel** (Direct connection to OpenAI):

```typescript
// Send audio chunk
dc.send(JSON.stringify({
  type: "input_audio_buffer.append",
  audio: base64AudioData
}));

// Commit audio on phrase boundary
dc.send(JSON.stringify({
  type: "input_audio_buffer.commit"
}));

// Request translation with audio output
dc.send(JSON.stringify({
  type: "response.create",
  response: {
    modalities: ["text", "audio"],  // Get both transcript and speech
    instructions: buildInstructions(myLanguage, targetLanguage)
  }
}));
```

### 2. Translation Instructions

**Location**: `frontend/src/hooks/useOpenAIRealtime.ts`

```typescript
function buildInstructions(myLanguage, targetLanguage, register, history) {
  return `You are a professional real-time interpreter translating from ${sourceLang} to ${targetLang}.

CRITICAL TRANSLATION RULES:
1. ONLY translate the input - never add commentary or explanations
2. Translate word-for-word preserving exact meaning and structure
3. If input is a question, translate the question - do NOT answer it
4. If input is a greeting, translate that greeting exactly
5. Preserve all proper nouns, names, numbers, dates
6. Match the emotional tone and urgency exactly
7. Never invent, add, or remove content

REGISTER: ${register}  // casual, formal, technical, emotional

RECENT CONVERSATION:
${history.slice(-5).map(h => `"${h.original}" → "${h.translated}"`).join('\n')}

EXAMPLES:
Input: "Good morning Sarah, thank you for joining"
Output: "Bonjour Sarah, merci de vous joindre"
NOT: "Bonjour, je suis content que vous soyez là"

Remember: You are a translator, not a conversation participant.`;
}
```

### 3. Context-Aware Translation

**Register Detection**:
```typescript
function detectRegister(history): Register {
  const recentText = history.slice(-3).map(h => h.original).join(" ");
  
  if (/\b(yo|hey|gonna|wanna)\b/.test(recentText)) return "casual";
  if (/\b(therefore|regarding|pursuant)\b/.test(recentText)) return "formal";
  if (/\b(api|function|deploy|debug)\b/.test(recentText)) return "technical";
  if (/(!{2,}|\?{2,}|urgent|help)\b/.test(recentText)) return "emotional";
  
  return "casual";
}
```

**Conversation History**:
- Maintains last 10 exchanges for context
- Helps with pronoun resolution and topic continuity
- Improves translation accuracy for ambiguous phrases

### 4. OpenAI Processing

**Realtime API Pipeline**:
1. **Audio Buffer**: Accumulates incoming PCM16 chunks
2. **Whisper ASR**: Transcribes audio to text (source language)
3. **GPT-4o**: Translates text to target language
4. **TTS Engine**: Generates speech from translated text
5. **Audio Streaming**: Sends PCM16 chunks back to client

**Events Received**:
```typescript
// Transcription complete
'conversation.item.input_audio_transcription.completed'
  → Original text in source language

// Translation streaming
'response.audio_transcript.delta'
  → Translated text chunks (real-time)

// Translation complete
'response.audio_transcript.done'
  → Full translated text

// Audio streaming
'response.audio.delta'
  → PCM16 audio chunks (translated speech)

// Audio complete
'response.audio.done'
  → Translation audio generation finished
```

---

## Audio Output Pipeline

### 1. Audio Chunk Reception

**Location**: `frontend/src/hooks/useChatroomConnection.ts`

```typescript
case 'AUDIO_CHUNK':
  // Filter out own audio
  if (data.participantId === participant.id) {
    console.warn('Ignoring own audio');
    break;
  }
  
  // Convert base64 PCM to audio chunk
  const chunk = {
    id: `chunk_${data.responseId}_${data.sequenceNumber}`,
    data: data.pcmData,  // Base64 PCM16
    timestamp: data.timestamp,
    sequenceNumber: data.sequenceNumber,
    responseId: data.responseId
  };
  
  // Add to streaming player
  translatedAudioPlayerRef.current.addChunk(chunk);
  break;
```

### 2. Streaming Audio Player

**Location**: `frontend/src/utils/StreamingAudioPlayer.ts`

```typescript
class StreamingAudioPlayer {
  async addChunk(chunk: AudioChunk) {
    // Detect responseId change and clear old queue
    if (this.currentResponseId !== chunk.responseId) {
      console.log('New response - clearing old queue');
      this.clearQueue();
    }
    
    // Decode base64 to Int16 PCM
    const binaryString = atob(chunk.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const int16Array = new Int16Array(bytes.buffer);
    
    // Convert Int16 to Float32 for Web Audio API
    const samples = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      const sample = int16Array[i];
      samples[i] = sample < 0 ? sample / 32768.0 : sample / 32767.0;
    }
    
    // Send to AudioWorklet for playback
    this.workletNode.port.postMessage({
      type: 'ADD_SAMPLES',
      data: samples
    });
  }
}
```

### 3. AudioWorklet Playback

**Location**: `frontend/public/audio-streaming-processor.js`

```javascript
class AudioStreamingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];  // FIFO queue of audio samples
    this.isPlaying = false;
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0][0];
    
    // Fill output buffer from queue
    for (let i = 0; i < output.length; i++) {
      if (this.queue.length > 0) {
        output[i] = this.queue.shift();
        this.isPlaying = true;
      } else {
        output[i] = 0;  // Silence when queue empty
        this.isPlaying = false;
      }
    }
    
    return true;  // Keep processor alive
  }
  
  // Receive samples from main thread
  port.onmessage = (event) => {
    if (event.data.type === 'ADD_SAMPLES') {
      this.queue.push(...event.data.data);
    }
    if (event.data.type === 'CLEAR_QUEUE') {
      this.queue = [];
    }
  };
}
```

### 4. Autoplay Policy Handling

```typescript
// Handle user gesture for autoplay
public async handleUserGesture() {
  this.userGestureReceived = true;
  
  if (this.audioContext.state === 'suspended') {
    await this.audioContext.resume();
  }
}

// Attach to user interactions
useEffect(() => {
  const events = ['click', 'touchstart', 'keydown', 'mousedown'];
  
  const handleInteraction = () => {
    translatedAudioPlayerRef.current?.handleUserGesture();
    events.forEach(event => {
      document.removeEventListener(event, handleInteraction);
    });
  };
  
  events.forEach(event => {
    document.addEventListener(event, handleInteraction);
  });
}, []);
```

---

## WebSocket Communication

### 1. Backend WebSocket Server

**Location**: `backend/index.js`

```javascript
wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    const data = JSON.parse(message);
    
    switch (data.type) {
      case 'join_session':
        // Add participant to session
        translationSession.addParticipant(userId, language, ws, name);
        break;
        
      case 'AUDIO_CHUNK':
        // Relay audio to other participant (zero buffering)
        const otherParticipant = session.getOtherParticipant(userId);
        if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
          otherParticipant.socket.send(JSON.stringify({
            type: 'AUDIO_CHUNK',
            participantId: userId,
            pcmData: data.pcmData,
            sequenceNumber: data.sequenceNumber,
            responseId: data.responseId
          }));
        }
        break;
        
      case 'BILINGUAL_MESSAGE':
        // Broadcast message to all participants
        for (const participant of session.participants.values()) {
          if (participant.socket?.readyState === WebSocket.OPEN) {
            participant.socket.send(JSON.stringify({
              type: 'BILINGUAL_MESSAGE',
              message: data.message
            }));
          }
        }
        break;
    }
  });
});
```

### 2. Session Management

```javascript
class TranslationSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.participants = new Map();  // userId -> participant data
    this.messageHistory = [];       // Chat messages
    this.transcriptHistory = [];    // Full transcripts
    this.recording = null;          // Recording session
  }
  
  addParticipant(userId, language, socket, name) {
    this.participants.set(userId, {
      language,
      socket,
      name,
      joinedAt: Date.now()
    });
  }
  
  getOtherParticipant(userId) {
    for (const [otherUserId, participant] of this.participants.entries()) {
      if (otherUserId !== userId) {
        return { userId: otherUserId, ...participant };
      }
    }
    return null;
  }
}
```

---

## Data Flow

### Complete End-to-End Flow

```
USER A SPEAKS (English)
  │
  ├─▶ Microphone captures audio (24kHz, mono)
  │
  ├─▶ AudioWorklet preprocesses:
  │   ├─ Voice Activity Detection
  │   ├─ Noise suppression
  │   ├─ Dynamic compression
  │   └─ Boundary detection
  │
  ├─▶ Convert Float32 → PCM16 → Base64
  │
  ├─▶ Send to OpenAI Realtime API (WebRTC DataChannel)
  │   ├─ input_audio_buffer.append (streaming)
  │   ├─ input_audio_buffer.commit (on phrase boundary)
  │   └─ response.create (request translation)
  │
  ├─▶ OpenAI processes:
  │   ├─ Whisper transcribes: "Hello, how are you?"
  │   ├─ GPT-4o translates: "Bonjour, comment allez-vous ?"
  │   └─ TTS generates French speech (PCM16 chunks)
  │
  ├─▶ Receive from OpenAI:
  │   ├─ conversation.item.input_audio_transcription.completed
  │   │   → "Hello, how are you?"
  │   ├─ response.audio_transcript.delta (streaming)
  │   │   → "Bonjour, " → "comment " → "allez-vous ?"
  │   ├─ response.audio_transcript.done
  │   │   → "Bonjour, comment allez-vous ?"
  │   └─ response.audio.delta (PCM16 chunks)
  │       → [chunk1] → [chunk2] → [chunk3] → ...
  │
  ├─▶ Send audio chunks to Backend WebSocket
  │   └─ type: 'AUDIO_CHUNK', pcmData: base64, sequenceNumber: N
  │
  ├─▶ Backend relays to USER B (zero buffering)
  │   └─ Immediate WebSocket.send() to other participant
  │
  ├─▶ USER B receives audio chunks
  │   ├─ Decode Base64 → Int16 → Float32
  │   ├─ Add to StreamingAudioPlayer queue
  │   └─ AudioWorklet plays from FIFO queue
  │
  └─▶ USER B HEARS: "Bonjour, comment allez-vous ?"
      (Total latency: ~300-500ms)
```

### Bidirectional Flow

The same pipeline works in reverse:
- USER B speaks French
- System translates to English
- USER A hears English translation

Both users can speak simultaneously, and the system handles:
- Separate OpenAI WebRTC connections per user
- Independent audio streams
- Collision detection and turn-taking via VAD

---

## Technology Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Web Audio API** - Audio processing
- **AudioWorklet** - Real-time audio processing thread
- **WebRTC** - Direct connection to OpenAI
- **WebSocket** - Backend communication
- **Vite** - Build tool

### Backend
- **Node.js** - Runtime
- **Express** - HTTP server
- **WebSocket (ws)** - Real-time communication
- **CORS** - Cross-origin support

### External Services
- **OpenAI Realtime API** - Translation engine
  - Whisper - Speech-to-text
  - GPT-4o - Translation
  - TTS - Text-to-speech
- **Vercel** - Frontend hosting
- **Render.com** - Backend hosting

### Audio Processing
- **Sample Rate**: 24kHz (OpenAI requirement)
- **Format**: PCM16 (16-bit linear PCM)
- **Channels**: Mono (1 channel)
- **Encoding**: Base64 for transmission
- **Latency**: ~300-500ms end-to-end

---

## Performance Optimizations

### 1. Zero-Buffer Audio Relay
- Backend immediately forwards audio chunks
- No server-side buffering or processing
- Minimal latency added by relay

### 2. AudioWorklet Processing
- Runs in separate high-priority thread
- No main thread blocking
- Consistent 128-sample processing blocks

### 3. Streaming Architecture
- Audio sent in small chunks (128-4096 samples)
- Translation starts before speech ends
- Playback starts before translation completes

### 4. Queue Management
- FIFO queue prevents audio reordering
- Automatic queue clearing on new response
- Prevents audio stutter from old data

### 5. VAD Optimization
- Client-side filtering reduces API calls
- Server-side VAD for accurate turn detection
- Energy-based hallucination prevention

---

## Security & Privacy

### 1. CORS Protection
```javascript
const allowedOrigins = [
  'https://neuralecho1.vercel.app',
  'https://neuralecho.vercel.app',
  'https://neural-echo.vercel.app'
];
```

### 2. API Key Management
- OpenAI API key stored in backend environment
- Never exposed to frontend
- Ephemeral tokens for WebRTC connections

### 3. Session Isolation
- Each room has unique session ID
- Participants can only access their own session
- Audio never crosses session boundaries

---

## Deployment

### Frontend (Vercel)
```bash
# Build command
npm run build

# Output directory
dist/

# Environment variables
VITE_APP_BASE_URL=https://neuralecho1.vercel.app
VITE_BACKEND_URL=https://mithunkrishnaneuralecho-2.onrender.com
VITE_WS_URL=wss://mithunkrishnaneuralecho-2.onrender.com
```

### Backend (Render.com)
```bash
# Start command
node index.js

# Environment variables
OPENAI_API_KEY=sk-proj-...
FRONTEND_URL=https://neuralecho1.vercel.app
NODE_ENV=production
PORT=3001
```

---

## Monitoring & Debugging

### Console Logging
- `🎤` - Audio input events
- `🎵` - Audio chunk processing
- `📨` - Message events
- `🔊` - Audio output events
- `✅` - Success operations
- `❌` - Error conditions
- `⚠️` - Warnings

### Performance Metrics
- Processing time per translation
- Audio chunk latency
- Queue size monitoring
- WebSocket connection status

---

## Future Enhancements

1. **Additional Languages** - Expand beyond English/French
2. **Noise Cancellation** - Advanced ML-based noise removal
3. **Accent Adaptation** - Better handling of regional accents
4. **Offline Mode** - Local processing for privacy
5. **Recording & Playback** - Save and review conversations
6. **Multi-Party Rooms** - Support for 3+ participants

---

## Conclusion

NeuralEcho provides a complete real-time voice translation system with:
- **Low latency** (~300-500ms end-to-end)
- **High accuracy** (context-aware translations)
- **Robust filtering** (VAD + hallucination detection)
- **Scalable architecture** (multi-room support)
- **Production-ready** (deployed on Vercel + Render)

The system demonstrates the power of combining Web Audio API, WebRTC, and modern AI services to create seamless cross-language communication.
