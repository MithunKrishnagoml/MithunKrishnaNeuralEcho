# Audio Playback Debugging Guide

## What Was Wrong

The audio was getting stuck in **buffering mode** and never transitioning to playback. The jitter buffer was set too high (2400 samples = 100ms), requiring 19 chunks to fill before playback could start.

## Key Changes Made

### 1. Reduced Jitter Buffer
```javascript
// OLD: 2400 samples (100ms) - too long
this.JITTER_BUFFER_SIZE = 2400;

// NEW: 480 samples (20ms) - faster playback start
this.JITTER_BUFFER_SIZE = 480;
```

**Why**: With 128-sample chunks arriving from the WebSocket, it took 19 chunks to fill the old buffer. By then, the response might be complete. The new 480-sample buffer requires only 4 chunks (~40ms of audio), which is acceptable latency.

### 2. ResponseId Tracking
The worklet now tracks when a new response arrives:
```javascript
if (responseId && responseId !== this.currentResponseId) {
  console.log(`[AudioWorklet] New response detected: ${responseId}`);
  this.currentResponseId = responseId;
  this.isBuffering = true; // Start buffering for new response
}
```

**Why**: This distinguishes between:
- Silence within a response (normal, keep playing)
- Silence between responses (new utterance, buffer and wait)

### 3. Better Buffering Status Logging
```javascript
if (this.isBuffering) {
  // Log ~1% of frames to avoid spam
  if (Math.random() < 0.01) {
    console.log(`[AudioWorklet] Still buffering... queue: ${this.sampleQueue.length}/${this.JITTER_BUFFER_SIZE}`);
  }
}
```

**Why**: Helps debug if audio gets stuck in buffering mode without flooding the console.

## How to Verify Audio is Playing

### Check Console Logs

**Good signs:**
```
[AudioWorklet] Added 128 samples, queue size: 128, buffering: true
[AudioWorklet] Added 128 samples, queue size: 256, buffering: true
[AudioWorklet] Added 128 samples, queue size: 384, buffering: true
[AudioWorklet] Added 128 samples, queue size: 480, buffering: false
[AudioWorklet] Jitter buffer filled (480 samples) - starting playback
[AudioWorklet] Playing 128/128 samples, queue remaining: 352
[AudioWorklet] Playing 128/128 samples, queue remaining: 224
```

**Bad signs:**
```
[AudioWorklet] Still buffering... queue: 128/480
[AudioWorklet] Still buffering... queue: 256/480
[AudioWorklet] Still buffering... queue: 256/480  // STUCK - not increasing
```

### Expected Behavior

1. **First chunk arrives** → Worklet enters buffering mode
2. **4 chunks arrive** → Queue reaches 480 samples → Exits buffering
3. **Playback starts** → "Playing X/128 samples" logs appear
4. **Between utterances** → Queue empties, outputs silence
5. **New response arrives** → ResponseId changes → Back to buffering
6. **Playback resumes** → Smooth transition to next utterance

## Troubleshooting

### Audio Not Playing at All
1. Check if "Playing X/128 samples" logs appear
2. If stuck in buffering: Check if queue is increasing
3. Verify AudioContext state: Should be "running"
4. Check browser console for errors

### Audio Glitching Between Utterances
1. Look for "Extended silence detected" warnings
2. Should only appear after 480+ frames of silence
3. If appearing frequently: Silence threshold is too low

### Audio Cutting Out
1. Check for "QUEUE BACKUP DETECTED" warnings
2. Indicates chunks arriving faster than playback
3. May need to increase buffer size or reduce chunk frequency

## Performance Metrics

- **Jitter Buffer**: 480 samples (20ms at 24kHz)
- **Chunk Size**: 128 samples (~5.3ms)
- **Chunks to Fill Buffer**: 4 chunks (~21ms)
- **Playback Latency**: ~20-25ms from first chunk to audio output
- **Silence Threshold**: 480 frames (~10ms at 48kHz)

## Testing Checklist

- [ ] Audio plays on first utterance
- [ ] Audio plays on second utterance (no glitching)
- [ ] Clean silence between utterances
- [ ] No console spam during normal playback
- [ ] Long conversation (10+ minutes) plays smoothly
- [ ] Tab switching doesn't break audio
- [ ] Multiple participants' audio plays correctly
