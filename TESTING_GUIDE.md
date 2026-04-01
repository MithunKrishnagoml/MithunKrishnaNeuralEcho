# Hands-Free Translation Testing Guide

## Prerequisites

1. **Backend Running**
   ```bash
   cd neuralecho/backend
   npm install
   OPENAI_API_KEY=your_key_here npm start
   ```

2. **Frontend Running**
   ```bash
   cd neuralecho/frontend
   npm install
   npm run dev
   ```

3. **Environment Variables**
   - Backend: `OPENAI_API_KEY` must be set
   - Frontend: `VITE_WS_URL` should point to backend WebSocket

## Test Scenarios

### 1. Basic Mute/Unmute Functionality

**Test Steps:**
1. Open the app in browser
2. Select "Hands Free" mode
3. Grant microphone permission
4. Verify session starts with mic UNMUTED (green button)
5. Press M key → Button turns RED (muted)
6. Check console: `[MIC] MUTED — mic paused, nothing entering OpenAI`
7. Press M key again → Button turns GREEN (unmuted)
8. Check console: `[MIC] UNMUTED — mic resumed to OpenAI`

**Expected Results:**
- ✅ Button color changes correctly
- ✅ Mic icon changes (Mic ↔ MicOff)
- ✅ Console logs show mute state changes
- ✅ Session stays connected (no reconnection)

### 2. Audio Level Visualization

**Test Steps:**
1. Start session unmuted
2. Speak into microphone
3. Observe audio level bars
4. Mute the microphone
5. Speak again

**Expected Results:**
- ✅ Audio level bars animate when unmuted and speaking
- ✅ Audio level bars disappear when muted
- ✅ Pulsing rings appear when speaking and unmuted
- ✅ Console shows `[MIC → OPENAI]` logs with non-zero rmsEnergy

### 3. VAD Speaking Indicators

**Test Steps:**
1. Start session unmuted
2. Speak into microphone
3. Observe button behavior
4. Stop speaking
5. Wait for silence detection

**Expected Results:**
- ✅ Pulsing green rings appear when speaking
- ✅ Status text shows "Speaking... (AI Processing)"
- ✅ Rings disappear when silent
- ✅ Console shows VAD events: `[VAD] Voice activity started/stopped`

### 4. Two-User Audio Relay (CRITICAL TEST)

**Setup:**
1. Open app in two browser windows (or two devices)
2. Create a room in Window 1
3. Join the same room in Window 2
4. Window 1: Select English, unmute
5. Window 2: Select French, unmute

**Test Steps:**
1. **Window 1 (English):** Say "Hello, how are you today?"
2. **Window 2 (French):** Should hear French AI voice saying "Bonjour, comment allez-vous aujourd'hui ?"
3. **Window 2 (French):** Say "Je vais bien, merci"
4. **Window 1 (English):** Should hear English AI voice saying "I'm doing well, thank you"

**Expected Results:**
- ✅ Both users hear the AI translated voice
- ✅ Latency < 1 second end-to-end
- ✅ No echo or duplicate playback
- ✅ Audio quality is clear
- ✅ Console shows:
  - `[RELAY] AI_AUDIO_CHUNK` logs in sender
  - `[AUDIO_CHUNK] This is AI audio from other user's translation - PLAYING ✅` in receiver
  - `[FIFO] chunk enqueued` and `[FIFO] chunk played` logs

**Console Logs to Verify:**

Window 1 (English speaker):
```
[MIC → OPENAI] chunk #0: samples=1024, rmsEnergy=0.0234
[RELAY] Sending AI audio chunk #0 to backend
[AUDIO_CHUNK] FILTERED OUT - This is my own AI translation
```

Window 2 (French listener):
```
[AUDIO_CHUNK] This is AI audio from other user's translation - PLAYING ✅
[FIFO] chunk enqueued (seq: 0, queueLength: 1)
[FIFO] chunk played (seq: 0, durationMs: 43)
```

### 5. Session Persistence During Mute

**Test Steps:**
1. Start session unmuted
2. Speak a sentence → Verify translation works
3. Mute microphone (M key)
4. Wait 10 seconds
5. Unmute microphone
6. Speak another sentence → Verify translation still works

**Expected Results:**
- ✅ Session stays connected during mute
- ✅ No "Data channel closed" errors
- ✅ Translation works immediately after unmute
- ✅ No need to reconnect

### 6. Keyboard Shortcut

**Test Steps:**
1. Start session
2. Click in empty area (not input field)
3. Press M key
4. Verify mute toggles
5. Click in a text input field
6. Press M key
7. Verify M character is typed (not muted)

**Expected Results:**
- ✅ M key toggles mute when not in input field
- ✅ M key types normally in input fields
- ✅ Works from anywhere on the page

### 7. Error Handling

**Test Steps:**
1. Start session
2. Revoke microphone permission in browser
3. Try to unmute
4. Deny microphone permission on first load
5. Try to start session

**Expected Results:**
- ✅ Clear error message shown
- ✅ No undefined errors in console
- ✅ App doesn't crash
- ✅ Can retry after granting permission

### 8. Browser Compatibility

