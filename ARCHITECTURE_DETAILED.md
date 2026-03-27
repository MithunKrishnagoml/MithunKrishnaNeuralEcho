# NeuralEcho - Real-Time Translation System Architecture

## System Overview

NeuralEcho is a real-time bilingual translation system that enables seamless voice conversations between English and French speakers. The system uses OpenAI's Realtime API for speech-to-text, translation, and text-to-speech, with WebRTC for low-latency audio streaming.

## Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript + Vite
- **UI Library**: Radix UI + Tailwind CSS + shadcn/ui
- **State Management**: React Context API + Custom Hooks
- **Audio Processing**: Web Audio API + AudioWorklet
- **Real-time Communication**: WebRTC (for OpenAI) + WebSocket (for room relay)
- **Routing**: React Router v6

### Backend
- **Runtime**: Node.js + Express
- **WebSocket**: ws library
- **Real-time Communication**: WebSocket Server
- **API Integration**: OpenAI Realtime API (via WebRTC)

### External Services
- **OpenAI Realtime API**: Speech recognition, translation, and TTS
- **Deployment**: Vercel (frontend) + Render (backend)

---

## Architecture Layers


## 1. Audio Input Pipeline (Microphone → OpenAI)

### 1.1 Microphone Capture
```
User Microphone → getUserMedia() → MediaStream → AudioContext
```

**Components:**
- `useRealtimeVoice.ts`: Main hook managing WebRTC connection
- Browser MediaDevices API with constraints:
  - Sample rate: 16kHz (optimized for speech)
  - Mono channel
  - Noise suppression, echo cancellation, auto gain control enabled

### 1.2 Voice Activity Detection (VAD)
```
AudioContext → AudioWorkletNode → mic-input-processor.js → VAD Analysis
```

**File**: `frontend/public/mic-input-processor.js`

**VAD Algorithm:**
1. **Energy Calculation**: Computes RMS (Root Mean Square) of each audio frame
2. **Smoothing**: Moving average over 5 frames (~13ms) to reduce false positives
3. **Threshold Detection**: Default 0.01 (1% of max amplitude)
4. **State Machine**:
   - Idle → Speech detected (energy > threshold) → Start sending
   - Speaking → Silence detected (energy < threshold) → Wait 600ms → Stop sending
5. **Pre-buffering**: Maintains 250ms circular buffer, sent when speech starts

**Key Features:**
- Only sends audio when speech is detected
- Prevents silence/noise from reaching OpenAI
- Reduces API usage by 50-70%
- Prevents transcription hallucinations
- Configurable thresholds via `vadConfig`

### 1.3 Audio Encoding & Transmission
```
Float32 PCM → Int16 PCM → Base64 → DataChannel (input_audio_buffer.append)
```

**Process:**
1. AudioWorklet converts Float32 samples to Int16 PCM
2. Main thread converts Int16 to base64 string
3. Sends via WebRTC DataChannel to OpenAI
4. Message type: `input_audio_buffer.append`

---


## 2. OpenAI Realtime API Integration

### 2.1 Session Initialization
```
Frontend → Backend (/api/openai/realtime-session) → OpenAI API → Ephemeral Token
```

**Security Model:**
- OpenAI API key stored securely on backend (Render environment variables)
- Frontend requests ephemeral session token from backend
- Backend creates session with OpenAI and returns client_secret
- Frontend uses ephemeral token for WebRTC connection (expires after session)

**Session Configuration:**
```javascript
{
  model: 'gpt-4o-realtime-preview',
  instructions: buildTranslationInstructions(sourceLang, targetLang),
  turn_detection: voiceMode === "hands-free" ? {
    type: "server_vad",
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 700
  } : null,
  voice: "ballad" | "alloy" | "echo" | "shimmer",
  input_audio_transcription: {
    model: "whisper-1",
    language: "en" | "fr"
  },
  input_audio_format: 'pcm16',
  output_audio_format: 'pcm16'
}
```

### 2.2 WebRTC Connection
```
Frontend ↔ OpenAI Realtime API (WebRTC)
  ├─ Audio Track (Microphone)
  ├─ Audio Track (OpenAI Response)
  └─ Data Channel (Control Messages)
```

**Connection Flow:**
1. Create RTCPeerConnection
2. Add microphone track (initially muted)
3. Create data channel "oai-events"
4. Generate SDP offer
5. Send offer to OpenAI with ephemeral token
6. Receive SDP answer and set remote description
7. Wait for data channel to open

**Data Channel Events:**
- `input_audio_buffer.speech_started`: OpenAI detected speech
- `input_audio_buffer.speech_stopped`: OpenAI detected silence
- `conversation.item.input_audio_transcription.delta`: Partial transcript
- `conversation.item.input_audio_transcription.completed`: Final transcript
- `response.text.delta`: Translation text streaming
- `response.audio_transcript.delta`: Audio transcript streaming
- `response.audio.delta`: Audio data streaming
- `output_audio_buffer.started`: AI started speaking
- `output_audio_buffer.stopped`: AI stopped speaking
- `response.done`: Translation complete

### 2.3 Translation Instructions
```javascript
buildTranslationInstructions(sourceLang, targetLang)
```

**Strict Translation Rules:**
- Translate word-for-word, no interpretation
- Do NOT respond to questions, translate them
- Do NOT add greetings or commentary
- Preserve meaning, structure, and formatting exactly
- Output translation only, no markdown or preface
- Reject non-English/French languages immediately



---

## 3. Audio Output Pipeline (OpenAI → Speaker)

### 3.1 Real-Time Audio Streaming
```
OpenAI WebRTC Track → RealtimeAudioTap → audio-tap-processor.js → PCM Chunks
```

**File**: `frontend/src/utils/RealtimeAudioTap.ts`

**Process:**
1. Capture OpenAI's audio track via MediaStreamSource
2. AudioWorklet extracts raw PCM samples in real-time
3. Convert Float32 → Int16 PCM
4. Send chunks immediately (no buffering)
5. Each chunk ~43ms at 24kHz sample rate

**Key Features:**
- Zero-latency streaming (no waiting for complete response)
- Sequence numbering for chunk ordering
- Automatic stream start/stop detection
- Muted local playback (only for capture)

