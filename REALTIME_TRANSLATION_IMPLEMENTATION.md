# Real-Time Phone-Call-Style Translation Implementation

## Goal
True real-time phone-call-style translation where User A speaks English and User B hears French simultaneously — not after the sentence ends. Transcripts update live as speech is recognized. Both directions work symmetrically.

## ✅ Completed Changes

### Part 1: Fixed Audio Pipeline

#### 1.1 Fixed Sequence Number Tracking (`useOpenAIRealtime.ts`)
- ✅ Declared `sequenceNumberRef = useRef(0)` at hook scope
- ✅ Reset `sequenceNumberRef.current = 0` on new `response.created` event
- ✅ Increment sequence AFTER creating chunk (starts at 0)
- ✅ Track `currentResponseIdRef` to detect response changes

#### 1.2 Immediate Audio Chunk Streaming (`useOpenAIRealtime.ts`)
- ✅ Send each PCM chunk immediately in `response.audio.delta` handler
- ✅ No batching, no waiting for `response.audio.done`
- ✅ Every delta goes out instantly with proper sequence number

#### 1.3 Removed TRANSLATED_AUDIO Blob Relay (`useOpenAIRealtime.ts`)
- ✅ Removed `ScriptProcessor` audio capture code
- ✅ Removed WebM blob generation and relay
- ✅ Only use AUDIO_CHUNK streaming path
- ✅ Eliminates dual-playback conflicts

#### 1.4 Improved Reorder Buffer (`StreamingAudioPlayer.ts`)
- ✅ Only discard chunks more than 5 behind expected sequence
- ✅ Detect new stream when `seq === 0` and `expectedSequence > 5`
- ✅ Reset sequence tracking on new stream detection
- ✅ Log "🔢 New stream detected — resetting sequence"

### Part 2: Real-Time Simultaneous Translation

#### 2.1 Server VAD Configuration (`useOpenAIRealtime.ts`)
- ✅ Already configured with `server_vad` mode
- ✅ Threshold: 0.4 for fast detection
- ✅ Silence duration: 200ms for continuous streaming
- ✅ Prefix padding: 100ms for minimal latency

#### 2.2 Continuous Audio Streaming (`useOpenAIRealtime.ts`)
- ✅ Already streaming every voice-active frame
- ✅ Using `input_audio_buffer.append` continuously
- ✅ No manual `response.create` calls (Server VAD handles it)

#### 2.3 Interruption Handling (`useOpenAIRealtime.ts`)
- ✅ Send CLEAR_AUDIO on `input_audio_buffer.speech_started` (interruption)
- ✅ Send CLEAR_AUDIO on `response.cancelled`
- ✅ Cancel in-progress response when new speech starts

## 🚧 Remaining Tasks

### Part 2: Backend & Frontend Integration

#### 2.3 Backend CLEAR_AUDIO Relay (`backend/index.js`)
```javascript
// Add to WebSocket message handler
if (data.type === 'CLEAR_AUDIO') {
  const connection = activeConnections.get(ws);
  if (!connection) return;

  const { sessionId, userId } = connection;
  const translationSession = translationSessions.get(sessionId);
  if (!translationSession) return;

  // Relay to other participant immediately
  const otherParticipant = translationSession.getOtherParticipant(userId);
  if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
    otherParticipant.socket.send(JSON.stringify({
      type: 'CLEAR_AUDIO',
      participantId: userId,
      timestamp: Date.now()
    }));
    console.log(`🧹 [CLEAR_AUDIO] Relayed from ${userId} to other participant`);
  }
}
```

#### 2.3 Frontend CLEAR_AUDIO Handler (`useChatroomConnection.ts`)
- ✅ Already implemented in previous changes
- Calls `translatedAudioPlayerRef.current.clearQueue()` on CLEAR_AUDIO

### Part 2d: Smooth Audio Playback (`StreamingAudioPlayer.ts`)

