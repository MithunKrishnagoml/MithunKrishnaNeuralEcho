# Peer Visibility Debugging Guide

## Architecture Overview

Your system uses **WebSocket-based server-mediated architecture**, NOT WebRTC peer-to-peer:

```
User A ←→ Backend (WebSocket) ←→ User B
         ↓
    OpenAI Realtime API
```

This is simpler and more reliable than WebRTC for your translation use case.

## Expected Flow

### 1. User A Creates Room
```
User A → Backend: join_session
Backend → User A: USER_JOINED_ROOM (participantCount: 1)
Backend → User A: WAITING_FOR_PARTICIPANT
```

### 2. User B Joins Room
```
User B → Backend: join_session
Backend → User B: USER_JOINED_ROOM (participantCount: 2, userId: B)
Backend → User A: USER_JOINED_ROOM (participantCount: 2, userId: B) ← CRITICAL
```

### 3. Translation Initialization
```
Backend initializes OpenAI sessions for both users
Backend → User A: translation_ready (with otherParticipant: B)
Backend → User B: translation_ready (with otherParticipant: A)
```

### 4. Both Users See Each Other
```
User A UI: Shows User B
User B UI: Shows User A
Translation: ACTIVE
```

## What Was Fixed

### Issue 1: Frontend Logic Bug
**Problem**: User A's `translation_ready` handler had condition `if (!otherParticipant && data.otherParticipant)` which prevented updating if already set.

**Fix**: Changed to ALWAYS set `otherParticipant` from `translation_ready` event since backend provides authoritative data.

### Issue 2: Missing Visibility
**Problem**: User A couldn't see User B even though backend sent correct events.

**Fix**: Ensured `translation_ready` event properly updates `otherParticipant` state for both users.

## Testing Instructions

### Open Browser Console on Both Sides

**User A (Room Creator):**
1. Open DevTools Console
2. Create room
3. Look for these logs:
```
✅ [WebSocket] Connected to chatroom: session_xxx
📤 [WebSocket] Sending join_session message
📥 [USER_JOINED_ROOM] Event received!
📥 [USER_JOINED_ROOM] Participant count: 1
```

**User B (Joiner):**
1. Open DevTools Console
2. Join via link
3. Look for these logs:
```
✅ [WebSocket] Connected to chatroom: session_xxx
📤 [WebSocket] Sending join_session message
📥 [USER_JOINED_ROOM] Event received!
📥 [USER_JOINED_ROOM] Participant count: 2
```

### Critical Logs to Check

**On User A's Console (after User B joins):**
```
═══════════════════════════════════════════════════════
📥 [USER_JOINED_ROOM] Event received!
📥 [USER_JOINED_ROOM] Participant count: 2
📥 [USER_JOINED_ROOM] Joining user ID: <User B's ID>
📥 [USER_JOINED_ROOM] My participant ID: <User A's ID>
📥 [USER_JOINED_ROOM] Is this me joining? false
✅ [USER_JOINED_ROOM] Someone else joined! Setting otherParticipant
═══════════════════════════════════════════════════════
```

**Then both should see:**
```
═══════════════════════════════════════════════════════
🚀 [translation_ready] Translation session is ready!
🚀 [translation_ready] Other participant data: {id, name, language}
✅ [translation_ready] Setting otherParticipant from backend data
✅ [translation_ready] otherParticipant state updated successfully
═══════════════════════════════════════════════════════
```

**And in ChatroomInterface:**
```
═══════════════════════════════════════════════════════
👥 [ChatroomInterface] otherParticipant state changed!
👥 [ChatroomInterface] Other participant details:
  id: <other user id>
  name: <other user name>
  language: en-US or fr-CA
  isConnected: true
═══════════════════════════════════════════════════════
```

## If Issue Persists

### Check 1: Backend Notification
Look for this in User A's console when User B joins:
```
📥 [USER_JOINED_ROOM] Joining user ID: <should be User B's ID>
📥 [USER_JOINED_ROOM] My participant ID: <should be User A's ID>
📥 [USER_JOINED_ROOM] Is this me joining? false ← MUST BE FALSE
```

If "Is this me joining?" is `true`, the backend is sending wrong userId.

### Check 2: State Update
Look for:
```
👥 [ChatroomInterface] otherParticipant state changed!
```

If this doesn't fire, React state update failed.

### Check 3: Backend Logs
Check backend console for:
```
👤 Participant <User B ID> joined session <session_id>. Total participants: 2
🚀 Session <session_id> now has 2 participants! Initializing OpenAI sessions...
✅ OpenAI sessions initialized for <session_id>
```

## Common Issues

### Issue: User A sees "1/2" participants
**Cause**: `otherParticipant` state not set
**Check**: Look for `translation_ready` event in console
**Fix**: Ensure `translation_ready` handler runs and sets state

### Issue: Translation not starting
**Cause**: OpenAI sessions not initialized
**Check**: Backend logs for "OpenAI sessions initialized"
**Fix**: Ensure both users have different languages (en-US vs fr-CA)

### Issue: Both users see each other but no audio
**Cause**: Mic permissions or audio pipeline issue
**Check**: Look for `🎤 [translation_ready] Mic enabled` log
**Fix**: Grant microphone permissions in browser

## Architecture Notes

- **No WebRTC**: System uses WebSocket for all communication
- **Server-mediated**: Backend handles all translation via OpenAI
- **Stateful backend**: Backend maintains session state and participant list
- **Event-driven**: Frontend reacts to backend events (USER_JOINED_ROOM, translation_ready)

## Success Criteria

✅ User A sees User B in participant list (2/2)
✅ User B sees User A in participant list (2/2)
✅ Both see "Connected — translation is live" toast
✅ Mic indicator shows when speaking
✅ Translation appears in real-time
✅ Audio plays for translated speech
