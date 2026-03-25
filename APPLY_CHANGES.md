# How to Apply Streaming Parallel Translation Changes

Due to file encoding issues, here's a step-by-step guide to apply the changes manually:

## Step 1: Backend Changes (index.js)

### Change 1: Update addParticipant method (around line 61)

Find this line in the `addParticipant` method:
```javascript
pendingMessage: null // For tracking translation in progress
```

Add these three new properties after it:
```javascript
pendingMessage: null, // For tracking translation in progress
audioSequenceNumber: 0, // Track audio chunk sequence
currentResponseId: null, // Track current OpenAI response
isStreaming: false, // Track if currently streaming translation
isMuted: false // Track mute state
```

### Change 2: Update OpenAI session config (around line 1045)

Find the `turn_detection` section and update it to:
```javascript
turn_detection: {
  type: 'server_vad',
  threshold: 0.3,
  silence_duration_ms: 200,  // Changed from 300
  prefix_padding_ms: 100      // Changed from 200
},
```

### Change 3: Update response.audio.delta handler (around line 1280)

Find the section that starts with:
```javascript
if (response.type === 'response.audio.delta') {
```

Replace the entire block with the code from `STREAMING_PARALLEL_TRANSLATION_IMPLEMENTATION.md` section 3.

### Change 4: Add interruption handling (around line 1250)

Find the section that handles `input_audio_buffer.speech_started`.

BEFORE the existing handler, add the interruption code from `STREAMING_PARALLEL_TRANSLATION_IMPLEMENTATION.md` section 4.

### Change 5: Add response.audio.done handler (around line 1315)

After the audio.delta handler, add the audio.done handler from `STREAMING_PARALLEL_TRANSLATION_IMPLEMENTATION.md` section 5.

### Change 6: Add mute/unmute WebSocket handler (around line 600)

In the WebSocket message handler section (where other message types are handled), add the mute handler from `STREAMING_PARALLEL_TRANSLATION_IMPLEMENTATION.md` section 6.

## Step 2: Frontend Changes

### Remove Push-to-Talk from ChatroomInterface.tsx

1. Remove these state variables:
   - `isPressing`
   - `pressStartTime`

2. Remove these functions:
   - `handleMicPress`
   - `handleMicRelease`
   - `handleMouseDown`
   - `handleMouseUp`
   - `handleTouchStart`
   - `handleTouchEnd`

3. Remove the spacebar event listeners in the useEffect

### Add Mute/Unmute to ChatroomInterface.tsx

1. Add new state variables (section 2 of implementation doc)
2. Add auto-start microphone effect (section 3)
3. Add toggleMute function (section 4)
4. Add keyboard shortcut for 'M' key (section 4)
5. Handle server VAD events (section 5)
6. Handle translation interruption (section 6)
7. Replace push-to-talk button with mute button (section 7)
8. Add other participant speaking indicator (section 8)

### Update StreamingAudioPlayer.ts

Add the `handleInterruption()` method from section 9 of the implementation doc.

### Update Audio Chunk Handler

In the AUDIO_CHUNK event handler in ChatroomInterface.tsx or useChatroomConnection.ts, add sequence number checking from section 10.

## Step 3: Testing

After applying all changes:

1. Start backend: `cd backend && npm start`
2. Start frontend: `cd frontend && npm run dev`
3. Open two browser windows
4. Create a room in window 1
5. Join the room in window 2
6. Verify microphone starts automatically (no button press)
7. Speak in window 1 - verify window 2 hears translation within 500ms
8. Press 'M' to mute/unmute
9. Have both users speak - verify interruption handling works
10. Check console logs for sequence numbers and streaming indicators

## Step 4: Commit

Once tested and working:

```bash
git add .
git commit -m "feat: Implement streaming parallel translation and always-on mute/unmute

- Add real-time audio streaming (User B hears while User A speaks)
- Replace push-to-talk with Google Meet-style mute/unmute
- Add interruption handling for simultaneous speech
- Add sequence numbers to prevent out-of-order audio
- Auto-start microphone on session join
- Add keyboard shortcut (M) for mute toggle
- Add server VAD-driven visual feedback (pulsing ring)
- Update OpenAI config (silence_duration_ms: 200, prefix_padding_ms: 100)

Breaking changes:
- Push-to-talk completely removed
- Microphone starts automatically on join
- Users must explicitly mute to stop transmission"

git push
```

## Troubleshooting

### If audio doesn't stream in real-time:
- Check backend logs for "Broadcasting chunk #X"
- Verify response.audio.delta handler is sending immediately
- Check frontend audio player is receiving AUDIO_CHUNK events

### If interruption doesn't work:
- Check backend logs for "INTERRUPTION" messages
- Verify response.cancel is being sent to OpenAI
- Check frontend is clearing audio queue on TRANSLATION_INTERRUPTED

### If mute doesn't work:
- Check MediaStream tracks are being enabled/disabled
- Verify MUTE_STATE_CHANGED is being sent to server
- Check server is not processing audio when participant.isMuted is true

### If microphone doesn't auto-start:
- Check browser permissions
- Verify isVoiceReady and isConnected are true
- Check console for auto-start logs

## Notes

- The implementation document (`STREAMING_PARALLEL_TRANSLATION_IMPLEMENTATION.md`) contains all the code snippets
- Apply changes incrementally and test after each major change
- Keep the old push-to-talk code in a separate branch as backup
- Monitor console logs during testing for debugging

## Estimated Time

- Backend changes: 30-45 minutes
- Frontend changes: 45-60 minutes
- Testing: 30 minutes
- Total: 2-2.5 hours