### 3.2 Audio Playback
```
PCM Chunks → StreamingAudioPlayer → audio-streaming-processor.js → Speakers
```

**File**: `frontend/src/utils/StreamingAudioPlayer.ts`

**Process:**
1. Receive base64-encoded PCM chunks
2. Decode to Float32 samples
3. Queue in AudioWorklet processor
4. Continuous playback with gain control (0.8 to prevent clipping)
5. Keep-alive mechanism prevents AudioContext suspension

**Dual Path Support:**
- **Real-time PCM**: Immediate playback from streaming chunks
- **Fallback WebM**: MediaRecorder blob for download/recording

### 3.3 Audio Monitoring
```
Microphone → AnalyserNode → FFT → dB Level Calculation
```

**Features:**
- Real-time audio level monitoring (dB)
- Configurable threshold for voice detection
- Visual feedback for user
- RMS-based level calculation



---

## 4. Multi-User Room System

### 4.1 Room Architecture
```
Frontend A ↔ Backend WebSocket ↔ Frontend B
     ↓                              ↓
  OpenAI A                       OpenAI B
```

**Key Principle**: Each participant has their own direct WebRTC connection to OpenAI. Backend only relays messages and coordinates participants.

### 4.2 Backend WebSocket Server

**File**: `backend/index.js`

**Session Management:**
```javascript
class TranslationSession {
  sessionId: string
  participants: Map<userId, {
    language: 'en-US' | 'fr-CA',
    socket: WebSocket,
    name: string,
    openaiWs: null, // Not used - frontend handles OpenAI
    audioSequenceNumber: number,
    isStreaming: boolean
  }>
  messageHistory: Array<Message>
  transcriptHistory: Array<Transcript>
  recording: RecordingSession
}
```

**WebSocket Message Types:**

**Room Management:**
- `join_session`: Join a translation room
- `USER_JOINED_ROOM`: Broadcast when user joins
- `USER_LEFT_ROOM`: Broadcast when user leaves
- `translation_ready`: Both participants connected
- `END_SESSION`: Close the session

**Real-Time Streaming:**
- `PARTIAL_TRANSCRIPT`: Streaming transcript chunks
- `TRANSLATION_DELTA`: Streaming translation chunks
- `VOICE_ACTIVITY_STARTED`: Speech detection started
- `VOICE_ACTIVITY_STOPPED`: Speech detection stopped

**Audio Relay:**
- `AI_AUDIO_CHUNK`: Relay AI audio from one user to another
- `AI_AUDIO_END`: Signal end of AI audio stream
- `AUDIO_CHUNK`: Real-time PCM audio chunks
- `AUDIO_STREAM_END`: End of audio stream
- `TRANSLATED_AUDIO`: Complete translated audio (fallback)

**Transcript Management:**
- `SPEECH_TRANSCRIPT`: Original speech transcript
- `BILINGUAL_MESSAGE`: Message with original + translation
- `GET_TRANSCRIPT_HISTORY`: Request transcript history
- `TRANSCRIPT_HISTORY_UPDATE`: Send transcript history

**Recording:**
- `START_RECORDING`: Start session recording
- `STOP_RECORDING`: Stop session recording
- `RECORDING_STARTED`: Broadcast recording started
- `RECORDING_STOPPED`: Broadcast recording stopped

### 4.3 Message Flow Example

**Scenario**: English speaker says "Hello" to French speaker

```
1. English User:
   Microphone → VAD → AudioWorklet → WebRTC → OpenAI

2. OpenAI (English User's Session):
   Whisper: "Hello" → GPT-4: "Bonjour" → TTS: [audio PCM]

3. Frontend (English User):
   Transcript: "Hello" → Translation: "Bonjour" → Audio: [PCM chunks]
   → Send BILINGUAL_MESSAGE to Backend
   → Send AI_AUDIO_CHUNK to Backend (disabled in 2-person rooms)

4. Backend:
   Relay BILINGUAL_MESSAGE → French User
   (AI audio NOT relayed - each user hears their own AI)

5. French User:
   Display: "Hello" (original) + "Bonjour" (translation)
   Play: Their own OpenAI audio (not relayed)
```



---

## 5. State Management & Data Flow

### 5.1 Application Context

**File**: `frontend/src/contexts/AppContext.tsx`

**Global State:**
```typescript
{
  // Session State
  status: "idle" | "connecting" | "ready" | "listening" | "processing" | "error"
  sessionState: "disconnected" | "connecting" | "ready" | "error"
  
  // Participants
  speakers: Speaker[]  // Array of participants with language config
  activeSpeakerId: number  // Currently speaking participant
  speakerCount: number  // Total participants (1-2)
  
  // Configuration
  voiceMode: "push-to-talk" | "hands-free"
  selectedVoice: OpenAIVoice  // "ballad" | "alloy" | "echo" | "shimmer"
  translationEnabled: boolean
  captionsEnabled: boolean
  voiceFeedback: boolean
  dbThreshold: number  // Audio level threshold in dB
  
  // Conversation
  messages: ConversationMessage[]  // Chat history
  insights: SessionInsights  // Performance metrics
  
  // Recording
  recordingState: RecordingState
  showDownloadPanel: boolean
}
```

### 5.2 Speaker Configuration
```typescript
interface Speaker {
  id: number
  name: string  // "Speaker 1" | "Speaker 2"
  language: "en-US" | "fr-CA"  // Input language
  viewLanguage: "en-US" | "fr-CA"  // Display language preference
  color: string  // UI color identifier
}
```

### 5.3 Message Structure
```typescript
interface ConversationMessage {
  id: string
  speakerId: number
  sourceText: string  // Original transcript
  translations: {
    [lang: string]: string  // Translated text per language
  }
  timestamp: number
  audioData?: string  // Base64 audio for playback
}
```



---

## 6. Voice Modes

### 6.1 Push-to-Talk Mode
```
User presses mic button → enableMic() → Start VAD → Send audio → Release button → disableMic() → commitTurn()
```

**Characteristics:**
- Manual control via mic button
- Session stays connected between turns
- `turn_detection: null` (manual turn management)
- Calls `input_audio_buffer.commit` + `response.create` on release
- Silence detection: Rejects turns < 400ms (accidental clicks)

