# NeuralEcho Backend Architecture & Working

## Backend System Overview

The NeuralEcho backend is a Node.js-based real-time translation server that orchestrates bilingual conversations through WebSocket connections and OpenAI's Realtime API integration.

### Technology Stack
- **Runtime**: Node.js 18+ with ES Modules
- **Framework**: Express.js for HTTP server
- **WebSocket**: `ws` library for real-time communication
- **AI Integration**: OpenAI Realtime API (gpt-realtime-mini-2025-12-15)
- **Audio Format**: PCM16 for minimal latency

## Core Backend Components

### 1. Server Infrastructure (`index.js`)

```javascript
// Main server setup
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Global state management
const translationSessions = new Map();  // sessionId -> TranslationSession
const activeConnections = new Map();    // WebSocket -> connection info
```

**Responsibilities:**
- HTTP server for health checks and CORS handling
- WebSocket server for client connections
- Global session and connection state management
- Request routing and middleware setup

### 2. Translation Session Management

#### TranslationSession Class Architecture

```javascript
class TranslationSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.participants = new Map();     // userId -> participant data
    this.messageHistory = [];          // Complete message records
    this.transcriptHistory = [];       // Transcript records
    this.isRecording = false;          // Recording state
    this.recordingData = [];           // Audio recording buffer
  }
}
```

**Participant Data Structure:**
```javascript
{
  userId: string,
  language: 'en-US' | 'fr-CA',
  socket: WebSocket,
  name: string,
  openaiWs: WebSocket,              // OpenAI connection
  lastRequestTime: number,          // Performance tracking
  pendingMessage: object,           // In-flight translation
  pendingMessageTimeout: timeout    // Cleanup timer
}
```

**Key Methods:**
- `addParticipant()`: Registers new participant with language preference
- `removeParticipant()`: Cleanup participant and connections
- `getOtherParticipant()`: Finds conversation partner
- `addMessage()`: Stores completed translation
- `addTranscriptMessage()`: Records transcript with metadata

### 3. WebSocket Connection Handling

#### Connection Lifecycle

```javascript
wss.on('connection', (ws, req) => {
  // 1. Connection establishment
  // 2. Client authentication/identification
  // 3. Session joining/creation
  // 4. OpenAI connection initialization
  // 5. Event handler setup
});
```

#### Message Types Handled

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `JOIN_SESSION` | Client → Server | Join translation session |
| `AUDIO_DATA` | Client → Server | Stream audio for translation |
| `LEAVE_SESSION` | Client → Server | Leave current session |
| `SPEECH_TRANSCRIPT` | Server → Client | Transcribed speech |
| `TRANSLATED_AUDIO` | Server → Client | Translated audio stream |
| `VOICE_ACTIVITY_*` | Server → Client | Speech detection events |

### 4. OpenAI Integration Layer

#### Connection Initialization

```javascript
async function initializeOpenAIConnection(userId, translationSession) {
  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime', {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1'
    }
  });
  
  // Session configuration for translation
  const sessionConfig = {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions: buildTranslationInstructions(inputLang, outputLang),
      voice: 'ballad',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      turn_detection: {
        type: 'server_vad',
        threshold: 0.3,
        prefix_padding_ms: 200,
        silence_duration_ms: 300
      }
    }
  };
}
```

#### Translation Instructions Generation

```javascript
function buildTranslationInstructions(inputLang, outputLang) {
  return `You are a TRANSLATION MACHINE that translates FROM ${inputLangName} TO ${outputLangName}.

TRANSLATION RULES:
1. ONLY translate the input text word-for-word
2. DO NOT respond to the content
3. DO NOT add greetings or commentary
4. ONLY output the direct translation
5. Keep the EXACT same meaning and length
6. Preserve all punctuation and formatting`;
}
```

## Audio Processing Pipeline

### 1. Audio Input Processing

