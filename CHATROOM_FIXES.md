# Chatroom Bug Fixes

## Issues Identified

### Bug 1: WebRTC (Single-User Mode) Running on Chatroom Page
**Problem:** The `AppProvider` (which initializes `useRealtimeVoice` and WebRTC connections) was wrapping ALL routes globally, causing WebRTC to run on the `/chatroom` page where it shouldn't.

**Symptoms:**
- `❌ [MIC AUDIO] DataChannel not open! Cannot send audio to OpenAI`
- `✅ [WebRTC] Data channel opened`
- `[RELAY CAPTURE]`, `[RealtimeAudioTap]` logs appearing on chatroom page
- Microphone being consumed by WebRTC before chatroom WebSocket could use it

**Fix:** Scoped `AppProvider` to only single-user routes (/, /admin, /phone, /documents) and excluded chatroom routes (/chatroom, /join/:roomId).

**File:** `neuralecho/frontend/src/App.tsx`

### Bug 2: Backend Sending USER_JOINED_ROOM to the Joiner Themselves
**Problem:** When a user joined a room, the backend was sending `USER_JOINED_ROOM` back to the same user who just joined, causing confusion in the frontend logic.

**Symptoms:**
```
📥 [USER_JOINED_ROOM] Is this me joining? true
📥 [USER_JOINED_ROOM] participantCount: 1
ℹ️ [USER_JOINED_ROOM] Not setting otherParticipant. Reason: participantCount = 1
```

**Fix:** Removed the code that sends `USER_JOINED_ROOM` to the joiner. Now only OTHER participants receive this notification.

**File:** `neuralecho/backend/index.js`

## Expected Behavior After Fixes

### User A (First to Join)
1. Connects to room
2. Receives `WAITING_FOR_PARTICIPANT` (participantCount: 1)
3. Waits for User B

### User B (Second to Join)
1. Connects to room
2. Does NOT receive `USER_JOINED_ROOM` about themselves
3. Receives `translation_ready` when both are connected

### User A (After User B Joins)
1. Receives `USER_JOINED_ROOM` notification about User B
2. `otherParticipant` state is set
3. Receives `translation_ready`
4. Translation session begins

## Testing Checklist

- [ ] Open chatroom page - no WebRTC logs should appear
- [ ] No "DataChannel not open" errors
- [ ] User A joins - sees "Waiting for participant"
- [ ] User B joins - User A receives USER_JOINED_ROOM notification
- [ ] User B does NOT receive USER_JOINED_ROOM about themselves
- [ ] Both users receive translation_ready
- [ ] Microphone works correctly for both users
- [ ] Translation flows bidirectionally

## Files Modified

1. `neuralecho/frontend/src/App.tsx` - Scoped AppProvider to single-user routes only
2. `neuralecho/backend/index.js` - Removed USER_JOINED_ROOM echo to joiner
