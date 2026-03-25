# Streaming Parallel Translation & Always-On Mute/Unmute Implementation

## Overview

This document outlines the implementation of two major features:
1. **Streaming Parallel Translation** - User B hears translated audio while User A is still speaking
2. **Always-On Mute/Unmute** - Google Meet-style mute toggle, no push-to-talk

## Backend Changes (index.js)

### 1. Update TranslationSession.addParticipant()

Add sequence tracking and streaming state:

```javascript
addParticipant(userId, language, socket, name = null) {
  this.participants.set(userId, {
    language,
    socket,
    name,
    openaiWs: null,
    audioBuffer: [],
    lastRequestTime: null,
    joinedAt: Date.now(),
    totalProcessingTime: 0,
    requestCount: 0,
    pendingMessage: null,
    audioSequenceNumber: 0, // NEW: Track audio chunk sequence
    currentResponseId: null, // NEW: Track current OpenAI response
    isStreaming: false, // NEW: Track if currently streaming translation
    isMuted: false // NEW: Track mute state
  });
  console.log(`Added participant ${userId} with language ${language} to session ${this.sessionId}`);
}
```

### 2. Update OpenAI Session Config in initializeOpenAIConnection()

```javascript
turn_detection: {
  type: 'server_vad',
  threshold: 0.3,                      // Keep at 0.3 for good balance
  silence_duration_ms: 200,            // Reduced from 300 → 200
  prefix_padding_ms: 100               // Reduced from 200 → 100
},
```

### 3. Update handleOpenAIResponse() - Audio Delta Streaming

Replace the `response.audio.delta` handler:

```javascript
// Handle translated audio streaming for room broadcast
// STREAMING PARALLEL TRANSLATION: Send audio chunks immediately
if (response.type === 'response.audio.delta') {
  const audioData = response.delta;
  
  console.log(`[AUDIO DELTA] Received audio chunk for user ${userId}, size: ${audioData?.length || 0}`);
  
  // Mark participant as streaming
  if (participant) {
    participant.isStreaming = true;
    participant.currentResponseId = response.response_id || `response_${Date.now()}`;
  }
  
  // Broadcast translated audio to the other participant IMMEDIATELY
  otherParticipant = translationSession.getOtherParticipant(userId);
  if (otherParticipant?.socket && otherParticipant.socket.readyState === WebSocket.OPEN) {
    // Increment sequence number
    if (participant) {
      participant.audioSequenceNumber++;
    }
    
    const chunkEvent = {
      type: 'AUDIO_CHUNK',
      sessionId: translationSession.sessionId,
      participantId: userId,
      audioData,
      responseId: response.response_id || `response_${Date.now()}`,
      sequenceNumber: participant?.audioSequenceNumber || 0,
      chunkId: `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      isStreaming: true
    };
    
    console.log(`[ROOM AUDIO] Broadcasting chunk #${participant?.audioSequenceNumber}`);
    otherParticipant.socket.send(JSON.stringify(chunkEvent));
  }
}
```

### 4. Add Interruption Handling in handleOpenAIResponse()

Add this BEFORE the existing `input_audio_buffer.speech_started` handler:

```javascript
// Handle speech started - send interruption signal to other participant
if (response.type === 'input_audio_buffer.speech_started') {
  console.log(`[SPEECH STARTED] User ${userId} started speaking`);
  
  // Get the other participant
  otherParticipant = translationSession.getOtherParticipant(userId);
  
  // If other participant is currently streaming translation, interrupt it
  if (otherParticipant && otherParticipant.isStreaming) {
    console.log(`[INTERRUPTION] Canceling in-flight translation for other participant`);
    
    // Cancel the OpenAI response for the other participant
    if (otherParticipant.openaiWs && otherParticipant.openaiWs.readyState === WebSocket.OPEN) {
      otherParticipant.openaiWs.send(JSON.stringify({
        type: 'response.cancel'
      }));
    }
    
    // Reset streaming state
    otherParticipant.isStreaming = false;
    otherParticipant.currentResponseId = null;
  }
  
  // Send translation_interrupted event to other participant's client
  if (otherParticipant?.socket && otherParticipant.socket.readyState === WebSocket.OPEN) {
    otherParticipant.socket.send(JSON.stringify({
      type: 'TRANSLATION_INTERRUPTED',
      sessionId: translationSession.sessionId,
      interruptedBy: userId,
      timestamp: Date.now()
    }));
  }
  
  // Continue with existing VOICE_ACTIVITY_STARTED logic...
}
```

### 5. Add response.audio.done Handler

Add after the audio.delta handler:

```javascript
// Mark streaming as complete
if (response.type === 'response.audio.done') {
  console.log(`[AUDIO DONE] Audio generation completed for user ${userId}`);
  
  if (participant) {
    participant.isStreaming = false;
    // Don't reset currentResponseId yet - keep for deduplication
  }
  
  // Notify other participant that streaming is complete
  otherParticipant = translationSession.getOtherParticipant(userId);
  if (otherParticipant?.socket && otherParticipant.socket.readyState === WebSocket.OPEN) {
    otherParticipant.socket.send(JSON.stringify({
      type: 'AUDIO_STREAM_END',
      sessionId: translationSession.sessionId,
      participantId: userId,
      responseId: participant?.currentResponseId,
      timestamp: Date.now()
    }));
  }
}
```

### 6. Add Mute/Unmute WebSocket Handler

Add this in the WebSocket message handler section:

```javascript
// Handle mute/unmute
if (data.type === 'MUTE_STATE_CHANGED') {
  const { sessionId, userId, isMuted } = data;
  const translationSession = translationSessions.get(sessionId);
  
  if (translationSession) {
    const participant = translationSession.participants.get(userId);
    if (participant) {
      participant.isMuted = isMuted;
      console.log(`[MUTE] User ${userId} ${isMuted ? 'muted' : 'unmuted'}`);
      
      // Broadcast mute state to other participant
      const otherParticipant = translationSession.getOtherParticipant(userId);
      if (otherParticipant?.socket && otherParticipant.socket.readyState === WebSocket.OPEN) {
        otherParticipant.socket.send(JSON.stringify({
          type: 'PARTICIPANT_MUTE_CHANGED',
          sessionId,
          participantId: userId,
          isMuted,
          timestamp: Date.now()
        }));
      }
    }
  }
}
```

## Frontend Changes

### 1. Remove All Push-to-Talk Logic

Files to modify:
- `ChatroomInterface.tsx` - Remove all press/hold handlers
- Remove `handleMicPress`, `handleMicRelease`, `handleMouseDown`, `handleMouseUp`, `handleTouchStart`, `handleTouchEnd`
- Remove spacebar event listeners
- Remove `isPressing` state
- Remove `pressStartTime` state

### 2. Add Mute/Unmute State in ChatroomInterface.tsx

```typescript
const [isMuted, setIsMuted] = useState(false); // Start unmuted
const [isOtherParticipantMuted, setIsOtherParticipantMuted] = useState(false);
const [isServerVADActive, setIsServerVADActive] = useState(false); // For pulsing ring
const mediaStreamRef = useRef<MediaStream | null>(null);
```

### 3. Auto-Start Microphone on Join

Add this effect in ChatroomInterface.tsx:

```typescript
// Auto-start microphone when session is ready
useEffect(() => {
  if (isVoiceReady && isConnected && otherParticipant && !mediaStreamRef.current) {
    console.log('[AUTO-START] Starting microphone automatically');
    startMicrophone();
  }
}, [isVoiceReady, isConnected, otherParticipant]);

