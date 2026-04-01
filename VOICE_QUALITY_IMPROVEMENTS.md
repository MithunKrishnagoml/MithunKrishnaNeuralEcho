# Voice Quality & Transcription Improvements

## Summary
Fixed grainy/robotic AI voice and improved transcription accuracy by implementing PCM16Player and optimizing OpenAI Realtime API configuration.

---

## Root Causes of Audio Quality Issues

### 1. Sample Rate Mismatch ❌ → ✅
**Problem:**
- OpenAI Realtime API outputs PCM16 at exactly 24000 Hz
- AudioContext was created without explicit `sampleRate: 24000`
- Browser defaulted to 44100 Hz or 48000 Hz
- Browser resampled 24000→44100 incorrectly (treated as native rate)
- Result: audio played at wrong speed and pitch = robotic chipmunk voice

**Fix:**
```typescript
// ✅ CORRECT - Force 24000 Hz to match OpenAI output
this.ctx = new AudioContext({ sampleRate: 24000 });
```

### 2. Chunk Boundary Clicks and Pops ❌ → ✅
**Problem:**
- Each PCM16 chunk starts/ends at arbitrary sample boundary
- Chunks not scheduled contiguously in time
- Gaps or overlaps at each boundary = crackling/clicking
- `nextStartTime` scheduler had drift issues

**Fix:**
```typescript
// ✅ CORRECT - Gapless scheduling with Math.max guard
const now = this.ctx.currentTime;
const startAt = this.nextStartTime > now 
  ? this.nextStartTime 
  : now + 0.02; // 20ms lookahead on first chunk only

source.start(startAt);
this.nextStartTime = startAt + buffer.duration;
```

### 3. Int16 Byte Order ❌ → ✅
**Problem:**
- PCM16 from OpenAI is little-endian signed 16-bit
- Plain Uint8Array cast to Int16Array doesn't respect byte order
- Every sample corrupted on big-endian platforms and some mobile browsers

**Fix:**
```typescript
// ✅ CORRECT - DataView with explicit little-endian
const view = new DataView(bytes.buffer);
for (let i = 0; i < sampleCount; i++) {
  const int16 = view.getInt16(i * 2, true); // true = little-endian
  float32[i] = Math.max(-1, int16 / 32768); // Clamp to prevent clipping
}
```

### 4. Float32 Clipping ❌ → ✅
**Problem:**
- Dividing Int16 by 32768 is correct
- But if sample equals -32768, result is -1.0000...
- Some browsers clip to slightly above -1.0 = subtle distortion

**Fix:**
```typescript
// ✅ CORRECT - Clamp 
to prevent clipping
float32[i] = Math.max(-1, int16 / 32768);
```

---

## PCM16Player Implementation

### Complete Replacement
Replaced `StreamingAudioPlayer` with `PCM16Player` - a simplified, high-quality player specifically designed for OpenAI Realtime API PCM16 format.

### Key Features
- **Exact sample rate matching**: 24000 Hz AudioContext
- **Gapless playback**: Precise scheduling with nextStartTime tracking
- **Byte-order safe**: DataView with little-endian guarantee
- **Clipping prevention**: Math.max(-1, ...) on every sample
- **No buffering**: Direct enqueue → schedule → play pipeline
- **No decodeAudioData**: Raw PCM16 decode only

### API
```typescript
const player = new PCM16Player();

// Enqueue base64 PCM16 chunk
player.enqueue(base64chunk);

// Resume for autoplay policy
await player.resume();

// Set volume (0.0 to 1.0)
player.setVolume(0.8);

// Flush and reset
player.flush();

// Dispose
player.dispose();
```

### Console Output
```
[PCM16Player] chunk scheduled {
  sampleCount: 480,
  durationMs: "20.0",
  startAt: "0.123",
  nextStartTime: "0.143",
  queueAheadMs: "45.2"
}
```

**Healthy queue ahead**: 20-500ms (not growing unbounded)

---

## OpenAI Session Configuration Improvements

### Voice Selection: ballad → shimmer
**Before:**
```typescript
voice: 'ballad' // Musical, can sound robotic on short phrases
```

**After:**
```typescript
voice: 'shimmer' // Warm, clear, best for translation
```

**Available vo