```javascript
async function processAudioForTranslation(data, ws) {
  const connection = activeConnections.get(ws);
  const { sessionId, userId } = connection;
  const translationSession = translationSessions.get(sessionId);
  const participant = translationSession.participants.get(userId);
  
  // Performance tracking
  participant.lastRequestTime = Date.now();
  
  // Forward to OpenAI
  const audioMessage = {
    type: 'input_audio_buffer.append',
    audio: data.audio
  };
  
  participant.openaiWs.send(JSON.stringify(audioMessage));
}
```

### 2. OpenAI Response Processing

#### Response Type Handling

```javascript
async function handleOpenAIResponse(data, userId, translationSession) {
  const response = JSON.parse(data.toString());
  const participant = translationSession.participants.get(userId);
  const processingTime = Date.now() - participant.lastRequestTime;
  
  switch(response.type) {
    case 'response.done':
      // Complete translation ready
      handleTranslationComplete(response, userId, translationSession);
      break;
      
    case 'response.audio.delta':
      // Streaming translated audio
      broadcastAudioToOtherParticipant(response, userId, translationSession);
      break;
      
    case 'input_audio_buffer.speech_started':
      // Voice activity detection
      notifyOtherParticipant('VOICE_ACTIVITY_STARTED', userId, translationSession);
      break;
      
    case 'response.audio_transcript.delta':
      // Real-time transcript streaming
      streamTranscriptDelta(response, userId, translationSession);
      break;
  }
}
```

### 3. Audio Broadcasting

```javascript
function broadcastAudioToOtherParticipant(response, userId, translationSession) {
  const otherParticipant = translationSession.getOtherParticipant(userId);
  
  if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
    const audioEvent = {
      type: 'TRANSLATED_AUDIO',
      sessionId: translationSession.sessionId,
      fromParticipant: userId,
      audioData: response.delta,
      timestamp: Date.now(),
      quality: 'high'
    };
    
    otherParticipant.socket.send(JSON.stringify(audioEvent));
  }
}
```

## Real-time Translation Flow

### Complete Translation Sequence

```
1. User A speaks → Audio captured by client
2. Client streams audio → Server receives via WebSocket
3. Server forwards audio → OpenAI Realtime API
4. OpenAI processes speech → Whisper transcription
5. OpenAI translates text → GPT translation
6. OpenAI generates speech → TTS synthesis
7. Server receives audio → Streams to User B
8. User B hears translation → Real-time conversation
```

### Timing and Performance

```javascript
// Performance tracking implementation
participant.lastRequestTime = Date.now();

// Later, when response received
const processingTime = Date.now() - participant.lastRequestTime;

// Quality feedback based on performance
const qualityFeedback = {
  type: 'quality_feedback',
  processingTime: processingTime,
  qualityScore: processingTime < 2000 ? 0.9 : 0.7,
  recommendations: processingTime > 3000 ? 
    ['Consider speaking more clearly'] : []
};
```

## State Management

### Session State Lifecycle

```javascript
// Session creation
const session = new TranslationSession(sessionId);
translationSessions.set(sessionId, session);

// Participant management
session.addParticipant(userId, language, socket, name);

// Message history
session.addMessage({
  messageId: generateId(),
  participantId: userId,
  originalText: originalText,
  translatedText: translatedText,
  originalLanguage: inputLang,
  targetLanguage: outputLang,
  timestamp: Date.now(),
  processingTime: processingTime
});

// Cleanup on disconnect
session.removeParticipant(userId);
if (session.participants.size === 0) {
  translationSessions.delete(sessionId);
}
```

### Connection State Management

```javascript
// Connection tracking
activeConnections.set(ws, {
  sessionId: sessionId,
  userId: userId,
  joinedAt: Date.now()
});

// Cleanup function
function cleanupConnection(ws) {
  const connection = activeConnections.get(ws);
  if (connection) {
    const session = translationSessions.get(connection.sessionId);
    if (session) {
      session.removeParticipant(connection.userId);
    }
    activeConnections.delete(ws);
  }
}
```

## Error Handling and Recovery

### Error Classification

