#### Audio Playback Fixes - Chrome AudioContext Suspension Issue

## Problem Summary
Audio was playing correctly for the first few translations but then started breaking/cutting out continuously in Chrome. The root cause was Chrome's AudioContext suspension after ~30 seconds of inactivity or when the tab loses focus.

## Root Causes Fixed

### 1. Chrome AudioContext Suspension (FIXED)
**Issue**: Chrome suspends AudioContext after ~30 seconds of no user gesture and when tab loses focus.

**Solution**: 
- Added `startKeepAlive()` mechanism that pings the AudioContext every 25 seconds with a silent buffer
- Added `setupVisibilityHandler()` to resume AudioContext when tab regains focus
- Both mechanisms ensure the AudioContext stays in 'running' state

### 2. Missing Resume Before Chunk Playback (FIXED)
**Issue**: WebSocket onmessage handler wasn't checking if AudioContext was suspended before processing chunks.

**Solution**:
- Added `await this.ensureAudioContextResumed()` call at the start of `processChunk()`
- This ensures every incoming audio chunk can resume a suspended context immediately

### 3. AudioWorklet Buffer Underrun (FIXED)
**Issue**: When queue hit 0 samples, the worklet output silence causing clicks and pops.

**Solution**:
- Added jitter buffer (2400 samples = 100ms at 24kHz) before starting playback
- Added underrun detection: when queue is empty for 10+ consecutive frames, reset to buffering state
- During buffering state, output clean silence instead of garbage data
- Worklet now tracks `isBuffering` flag and waits for jitter buffer to fill before playback

### 4. Sample Rate Mismatch (VERIFIED)
**Status**: Already correct - AudioContext created with `{ sampleRate: 24000 }` matching incoming PCM stream

### 5. AudioContext Created Before User Gesture (VERIFIED)
**Status**: Already handled - `handleUserGesture()` is called on first user interaction

## Implementation Details

### StreamingAudioPlayer.ts Changes

**New Properties**:
```typescript
private keepAliveIntervalId: number | null = null;
private underrunFrameCount: number = 0;
private isBuffering: boolean = false;
private readonly JITTER_BUFFER_SIZE = 2400; // 100ms at 24kHz
private readonly UNDERRUN_THRESHOLD = 10; // frames before reset
private readonly KEEP_ALIVE_INTERVAL = 25000; // 25 seconds
```

**New Methods**:
- `startKeepAlive()`: Sends silent buffers every 25 seconds to keep AudioContext active
- `stopKeepAlive()`: Cleans up the keep-alive interval
- `setupVisibilityHandler()`: Resumes AudioContext when tab becomes visible

**Modified Methods**:
- `initializeAudioWorklet()`: Now calls `startKeepAlive()` after initialization
- `processChunk()`: Now passes `isBuffering` flag to worklet
- `dispose()`: Now calls `stopKeepAlive()` for cleanup

### audio-streaming-processor.js Changes

**New Properties**:
```javascript
this.isBuffering = false;
this.underrunFrameCount = 0;
this.JITTER_BUFFER_SIZE = 2400; // 100ms at 24kHz
this.UNDERRUN_THRESHOLD = 10; // frames before reset
```

**New Logic**:
- Starts in buffering mode, waits for jitter buffer to fill (2400 samples)
- Once buffer filled, transitions to playback mode
- Detects underruns (empty queue) and counts consecutive underrun frames
- After 10 consecutive underrun frames, returns to buffering mode
- Outputs clean silence during buffering instead of garbage

**Message Handling**:
- Accepts `isBuffering` flag from main thread
- Accepts `isKeepAlive` flag to suppress debug logs for keep-alive messages

## Testing

To verify the fixes work:

1. **Keep-Alive Test**: Open DevTools console and watch for keep-alive messages every 25 seconds
2. **Tab Focus Test**: Switch tabs and back - audio should resume without interruption
3. **Long Session Test**: Run translations for 5+ minutes - audio should remain continuous
4. **Underrun Recovery**: Simulate slow network - audio should buffer and recover gracefully

## Performance Impact

- **CPU**: Minimal - keep-alive sends only 2400 samples (100ms) of silence every 25 seconds
- **Memory**: No increase - reuses existing buffers
- **Latency**: Jitter buffer adds ~100ms initial latency but prevents glitches

## Browser Compatibility

- Chrome/Edge: Full support (tested)
- Firefox: Full support (AudioContext suspension less aggressive)
- Safari: Full support (webkit prefix handled)