**Test in each browser:**
- Chrome/Edge (Chromium)
- Firefox
- Safari (macOS/iOS)

**Expected Results:**
- ✅ All features work in all browsers
- ✅ AudioWorklet supported
- ✅ WebRTC connection stable
- ✅ No browser-specific errors

## Performance Benchmarks

### Audio Latency
- **Mic → OpenAI:** < 100ms
- **OpenAI Processing:** 200-500ms (Whisper + GPT-4o + TTS)
- **Relay → Other User:** < 100ms
- **Total End-to-End:** 300-700ms

### Audio Quality
- **Sample Rate:** 24kHz (OpenAI output)
- **Bit Depth:** 16-bit PCM
- **Chunk Size:** 1024 samples (~43ms at 24kHz)
- **Chunk Rate:** ~23 chunks/second

### Network
- **WebSocket Messages:** ~23 AI_AUDIO_CHUNK/second during speech
- **Chunk Size:** ~2KB base64 encoded
- **Bandwidth:** ~46KB/second during active translation

## Common Issues & Solutions

### Issue: No audio heard by other user
**Check:**
1. Console logs: Look for `[RELAY]` and `[AUDIO_CHUNK]` messages
2. Verify `speakerId` filtering is working correctly
3. Check AudioContext state (should be "running")
4. Verify StreamingAudioPlayer is initialized

**Solution:**
- Ensure both users have granted microphone permission
- Check that audio chunks are being sent (look for `[RELAY]` logs)
- Verify filtering logic: `data.speakerId !== participant.id`

### Issue: Echo or duplicate audio
**Check:**
1. Verify relay capture element is muted: `muted: true, volume: 0`
2. Check that own AI audio is filtered out
3. Verify only one audio player instance per user

**Solution:**
- Ensure `data.speakerId === participant.id` filter is working
- Check that relay capture element has `muted: true`

### Issue: Mute button doesn't work
**Check:**
1. Session state (must be "ready")
2. Console logs for `[MIC] MUTED/UNMUTED` messages
3. Track enabled state

**Solution:**
- Ensure session is initialized before toggling mute
- Check that `toggleMute()` is being called
- Verify `track.enabled` is being set correctly

### Issue: High latency
**Check:**
1. Network connection quality
2. OpenAI API response times
3. Audio chunk buffering

**Solution:**
- Reduce jitter buffer size (currently 3 chunks)
- Check network latency to OpenAI servers
- Verify no unnecessary buffering in pipeline

## Debug Console Commands

Open browser console and run:

```javascript
// Check session state
console.log('Session State:', window.__appContext?.sessionState);
console.log('Is Muted:', window.__appContext?.isMuted);
console.log('Is Speaking:', window.__appContext?.isSpeaking);

// Check audio context
console.log('Audio Context State:', window.__audioContext?.state);

// Check WebSocket connection
console.log('WebSocket Ready:', window.__ws?.readyState === 1);

// Force unmute
window.__appContext?.toggleMute();

// Check audio level
console.log('Current dB Level:', window.__appContext?.currentDbLevel);
```

## Success Criteria Checklist

- [ ] Session starts with mic unmuted
- [ ] M key toggles mute correctly
- [ ] Mute button toggles mute correctly
- [ ] Muting pauses mic without dropping session
- [ ] User A says "Hello" → User B hears "Bonjour" in AI voice < 1s
- [ ] User B says "Merci" → User A hears "Thank you" in AI voice < 1s
- [ ] Both users hear AI translated voice simultaneously
- [ ] No audio echo or duplicate playback
- [ ] Audio level visualization shows when unmuted
- [ ] Pulsing rings show when speaking and not muted
- [ ] `[MIC → OPENAI]` logs show non-zero rmsEnergy
- [ ] `[RELAY]` logs confirm chunks sent to backend
- [ ] No `isPressing` undefined errors
- [ ] No regression on session join
- [ ] No regression on participant detection
- [ ] Works in Chrome, Firefox, Safari

## Monitoring & Metrics

### Key Metrics to Track
1. **Audio Chunk Delivery Rate:** Should be ~23 chunks/second
2. **End-to-End Latency:** Should be < 1 second
3. **Error Rate:** Should be < 1%
4. **Session Uptime:** Should maintain connection for hours
5. **Audio Quality:** RMS energy > 0.001 when speaking

### Logging Levels
- **Every chunk:** `[MIC → OPENAI]` (with RMS, peak, samples)
- **Every 50th chunk:** `[RELAY]` and `[FIFO]` logs
- **Every event:** `[MIC] MUTED/UNMUTED`, `[VAD]` events
- **Errors:** All errors logged with full context

## Production Readiness

Before deploying to production:

1. ✅ All test scenarios pass
2. ✅ Performance benchmarks met
3. ✅ Error handling tested
4. ✅ Browser compatibility verified
5. ✅ Load testing completed (multiple concurrent sessions)
6. ✅ Security review (API keys, CORS, etc.)
7. ✅ Monitoring and alerting configured
8. ✅ Documentation updated
9. ✅ User acceptance testing completed
10. ✅ Rollback plan prepared
