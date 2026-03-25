# Real-Time Audio Streaming Fix

## Problem Analysis

From the logs, we can see:

### ✅ What's Working
1. AudioTap initialized successfully
2. Audio graph connected properly
3. AudioContext running at 24kHz
4. WebRTC session established
5. Data channel open

### ❌ What's NOT Working
1. **AudioTap never starts capturing**
   ```
   [AudioTapProcessor] process() call #0, isCapturing: false
   ```
   - Worklet is running ✅
   - Audio is flowing ✅  
   - BUT `startCapture()` never called ❌

2. **Player stuck buffering**
   ```
   [AudioWorklet] Still buffering... queue: 0/480
   ```
   - No audio chunks arriving at playback queue
   - Because upstream (AudioTap → WS → other user) is empty

3. **WebSocket disconnect (1006)**
   ```
   Disconnected from chatroom. Code: 1006
   ```
   - Usually happens due to inactivity
   - No data sent for long time

## Root Cause

The AudioTap is initialized but **never triggered** because:

1. User hasn't spoken yet → No OpenAI audio generation
2. No `output_audio_buffer.started` event → No `startCapture()` call
3. No PCM chunks sent → No WebSocket streaming
4. Other user receives nothing → Stuck buffering

## The Real-Time Flow (What Should Happen)

```
User A speaks
    ↓
Mic captures audio → sends to OpenAI
    ↓
OpenAI transcribes + translates
    ↓
OpenAI generates TTS audio (streaming)
    ↓
Event: output_audio_buffer.started
    ↓
RealtimeAudioTap.startCapture(responseId)
    ↓
AudioWorklet captures PCM chunks (every 128 samples)
    ↓
Chunks → WebSocket (AI_AUDIO_CHUNK)
    ↓
User B receives chunks
    ↓
User B plays instantly (20ms buffer)
```

## Current Implementation Status

### ✅ Already Implemented

1. **AudioTap Initialization** (useRealtimeVoice.ts)
   ```typescript
   audioTapRef.current = new RealtimeAudioTap(
     (pcmData, responseId, sequenceNumber) => {
       // Send to local audio player
       if (callbacksRef.current?.onAudioChunk) {
         callbacksRef.current.onAudioChunk(pcmData, responseId);
       }
       
       // RELAY TO BACKEND
       if (callbacksRef.current?.onAIAudioChunk) {
         callbacksRef.current.onAIAudioChunk(pcmData, sequenceNumber);
       }
     },
     (responseId) => {
       console.log('🏁 Stream ended for response:', responseId);
     }
   );
   ```

2. **Capture Start on OpenAI Audio** (useRealtimeVoice.ts)
   ```typescript
   if (event.type === "output_audio_buffer.started") {
     const responseId = event.response_id || `response_${Date.now()}`;
     
     const tryStartCapture = (attempt: number = 0) => {
       if (audioTapRef.current) {
         audioTapRef.current.startCapture(responseId);
       } else if (attempt < 5) {
         setTimeout(() => tryStartCapture(attempt + 1), 100);
       }
     };
     
     tryStartCapture();
   }
   ```

3. **WebSocket Relay** (useRoomTranslation.ts)
   ```typescript
   setAIAudioChunkCallback((audioData: string, sequenceNumber: number) => {
     if (ws && ws.readyState === WebSocket.OPEN) {
       ws.send(JSON.stringify({
         type: 'AI_AUDIO_CHUNK',
         audio: audioData,
         sequenceNumber,
         language: participant.language
       }));
     }
   });
   ```

4. **Playback on Receiver** (ChatroomInterface.tsx)
   ```typescript
   case 'AI_AUDIO_CHUNK':
     if (data.language !== participant.language) {
       // Play audio from other participant
       audioQueueRef.current?.addChunk(data.audio);
     }
     break;
   ```

## Why It's Not Working in Your Test

**The user never spoke!**

Looking at the logs:
- Session initialized ✅
- WebRTC connected ✅
- Data channel opened ✅
- **But no mic button pressed** ❌
- **No audio sent to OpenAI** ❌
- **No translation generated** ❌
- **No `output_audio_buffer.started` event** ❌

## Testing Instructions

### To Test Real-Time Audio Streaming:

1. **Open two browser windows**
   - Window A: User speaking English
   - Window B: User speaking French

2. **Join the same room**
   - Both users enter the same room ID
   - Wait for "Translation session is ready with 2 participants"

3. **User A: Press and hold mic button**
   - Speak in English: "Hello, how are you today?"
   - Release mic button

4. **Expected Flow:**
   ```
   User A speaks → OpenAI transcribes
   ↓
   OpenAI translates to French
   ↓
   OpenAI generates French TTS
   ↓
   output_audio_buffer.started fires
   ↓
   AudioTap starts capturing
   ↓
   PCM chunks → WebSocket
   ↓
   User B hears French audio in real-time
   ```

5. **Check Logs:**
   ```
   ✅ [RealtimeAudioTap] Started capture (output_audio_buffer.started)
   🎵 [RealtimeAudioTap] Chunk #0: hasAudio=true, maxAmp=0.XXXX
   🔊 [RELAY] Sending AI audio chunk #0 to backend
   [AudioWorklet] Added 480 samples, queue size: 480
   [AudioWorklet] Jitter buffer filled - starting playback
   [AudioWorklet] Playing 128/128 samples
   ```

## Verification Checklist

### Before Speaking:
- [ ] AudioTap initialized
- [ ] Audio graph connected
- [ ] WebRTC session ready
- [ ] Data channel open
- [ ] Both participants connected
- [ ] `isCapturing: false` (expected)

### After Speaking:
- [ ] Mic button pressed
- [ ] Audio sent to OpenAI
- [ ] `output_audio_buffer.started` event received
- [ ] `startCapture()` called
- [ ] `isCapturing: true`
- [ ] PCM chunks captured (maxAmp > 0)
- [ ] Chunks sent via WebSocket
- [ ] Other user receives chunks
- [ ] Other user's queue fills
- [ ] Playback starts

## Common Issues

### Issue 1: "Still buffering... queue: 0/480"
**Cause**: No audio chunks arriving
**Fix**: User needs to speak first to trigger OpenAI audio generation

### Issue 2: "isCapturing: false"
**Cause**: `startCapture()` not called
**Fix**: Speak into mic to trigger `output_audio_buffer.started`

### Issue 3: "WebSocket disconnect (1006)"
**Cause**: No activity for extended period
**Fix**: Speak or implement heartbeat (already has auto-reconnect)

### Issue 4: "maxAmp=0.0000"
**Cause**: Capturing silence (no OpenAI audio yet)
**Fix**: Wait for OpenAI to generate audio after transcription

## Performance Metrics

- **Jitter Buffer**: 20ms (480 samples at 24kHz)
- **Chunk Size**: ~43ms (1024 samples at 24kHz)
- **Expected Latency**: 
  - Transcription: 200-500ms
  - Translation: 100-300ms
  - TTS Generation: 200-400ms
  - Network: 50-100ms
  - **Total**: 550-1300ms (< 1.5 seconds)

## Next Steps

1. **Test with actual speech**
   - Press mic button
   - Speak a sentence
   - Verify audio flows through pipeline

2. **Monitor logs for:**
   - `output_audio_buffer.started`
   - `startCapture()` called
   - `isCapturing: true`
   - `maxAmp > 0`
   - Chunks sent/received

3. **If still not working:**
   - Check mic permissions
   - Check OpenAI API key
   - Check WebSocket connection
   - Check browser console for errors