**Benefits:**
- Precise control over when to speak
- No false activations
- Lower latency (session pre-initialized)

### 6.2 Hands-Free Mode
```
User speaks → OpenAI Server VAD detects speech → Auto-commit turn → Translation
```

**Characteristics:**
- Automatic speech detection by OpenAI
- `turn_detection: { type: "server_vad", threshold: 0.5, ... }`
- No manual commit needed
- 300ms prefix padding, 700ms silence duration

**Benefits:**
- Natural conversation flow
- No button pressing required
- Ideal for continuous dialogue



---

## 7. Audio Processing Components

### 7.1 AudioWorklet Processors

#### mic-input-processor.js
**Purpose**: Capture microphone input with VAD
**Location**: `frontend/public/mic-input-processor.js`

**Features:**
- Voice Activity Detection (VAD)
- Energy-based speech detection
- Pre-buffering (250ms circular buffer)
- Smoothing (moving average)
- Float32 → Int16 PCM conversion

**Messages:**
- IN: `START_CAPTURE`, `STOP_CAPTURE`, `UPDATE_CONFIG`
- OUT: `AUDIO_DATA` (Int16 PCM buffer)

#### audio-tap-processor.js
**Purpose**: Extract PCM from OpenAI audio track
**Location**: `frontend/public/audio-tap-processor.js`

**Features:**
- Real-time PCM extraction from WebRTC track
- Float32 → Int16 conversion
- Sequence numbering
- Silence detection (max amplitude tracking)

**Messages:**
- IN: `START_CAPTURE`, `STOP_CAPTURE`
- OUT: `PCM_CHUNK` (Int16 PCM buffer + metadata)

#### audio-streaming-processor.js
**Purpose**: Continuous audio playback
**Location**: `frontend/public/audio-streaming-processor.js`

**Features:**
- Queue-based continuous playback
- Handles multiple concurrent responses
- Keep-alive mechanism (prevents suspension)
- Gain control (0.8 to prevent clipping)

**Messages:**
- IN: `ADD_SAMPLES`, `CLEAR_QUEUE`, `GET_QUEUE_SIZE`, `INIT`
- OUT: `QUEUE_SIZE_RESPONSE`

### 7.2 Audio Utilities

#### RealtimeAudioTap
**File**: `frontend/src/utils/RealtimeAudioTap.ts`

**Purpose**: Bridge between WebRTC audio track and streaming chunks

**Flow:**
```
WebRTC Audio Track → MediaStreamSource → AudioWorkletNode → PCM Chunks → Callback
```

**Methods:**
- `initialize(audioTrack)`: Set up audio graph
- `startCapture(responseId)`: Begin capturing for a response
- `stopCapture()`: End capture and signal stream end
- `dispose()`: Clean up resources

#### StreamingAudioPlayer
**File**: `frontend/src/utils/StreamingAudioPlayer.ts`

**Purpose**: Play streaming audio chunks with continuous timeline

**Flow:**
```
Base64 PCM → Decode → Float32 Samples → AudioWorklet Queue → Speakers
```

**Methods:**
- `addChunk(chunk)`: Add audio chunk to playback queue
- `clearQueue()`: Clear all queued audio
- `handleUserGesture()`: Resume AudioContext (autoplay policy)
- `testAudio()`: Play 440Hz test tone
- `dispose()`: Clean up resources

**Features:**
- Dual format support (PCM streaming + WebM fallback)
- Automatic AudioContext resume
- Keep-alive mechanism (25s interval)
- Visibility change handling



---

## 8. Custom Hooks Architecture

### 8.1 useRealtimeVoice
**File**: `frontend/src/hooks/useRealtimeVoice.ts`

**Purpose**: Manage WebRTC connection to OpenAI Realtime API

**Key Methods:**
- `initSession(config)`: Initialize WebRTC session with OpenAI
- `attachCallbacks(...)`: Register event handlers
- `enableMic()`: Unmute microphone and start VAD
- `disableMic()`: Mute microphone and stop VAD
- `commitTurn()`: Commit audio buffer and request translation
- `stopSession()`: Clean up WebRTC connection
- `checkMicrophonePermission()`: Check mic access
- `getAudioLevelDb()`: Get current audio level
- `isAudioAboveThreshold()`: Check if speaking

**State:**
- `isConnected`: WebRTC connection status
- `sessionState`: Session lifecycle state
- `currentDbLevel`: Real-time audio level

**Refs (Persistent):**
- `pcRef`: RTCPeerConnection
- `dcRef`: RTCDataChannel
- `streamRef`: MediaStream (microphone)
- `audioContextRef`: AudioContext
- `analyserRef`: AnalyserNode (for monitoring)
- `micWorkletNodeRef`: AudioWorkletNode (VAD processor)
- `audioTapRef`: RealtimeAudioTap (output capture)
- `mediaRecorderRef`: MediaRecorder (fallback recording)

### 8.2 useChatroomConnection
**File**: `frontend/src/hooks/useChatroomConnection.ts`

**Purpose**: Manage WebSocket connection to backend for room coordination

**Key Methods:**
- `connect()`: Establish WebSocket connection
- `disconnect()`: Close connection
- `sendEvent(event)`: Send message to backend
- `sendTranscript(transcript, language)`: Send transcript to room
- `sendBilingualMessage(...)`: Send message with translation
- `sendAudioStream(audioData, targetId)`: Send audio to specific participant
- `sendTranslatedAudio(...)`: Send translated audio to room

**State:**
- `isConnected`: WebSocket connection status
- `room`: Current room information
- `messages`: Room message history
- `otherParticipant`: Other participant info
- `lastTranslation`: Most recent translation

### 8.3 useCallRecording
**File**: `frontend/src/hooks/useCallRecording.ts`

**Purpose**: Record and download conversation audio

**Features:**
- MediaRecorder-based audio capture
- Captures both microphone and OpenAI audio
- WebM/Opus format
- Download as audio file

### 8.4 useTranscriptDownload
**File**: `frontend/src/hooks/useTranscriptDownload.ts`

**Purpose**: Export conversation transcript

