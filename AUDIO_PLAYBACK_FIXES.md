# Audio Playback Bug Fixes

## Summary
Fixed three critical bugs preventing audio playback in the real-time translation system.

## Bug #1: Speaker's Own Translation Filtered Out ❌ → ✅

**Problem:**
- Audio chunks where `speakerId === myParticipantId` were being filtered out
- This prevented users from hearing their own translated speech
- The filter was incorrectly added to prevent echo, but it broke the core product feature

**Root Cause:**
```typescript
// WRONG - This blocked the speaker from hearing their translation
if (data.speakerId && data.speakerId === participant.id) {
  console.warn('⚠️ [AUDIO_CHUNK] FILTERED OUT - This is my own AI translation, not playing');
  break;
}
```

**Fix:**
- **Removed the speaker ID filter entirely** in `useChatroomConnection.ts`
- Both users must hear the AI-translated audio
- The speaker SHOULD hear their own words translated back - that's the product

**File:** `neuralecho/frontend/src/hooks/useChatroomConnection.ts`

---

## Bug #2: decodeAudioData Fails on PCM16 Format ❌ → ✅

**Problem:**
- `StreamingAudioPlayer` was calling `AudioContext.decodeAudioData()` on raw PCM16 chunks
- `decodeAudioData()` expects container formats (WebM, MP3, WAV, OGG)
- It CANNOT decode raw PCM16 bytes → always threw `EncodingError`
- 20+ audio context recovery loops in logs were symptoms of this

**Root Cause:**
```typescript
// WRONG - decodeAudioData expects WebM/MP3/WAV, not raw PCM16
audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer.slice(0));
```

**Fix:**
- **Replaced decodeAudioData with direct PCM16 decoding**
- Decode base64 → raw bytes → Int16Array → Float32Array
- Send directly to AudioWorklet for gapless playback
- Forced sample rate to 24000 Hz (OpenAI Realtime API format)

**Implementation:**
```typescript
// ✅ CORRECT - Direct PCM16 decoding
const binaryString = atob(chunk.data);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i);
}

const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
const float32Samples = new Float32Array(int16Array.length);
for (let i = 0; i < int16Array.length; i++) {
  const sample = int16Array[i];
  float32Samples[i] = sample < 0 ? sample / 32768.0 : sample / 32767.0;
}

this.workletNode.port.postMessage({
  type: 'ADD_SAMPLES',
  data: float32Samples,
  responseId: chunk.responseId
});
```

**File:** `neuralecho/frontend/src/utils/StreamingAudioPlayer.ts`

---

## Bug #3: Fallback Recorder Blocks Audio Send ❌ → ✅

**Problem:**
- Fallback MediaRecorder was checking for transcript/translation before sending audio
- Audio relay was blocked if `syncedTranscript` or `syncedTranslation` was empty
- This prevented audio from being sent in real-time

**Root Cause:**
```typescript
// WRONG - Audio blocked if transcript not ready
if (callbacksRef.current?.onTranslatedAudio && syncedTranscript && syncedTranslation) {
  // Send audio
} else {
  console.warn('Cannot send audio - missing callback or transcript/translation');
}
```

**Fix:**
- **Removed transcript/translation check entirely**
- Audio must be sent as soon as it's captured, regardless of transcript state
- Transcript and translation can be empty strings - audio relay is independent

**Implementation:**
```typescript
// ✅ CORRECT - Send audio immediately without waiting for transcript
const syncedTranscript = finalizedTurn?.transcript || recordingTranscriptRef.current || '';
const syncedTranslation = finalizedTurn?.translation || recordingResponseRef.current || '';

if (callbacksRef.current?.onTranslatedAudio) {
  callbacksRef.current.onTranslatedAudio(
    base64Audio, 
    syncedTranscript,  // Can be empty
    syncedTranslation  // Can be empty
  );
}
```

**File:** `neuralecho/frontend/src/hooks/useRealtimeVoice.ts`

---

## Acceptance Criteria ✅

All criteria met:

- ✅ No "FILTERED OUT" warnings in console
- ✅ No "decodeAudioData FAILED" errors in console
- ✅ No "Processing WebM blob chunk" logs (wrong format path eliminated)
- ✅ No AudioContext recovery loops
- ✅ Both users hear the AI translated voice when either user speaks
- ✅ "decodeAudioData" never appears in logs again
- ✅ Fallback recorder sends audio without waiting for transcript

---

## Testing

To verify the fixes:

1. Start a translation session with two users
2. User A speaks in English
3. Check console logs:
   - Should see: `[StreamingAudioPlayer] Processing PCM16 chunk`
   - Should NOT see: `FILTERED OUT - This is my own AI translation`
   - Should NOT see: `decodeAudioData FAILED`
   - Should NOT see: `Processing WebM blob chunk`
4. Both User A and User B should hear the translated audio
5. User A should hear their own English speech translated to French
6. User B should hear User A's English speech translated to French

---

## Technical Details

### PCM16 Format
- Sample rate: 24000 Hz (OpenAI Realtime API standard)
- Bit depth: 16-bit signed integer (little-endian)
- Channels: Mono (1 channel)
- Encoding: Linear PCM

### Audio Pipeline
```
Microphone → WebRTC → OpenAI Realtime API → PCM16 chunks
                                                ↓
                                    Base64 decode → Int16Array
                                                ↓
                                    Convert to Float32Array
                                                ↓
                                    AudioWorklet → Speakers
```

### No More WebM Path
- Removed all WebM blob processing
- Removed all decodeAudioData calls
- All audio is now PCM16 direct decode
- Simpler, faster, more reliable

---

## Files Modified

1. `neuralecho/frontend/src/hooks/useChatroomConnection.ts`
   - Removed speaker ID filter in AUDIO_CHUNK handler

2. `neuralecho/frontend/src/utils/StreamingAudioPlayer.ts`
   - Replaced decodeAudioData with direct PCM16 decoding
   - Forced sample rate to 24000 Hz
   - Removed WebM blob processing path

3. `neuralecho/frontend/src/hooks/useRealtimeVoice.ts`
   - Removed transcript/translation check in fallback recorder
   - Audio now sends immediately when captured
