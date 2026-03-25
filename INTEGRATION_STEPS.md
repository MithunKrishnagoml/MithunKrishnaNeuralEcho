# Integration Steps for Real-Time Audio Pipeline

## Overview
This guide shows how to integrate the manual audio streaming implementation into your existing codebase.

## Files Created
1. `frontend/public/mic-input-processor.js` - AudioWorklet for mic capture
2. `REALTIME_AUDIO_IMPLEMENTATION.ts` - Complete implementation code

## Step-by-Step Integration

### Step 1: Add AudioWorklet File
The `mic-input-processor.js` file is already created in `frontend/public/`.
No action needed - it will be loaded automatically.

### Step 2: Modify useRealtimeVoice.ts

**Find the section where WebRTC is initialized** (around line 600):

**REPLACE THIS**:
```typescript
// Start with mic muted
stream.getTracks().forEach((track) => {
  track.enabled = false;
  pc.addTrack(track, stream);
});
```

**WITH THIS**:
```typescript
// DON'T add mic track to peer connection
// We'll capture audio manually via AudioWorklet
// Only add if you want to hear your own voice (not needed for translation)
```

### Step 3: Initialize Manual Audio Capture

**Add after DataChannel is opened** (around line 660):

```typescript
dc.onopen = async () => {
  console.log('✅ [WebRTC] Data channel opened - session is ready!');
  setSessionState('ready');
  
  // ========== ADD THIS ==========
  // Initialize manual audio capture
  try {
    await initializeMicCapture(dc);
    console.log('✅ [AUDIO] Manual capture initialized');
  } catch (error) {
    console.error('❌ [AUDIO] Failed to initialize:', error);
  }
  // ========== END ADD ==========
};
```

### Step 4: Connect VAD to Audio Streaming

**Find the VAD callbacks** (search for "onVADSpeechStart"):

**REPLACE**:
```typescript
const onVADSpeechStart = () => {
  // existing code
};

const onVADSpeechEnd = () => {
  // existing code
};
```

**WITH**:
```typescript
const onVADSpeechStart = () => {
  console.log('🎤 [VAD] Speech started');
  startAudioStreaming(); // ← ADD THIS
};

const onVADSpeechEnd = () => {
  console.log('🔇 [VAD] Speech ended');
  stopAudioStreaming(); // ← ADD THIS
};
```

### Step 5: Update DataChannel Message Handler

**Find** `handleDataChannelMessage` function:

**ADD** the message handlers from `REALTIME_AUDIO_IMPLEMENTATION.ts`:
- `conversation.item.input_audio_transcription.completed`
- `response.audio_transcript.delta`
- `response.audio_transcript.done`
- `response.audio.delta`
- `response.audio.done`

### Step 6: Copy Helper Functions

Copy these functions from `REALTIME_AUDIO_IMPLEMENTATION.ts` to your `useRealtimeVoice.ts`:

```typescript
// Add at the top of the file
const audioManager = useRef<AudioStreamManager>({
  audioContext: null,
  micWorklet: null,
  micStream: null,
  dataChannel: null,
  isStreaming: false
});

// Add these functions
const initializeMicCapture = useCallback(async (dataChannel: RTCDataChannel) => {
  // ... copy from implementation file
}, []);

const sendAudioToOpenAI = (audioBuffer: ArrayBuffer, dataChannel: RTCDataChannel) => {
  // ... copy from implementation file
};

const startAudioStreaming = useCallback(() => {
  // ... copy from implementation file
}, []);

const stopAudioStreaming = useCallback(() => {
  // ... copy from implementation file
}, []);
```

## Testing Checklist

After integration, test in this order:

### 1. Microphone Capture
- [ ] Open console
- [ ] Click mic button
- [ ] Speak
- [ ] See: `📤 [AUDIO] Sent chunk: XXX bytes`
- [ ] See chunks being sent continuously while speaking

### 2. OpenAI Response
- [ ] After speaking, see: `✅ [AUDIO] Committed and requested response`
- [ ] See: `📨 [DataChannel] Received: conversation.item.input_audio_transcription.completed`
- [ ] See: `📝 [ORIGINAL] "your text here"`
- [ ] See: `📝 [TRANSLATION DELTA] "..."`
- [ ] See: `🔊 [AUDIO DELTA] Received chunk`

### 3. Multi-User Relay
- [ ] Open two browser windows
- [ ] Join same room
- [ ] User A speaks
- [ ] User B console shows: `🔊 [RECEIVE] Audio chunk from participant-XXX`
- [ ] User B hears translated audio
- [ ] Audio queue shows non-zero: `queue: 2400/480`

### 4. Transcripts
- [ ] Original transcript appears for speaker
- [ ] Translated transcript appears for listener
- [ ] Text streams in real-time (not all at once)

## Common Issues & Solutions

### Issue: No audio chunks sent
**Solution**: Check microphone permissions
```typescript
navigator.permissions.query({ name: 'microphone' }).then(result => {
  console.log('Mic permission:', result.state);
});
```

### Issue: DataChannel not open
**Solution**: Ensure you're calling `initializeMicCapture` AFTER `dc.onopen` fires

### Issue: Audio chunks sent but no response
**Solution**: Check OpenAI API key and session configuration

### Issue: Audio queue stays at 0
**Solution**: Check WebSocket connection and message relay in backend

## Performance Tips

1. **Chunk Size**: 2400 samples (100ms at 24kHz) is optimal
   - Smaller = more overhead
   - Larger = more latency

2. **Sample Rate**: Must be 24kHz to match OpenAI

3. **Buffer Management**: Clear buffer on VAD start to prevent stale audio

## Debugging Commands

```javascript
// Check if worklet is loaded
console.log(audioManager.current);

// Check DataChannel state
console.log(dcRef.current?.readyState);

// Check WebSocket state
console.log(roomWebSocket?.readyState);

// Manually trigger audio send (for testing)
startAudioStreaming();
setTimeout(() => stopAudioStreaming(), 3000);
```

## Next Steps

1. Integrate the code following steps above
2. Test with console open
3. Verify all log messages appear
4. Test with two participants
5. Verify audio and transcripts work end-to-end

## Support

If issues persist:
1. Check all console logs
2. Verify WebRTC connection is established
3. Verify DataChannel is open
4. Verify microphone permissions granted
5. Check backend logs for relay messages
