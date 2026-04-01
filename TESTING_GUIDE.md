# Full-Duplex Streaming - Testing & Verification Guide

## 🧪 How to Test the Upgrade

### 1. Basic Functionality Test

**Setup:**
1. Open two browser windows
2. Create a room in window 1 (English speaker)
3. Join the same room in window 2 (French speaker)

**Test Scenarios:**

#### A. Latency Test
1. Speaker 1 says: "Hello, how are you?"
2. Measure time until Speaker 2 hears French translation
3. **Expected:** <500ms from speech end to playback start

#### B. Full-Duplex Test
1. Both speakers talk simultaneously
2. **Expected:** Both translations play without blocking
3. **Expected:** No "walkie-talkie" turn-taking

#### C. Barge-In Test
1. Speaker 1 starts a long sentence
2. Speaker 2 interrupts mid-sentence
3. **Expected:** Speaker 1's audio stops immediately
4. **Expected:** Speaker 2's translation plays instantly

#### D. Silence Detection Test
1. Speaker 1 says: "Hello" (pause 300ms) "How are you?"
2. **Expected:** Two separate translation chunks
3. **Expected:** Natural segmentation at silence

### 2. Performance Monitoring

#### Browser Console Checks

**Look for these logs:**

```javascript
// Mic streaming (should see frequently)
🎤 [MicStream] Started

// Audio chunks (should be ~20ms apart)
[MIC_AUDIO_CHUNK] Sent to backend

// Commit signals (after 300ms silence)
[COMMIT_AUDIO_BUFFER] Silence detected

// Playback (should start quickly)
🎵 [LowLatencyAudio] Playback started

// Queue health (should stay <100ms)
🎵 [LowLatencyAudio] Queue: 75ms, 3 chunks
```

**Warning signs:**

```javascript
// BAD: Queue overflow (means latency is accumulating)
⚠️ [LowLatencyAudio] Queue overflow - dropped chunks: 10

// BAD: Worklet not ready (initialization issue)
⚠️ [LowLatencyAudio] Worklet not initialized
```

#### Backend Console Checks

```javascript
// Good: Immediate forwarding
[MIC_AUDIO_CHUNK] Forwarding to OpenAI immediately

// Good: Commit triggered
[COMMIT_AUDIO_BUFFER] Speech ended, triggering translation

// Good: Streaming output
[TRANSLATED_AUDIO_CHUNK] Streaming to frontend
```

### 3. Latency Measurement

#### Manual Timing
1. Use stopwatch or phone timer
2. Start when speaker finishes sentence
3. Stop when translation audio starts
4. **Target:** <500ms

#### Automated Measurement
```javascript
// Add to browser console
let lastSpeechEnd = 0;
let lastPlaybackStart = 0;

// Hook into events
window.addEventListener('speechEnd', () => {
  lastSpeechEnd = Date.now();
});

window.addEventListener('playbackStart', () => {
  lastPlaybackStart = Date.now();
  const latency = lastPlaybackStart - lastSpeechEnd;
  console.log(`Latency: ${latency}ms`);
});
```

### 4. Audio Quality Checks

#### Gapless Playback
- Listen for clicks, pops, or gaps between chunks
- **Expected:** Smooth, continuous audio

#### Volume Consistency
- Check if volume is stable across chunks
- **Expected:** No sudden volume changes

#### Clipping
- Listen for distortion at loud volumes
- **Expected:** Clean audio (gain set to 0.8)

### 5. Edge Cases

#### A. Network Jitter
1. Throttle network to 3G in DevTools
2. Speak normally
3. **Expected:** Audio still plays smoothly (jitter buffer handles it)

#### B. Rapid Speech
1. Speak very quickly without pauses
2. **Expected:** Translation keeps up, no queue overflow

#### C. Long Silence
1. Pause for 5 seconds mid-conversation
2. **Expected:** System stays ready, no disconnection

#### D. Simultaneous Speech
1. Both users speak at exact same time
2. **Expected:** Both translations play (may overlap)

### 6. Browser Compatibility

Test on:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (Mac/iOS)

**Known Issues:**
- Safari may require explicit user gesture for AudioContext
- Firefox may show different latency characteristics

### 7. Performance Metrics

#### Target Metrics
| Metric | Target | How to Measure |
|--------|--------|----------------|
| Chunk size | ~20ms | Check mic-input-processor logs |
| Jitter buffer | 50-100ms | Call `getStats()` |
| Queue overflow | 0 | Monitor console warnings |
| End-to-end latency | <500ms | Manual stopwatch |
| Dropped chunks | <5% | Check stats |

#### Get Stats Programmatically
```javascript
// In browser console
const stats = await lowLatencyAudio.getStats();
console.table(stats);
```

### 8. Troubleshooting

#### High Latency (>500ms)
**Possible causes:**
- Queue overflow (check for warnings)
- Network issues (check DevTools Network tab)
- Backend not streaming (check backend logs)

**Solutions:**
- Reduce jitter buffer size
- Check network connection
- Verify backend is using `MIC_AUDIO_CHUNK` handler

#### Audio Cutting Out
**Possible causes:**
- Aggressive queue trimming
- Network packet loss
- AudioContext suspended

**Solutions:**
- Increase MIN_BUFFER_MS slightly
- Check network stability
- Ensure user gesture received

#### No Audio Playback
**Possible causes:**
- AudioContext not resumed
- Autoplay policy blocking
- Worklet not initialized

**Solutions:**
- Click anywhere on page (user gesture)
- Check browser console for errors
- Verify worklet loaded successfully

### 9. Success Criteria Checklist

- [ ] Latency <500ms consistently
- [ ] Both users can speak simultaneously
- [ ] Interruptions work smoothly
- [ ] No queue overflow warnings
- [ ] Audio is gapless and smooth
- [ ] Silence detection works (300ms)
- [ ] No audio artifacts (clicks, pops)
- [ ] Works on all major browsers
- [ ] Network jitter handled gracefully
- [ ] Feels like a phone call

### 10. Comparison Test

**Before vs After:**

| Aspect | Before | After |
|--------|--------|-------|
| Latency | 800-1500ms | <500ms |
| Duplex | Half (turn-taking) | Full (simultaneous) |
| Interruption | Awkward | Natural |
| Queue | Unlimited (overflow) | Limited (protected) |
| Chunk size | Batched (100ms+) | Streaming (20ms) |
| Experience | Walkie-talkie | Phone call |

## 🎯 Expected User Experience

**The system should feel like:**
- A real phone call
- Natural conversation
- Instant responses
- Smooth interruptions
- No awkward pauses

**NOT like:**
- Walkie-talkie (push-to-talk)
- Video call with lag
- Delayed echo
- Robotic turn-taking

## 📊 Monitoring Dashboard (Optional)

Create a simple stats display:

```javascript
// Add to UI
setInterval(async () => {
  const stats = await lowLatencyAudio.getStats();
  document.getElementById('stats').innerHTML = `
    Queue: ${stats.queueDurationMs}ms
    Chunks: ${stats.queueChunks}
    Dropped: ${stats.droppedChunks}
    Playing: ${stats.isPlaying ? 'Yes' : 'No'}
  `;
}, 1000);
```

## ✅ Final Verification

Run through all test scenarios above. If all pass, the upgrade is successful and ready for production use.

**Key indicators of success:**
1. Console shows no queue overflow warnings
2. Latency consistently <500ms
3. Users can interrupt each other naturally
4. Audio is smooth and gapless
5. System feels like a phone call

Congratulations! You now have a production-ready, full-duplex voice translation system. 🎉
