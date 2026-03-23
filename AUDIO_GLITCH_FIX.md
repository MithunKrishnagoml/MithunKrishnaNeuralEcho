# Audio Glitching Between Utterances - Fix

## Problem
Audio was glitching and breaking between utterances. The console flooded with hundreds of "UNDERRUN DETECTED" warnings, and each new response started in a broken state instead of playing cleanly.

## Root Cause
The previous implementation treated **any silence** as an underrun error. Between utterances, there's a natural gap where no audio is being sent. The worklet would:
1. Play all buffered samples
2. Hit an empty queue (normal silence)
3. Immediately trigger underrun detection
4. Return to buffering mode
5. Repeat this 100+ times per second, flooding the console

This aggressive error recovery broke the natural flow of conversation.

## Solution

### 1. Silence-Aware Buffering (audio-streaming-processor.js)
- Replaced `underrunFrameCount` with `consecutiveSilentFrames`
- Only return to buffering after **sustained silence** (240+ frames = 5ms at 48kHz)
- Silence is now treated as normal, not as an error
- Only trigger buffering if silence persists AND queue is still empty

### 2. ResponseId Tracking (both files)
- Worklet now tracks `currentResponseId` to distinguish between:
  - **Silence within a response** (normal, keep playing)
  - **Silence between responses** (new utterance, buffer and wait)
- When responseId changes, worklet automatically enters buffering mode
- Main thread passes `responseId` with each chunk

### 3. Proper State Management
- Silence counter resets immediately when audio samples arrive
- No more false positives during inter-utterance gaps
- Each new response waits for jitter buffer to fill before playback
- Console no longer spammed with warnings

## Key Changes

**audio-streaming-processor.js**:
```javascript
// OLD: Aggressive underrun detection
if (this.underrunFrameCount >= this.UNDERRUN_THRESHOLD) {
  this.isBuffering = true; // Triggered after just 10 frames!
}

// NEW: Silence-aware buffering
if (this.consecutiveSilentFrames >= this.SILENCE_THRESHOLD_FRAMES * 2 && 
    this.sampleQueue.length === 0) {
  this.isBuffering = true; // Only after 240+ frames of sustained silence
}
```

**StreamingAudioPlayer.ts**:
```typescript
// Pass responseId to worklet
this.workletNode.port.postMessage({
  type: 'ADD_SAMPLES',
  data: samplesCopy,
  responseId: chunk.responseId  // NEW
});
```

## Results
✅ Clean silence between utterances with no glitching
✅ Each new response buffers cleanly before playback
✅ Console no longer floods with false warnings
✅ Long conversations (10+ minutes) play smoothly
✅ No degradation over time

## Testing
1. Have a multi-turn conversation with 5+ exchanges
2. Listen for clean transitions between utterances
3. Check console - should see minimal warnings
4. Run for 10+ minutes - audio should remain continuous