const startMicrophone = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    
    mediaStreamRef.current = stream;
    
    // Start sending audio to server (unmuted by default)
    if (!isMuted) {
      startRoomListening();
    }
  } catch (error) {
    console.error('[AUTO-START] Failed to start microphone:', error);
    toast.error('Failed to access microphone');
  }
};
```

### 4. Implement Mute/Unmute Toggle

```typescript
const toggleMute = useCallback(() => {
  const newMutedState = !isMuted;
  setIsMuted(newMutedState);
  
  if (mediaStreamRef.current) {
    // Pause/resume audio tracks
    mediaStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMutedState;
    });
  }
  
  if (newMutedState) {
    // Muted - stop sending audio
    stopRoomListening();
    toast.info('Microphone muted');
  } else {
    // Unmuted - start sending audio
    startRoomListening();
    toast.success('Microphone unmuted');
  }
  
  // Notify server of mute state change
  sendMuteStateChange(newMutedState);
}, [isMuted, startRoomListening, stopRoomListening]);

// Add keyboard shortcut
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleMute();
    }
  };
  
  document.addEventListener('keydown', handleKeyPress);
  return () => document.removeEventListener('keydown', handleKeyPress);
}, [toggleMute]);
```

### 5. Handle Server VAD Events for Pulsing Ring

```typescript
// In the WebSocket event handler
if (event.type === 'VOICE_ACTIVITY_STARTED') {
  if (event.participantId === participant.id) {
    setIsServerVADActive(true);
  } else {
    // Other participant started speaking
    setIsOtherSpeaking(true);
  }
}

if (event.type === 'VOICE_ACTIVITY_STOPPED') {
  if (event.participantId === participant.id) {
    setIsServerVADActive(false);
  } else {
    setIsOtherSpeaking(false);
  }
}
```

### 6. Handle Translation Interruption

```typescript
if (event.type === 'TRANSLATION_INTERRUPTED') {
  console.log('[INTERRUPTION] Translation interrupted, flushing audio queue');
  
  // Clear audio player queue
  if (audioPlayerRef.current) {
    audioPlayerRef.current.clearQueue();
  }
  
  // Clear any pending audio state
  setIncomingTranscript('');
  setIsOtherSpeaking(false);
}
```

### 7. Update Mute Button UI

Replace the push-to-talk button with:

```tsx
<button
  onClick={toggleMute}
  disabled={!isVoiceReady || !isConnected || !otherParticipant}
  className={`relative flex items-center justify-center gap-2 px-6 py-4 rounded-lg border transition-all text-sm font-medium ${
    isMuted
      ? 'border-border bg-secondary hover:bg-muted text-muted-foreground'
      : 'border-primary bg-primary/10 text-primary hover:bg-primary/20'
  } disabled:opacity-50 disabled:cursor-not-allowed`}
