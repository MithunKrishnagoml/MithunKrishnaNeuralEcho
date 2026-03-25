# AI Audio Relay Fix - Both Users Hear Translated Voice

## Problem
Translated AI voice was only audible to the user who spoke, not to both participants. The other user couldn't hear the AI translation.

## Root Cause
The app uses WebRTC to connect each browser DIRECTLY to OpenAI Realtime API. The backend only provides a session token and never sees the audio stream. This meant:
- AI audio played only in the browser that owns the WebRTC connection
- The other participant couldn't receive it because the server had no audio to relay
- The RealtimeAudioTap was capturing audio but not relaying it to the backend

## Solution Implemented

### Architecture
```
User A speaks → OpenAI → AI voice → Captured by RealtimeAudioTap
                                   ↓
                            Sent to Backend via WebSocket
                                   ↓
                            Broadcast to ALL participants
                                   ↓
                            Both User A and User B hear AI voice
```

### Changes Made

#### 1. Frontend - useRealtimeVoice.ts
- Added `onAIAudioChunk` callback to RealtimeStreamingCallbacks interface
- Modified RealtimeAudioTap initialization to send AI audio chunks to backend
- Audio chunks are captured from OpenAI's remote track and relayed via WebSocket

#### 2. Frontend - useRoomTranslation.ts
- Registered `onAIAudioChunk` callback in streaming callbacks
- Sends AI_AUDIO_CHUNK messages to backend with sequence numbers
- Each chunk is ~100ms of PCM16 audio at 24kHz

#### 3. Backend - index.js
- Added AI_AUDIO_CHUNK message handler
- Broadcasts AI audio chunks to ALL participants (including sender)
- Both users receive and play the same AI voice

#### 4. Frontend - ChatroomInterface.tsx
- Added AI_AUDIO_CHUNK event handler
- Plays AI audio chunks for all participants
- Uses existing FifoAudioQueue for smooth playback

#### 5. TypeScript Types - chatroom.ts
- Added AI_AUDIO_CHUNK to ChatroomEvent type
- Includes sessionId, fromParticipant, audioData, seq, timestamp

## Audio Flow

### Before Fix
```
User A speaks → OpenAI → AI voice → User A hears ✅
                                   → User B hears ❌
```

### After Fix
```
User A speaks → OpenAI → AI voice → RealtimeAudioTap captures
                                   ↓
                            Backend WebSocket
                                   ↓
                            ┌──────┴──────┐
                            ↓             ↓
                         User A        User B
                         hears ✅      hears ✅
```

## Key Features

1. **Real-time Streaming**: AI audio is captured and relayed in ~100ms chunks
2. **Low Latency**: Direct WebRTC to OpenAI + WebSocket relay = minimal delay
3. **Both Users Hear**: Backend broadcasts to all participants
4. **No Echo**: Audio is muted locally, only played from relayed chunks
5. **Sequence Numbers**: Chunks are ordered for smooth playback

## Testing

### Expected Behavior
1. User A speaks English
2. Both User A and User B hear French AI voice
3. User B speaks French  
4. Both User A and User B hear English AI voice
5. No duplicate/echo playback
6. Smooth, continuous audio

### Console Logs to Verify
```
🎤 [RealtimeAudioTap] Initialized for real-time streaming and relay
🤖 [AI_AUDIO_CHUNK] From participant-xxx, seq: 0, size: 2048
🤖 [AI_AUDIO_CHUNK] Broadcast to 2 participant(s)
🤖 [AI_AUDIO_CHUNK] Received seq 0 from participant-xxx
```

## Files Modified
1. `frontend/src/hooks/useRealtimeVoice.ts` - Added AI audio relay callback
2. `frontend/src/hooks/useRoomTranslation.ts` - Registered AI audio sender
3. `frontend/src/components/ChatroomInterface.tsx` - Added AI audio receiver
4. `frontend/src/types/chatroom.ts` - Added AI_AUDIO_CHUNK type
5. `backend/index.js` - Added AI_AUDIO_CHUNK broadcast handler

## Performance Notes
- Audio chunks are ~2KB each (100ms at 24kHz PCM16)
- Sent every ~100ms = ~20 chunks/second
- Bandwidth: ~40KB/s per speaking user
- Minimal overhead, real-time performance maintained