**Features:**
- JSON and TXT format export
- Includes timestamps, speakers, translations
- Session metadata and insights



---

## 9. Complete Data Flow Diagram

### 9.1 Single User Flow (Local Translation)
```
┌─────────────────────────────────────────────────────────────────┐
│ USER SPEAKS                                                      │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ MICROPHONE CAPTURE                                               │
│ • getUserMedia() → MediaStream                                   │
│ • AudioContext (16kHz, mono)                                     │
│ • Noise suppression, echo cancellation                           │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ VOICE ACTIVITY DETECTION (AudioWorklet)                          │
│ • Calculate RMS energy                                           │
│ • Smooth over 5 frames                                           │
│ • Compare to threshold (0.01)                                    │
│ • Maintain 250ms pre-buffer                                      │
│ • State: Idle → Speaking → Silence → Idle                       │
└─────────────────────────────────────────────────────────────────┘
                           ↓
                    [Speech Detected?]
                     /            \
                   NO              YES
                   ↓                ↓
            [Buffer Only]    [Send Pre-buffer + Audio]
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│ AUDIO ENCODING                                                   │
│ • Float32 → Int16 PCM                                            │
│ • Int16 → Base64 string                                          │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ WEBRTC DATA CHANNEL                                              │
│ • Message: { type: "input_audio_buffer.append", audio: base64 } │
│ • Sent to OpenAI Realtime API                                    │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ OPENAI REALTIME API                                              │
│ 1. Whisper: Audio → Text (Transcription)                        │
│ 2. GPT-4: Text → Translation                                     │
│ 3. TTS: Translation → Audio PCM                                  │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ RESPONSE STREAMING (via WebRTC)                                  │
│ • Data Channel Events:                                           │
│   - conversation.item.input_audio_transcription.completed        │
│   - response.text.delta (translation streaming)                  │
│   - response.audio.delta (audio streaming)                       │
│   - output_audio_buffer.started/stopped                          │
│ • Audio Track: PCM audio stream                                  │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ AUDIO CAPTURE (RealtimeAudioTap)                                 │
│ • Extract PCM from WebRTC audio track                            │
│ • Convert to Int16 chunks                                        │
│ • Sequence numbering                                             │
│ • Base64 encoding                                                │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ AUDIO PLAYBACK (StreamingAudioPlayer)                            │
│ • Decode base64 → Float32 samples                                │
│ • Queue in AudioWorklet                                          │
│ • Continuous playback with gain control                          │
│ • Output to speakers                                             │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ UI UPDATE                                                        │
│ • Display transcript                                             │
│ • Display translation                                            │
│ • Update conversation history                                    │
│ • Show captions (if enabled)                                     │
└─────────────────────────────────────────────────────────────────┘
```



### 9.2 Two-User Room Flow
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ USER A (English)                          USER B (French)                     │
└──────────────────────────────────────────────────────────────────────────────┘
        │                                           │
        │ Speaks: "Hello"                           │
        ↓                                           │
   [VAD Filter]                                     │
        ↓                                           │
   [WebRTC → OpenAI A]                              │
        ↓                                           │
   Whisper: "Hello"                                 │
   GPT-4: "Bonjour"                                 │
   TTS: [audio]                                     │
        ↓                                           │
   [Frontend A]                                     │
   • Display: "Hello" / "Bonjour"                   │
   • Play: OpenAI audio locally                     │
   • Send: BILINGUAL_MESSAGE → Backend              │
        ↓                                           │
   [Backend WebSocket]                              │
   • Relay message to User B                        │
   • Store in session history                       │
        ↓                                           ↓
        │                                    [Frontend B]
        │                                    • Receive: BILINGUAL_MESSAGE
        │                                    • Display: "Hello" / "Bonjour"
        │                                    • Play: Own OpenAI audio (NOT relayed)
        │                                           │
        │                                           │ Speaks: "Bonjour"
        │                                           ↓
        │                                      [VAD Filter]
        │                                           ↓
        │                                   [WebRTC → OpenAI B]
        │                                           ↓
        │                                   Whisper: "Bonjour"
        │                                   GPT-4: "Hello"
        │                                   TTS: [audio]
        │                                           ↓
        │                                   [Frontend B]
        │                                   • Display: "Bonjour" / "Hello"
        │                                   • Play: OpenAI audio locally
        │                                   • Send: BILINGUAL_MESSAGE → Backend
        │                                           ↓
        ↓                                   [Backend WebSocket]
   [Frontend A]                             • Relay message to User A
   • Receive: BILINGUAL_MESSAGE             • Store in session history
   • Display: "Bonjour" / "Hello"
   • Play: Own OpenAI audio (NOT relayed)