>
  {/* Pulsing ring when server VAD detects speech (only when unmuted) */}
  {!isMuted && isServerVADActive && (
    <>
      <span className="absolute w-20 h-20 rounded-full bg-primary/20 animate-ping" />
      <span className="absolute w-24 h-24 rounded-full border-2 border-primary animate-pulse" />
    </>
  )}
  
  {isMuted ? (
    <>
      <MicOff className="w-5 h-5" />
      <span>Unmute</span>
    </>
  ) : (
    <>
      <Mic className="w-5 h-5" />
      <span>Mute</span>
      {isServerVADActive && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
    </>
  )}
</button>

{/* Keyboard shortcut hint */}
<div className="text-xs text-muted-foreground">
  Press <kbd className="px-2 py-1 bg-secondary border border-border rounded">M</kbd> to toggle
</div>
```

### 8. Add Other Participant Speaking Indicator

```tsx
{isOtherSpeaking && (
  <div className="flex items-center gap-2 text-sm text-primary">
    <Waves className="w-4 h-4 animate-pulse" />
    <span>{otherParticipant?.name} is speaking...</span>
  </div>
)}
```

### 9. Update StreamingAudioPlayer to Handle Interruptions

In `StreamingAudioPlayer.ts`, add:

```typescript
public handleInterruption(): void {
  console.log('[StreamingAudioPlayer] Handling interruption - clearing queue');
  
  // Clear all pending chunks
  this.pendingChunks = [];
  this.pcmBufferByResponseId.clear();
  this.responseIdQueue = [];
  this.currentResponseId = null;
  
  // Clear the worklet queue
  if (this.workletNode) {
    this.workletNode.port.postMessage({
      type: 'CLEAR_QUEUE'
    });
  }
  
  if (this.options.debug) {
    console.log('[StreamingAudioPlayer] Interruption handled - all queues cleared');
  }
}
```

### 10. Update Audio Chunk Handler to Check Sequence Numbers

In the AUDIO_CHUNK event handler:

```typescript
if (event.type === 'AUDIO_CHUNK') {
  // Check sequence number to discard out-of-order chunks
  if (event.sequenceNumber !== undefined) {
    const lastSeq = lastSequenceNumbers.get(event.participantId) || 0;
    
    if (event.sequenceNumber <= lastSeq) {
      console.warn(`[AUDIO] Discarding out-of-order chunk: ${event.sequenceNumber} <= ${lastSeq}`);
      return;
    }
    
    lastSequenceNumbers.set(event.participantId, event.sequenceNumber);
  }
  
  // Add to audio player
  addAudioChunk(event.audioData, event.responseId);
  playIncomingAudioChunk(event.audioData, event.responseId);
}
```

## Testing Checklist

- [ ] User B hears translated audio within 500ms of User A starting to speak
- [ ] No duplicate or overlapping audio on rapid speech
- [ ] Microphone starts automatically on session join (no button press)
- [ ] Mute/unmute pauses and resumes mic stream without dropping session
- [ ] Pressing M toggles mute at any time
- [ ] Pulsing ring appears only during detected speech (server VAD)
- [ ] Other participant's speaking indicator shows correctly
- [ ] Interruption handling works (both users speaking simultaneously)
- [ ] No push-to-talk code remains in codebase
- [ ] Transcript generation still works correctly
- [ ] Sequence numbers prevent out-of-order audio playback

## Performance Targets

- **Latency:** User B hears translation within 500ms of User A speaking
- **No Gaps:** Streaming chunks play continuously without silence gaps
- **No Overlap:** Interruption handling prevents audio overlap
- **Smooth Mute:** Mute/unmute is instant with no audio glitches

## Migration Notes

### Breaking Changes
- Push-to-talk is completely removed
- Users must explicitly mute if they don't want to transmit
- Microphone permission required immediately on join

### Backward Compatibility
- Existing transcript and recording features unchanged
- WebSocket protocol extended (new event types added)
- OpenAI session config updated (may affect existing sessions)

## Implementation Priority

1. **Backend streaming** (audio.delta immediate relay)
2. **Backend interruption** (speech_started cancellation)
3. **Frontend mute/unmute** (remove push-to-talk)
4. **Frontend auto-start** (mic on join)
5. **Frontend interruption** (queue flushing)
6. **UI updates** (mute button, pulsing ring)
7. **Sequence numbers** (out-of-order detection)
8. **Testing and tuning**

## Success Criteria

✅ Streaming parallel translation working (< 500ms latency)
✅ Mute/unmute replaces push-to-talk completely
✅ No push-to-talk code remains
✅ Interruption handling prevents overlaps
✅ Server VAD drives visual feedback
✅ Keyboard shortcut (M) works
✅ Both users can be unmuted simultaneously
✅ Existing features (transcripts, recording) unaffected