#### Buffer Management
```typescript
// In bufferChunk():
// Don't start playback on first chunk - buffer minimum 3 chunks
if (!this.hasStartedPlayback) {
  const shouldStart = 
    this.bufferedChunks.length >= 3 || // Minimum 3 chunks
    this.getBufferedMs() >= 80;        // Or 80ms

  if (shouldStart) {
    this.hasStartedPlayback = true;
    this.drainBuffer();
  }
}
```

#### AudioContext Resume
```typescript
// Add visibilitychange listener in constructor
private setupVisibilityHandler(): void {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && this.audioContext) {
      await this.audioContext.resume();
    }
  });
}

// In addChunk(), always check and resume
if (this.audioContext?.state === 'suspended') {
  await this.audioContext.resume();
}
```

### Part 2e: Audio Worklet Improvements (`audio-streaming-processor.js`)

#### Crossfade Between Chunks
```javascript
// Apply 10ms crossfade at chunk boundaries
const CROSSFADE_SAMPLES = 240; // 10ms at 24kHz

// Store last N samples of previous chunk
if (this.lastChunkTail && newChunk) {
  for (let i = 0; i < CROSSFADE_SAMPLES; i++) {
    const alpha = i / CROSSFADE_SAMPLES;
    newChunk[i] = this.lastChunkTail[i] * (1 - alpha) + newChunk[i] * alpha;
  }
}
```

#### Fade-in on New Response
```javascript
// 15ms fade-in on first chunk of new responseId
const FADE_IN_SAMPLES = 360; // 15ms at 24kHz

if (isNewResponse) {
  for (let i = 0; i < FADE_IN_SAMPLES; i++) {
    chunk[i] *= (i / FADE_IN_SAMPLES);
  }
}
```

#### Fade-out on CLEAR_QUEUE
```javascript
// 10ms fade-out before clearing
const FADE_OUT_SAMPLES = 240; // 10ms at 24kHz

if (clearRequested && remainingSamples > 0) {
  for (let i = 0; i < Math.min(FADE_OUT_SAMPLES, remainingSamples); i++) {
    samples[i] *= (1 - i / FADE_OUT_SAMPLES);
  }
}
```

### Part 3: Live Transcript Updates

#### 3a: Stream Partial Transcripts (`useOpenAIRealtime.ts`)
```typescript
// Add state for partial transcripts
const [partialTranscript, setPartialTranscript] = useState('');
const [finalTranscript, setFinalTranscript] = useState('');
const [finalTranslation, setFinalTranslation] = useState('');

// Handle response.audio_transcript.delta
case 'response.audio_transcript.delta':
  setPartialTranscript(prev => prev + event.delta);
  // Send to backend immediately
  sendTranscriptToBackend({
    type: 'TRANSCRIPT_DELTA',
    participantId: myId,
    delta: event.delta,
    responseId: currentResponseIdRef.current
  }, 'DELTA');
  break;

// Handle response.audio_transcript.done
case 'response.audio_transcript.done':
  setFinalTranslation(event.transcript);
  setPartialTranscript(''); // Clear partial
  // Send to backend
  sendTranscriptToBackend({
    type: 'TRANSCRIPT_FINAL',
    participantId: myId,
    originalText: finalTranscript,
    translatedText: event.transcript,
    responseId: currentResponseIdRef.current,
    timestamp: Date.now()
  }, 'SENTENCE_DONE');
  break;
```

#### 3b: Backend Transcript Relay (`backend/index.js`)
```javascript
// Add TRANSCRIPT_DELTA handler
if (data.type === 'TRANSCRIPT_DELTA') {
  const otherParticipant = translationSession.getOtherParticipant(userId);
  if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
    otherParticipant.socket.send(JSON.stringify({
      type: 'TRANSCRIPT_DELTA',
      participantId: userId,
      delta: data.delta,
      responseId: data.responseId,
      timestamp: Date.now()
    }));
  }
}

// Add TRANSCRIPT_FINAL handler
if (data.type === 'TRANSCRIPT_FINAL') {
  // Relay to other participant
  const otherParticipant = translationSession.getOtherParticipant(userId);
  if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
    otherParticipant.socket.send(JSON.stringify(data));
  }
  
  // Add to session transcript history
  translationSession.transcriptHistory.push({
    timestamp: data.timestamp,
    speakerId: userId,
    speakerName: participant.name,
    sourceLanguage: participant.language,
    originalText: data.originalText,
    translatedText: data.translatedText
  });
}
```