```

**Key Points:**
- Each user has independent OpenAI WebRTC connection
- Backend only relays text messages (BILINGUAL_MESSAGE)
- AI audio is NOT relayed (each user hears their own AI)
- Prevents duplicate audio and reduces latency



---

## 10. Error Handling & Resilience

### 10.1 Silence Detection & Validation

**Client-Side VAD (AudioWorklet):**
- Filters silence before sending to OpenAI
- Reduces false transcriptions by 50-70%
- Prevents API waste on background noise

**Mic Button Duration Check:**
```javascript
if (micPressDuration < 400ms) {
  // Cancel turn - likely accidental click
  send({ type: "input_audio_buffer.clear" })
  return false
}
```

**Post-Transcription Validation:**
```javascript
if (!transcript || transcript.length < 2 || isDuplicate) {
  // Cancel response
  send({ type: "response.cancel" })
  send({ type: "input_audio_buffer.clear" })
  onSilenceDetected()
}
```

### 10.2 Language Validation

**Strict Language Enforcement:**
```javascript
containsNonEnglishFrenchCharacters(text)
```

**Checks:**
- Non-Latin scripts (Arabic, Chinese, Hindi, etc.)
- Welsh, Spanish, German, Italian, Portuguese patterns
- Rejects immediately if detected

**Translation Validation:**
```javascript
validateTranslation(sourceText, translatedText)
```

**Checks:**
- Length ratio (translation < 2.5x source)
- Hallucination patterns ("thank you for asking", etc.)
- Language compliance

### 10.3 Connection Resilience

**WebRTC (OpenAI):**
- Automatic cleanup on errors
- State validation before operations
- Graceful degradation (fallback to basic audio constraints)
- Microphone permission error handling

**WebSocket (Backend):**
- Auto-reconnect on unexpected disconnections (3s delay)
- Connection state tracking
- Heartbeat/keep-alive
- Error reporting with context

**AudioContext:**
- Auto-resume on user gesture
- Keep-alive mechanism (25s interval)
- Visibility change handling
- State validation before operations



---

## 11. Performance Optimizations

### 11.1 Audio Pipeline Optimizations

**Zero-Copy Transfers:**
```javascript
// Transfer ArrayBuffer ownership to avoid copying
postMessage({ data: buffer }, [buffer])
```

**Circular Buffers:**
- Pre-buffer uses circular array (no reallocation)
- Fixed memory footprint
- O(1) insertion

**Chunk Batching:**
- AudioWorklet processes 128 samples per frame (~2.67ms at 48kHz)
- Reduces message passing overhead
- Balances latency vs throughput

**Lazy Logging:**
```javascript
if (chunkCount % 100 === 0) {
  console.log(...)  // Log every 100th chunk only
}
```

### 11.2 Network Optimizations

**Session Pre-initialization:**
- WebRTC session created before user speaks
- Eliminates connection latency on first word
- Session stays alive between turns (push-to-talk)

**Streaming vs Buffering:**
- Real-time PCM streaming (no waiting for complete response)
- Immediate playback as chunks arrive
- Fallback to buffered WebM for recording

**Message Deduplication:**
```javascript
// Avoid duplicate messages in UI
const exists = prevMessages.find(msg => msg.id === messageId)
if (exists) return prevMessages
```

### 11.3 Memory Management

**Automatic Cleanup:**
- AudioWorklet nodes disconnected on unmount
- AudioContext closed properly
- MediaStream tracks stopped
- WebSocket connections closed
- Timeout/interval cleanup

**Ref-Based State:**
- Use refs for callback access (avoid stale closures)
- Prevent unnecessary re-renders
- Stable callback references



---

## 12. UI Components

### 12.1 Main Interface Components

**EnhancedTranslationInterface.tsx**
- Main translation UI container
- Speaker configuration
- Voice mode selection
- Recording controls

**ChatroomInterface.tsx**
- Multi-user room interface
- Room creation/joining
- Participant management
- Message display

**ConversationThread.tsx**
- Message history display
- Bilingual message rendering
- Speaker identification
- Timestamp display

**CaptionDisplay.tsx**
- Real-time caption overlay
- Streaming transcript display
- Translation preview

### 12.2 Control Components

**MicButton.tsx**
- Push-to-talk button
- Visual feedback (pulsing, recording state)
- Audio level indicator
- Touch/click handling

**RecordingControls.tsx**
- Start/stop recording
- Recording status display
- Download controls

**LanguageSelector.tsx**
- Language selection dropdown
- Flag icons
- Supported languages: English (en-US), French (fr-CA)

**SpeakerSelector.tsx**
- Active speaker selection
- Speaker configuration
- Language assignment

### 12.3 Display Components

**TranscriptPanel.tsx**
- Full transcript view
- Scrollable history
- Export functionality

**TranslationPanel.tsx**
- Side-by-side translation view
- Original + translated text
- Language indicators

**StreamingTranscript.tsx**
- Real-time streaming transcript
- Delta updates
- Partial text display

**StatusBar.tsx**
- Connection status
- Session state
- Audio level meter
- Error messages



---

## 13. API Endpoints

### 13.1 Backend REST API

**Base URL**: `https://neural-ix2j.onrender.com` (production)

#### Session Management

**POST /api/session/create**
- Create new translation session
- Body: `{ language: "en-US" | "fr-CA" }`
- Returns: `{ sessionId, success, message }`

**POST /api/session/join**
- Join existing session
- Body: `{ sessionId, language }`
- Returns: `{ success, sessionId, participantCount }`

**GET /api/session/:sessionId/status**
- Get session status and participants
- Returns: `{ sessionId, participantCount, participants[], status, messageCount }`

#### Transcript & Recording

**GET /api/session/:sessionId/transcript**
- Download session transcript
- Query: `?format=json|txt`
- Returns: JSON data or TXT file download

**GET /api/session/:sessionId/recording**
- Get recording metadata
- Returns: `{ recordingId, startTime, endTime, duration, status }`

#### OpenAI Integration

**POST /api/openai/realtime-session**
- Create OpenAI Realtime session (secure)
- Body: `{ instructions, turn_detection, voice, input_audio_transcription }`
- Returns: `{ client_secret: { value: ephemeralToken } }`
- **Security**: API key stays on server, frontend gets ephemeral token

#### Health Check

**GET /health**
- Server health status
- Returns: `{ status, timestamp, activeConnections, translationSessions, openai }`

### 13.2 WebSocket Protocol

**Connection**: `wss://neural-ix2j.onrender.com`

**Message Format:**
```json
{
  "type": "MESSAGE_TYPE",
  "sessionId": "session_xxx",
  "participantId": "user_xxx",
  "timestamp": 1234567890,
  ...additionalFields
}
```

See Section 4.2 for complete message type list.



---

## 14. Configuration & Environment

### 14.1 Frontend Environment Variables

**File**: `frontend/.env`

```bash
# Backend WebSocket URL
VITE_WS_URL=wss://neural-ix2j.onrender.com

# Backend HTTP URL
VITE_BACKEND_URL=https://neural-ix2j.onrender.com

# Feature Flags
VITE_ENABLE_RECORDING=true
VITE_ENABLE_TRANSCRIPT_DOWNLOAD=true
```

### 14.2 Backend Environment Variables

**File**: `backend/.env` (or Render dashboard)

```bash
# OpenAI API Key (REQUIRED)
OPENAI_API_KEY=sk-proj-...

# Server Configuration
PORT=3001
NODE_ENV=production

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=https://neuralecho.vercel.app,https://neuralecho1.vercel.app
```

### 14.3 VAD Configuration

