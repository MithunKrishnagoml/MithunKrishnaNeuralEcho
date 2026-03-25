# Transcript and Translation Fix

## Problem
Transcripts were not being received and translations were not happening in the chatroom. The console logs showed:
- WebSocket connection established ✅
- Both participants joined successfully ✅
- VAD (Voice Activity Detection) started when unmuted ✅
- BUT no `SPEECH_TRANSCRIPT` messages were being received by the backend ❌

## Root Cause
The frontend was generating transcripts from OpenAI's Whisper (via WebRTC), but these transcripts were never being sent to the backend WebSocket server. The flow was:

1. User speaks → OpenAI Whisper transcribes → `onTranscript` callback in AppContext
2. ❌ Transcript was stored locally but NOT sent to backend
3. Backend was waiting for `SPEECH_TRANSCRIPT` messages that never arrived

The `sendTranscript` function existed in `useChatroomConnection.ts` but was never called.

## Solution
Added a callback mechanism to send transcripts from AppContext to the backend:

### Changes Made

1. **AppContext.tsx** - Added transcript callback registration:
   - Added `transcriptCallbackRef` to store the callback
   - Added `setTranscriptCallback` function to register/clear the callback
   - Modified `onTranscript` callback to send transcripts via the registered callback
   - Exported `setTranscriptCallback` in the context interface

2. **useRoomTranslation.ts** - Registered the transcript callback:
   - Added `setTranscriptCallback` to the destructured AppContext
   - Created a useEffect to register `sendTranscript` as the callback
   - Cleanup on unmount to prevent memory leaks

## Flow After Fix

1. User speaks → OpenAI Whisper transcribes
2. `onTranscript` callback receives transcript in AppContext
3. ✅ Transcript is sent to backend via `transcriptCallbackRef.current(transcript, language)`
4. Backend receives `SPEECH_TRANSCRIPT` message
5. Backend relays transcript to other participant
6. Translation happens via OpenAI
7. Translated audio is sent back to participants

## Testing
After rebuilding the frontend, test by:
1. Join a room with two participants
2. Unmute and speak
3. Check console logs for:
   - `📤 [onTranscript] Sending transcript to backend via callback`
   - Backend logs showing `SPEECH_TRANSCRIPT` received
   - Translation and audio playback working

## Files Modified
- `neuralecho/frontend/src/contexts/AppContext.tsx`
- `neuralecho/frontend/src/hooks/useRoomTranslation.ts`
