# Real-Time Translated Audio Relay Implementation

## Current Status
- ✅ Audio capture via AudioTapProcessor working
- ✅ Backend OpenAI connections initialized
- ✅ WebSocket connections established
- ❌ Audio chunks NOT being relayed to backend
- ❌ Translated audio NOT being broadcast to other participants

## Root Cause
The `PCM_CHUNK` messages from AudioTapProcessor are not being handled in the frontend. Audio is captured but never sent to the backend WebSocket.

## Solution Architecture

### Flow Diagram
```
User A speaks (English)
  ↓
Frontend A: Capture audio via AudioTapProcessor
  ↓
Frontend A: Send RELAY_AUDIO_CHUNK to Backend WebSocket
  ↓
Backend: Receive audio → Send to OpenAI for translation
  ↓
Backend: Receive translated audio from OpenAI (response.audio.delta)
  ↓
Backend: Send translation_audio_chunk to User B (French speaker)
  ↓
Frontend B: Receive translation_audio_chunk → Enqueue in FifoAudioQueue
  ↓
Frontend B: Play translated French audio
```

## Implementation Steps

### 1. Frontend: Handle PCM_CHUNK and Relay to Backend

**File**: `frontend/src/hooks/useRealtimeAudio.ts` or `AppContext.tsx`

Add handler for AudioWorklet messages:

```typescript
// In the WebRTC setup where AudioTapProcessor is initialized
audioTapNode.port.onmessage = (event) => {
  if (event.data.type === 'PCM_CHUNK') {
    const { data, responseId, sequenceNumber } = event.data;
    
    // Convert ArrayBuffer to base64
    const int16Array = new Int16Array(data);
    const base64Audio = arrayBufferToBase64(int16Array.buffer);
    
    // Send to backend via WebSocket
    if (roomWebSocket && roomWebSocket.readyState === WebSocket.OPEN) {
      roomWebSocket.send(JSON.stringify({
        type: 'RELAY_AUDIO_CHUNK',
        chunk: base64Audio,
        responseId: responseId,
        fromParticipant: participantId,
        sessionId: sessionId,
        seq: sequenceNumber,
        timestamp: Date.now()
      }));
    }
  }
};

// Helper function
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

### 2. Backend: Already Implemented ✅

The backend already has the handler in `relayStreamingMessage()`:
- Receives RELAY_AUDIO_CHUNK
- Sends to OpenAI via `input_audio_buffer.append`
- Receives translated audio via `response.audio.delta`
- Broadcasts to other participant via `translation_audio_chunk`

### 3. Frontend: Already Implemented ✅

The frontend already has:
- FifoAudioQueue for playback
- Handler for `translation_audio_chunk` in ChatroomInterface
- Audio worklet for smooth playback

## What's Missing

The ONLY missing piece is connecting the AudioTapProcessor output to the WebSocket sender.

## Quick Fix

Add this code where the AudioTapProcessor is initialized (likely in AppContext or useRealtimeAudio):

```typescript
// When setting up the audio tap
if (audioTapNode) {
  audioTapNode.port.onmessage = (event) => {
    if (event.data.type === 'PCM_CHUNK' && roomWebSocket?.readyState === WebSocket.OPEN) {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(event.data.data)));
      roomWebSocket.send(JSON.stringify({
        type: 'RELAY_AUDIO_CHUNK',
        chunk: base64,
        fromParticipant: participantId,
        sessionId: currentSessionId,
        timestamp: Date.now()
      }));
    }
  };
}
```

## Testing Checklist
- [ ] User A speaks → Backend logs show "AUDIO TO OPENAI"
- [ ] Backend logs show "AUDIO DELTA" from OpenAI
- [ ] Backend logs show "Sending chunk to other participant"
- [ ] User B's console shows "STREAMING AUDIO Received chunk"
- [ ] User B hears French translation
- [ ] No echo (User A doesn't hear their own translation)