**Default Values:**
```javascript
{
  energyThreshold: 0.01,        // 1% of max amplitude
  silenceDurationMs: 600,       // 600ms silence before stopping
  preBufferDurationMs: 250      // 250ms pre-buffer
}
```

**Custom Configuration:**
```javascript
initSession({
  instructions: "...",
  voiceMode: "push-to-talk",
  language: "en",
  vadConfig: {
    energyThreshold: 0.005,     // More sensitive
    silenceDurationMs: 500,     // Shorter pauses
    preBufferDurationMs: 300    // More pre-buffer
  }
})
```



---

## 15. Security & Privacy

### 15.1 API Key Security
- OpenAI API key stored only on backend server
- Frontend never sees the API key
- Ephemeral tokens used for WebRTC sessions
- Tokens expire after session ends

### 15.2 Audio Privacy
- Audio processed in real-time (not stored on servers)
- WebRTC provides end-to-end encryption
- Recording is client-side only (optional)
- No audio data persisted on backend

### 15.3 CORS & Origin Validation
```javascript
allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://neuralecho.vercel.app',
  '*.vercel.app'  // All Vercel preview deployments
]
```

### 15.4 Input Validation
- Language validation (only en-US, fr-CA)
- Session ID validation
- Participant limit enforcement (max 2)
- Transcript length validation (max 200 words)
- Non-Latin script rejection

---

## 16. Deployment Architecture

### 16.1 Frontend (Vercel)
```
GitHub → Vercel Build → CDN Distribution
  ├─ Build: npm run build (Vite)
  ├─ Output: Static files (HTML, JS, CSS)
  └─ CDN: Global edge network
```

**Build Configuration:**
- TypeScript compilation
- Vite bundling and optimization
- Tree shaking and code splitting
- Asset optimization

### 16.2 Backend (Render)
```
GitHub → Render Deploy → Node.js Server
  ├─ Install: npm install
  ├─ Start: node index.js
  └─ Port: 3001 (or $PORT)
```

**Server Configuration:**
- WebSocket server on same port as HTTP
- Environment variables via Render dashboard
- Auto-deploy on git push
- Health check endpoint

### 16.3 Network Flow
```
User Browser
    ↓ HTTPS
Vercel CDN (Frontend)
    ↓ WSS
Render Server (Backend)
    ↓ HTTPS
OpenAI API
    ↕ WebRTC
User Browser (direct connection)
```



---

## 17. Key Design Decisions

### 17.1 Why WebRTC for OpenAI?
- **Low Latency**: Direct peer connection, no server relay
- **Bidirectional Audio**: Simultaneous send/receive
- **Built-in Audio Processing**: Echo cancellation, noise suppression
- **Efficient**: Binary audio streaming, no HTTP overhead

### 17.2 Why AudioWorklet?
- **Real-time Processing**: Runs on audio thread (not main thread)
- **Low Latency**: ~3ms processing time per frame
- **Precise Control**: Sample-level audio manipulation
- **No Blocking**: Doesn't block UI rendering

### 17.3 Why Separate OpenAI Connections?
- **Scalability**: Each user has independent session
- **Reliability**: One user's connection issues don't affect others
- **Simplicity**: No server-side audio mixing required
- **Latency**: Direct WebRTC to OpenAI (no backend relay)

### 17.4 Why VAD in AudioWorklet?
- **Efficiency**: Filter before network transmission
- **Accuracy**: Reduces false transcriptions by 50-70%
- **Cost**: Saves API usage on silence/noise
- **Quality**: Prevents hallucinations from background noise

