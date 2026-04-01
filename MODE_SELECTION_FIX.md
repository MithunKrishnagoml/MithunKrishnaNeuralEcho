# Mode Selection Fix - Chatroom vs Single-User

## Problem Identified

The application was running `useRealtimeVoice` (single-user mode) even when users were in chatroom mode, causing:
- `[PRE-OPENAI AUDIO]` logs in chatroom
- No WebSocket connection
- No `USER_JOINED_ROOM` events
- Users couldn't see each other

## Root Cause

`ChatroomInterface` was importing and calling `useAppState()`, which internally initializes `useRealtimeVoice`. This caused the single-user OpenAI connection to start even in chatroom mode.

```typescript
// ❌ BEFORE (WRONG)
import { useAppState } from '@/contexts/AppContext';

export function ChatroomInterface({ roomId, participant, onLeaveRoom }) {
  const { currentDbLevel, dbThreshold } = useAppState(); // ← This triggers useRealtimeVoice!
  // ...
}
```

## Solution Applied

### 1. Removed `useAppState` from ChatroomInterface

**File**: `neuralecho/frontend/src/components/ChatroomInterface.tsx`

```typescript
// ✅ AFTER (CORRECT)
// Removed: import { useAppState } from '@/contexts/AppContext';

export function ChatroomInterface({ roomId, participant, onLeaveRoom }) {
  // Use local state instead of AppContext
  const [audioLevel, setAudioLevel] = useState(-100);
  // ...
}
```

This ensures chatroom mode ONLY uses `useChatroomConnection` and never initializes `useRealtimeVoice`.

### 2. Added Debug Logging

Added clear mode indicators to help identify which mode is active:

**ChatroomInterface.tsx**:
```typescript
console.log('═══════════════════════════════════════════════════════');
console.log('🎯 [MODE] CHATROOM MODE ACTIVE');
console.log('🎯 [MODE] Room ID:', roomId);
console.log('🎯 [MODE] Using: useChatroomConnection (NOT useRealtimeVoice)');
console.log('═══════════════════════════════════════════════════════');
```

**Index.tsx** (single-user mode):
```typescript
console.log('═══════════════════════════════════════════════════════');
console.log('🎯 [MODE] SINGLE-USER MODE ACTIVE');
console.log('🎯 [MODE] Using: useRealtimeVoice (direct OpenAI connection)');
console.log('═══════════════════════════════════════════════════════');
```

**Chatroom.tsx** and **JoinRoom.tsx**:
```typescript
console.log('🎯 [ROUTE] /chatroom page loaded');
console.log('🎯 [ROUTE] Room ID:', roomId);
```

### 3. Cleaned Up Index.tsx

Removed the `saveAudioEnabled` debug toggle that was causing TypeScript errors.

## Architecture Overview

### Single-User Mode (`/`)
```
┌─────────────────────────────────────┐
│         Index.tsx                   │
│  ┌───────────────────────────────┐  │
│  │   TranslationPanel (EN)       │  │
│  │   - useAppState()             │  │
│  │   - useRealtimeVoice()        │  │
│  │   - Direct OpenAI WebRTC      │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │   TranslationPanel (FR)       │  │
│  │   - Same AppContext           │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
         ↓
    OpenAI Realtime API
```

**Logs**: `[PRE-OPENAI AUDIO]`, `🎤 [MIC] Audio data`

### Chatroom Mode (`/chatroom` or `/join/:roomId`)
```
┌─────────────────────────────────────┐
│    Chatroom.tsx / JoinRoom.tsx      │
│  ┌───────────────────────────────┐  │
│  │   ChatroomInterface           │  │
│  │   - useChatroomConnection()   │  │
│  │   - WebSocket to backend      │  │
│  │   - NO useRealtimeVoice       │  │
│  │   - NO useAppState            │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
         ↓
    Backend WebSocket Server
         ↓
    OpenAI Realtime API (2 sessions)
```

**Logs**: `🌐 [WebSocket] Connected`, `USER_JOINED_ROOM`, `translation_ready`

## Expected Console Output

### When Opening `/` (Single-User Mode)
```
═══════════════════════════════════════════════════════
🎯 [MODE] SINGLE-USER MODE ACTIVE
🎯 [MODE] URL: /
🎯 [MODE] Using: useRealtimeVoice (direct OpenAI connection)
🎯 [MODE] This is NOT chatroom mode
═══════════════════════════════════════════════════════
[PRE-OPENAI AUDIO] logs...
🎤 [MIC] Audio data...
```