```javascript
function isRetryableError(error) {
  const retryableErrors = [
    'network_error',
    'timeout',
    'rate_limit',
    'server_overload'
  ];
  return retryableErrors.includes(error.type);
}

function getErrorRecoveryAdvice(error) {
  const recoveryMap = {
    'network_error': 'Check your internet connection',
    'rate_limit': 'Please wait a moment and try again',
    'invalid_audio': 'Please check your microphone settings',
    'translation_failed': 'Try speaking more clearly'
  };
  return recoveryMap[error.type] || 'Please try again';
}
```

### Error Broadcasting

```javascript
// Send error to all session participants
const errorMessage = {
  type: 'translation_error',
  sessionId: translationSession.sessionId,
  fromParticipant: userId,
  error: response.error,
  timestamp: Date.now(),
  recovery: getErrorRecoveryAdvice(response.error),
  retryable: isRetryableError(response.error)
};

// Broadcast to all participants
const allParticipants = Array.from(translationSession.participants.values());
allParticipants.forEach(p => {
  if (p.socket?.readyState === WebSocket.OPEN) {
    p.socket.send(JSON.stringify(errorMessage));
  }
});
```

## Performance Optimization

### Latency Reduction Strategies

1. **Persistent Connections**
   - WebSocket connections maintained throughout session
   - OpenAI connections pooled per participant
   - No reconnection overhead during conversation

2. **Streaming Processing**
   - Audio processed in real-time chunks
   - Partial results streamed immediately
   - No waiting for complete sentences

3. **Optimized Audio Configuration**
   - PCM16 format for minimal encoding
   - Server-side VAD for immediate feedback
   - Optimized silence detection (300ms)

4. **Memory Management**
   - Efficient buffer handling for audio streams
   - Automatic cleanup of completed messages
   - Connection state pruning

### Performance Monitoring

```javascript
// Request timing
console.log(`[Performance] User ${userId}: ${processingTime}ms processing time`);

// Quality metrics
const qualityScore = processingTime < 2000 ? 0.9 : 0.7;

// System health
console.log(`[System] Active sessions: ${translationSessions.size}`);
console.log(`[System] Active connections: ${activeConnections.size}`);
```

## Security and Validation

### Input Validation

```javascript
// Language validation
if (translatedText.trim() === "INVALID_LANGUAGE") {
  const rejectionMessage = {
    type: 'language_rejected',
    error: 'Only English and French are supported',
    timestamp: Date.now()
  };
  participant.socket.send(JSON.stringify(rejectionMessage));
  return;
}

// Audio format validation
if (!data.audio || typeof data.audio !== 'string') {
  console.error('Invalid audio data received');
  return;
}
```

### Connection Security

```javascript
// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// WebSocket authentication (if implemented)
wss.on('connection', (ws, req) => {
  // Validate origin, tokens, etc.
});
```

## Deployment Configuration

### Environment Variables

```bash
OPENAI_API_KEY=sk-...           # OpenAI API key
PORT=3001                       # Server port
ALLOWED_ORIGINS=http://localhost:3000  # CORS origins
NODE_ENV=production             # Environment
```

### Process Management

```javascript
// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  
  // Close all WebSocket connections
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Server shutting down');
    }
  });
  
  server.close(() => {
    process.exit(0);
  });
});
```

## Monitoring and Logging

### Structured Logging

```javascript
// Performance logging
console.log(`=⚡ [Performance] User ${userId}: ${processingTime}ms processing time`);

// Audio processing
console.log(`=🎤 [Audio] Processing audio for user ${userId} (${audioLength} bytes)`);

// Translation completion
console.log(`=✅ [Translation] Completed for user ${userId}: "${translatedText}"`);

// Error logging
console.error(`=❌ [Error] OpenAI error for user ${userId}:`, error);
```

### Health Monitoring

```javascript
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeSessions: translationSessions.size,
    activeConnections: activeConnections.size,
    uptime: process.uptime()
  });
});
```

This backend architecture provides a robust, scalable foundation for real-time bilingual translation with optimized performance and comprehensive error handling.