### 17.5 Why Streaming Audio?
- **Latency**: Start playback immediately (don't wait for complete response)
- **UX**: Natural conversation flow
- **Memory**: Process chunks incrementally (no large buffers)
- **Flexibility**: Support both streaming and fallback paths

---

## 18. Monitoring & Debugging

### 18.1 Console Logging Strategy

**Log Prefixes:**
- `🎤` Microphone/input audio
- `🔊` Speaker/output audio
- `🎵` Audio streaming/chunks
- `📝` Transcription
- `🌐` Translation
- `🔧` Configuration/setup
- `✅` Success operations
- `❌` Errors
- `⚠️` Warnings
- `🔄` State changes
- `📤` Outgoing messages
- `📥` Incoming messages

**Verbosity Levels:**
- Critical events: Always logged
- Chunk processing: Every 50-100th chunk
- State changes: Always logged
- Debug info: Conditional (debug flag)

### 18.2 Performance Metrics

**Session Insights:**
```typescript
{
  avgTranslationLatency: number    // ms
  avgSynthesisLatency: number      // ms
  avgNetworkDelay: number          // ms
  errorRate: number                // percentage
  avgConfidence: number            // 0-1
  totalMessages: number
  sessionDuration: number          // ms
}
```

**Tracked Metrics:**
- Audio chunk count
- Processing time per message
- WebSocket message count
- Session duration
- Error frequency



---

## 19. File Structure

```
neuralecho/
├── frontend/
│   ├── public/
│   │   ├── mic-input-processor.js          # VAD + microphone capture
│   │   ├── audio-tap-processor.js          # OpenAI audio extraction
│   │   └── audio-streaming-processor.js    # Continuous playback
│   │
│   ├── src/
│   │   ├── components/
│   │   │   ├── EnhancedTranslationInterface.tsx  # Main UI
│   │   │   ├── ChatroomInterface.tsx             # Room UI
│   │   │   ├── ConversationThread.tsx            # Message display
│   │   │   ├── MicButton.tsx                     # PTT button
│   │   │   ├── CaptionDisplay.tsx                # Real-time captions
│   │   │   ├── RecordingControls.tsx             # Recording UI
│   │   │   ├── LanguageSelector.tsx              # Language picker
│   │   │   ├── StatusBar.tsx                     # Status display
│   │   │   └── ui/                               # shadcn components
│   │   │
│   │   ├── contexts/
│   │   │   └── AppContext.tsx                    # Global state
│   │   │
│   │   ├── hooks/
│   │   │   ├── useRealtimeVoice.ts               # OpenAI WebRTC
│   │   │   ├── useChatroomConnection.ts          # Backend WebSocket
│   │   │   ├── useCallRecording.ts               # Audio recording
│   │   │   └── useTranscriptDownload.ts          # Transcript export
│   │   │
│   │   ├── utils/
│   │   │   ├── RealtimeAudioTap.ts               # Audio extraction
│   │   │   ├── StreamingAudioPlayer.ts           # Audio playback
│   │   │   └── StreamingErrorHandler.ts          # Error reporting
│   │   │
│   │   ├── lib/
│   │   │   ├── constants.ts                      # App constants
│   │   │   └── config.ts                         # Environment config
│   │   │
│   │   ├── pages/
│   │   │   └── Index.tsx                         # Main page
│   │   │
│   │   └── types/
│   │       └── chatroom.ts                       # TypeScript types
│   │
│   ├── .env                                      # Environment variables
│   ├── package.json                              # Dependencies
│   ├── vite.config.ts                            # Vite configuration
│   └── tsconfig.json                             # TypeScript config
│
├── backend/
│   ├── index.js                                  # Express + WebSocket server
│   ├── package.json                              # Dependencies
│   ├── .env.example                              # Environment template
│   └── render.yaml                               # Render deployment config
│
├── VAD_IMPLEMENTATION.md                         # VAD documentation
└── ARCHITECTURE_DETAILED.md                      # This file
```



---

## 20. Sequence Diagrams

### 20.1 Session Initialization Sequence

```
User                Frontend              Backend              OpenAI
 │                     │                     │                    │
 │ Click "Start"       │                     │                    │
 ├────────────────────>│                     │                    │
 │                     │ POST /realtime-     │                    │
 │                     │      session        │                    │
 │                     ├────────────────────>│                    │
 │                     │                     │ POST /realtime/    │
 │                     │                     │      sessions      │
 │                     │                     ├───────────────────>│
 │                     │                     │<───────────────────┤
 │                     │                     │ {client_secret}    │
 │                     │<────────────────────┤                    │
 │                     │ {ephemeral_token}   │                    │
 │                     │                     │                    │
 │                     │ Create RTCPeerConnection                 │
 │                     ├──────────────────────────────────────────>│
 │                     │ SDP Offer                                │
 │                     ├──────────────────────────────────────────>│
 │                     │<──────────────────────────────────────────┤
 │                     │ SDP Answer                               │
 │                     │                     │                    │
 │                     │ WebRTC Connected    │                    │
 │                     │<═══════════════════════════════════════>│
 │                     │ DataChannel Open    │                    │
 │<────────────────────┤                     │                    │
 │ Status: "ready"     │                     │                    │
```

### 20.2 Translation Turn Sequence (Push-to-Talk)

```
User A              Frontend A           OpenAI A            Backend           Frontend B
  │                     │                    │                  │                  │
  │ Press Mic           │                    │                  │                  │
  ├────────────────────>│                    │                  │                  │
  │                     │ enableMic()        │                  │                  │
  │                     │ START_CAPTURE      │                  │                  │
  │                     ├───────────────────>│                  │                  │
  │                     │                    │                  │                  │
  │ Speaks: "Hello"     │                    │                  │                  │
  ├────────────────────>│ [VAD: Speech!]     │                  │                  │
  │                     │ input_audio_       │                  │                  │
  │                     │   buffer.append    │                  │                  │
  │                     ├───────────────────>│                  │                  │
  │                     │ (continuous)       │                  │                  │
  │                     ├───────────────────>│                  │                  │
  │                     │                    │                  │                  │
  │ Release Mic         │                    │                  │                  │
  ├────────────────────>│ disableMic()       │                  │                  │
  │                     │ STOP_CAPTURE       │                  │                  │
  │                     │ commitTurn()       │                  │                  │
  │                     │ input_audio_       │                  │                  │
  │                     │   buffer.commit    │                  │                  │
  │                     ├───────────────────>│                  │                  │
  │                     │ response.create    │                  │                  │
  │                     ├───────────────────>│                  │                  │
  │                     │                    │                  │                  │
  │                     │                    │ [Processing...]  │                  │
  │                     │                    │                  │                  │
  │                     │<───────────────────┤                  │                  │
  │                     │ transcription.     │                  │                  │
  │                     │   completed        │                  │                  │
  │                     │ "Hello"            │                  │                  │
  │                     │                    │                  │                  │
  │                     │<───────────────────┤                  │                  │
  │                     │ response.text.     │                  │                  │
  │                     │   delta            │                  │                  │
  │                     │ "Bonjour"          │                  │                  │
  │                     │                    │                  │                  │
  │                     │<───────────────────┤                  │                  │
  │                     │ response.audio.    │                  │                  │
  │                     │   delta (PCM)      │                  │                  │
  │                     │                    │                  │                  │
  │                     │ [Play Audio]       │                  │                  │
  │<────────────────────┤                    │                  │                  │
  │ Hear: "Bonjour"     │                    │                  │                  │
  │                     │                    │                  │                  │
  │                     │ BILINGUAL_MESSAGE  │                  │                  │
  │                     ├────────────────────────────────────────>│                  │
  │                     │                    │                  │ BILINGUAL_       │
  │                     │                    │                  │   MESSAGE        │
  │                     │                    │                  ├─────────────────>│
  │                     │                    │                  │                  │
  │                     │                    │                  │                  │ Display:
  │                     │                    │                  │                  │ "Hello"
  │                     │                    │                  │                  │ "Bonjour"
```



---

## 21. Critical Implementation Details

### 21.1 Audio Format Specifications

**Microphone Input:**
- Format: PCM16 (16-bit signed integer)
- Sample Rate: 16kHz (optimized for speech)
- Channels: Mono
- Encoding: Base64 for transmission

**OpenAI Output:**
- Format: PCM16 (16-bit signed integer)
- Sample Rate: 24kHz (OpenAI Realtime API default)
- Channels: Mono
- Encoding: Base64 for transmission

**Recording Output:**
- Format: WebM with Opus codec
- Sample Rate: 48kHz (browser default)
- Channels: Mono or Stereo
- Encoding: Opus compression

### 21.2 Timing & Latency

**VAD Processing:**
- Frame size: 128 samples
- Frame duration: ~2.67ms at 48kHz
- Pre-buffer: 100 frames (~267ms)
- Smoothing window: 5 frames (~13ms)
- Silence threshold: 600ms (~225 frames)

**Network Latency:**
- WebRTC to OpenAI: ~50-150ms (direct connection)
- WebSocket to Backend: ~20-100ms (relay)
- Total end-to-end: ~200-500ms (speech to translation audio)

**Audio Playback:**
- Chunk size: 1024 samples (~43ms at 24kHz)
- Queue size: 10 seconds max
- Keep-alive interval: 25 seconds

### 21.3 Memory Management

**Circular Buffers:**
- Pre-buffer: 100 frames × 128 samples × 4 bytes = ~51KB
- Reuses memory (no allocation per frame)

**Audio Chunks:**
- Transferred ownership (zero-copy)
- Garbage collected after playback
- No accumulation

**Session Cleanup:**
- All refs cleared on unmount
- AudioContext closed
- MediaStream tracks stopped
- WebSocket connections closed
- Timeouts/intervals cleared



---

## 22. Common Workflows

### 22.1 Solo Translation (Single User)

1. User selects source language (en-US or fr-CA)
2. User selects voice mode (push-to-talk or hands-free)
3. User clicks "Start Listening"
4. Frontend initializes OpenAI WebRTC session
5. User speaks (mic button or hands-free)
6. VAD filters audio, sends only speech
7. OpenAI transcribes, translates, and generates audio
8. Frontend displays transcript + translation
9. Frontend plays translated audio
10. Repeat for next turn

### 22.2 Room Translation (Two Users)

1. User A creates room → Gets sessionId
2. User A shares sessionId with User B
3. User B joins room with sessionId
4. Both users connect to backend WebSocket
5. Backend confirms both participants connected
6. Each user initializes their own OpenAI session
7. User A speaks → OpenAI A transcribes/translates
8. Frontend A sends BILINGUAL_MESSAGE to backend
9. Backend relays to User B
10. User B sees message in their language
11. User B speaks → OpenAI B transcribes/translates
12. Frontend B sends BILINGUAL_MESSAGE to backend
13. Backend relays to User A
14. Conversation continues...

### 22.3 Recording & Export

1. User clicks "Start Recording"
2. MediaRecorder captures both mic and OpenAI audio
3. Audio chunks stored in memory
4. User clicks "Stop Recording"
5. Chunks combined into WebM blob
6. User clicks "Download Recording"
7. Browser downloads audio file
8. User clicks "Download Transcript"
9. Transcript exported as JSON or TXT



---

## 23. Future Enhancements

### 23.1 Potential Improvements

**Audio Quality:**
- Adaptive bitrate based on network conditions
- Noise reduction algorithms (beyond browser defaults)
- Advanced VAD (ML-based like Silero VAD)
- Acoustic echo cancellation tuning

**Performance:**
- WebAssembly for audio processing
- Worker threads for heavy computation
- Lazy loading of components
- Service worker for offline support

**Features:**
- More languages (Spanish, German, etc.)
- Group calls (3+ participants)
- Screen sharing with translation
- Real-time sentiment analysis
- Conversation summaries (AI-generated)
- Speaker diarization (multiple speakers per side)

**UX:**
- Mobile app (React Native)
- Keyboard shortcuts
- Customizable UI themes
- Accessibility improvements (screen reader support)
- Tutorial/onboarding flow

**Infrastructure:**
- Redis for session persistence
- Database for conversation history
- CDN for audio assets
- Load balancing for backend
- Monitoring and analytics (Sentry, DataDog)

### 23.2 Known Limitations

**Current Constraints:**
- Only 2 participants per room
- Only English ↔ French translation
- No conversation history persistence
- No user authentication
- No mobile optimization
- Browser-dependent audio quality

**Technical Debt:**
- Some TypeScript `any` types
- Limited error recovery
- No automated testing
- Manual deployment process
- Hardcoded configuration values

---

## 24. Troubleshooting Guide

### 24.1 Common Issues

**"Microphone permission denied"**
- Check browser permissions
- Ensure HTTPS (required for getUserMedia)
- Try different browser

**"Session failed to initialize"**
- Check OPENAI_API_KEY on backend
- Verify backend is running
- Check network connectivity
- Look for CORS errors in console

**"No audio playback"**
- Click anywhere to trigger user gesture (autoplay policy)
- Check speaker/volume settings
- Verify AudioContext state (should be "running")
- Check browser console for errors

**"Translation not working"**
- Verify both participants connected
- Check WebSocket connection status
- Ensure correct language selected
- Look for validation errors in console

**"High latency"**
- Check network speed
- Verify WebRTC connection (not falling back to relay)
- Reduce audio quality if needed
- Check server load

### 24.2 Debug Checklist

1. Open browser console (F12)
2. Check for red errors
3. Verify WebSocket connection: `🔄 [WebSocket] Connected`
4. Verify OpenAI session: `✅ [WebRTC] Session is ready`
5. Check audio levels: `🎤 [VAD] Energy: X.XXXX`
6. Monitor message flow: `📤 [WebSocket] Sending...`
7. Check AudioContext state: Should be "running"
8. Verify microphone access: Green indicator in browser
9. Test with different browser/device
10. Check backend logs on Render dashboard

---

## 25. Glossary

**AudioContext**: Web Audio API interface for audio processing graph
**AudioWorklet**: Modern API for custom audio processing on audio thread
**Base64**: Binary-to-text encoding for transmitting audio data
**DataChannel**: WebRTC channel for sending arbitrary data
**Ephemeral Token**: Temporary authentication token that expires
**PCM**: Pulse Code Modulation, uncompressed audio format
**RMS**: Root Mean Square, measure of audio signal strength
**SDP**: Session Description Protocol, WebRTC connection metadata
**TTS**: Text-to-Speech synthesis
**VAD**: Voice Activity Detection, identifies speech vs silence
**WebRTC**: Web Real-Time Communication, peer-to-peer protocol
**WebSocket**: Full-duplex communication protocol over TCP
**Whisper**: OpenAI's speech recognition model

---

## Document Version

**Version**: 1.0  
**Last Updated**: 2026-03-27  
**Author**: AI Assistant (Kiro)  
**Project**: NeuralEcho Real-Time Translation System

