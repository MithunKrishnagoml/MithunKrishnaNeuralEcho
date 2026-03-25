# Complete Audio & Transcript Pipeline Fix

## Current Architecture (BROKEN)

```
User A (English) speaks
  ↓
Mic → WebRTC → OpenAI Realtime API
  ↓
OpenAI translates to French
  ↓
WebRTC receives translated audio
  ↓
❌ STOPS HERE - Not relayed to User B
```

## What Should Happen

```
User A (English) speaks
  ↓
Mic → WebRTC → OpenAI Realtime API
  ↓
OpenAI translates to French + generates transcript
  ↓
WebRTC receives:
  - Translated audio (French)
  - Original transcript (English)
  - Translated transcript (French)
  ↓
Frontend captures translated audio via RealtimeAudioTap
  ↓
Send to Backend WebSocket:
  - RELAY_AUDIO_CHUNK (translated audio)
  - TRANSCRIPT messages (both original & translated)
  ↓
Backend broadcasts to User B
  ↓
User B hears French audio + sees transcripts
```

## The Fix - Step by Step

### STEP 1: Connect RealtimeAudioTap to WebSocket ✅ (Already Documented)

See `COMPLETE_AUDIO_RELAY_FIX.md` for implementation.

**Key Code**:
```typescript
const audioTap = new RealtimeAudioTap(
  // onAudioChunk - relay to backend
  (pcmData, responseId, seq) => {
    roomWebSocket.send(JSON.stringify({
      type: 'RELAY_AUDIO_CHUNK',
      chunk: pcmData,
      fromParticipant: participantId,
      sessionId: sessionId,
      seq,
      timestamp: Date.now()
    }));
  },
  // onStreamEnd
  (responseId) => {
    roomWebSocket.send(JSON.stringify({
      type: 'RELAY_AUDIO_END',
      responseId,
      fromParticipant: participantId,
      sessionId: sessionId,
      timestamp: Date.now()
    }));
  }
);
```

### STEP 2: Capture and Relay Transcripts

The WebRTC DataChannel receives events from OpenAI. We need to capture:
- `response.audio_transcript.delta` - Streaming translated text
- `response.audio_transcript.done` - Final translated text
- `conversation.item.input_audio_transcription.completed` - Original transcript

**Add to DataChannel message handler**:

```typescript
dataChannel.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  // Handle original transcript (what user said)
  if (message.type === 'conversation.item.input_audio_transcription.completed') {
    const originalText = message.transcript;
    
    // Send to backend for relay
    roomWebSocket.send(JSON.stringify({
      type: 'ORIGINAL_TRANSCRIPT',
      text: originalText,
      language: currentUserLanguage,
      fromParticipant: participantId,
      sessionId: sessionId,
      timestamp: Date.now()
    }));
    
    console.log(`📝 [ORIGINAL TRANSCRIPT] ${originalText}`);
  }
  
  // Handle translated transcript (streaming)
  if (message.type === 'response.audio_transcript.delta') {
    const translatedDelta = message.delta;
    
    // Send to backend for relay
    roomWebSocket.send(JSON.stringify({
      type: 'TRANSLATED_TRANSCRIPT_DELTA',
      delta: translatedDelta,
      fromParticipant: participantId,
      sessionId: sessionId,
      timestamp: Date.now()
    }));
    
    console.log(`📝 [TRANSLATED DELTA] ${translatedDelta}`);
  }
  
  // Handle translated transcript (final)
  if (message.type === 'response.audio_transcript.done') {
    const translatedText = message.transcript;
    
    // Send to backend for relay
    roomWebSocket.send(JSON.stringify({
      type: 'TRANSLATED_TRANSCRIPT_DONE',
      text: translatedText,
      targetLanguage: otherUserLanguage,
      fromParticipant: participantId,
      sessionId: sessionId,
      timestamp: Date.now()
    }));
    
    console.log(`✅ [TRANSLATED TRANSCRIPT] ${translatedText}`);
  }
};
```

### STEP 3: Backend - Relay Transcripts

**Add to backend WebSocket handler** (in `index.js`):

