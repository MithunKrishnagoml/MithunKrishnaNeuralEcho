# CRITICAL FIX: Audio Relay Not Working

## Problem
Audio is being captured by AudioTapProcessor but NOT being sent to the backend WebSocket. The other participant cannot hear the translation because no audio chunks are being relayed.

## Root Cause
The `PCM_CHUNK` messages from the AudioWorklet are not being handled. There's no code connecting the audio capture to the WebSocket sender.

## Solution

### Option 1: Add Handler in WebRTC Setup Code

Find where the AudioTapProcessor/AudioWorkletNode is created (search for "audio-tap-processor" or "RealtimeAudioTap") and add:

```typescript
// After creating the AudioWorkletNode for audio-tap-processor
audioTapNode.port.onmessage = (event) => {
  if (event.data.type === 'PCM_CHUNK') {
    // Convert ArrayBuffer to base64
    const uint8Array = new Uint8Array(event.data.data);
    const base64 = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));
    
    // Send to backend WebSocket
    if (roomWebSocket && roomWebSocket.readyState === WebSocket.OPEN) {
      roomWebSocket.send(JSON.stringify({
        type: 'RELAY_AUDIO_CHUNK',
        chunk: base64,
        fromParticipant: participantId,
        sessionId: sessionId,
        timestamp: Date.now()
      }));
      
      console.log(`🎤 [AUDIO RELAY] Sent chunk to backend (${base64.length} bytes)`);
    }
  }
};
```

### Option 2: Modify audio-tap-processor.js to Send Directly

**Current Issue**: The AudioWorklet sends PCM_CHUNK to main thread, but main thread doesn't handle it.

**Alternative**: Make the AudioWorklet NOT send chunks, and instead capture audio differently.

### Option 3: Use MediaRecorder Instead (Simpler)

Replace the AudioTapProcessor approach with MediaRecorder:

```typescript
// In WebRTC setup, after getting remote audio track
const remoteStream = new MediaStream([remoteAudioTrack]);
const mediaRecorder = new MediaRecorder(remoteStream, {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 16000
});

mediaRecorder.ondataavailable = (event) => {
  if (event.data.size > 0 && roomWebSocket?.readyState === WebSocket.OPEN) {
    // Convert Blob to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      roomWebSocket.send(JSON.stringify({
        type: 'RELAY_AUDIO_CHUNK',
        chunk: base64,
        fromParticipant: participantId,
        sessionId: sessionId,
        timestamp: Date.now()
      }));
    };
    reader.readAsDataURL(event.data);
  }
};

// Start recording in chunks
mediaRecorder.start(100); // 100ms chunks
```

## Recommended Immediate Fix

Since the AudioTapProcessor is already set up but not connected, the fastest fix is to add the message handler.

**Search for these files:**
1. `src/contexts/AppContext.tsx`
2. `src/hooks/useRealtimeAudio.ts`
3. `src/hooks/useWebRTC.ts`
4. Any file that contains "audio-tap-processor" or "addWorkletModule"

**Add the handler code** shown in Option 1 above.

## Verification

After adding the fix, you should see in the console:
1. Frontend: `🎤 [AUDIO RELAY] Sent chunk to backend`
2. Backend: `🎤 [AUDIO TO OPENAI] Sent audio chunk from X to OpenAI`
3. Backend: `=== [AUDIO DELTA] Received audio chunk`
4. Backend: `=== [STREAMING AUDIO] Sending chunk to other participant`
5. Frontend (other user): `🔊 [STREAMING AUDIO] Received chunk`

## Why This Wasn't Working

The system has all the pieces:
- ✅ Audio capture (AudioTapProcessor)
- ✅ Backend relay logic (relayStreamingMessage)
- ✅ OpenAI translation (handleOpenAIResponse)
- ✅ Audio playback (FifoAudioQueue)
- ❌ **Missing link**: AudioTapProcessor → WebSocket

It's like having a microphone, speakers, and a translation service, but forgetting to connect the microphone cable!
