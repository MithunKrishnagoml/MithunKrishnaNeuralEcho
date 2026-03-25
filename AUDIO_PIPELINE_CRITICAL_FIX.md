# CRITICAL AUDIO PIPELINE FIX

## ROOT CAUSE ANALYSIS

### Problem 1: No Audio Entering Pipeline
**Symptom**: `AudioWorklet → queue: 0/480` - No audio frames captured
**Root Cause**: Microphone source is NOT connected to AudioWorklet
**Impact**: ❌ No audio → ❌ No transcripts → ❌ No translations → ❌ No translated audio

### Problem 2: Session Recreation Loop
**Symptom**: "Reinitializing session multiple times" + "Data channel closed"
**Root Cause**: WebRTC session recreated on language/speaker changes
**Impact**: ❌ Breaks streaming → ❌ Data channel closes → ❌ Pipeline fails

## CURRENT BROKEN FLOW

```
Mic 🎤
  ↓
❌ NOT CONNECTED TO AUDIOWORKLET
  ↓
WebRTC addTrack (bypasses worklet)
  ↓
OpenAI Realtime
  ↓
❌ No proper audio processing
```

## REQUIRED FIXED FLOW

```
Mic 🎤
  ↓
getUserMedia()
  ↓
createMediaStreamSource()
  ↓
source.connect(workletNode) ← CRITICAL MISSING LINE
  ↓
AudioWorklet process()
  ↓
port.postMessage(Float32Array)
  ↓
Main thread: Float32 → Int16 → Base64
  ↓
dataChannel.send({ type: "input_audio_buffer.append", audio: base64 })
  ↓
dataChannel.send({ type: "input_audio_buffer.commit" })
  ↓
OpenAI Realtime API
  ↓
response.output_text.delta → transcript
  ↓
response.output_audio.delta → audio
```

## FIXES REQUIRED

### FIX 1: Connect Mic → AudioWorklet (CRITICAL)
**File**: `useRealtimeVoice.ts`
**Location**: After `getUserMedia()` in `initSession()`

```typescript
// Current (BROKEN):
stream.getTracks().forEach((track) => {
  track.enabled = false;
  pc.addTrack(track, stream);
});

// Fixed (CORRECT):
// 1. Create AudioContext
const audioContext = new AudioContext({ sampleRate: 24000 });

// 2. Create source from microphone
const source = audioContext.createMediaStreamSource(stream);

// 3. Load AudioWorklet module
await audioContext.audioWorklet.addModule('/mic-input-processor.js');

// 4. Create AudioWorkletNode
const workletNode = new AudioWorkletNode(audioContext, 'mic-input-processor');

// 5. CRITICAL: Connect source to worklet
source.connect(workletNode);

// 6. Handle audio chunks from worklet
workletNode.port.onmessage = (event) => {
  if (event.data.type === 'AUDIO_CHUNK') {
    const int16Array = new Int16Array(event.data.data);
    const base64 = base64EncodeAudio(int16Array);
    
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64
      }));
    }
  }
};
```

### FIX 2: Update mic-input-processor.js
**File**: `frontend/public/mic-input-processor.js`
**Changes**: Already correct, just needs to be connected

### FIX 3: Add Helper Functions
**File**: `useRealtimeVoice.ts`

```typescript
function base64EncodeAudio(int16Array: Int16Array): string {
  let binary = "";
  const bytes = new Uint8Array(int16Array.buffer);
  const chunkSize = 0x8000;
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  
  return btoa(binary);
}
```

### FIX 4: Control AudioWorklet Capture
**File**: `useRealtimeVoice.ts`

```typescript
// In enableMic():
workletNodeRef.current?.port.postMessage({ type: 'START_CAPTURE' });

// In disableMic():
workletNodeRef.current?.port.postMessage({ type: 'STOP_CAPTURE' });
```

### FIX 5: Prevent Session Recreation (CRITICAL)
**File**: `useRoomTranslation.ts` or wherever session is reinitialized

```typescript
// BEFORE (BROKEN):
useEffect(() => {
  // Reinitialize on language change
  setVoiceModeAndInit(voiceMode);
}, [participant.language]);

// AFTER (FIXED):
useEffect(() => {
  // Check if session is already active
  if (sessionState === "ready" || sessionState === "connecting") {
    console.log("⚠️ Session already active, skipping reinit");
    return;
  }
  
  setVoiceModeAndInit(voiceMode);
}, [participant.language, sessionState]);
```

### FIX 6: Update Session Config Instead of Recreating
**File**: `useRealtimeVoice.ts`

```typescript
// Add new function to update session without recreating
const updateSessionConfig = useCallback((config: Partial<SessionConfig>) => {
  if (dcRef.current?.readyState === 'open') {
    dcRef.current.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: config.instructions,
        // ... other config
      }
    }));
  }
}, []);
```

### FIX 7: Remove Duplicate Audio Paths
**Current Issue**: Audio is sent via both WebRTC track AND (should be) AudioWorklet
**Fix**: Remove WebRTC audio track, use ONLY AudioWorklet + DataChannel

```typescript
// REMOVE THIS:
stream.getTracks().forEach((track) => {
  pc.addTrack(track, stream);
});

// KEEP ONLY AudioWorklet path
```

## IMPLEMENTATION CHECKLIST

- [ ] Add AudioContext creation in initSession()
- [ ] Add createMediaStreamSource() for mic
- [ ] Add audioWorklet.addModule() for processor
- [ ] Add AudioWorkletNode creation
- [ ] **CRITICAL**: Add source.connect(workletNode)
- [ ] Add workletNode.port.onmessage handler
- [ ] Add base64EncodeAudio() helper function
- [ ] Update enableMic() to send START_CAPTURE
- [ ] Update disableMic() to send STOP_CAPTURE
- [ ] Add session state check before reinit
- [ ] Remove WebRTC addTrack() for audio
- [ ] Add updateSessionConfig() function
- [ ] Test: Verify audio chunks are sent
- [ ] Test: Verify transcripts appear
- [ ] Test: Verify translations work
- [ ] Test: Verify no session recreation

## EXPECTED RESULTS AFTER FIX

✅ AudioWorklet queue shows samples: `queue: 2400/2400`
✅ Audio chunks sent continuously to OpenAI
✅ Transcripts appear in real-time
✅ Translations generated correctly
✅ Data channel stays open
✅ No session reinitialization
✅ Smooth streaming experience

## TESTING PROCEDURE

1. Open browser console
2. Click mic button
3. Speak into microphone
4. Verify logs show:
   - `[MicInputProcessor] Started capturing`
   - `[AudioWorklet] Added X samples, queue size: Y`
   - `📤 Audio chunk sent`
   - `📥 OpenAI event: response.output_text.delta`
   - `📥 OpenAI event: response.output_audio.delta`
5. Verify NO logs show:
   - `Reinitializing session`
   - `Data channel closed`
   - `queue: 0/480`

## FILES TO MODIFY

1. `frontend/src/hooks/useRealtimeVoice.ts` - Main audio pipeline
2. `frontend/src/hooks/useRoomTranslation.ts` - Prevent session recreation
3. `frontend/public/mic-input-processor.js` - Already correct
4. `frontend/src/contexts/AppContext.tsx` - Session state management