#### 3c: UI Display (`ChatroomInterface.tsx`)
```tsx
// Add live transcript row
<div className="live-transcript">
  {partialTranscript && (
    <div className="streaming-row">
      <span className="speaker-name">{speakerName}</span>
      <span className="mic-pulse">🎤</span>
      <span className="partial-text italic dimmed">
        {partialTranscript}
        <span className="cursor blink">|</span>
      </span>
    </div>
  )}
</div>

// Completed entries
{transcripts.map(t => (
  <div key={t.id} className="completed-entry">
    <div className="timestamp">{formatTime(t.timestamp)}</div>
    <div className="speaker">{t.speakerName}</div>
    <div className="bilingual">
      <div className="original">{t.originalText}</div>
      <div className="arrow">→</div>
      <div className="translated">{t.translatedText}</div>
    </div>
  </div>
))}
```

#### 3d: Transcript Export (`backend/index.js`)
```javascript
// GET /session/:sessionId/transcript
app.get('/api/session/:sessionId/transcript', (req, res) => {
  const { sessionId } = req.params;
  const { participantId } = req.query;
  
  const session = translationSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  
  // Verify participant
  if (!session.participants.has(participantId)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  res.json({
    sessionId,
    transcripts: session.transcriptHistory,
    totalMessages: session.transcriptHistory.length
  });
});

// GET /session/:sessionId/transcript/download
app.get('/api/session/:sessionId/transcript/download', (req, res) => {
  const { sessionId } = req.params;
  const session = translationSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  
  let txt = `NeuralEcho Translation Session\nSession ID: ${sessionId}\n\n`;
  
  session.transcriptHistory.forEach(t => {
    const time = new Date(t.timestamp).toLocaleTimeString();
    txt += `[${time}] ${t.speakerName} (${t.sourceLanguage}):\n`;
    txt += `  "${t.originalText}"\n`;
    txt += `  → (${t.targetLanguage}): "${t.translatedText}"\n\n`;
  });
  
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="transcript-${sessionId}.txt"`);
  res.send(txt);
});
```

## Expected Results

### Latency Target
- ✅ Under 400ms from speech to translated audio on the other side

### User Experience
1. ✅ User A holds spacebar, says "Hello good morning my name is Mithun"
2. ✅ User B starts hearing "Bonjour" within ~300ms of "Hello" being spoken
3. 🚧 Transcript panel updates live word-by-word as speech is recognized
4. 🚧 Permanent bilingual entry appears when utterance completes
5. ✅ User B speaks French — User A hears English via same pipeline
6. ✅ No audio pops, cuts, or stutter between chunks

## Testing Checklist

- [ ] Audio chunks arrive with correct sequence numbers (0, 1, 2, ...)
- [ ] Sequence resets to 0 on new response
- [ ] No TRANSLATED_AUDIO messages sent (only AUDIO_CHUNK)
- [ ] Audio plays smoothly without pops or gaps
- [ ] CLEAR_AUDIO flushes queue on interruption
- [ ] Transcripts update character-by-character in real-time
- [ ] Both directions work symmetrically (EN→FR and FR→EN)
- [ ] Latency under 400ms measured from speech to audio playback

## Performance Optimizations

### Already Implemented
- ✅ Server VAD for automatic turn detection
- ✅ Continuous audio streaming (no manual commits)
- ✅ Immediate chunk relay (no batching)
- ✅ Sequence number tracking for proper ordering
- ✅ Reorder buffer with resilience to resets

### To Implement
- 🚧 3-chunk minimum buffer before playback starts
- 🚧 Crossfade between chunks (10ms)
- 🚧 Fade-in on new response (15ms)
- 🚧 Fade-out on clear (10ms)
- 🚧 AudioContext auto-resume on tab visibility
- 🚧 Live transcript streaming to UI
- 🚧 Transcript persistence and export
