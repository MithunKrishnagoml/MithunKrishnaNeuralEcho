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

**Status:** ✅ Already fixed in current codebase

**File:** `neuralecho/frontend/src/App.tsx`

### Bug 2: Backend Sending Incorrect otherParticipant Info in ROOM_READY
**Problem:** When the second participant joined a room, the backend was finding `otherParticipant` once outside the notification loop, causing both users to receive the same `otherParticipant` object instead of each receiving info about the OTHER user.

**Symptoms:**
- Both participants might receive incorrect participant information
- Potential confusion in participant state management
- otherParticipant not being set correctly on the frontend

**Fix:** Moved the `otherParticipant` lookup inside the notification loop so each participant receives the correct information about the OTHER user.

**File:** `neuralecho/backend/index.js`

## Expected Behavior After Fixes

### User A (First to Join)
1. Connects to room
2. Receives `WAITING` (participantCount: 1)
3. Waits for User B

### User B (Second to Join)
1. Connects to room
2. Receives `ROOM_READY` with otherParticipant = User A's info
3. Translation session begins

### User A (After User B Joins)
1. Receives `ROOM_READY` with otherParticipant = User B's info
2. `otherParticipant` state is set correctly
3. Translation session begins

## Testing Checklist

- [ ] Open chatroom page - no WebRTC logs should appear
- [ ] No "DataChannel not open" errors
- [ ] User A joins - sees "Waiting for participant"
- [ ] User B joins - both users receive ROOM_READY
- [ ] User A receives correct info about User B
- [ ] User B receives correct info about User A
- [ ] Microphone works correctly for both users
- [ ] Translation flows bidirectionally

## Files Modified

1. `neuralecho/frontend/src/App.tsx` - Scoped AppProvider to single-user routes only (already fixed)
2. `neuralecho/backend/index.js` - Fixed otherParticipant lookup in ROOM_READY notification