### When Opening `/chatroom` or `/join/:roomId` (Chatroom Mode)
```
═══════════════════════════════════════════════════════
🎯 [ROUTE] /chatroom page loaded
🎯 [ROUTE] Current room: none (showing join/create UI)
═══════════════════════════════════════════════════════

[After creating/joining room:]

═══════════════════════════════════════════════════════
🎯 [MODE] CHATROOM MODE ACTIVE
🎯 [MODE] Room ID: session_1234567890_abc123
🎯 [MODE] Participant: participant-xxx Alice
🎯 [MODE] Using: useChatroomConnection (NOT useRealtimeVoice)
═══════════════════════════════════════════════════════
✅ [WebSocket] Connected to chatroom: session_xxx
📤 [WebSocket] Sending join_session message
🌐🌐🌐 [WebSocket] onmessage fired!
📨 [WebSocket] Message type: USER_JOINED_ROOM
```

## Verification Steps

### 1. Test Single-User Mode
1. Navigate to: `http://localhost:5173/`
2. Check console for: `🎯 [MODE] SINGLE-USER MODE ACTIVE`
3. Should see: `[PRE-OPENAI AUDIO]` logs (this is correct for this mode)
4. Should NOT see: WebSocket logs

### 2. Test Chatroom Mode
1. Navigate to: `http://localhost:5173/chatroom`
2. Create a room
3. Check console for: `🎯 [MODE] CHATROOM MODE ACTIVE`
4. Should see: `🌐 [WebSocket] Connected` logs
5. Should see: `USER_JOINED_ROOM` events
6. Should NOT see: `[PRE-OPENAI AUDIO]` logs

### 3. Test Join Link
1. User A creates room and copies link
2. User B opens link: `http://localhost:5173/join/session_xxx`
3. Both users should see: `🎯 [MODE] CHATROOM MODE ACTIVE`
4. Both users should see: WebSocket connection logs
5. Both users should see each other in the UI

## Files Modified

1. **neuralecho/frontend/src/components/ChatroomInterface.tsx**
   - Removed `useAppState` import
   - Removed dependency on `currentDbLevel` and `dbThreshold`
   - Added local `audioLevel` state
   - Added debug logging for mode confirmation

2. **neuralecho/frontend/src/pages/Index.tsx**
   - Added debug logging for single-user mode
   - Removed `saveAudioEnabled` debug toggle

3. **neuralecho/frontend/src/pages/Chatroom.tsx**
   - Added debug logging for route confirmation

4. **neuralecho/frontend/src/pages/JoinRoom.tsx**
   - Added debug logging for route confirmation

## Key Takeaways

### ✅ Correct Behavior
- **Single-user mode** (`/`): Uses `useRealtimeVoice`, shows `[PRE-OPENAI AUDIO]`
- **Chatroom mode** (`/chatroom`, `/join/:roomId`): Uses `useChatroomConnection`, shows WebSocket logs
- **No mixing**: Each mode uses its own hooks exclusively

### ❌ Previous Bug
- Chatroom mode was accidentally calling `useAppState()` → triggered `useRealtimeVoice`
- This caused both modes to run simultaneously
- WebSocket connection was established but overshadowed by direct OpenAI connection
- Users saw `[PRE-OPENAI AUDIO]` logs even in chatroom mode

### 🔍 How to Identify Mode Issues
If you see `[PRE-OPENAI AUDIO]` logs:
1. Check the URL - are you on `/` or `/chatroom`?
2. Check console for mode indicator: `🎯 [MODE] ...`
3. If on chatroom URL but seeing `[PRE-OPENAI AUDIO]`, there's a bug
4. If on `/` and seeing `[PRE-OPENAI AUDIO]`, that's correct

## Testing Checklist

- [ ] Single-user mode works (direct OpenAI connection)
- [ ] Chatroom creation works
- [ ] Join link works
- [ ] Both users see each other in chatroom
- [ ] WebSocket connection established in chatroom
- [ ] `USER_JOINED_ROOM` events received
- [ ] `translation_ready` event received
- [ ] Translation works between users
- [ ] No `[PRE-OPENAI AUDIO]` logs in chatroom mode
- [ ] Console shows correct mode indicators

## Next Steps

1. Test the changes locally
2. Verify both modes work independently
3. Test the complete chatroom flow (create → share → join)
4. Deploy to staging
5. Test on production URLs
