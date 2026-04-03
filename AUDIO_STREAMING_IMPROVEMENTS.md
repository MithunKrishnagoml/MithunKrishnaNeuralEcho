# Audio Streaming Quality Improvements

This document describes the 8 critical improvements implemented to eliminate audio artifacts and ensure smooth real-time translation playback.

## 1. Crossfade Between Consecutive Audio Chunks ✅
**File:** `frontend/public/audio-streaming-processor.js`

- Applies 7.5ms (180 samples at 24kHz) linear crossfade between consecutive chunks
- Eliminates clicks/pops at chunk boundaries from phase discontinuities
- Implemented in AudioWorklet processor (zero main-thread involvement)
- Stores tail of previous chunk and blends with head of new chunk

## 2. Jitter Buffer on Receiver ✅
**File:** `frontend/src/utils/StreamingAudioPlayer.ts`

- Buffers minimum of 3 chunks OR 80ms before starting playback
- Absorbs network jitter to prevent queue starvation
- Implements buffer health monitoring (logged every 2s in dev mode)
- Format: `📊 Buffer health: 87% (queue: 42 chunks)`

## 3. Queue Starvation and Overflow Prevention ✅
**File:** `frontend/src/utils/StreamingAudioPlayer.ts`

- Maximum queue depth: 150 chunks
- Drops oldest chunks on overflow (never blocks producer)
- Logs: `⚠️ Queue overflow — dropping old chunks`
- Detects starvation when queue drops below 2 chunks
- Logs: `⚠️ Queue starvation — buffer running low`
- TODO: Implement 0.98x playback rate nudge for 50ms during starvation

## 4. Smooth Fade-in/Fade-out ✅
**File:** `frontend/public/audio-streaming-processor.js`

- 15ms (360 sample) linear fade-in on first chunk of new response
- Prevents abrupt onset pop when translation starts mid-phoneme
- 10ms (240 sample) fade-out when CLEAR_AUDIO is received
- Prevents harsh cuts when queue is flushed

## 5. Sequence Number Gap Detection and Reordering ✅
**File:** `frontend/src/utils/StreamingAudioPlayer.ts`

- Maintains reorder buffer for out-of-order chunks
- Holds chunks for up to 40ms waiting for missing packets
- Skips missing chunks after timeout (doesn't stall playback)
- Logs: `⚠️ Dropped out-of-order chunk #N`
- Plays chunks in correct sequence order

## 6. AudioContext State Management ✅
**File:** `frontend/src/utils/StreamingAudioPlayer.ts`

- Checks `audioContext.state` before every `addChunk()` call
- Calls `audioContext.resume()` if state is 'suspended'
- Adds `visibilitychange` event listener
- Automatically resumes AudioContext when tab becomes visible
- Prevents complete audio silence when tab is backgrounded

## 7. Sample Rate Locking (24kHz) ✅
**File:** `frontend/src/utils/StreamingAudioPlayer.ts`

- Enforces 24000 Hz sample rate on AudioContext creation
- Logs warning if browser refuses 24kHz
- Detects sample rate mismatch
- TODO: Add linear interpolation resampler for mobile browsers if needed
- Avoids browser's built-in resampler (unpredictable latency)

## 8. WebSocket Backpressure Handling ✅
**File:** `frontend/src/hooks/useOpenAIRealtime.ts`

- Checks `ws.bufferedAmount` before each `ws.send()`
- Threshold: 64KB
- Skips sending chunk if backpressure detected
- Logs: `⚠️ WebSocket backpressure — skipping chunk`
- Prevents self-inflicted latency spikes from backed-up WebSocket

## Technical Details

### Crossfade Algorithm
```javascript
for (let i = 0; i < crossfadeLength; i++) {
  const alpha = i / crossfadeLength; // 0 → 1
  const blended = prevChunk[i] * (1 - alpha) + newChunk[i] * alpha;
}
```

### Fade-in/Fade-out
- Linear amplitude envelope applied in audio thread
- Fade-in: 0 → 1 over 360 samples
- Fade-out: 1 → 0 over 240 samples

### Reorder Buffer
- Map<sequenceNumber, AudioChunk>
- 40ms timeout for missing packets
- Automatic gap skipping to maintain flow

### Buffer Health Calculation
```typescript
const health = Math.min(100, (currentDepth / targetDepth) * 100);
```

## Performance Impact

- All audio processing in AudioWorklet (audio thread)
- Zero main-thread blocking
- Minimal memory overhead (~150 chunks max)
- Reorder buffer cleared on new response
- Automatic cleanup on dispose

## Testing Recommendations

1. Test with poor network conditions (throttling)
2. Verify no clicks/pops at chunk boundaries
3. Test tab backgrounding/foregrounding
4. Monitor buffer health logs
5. Test with packet loss simulation
6. Verify WebSocket backpressure handling

## Future Enhancements

1. Implement 0.98x playback rate nudge during starvation
2. Add linear interpolation resampler for mobile browsers
3. Adaptive buffer sizing based on network conditions
4. Pitch-preserving time stretching for rate adjustments