```javascript
// Handle original transcript
if (data.type === 'ORIGINAL_TRANSCRIPT') {
  const { text, language, fromParticipant, sessionId } = data;
  
  const translationSession = translationSessions.get(sessionId);
  if (!translationSession) return;
  
  // Broadcast to ALL participants (including sender for UI update)
  translationSession.participants.forEach((participant) => {
    if (participant.socket?.readyState === WebSocket.OPEN) {
      participant.socket.send(JSON.stringify({
        type: 'ORIGINAL_TRANSCRIPT',
        text,
        language,
        speakerId: fromParticipant,
        timestamp: Date.now()
      }));
    }
  });
  
  console.log(`📝 [BACKEND] Relayed original transcript: "${text}"`);
}

// Handle translated transcript delta
if (data.type === 'TRANSLATED_TRANSCRIPT_DELTA') {
  const { delta, fromParticipant, sessionId } = data;
  
  const translationSession = translationSessions.get(sessionId);
  if (!translationSession) return;
  
  // Send to OTHER participant only
  const otherParticipant = translationSession.getOtherParticipant(fromParticipant);
  if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
    otherParticipant.socket.send(JSON.stringify({
      type: 'TRANSLATED_TRANSCRIPT_DELTA',
      delta,
      speakerId: fromParticipant,
      timestamp: Date.now()
    }));
  }
}

// Handle translated transcript done
if (data.type === 'TRANSLATED_TRANSCRIPT_DONE') {
  const { text, targetLanguage, fromParticipant, sessionId } = data;
  
  const translationSession = translationSessions.get(sessionId);
  if (!translationSession) return;
  
  // Send to OTHER participant only
  const otherParticipant = translationSession.getOtherParticipant(fromParticipant);
  if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
    otherParticipant.socket.send(JSON.stringify({
      type: 'TRANSLATED_TRANSCRIPT_DONE',
      text,
      targetLanguage,
      speakerId: fromParticipant,
      timestamp: Date.now()
    }));
  }
  
  console.log(`✅ [BACKEND] Relayed translated transcript: "${text}"`);
}
```

### STEP 4: Frontend - Display Transcripts

**Add to ChatroomInterface or transcript component**:

```typescript
// Listen for transcript messages
useEffect(() => {
  if (!roomWebSocket) return;
  
  const handleMessage = (event: MessageEvent) => {
    const message = JSON.parse(event.data);
    
    // Handle original transcript
    if (message.type === 'ORIGINAL_TRANSCRIPT') {
      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}`,
        speakerId: message.speakerId,
        originalText: message.text,
        originalLanguage: message.language,
        translatedText: '', // Will be filled when translation arrives
        timestamp: message.timestamp
      }]);
    }
    
    // Handle translated transcript delta (streaming)
    if (message.type === 'TRANSLATED_TRANSCRIPT_DELTA') {
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.speakerId === message.speakerId) {
          // Append delta to existing message
          return [
            ...prev.slice(0, -1),
            {
              ...lastMsg,
              translatedText: lastMsg.translatedText + message.delta
            }
          ];
        }
        return prev;
      });
    }
    
    // Handle translated transcript done
    if (message.type === 'TRANSLATED_TRANSCRIPT_DONE') {
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.speakerId === message.speakerId) {
          // Finalize translation
          return [
            ...prev.slice(0, -1),
            {
              ...lastMsg,
              translatedText: message.text,
              targetLanguage: message.targetLanguage
            }
          ];
        }
        return prev;
      });
    }
  };
  
  roomWebSocket.addEventListener('message', handleMessage);
  return () => roomWebSocket.removeEventListener('message', handleMessage);
}, [roomWebSocket]);
```

## Summary of Changes Needed

### Frontend Files to Modify:
1. **Where WebRTC is set up** (AppContext or useRealtimeVoice):
   - Instantiate RealtimeAudioTap with WebSocket callbacks
   - Add DataChannel message handlers for transcripts

2. **ChatroomInterface.tsx**:
   - Add WebSocket message listeners for transcripts
   - Update UI to display streaming transcripts

### Backend Files to Modify:
1. **index.js**:
   - Add handlers for ORIGINAL_TRANSCRIPT
   - Add handlers for TRANSLATED_TRANSCRIPT_DELTA
   - Add handlers for TRANSLATED_TRANSCRIPT_DONE
   - Relay messages to appropriate participants

## Testing Checklist

After implementing:
- [ ] User A speaks → Console shows "📝 [ORIGINAL TRANSCRIPT]"
- [ ] Console shows "🎤 [AUDIO RELAY] Sent chunk"
- [ ] Backend logs show "📝 [BACKEND] Relayed original transcript"
- [ ] Backend logs show "🎤 [AUDIO TO OPENAI]"
- [ ] Backend logs show "=== [AUDIO DELTA]"
- [ ] User B sees transcript appear in real-time
- [ ] User B hears translated audio
- [ ] Audio queue shows non-zero values

## Why This Will Work

The entire pipeline is already built:
- ✅ WebRTC to OpenAI (working)
- ✅ OpenAI translation (working)
- ✅ Backend relay infrastructure (working)
- ✅ Frontend playback (working)
- ✅ RealtimeAudioTap class (working)

The ONLY missing pieces are:
1. Connecting RealtimeAudioTap to WebSocket
2. Capturing and relaying transcript events
3. Displaying transcripts in UI

Once these connections are made, everything will flow automatically.
