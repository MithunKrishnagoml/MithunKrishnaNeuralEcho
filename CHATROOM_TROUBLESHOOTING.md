# Chatroom Troubleshooting Guide

## Issue: User A Cannot See User B

### Root Cause
Based on your console logs showing ONLY `[PRE-OPENAI AUDIO]` messages, you are using the **WRONG INTERFACE**.

You are currently on the **single-user direct OpenAI mode** instead of the **chatroom mode**.

---

## NeuralEcho Has TWO Different Modes

### 1. Single-User Mode (WRONG for your use case)
- **URL**: `/` (root page)
- **Purpose**: One person translating their own speech
- **Architecture**: Direct WebRTC connection to OpenAI Realtime API
- **Logs**: Shows `[PRE-OPENAI AUDIO]` messages
- **Components**: `TranslationPanel` with `useRealtimeVoice` hook
- **NO peer-to-peer**: This mode doesn't support multiple users

### 2. Chatroom Mode (CORRECT for your use case)
- **URL**: `/chatroom` (create/join) or `/join/:roomId` (direct join)
- **Purpose**: Two people having a translated conversation
- **Architecture**: WebSocket-based backend relay through your Node.js server
- **Logs**: Shows `🌐🌐🌐 [WebSocket] onmessage` messages
- **Components**: `ChatroomInterface` with `useChatroomConnection` hook
- **Peer visibility**: Backend manages both users and relays audio/translation

---

## How to Use Chatroom Mode (CORRECT FLOW)

### Step 1: User A Creates a Room
1. Navigate to: `http://localhost:5173/chatroom` (or your deployed URL + `/chatroom`)
2. Click "Create Room"
3. Enter your name (e.g., "Alice")
4. Select your language (e.g., "English")
5. Click "Create Room"
6. You'll see a shareable link like: `https://neuralecho.vercel.app/join/session_1234567890_abc123`

### Step 2: User A Shares the Link
1. Copy the shareable link from the toast notification or click the "Share" button
2. Send this link to User B via email, chat, etc.

### Step 3: User B Joins via Link
1. User B opens the link: `https://neuralecho.vercel.app/join/session_1234567890_abc123`
2. Enter their name (e.g., "Bob")
3. Select their language (e.g., "Français")
4. Click "Join Room"

### Step 4: Both Users See Each Other
- User A's screen will show: "Bob joined!" notification
- User B's screen will show: "Alice" in the participants list
- Both users will see: "Live translation active — speak naturally"
- Translation will start automatically when either person speaks

---

## How to Verify You're on the Correct Interface

### ✅ Correct Interface (Chatroom Mode)
Look for these indicators:
- URL contains `/chatroom` or `/join/session_`
- Header shows "NeuralEcho Chatroom" (not just "NeuralEcho")
- Participants counter shows "1/2" or "2/2"
- Console shows: `🌐🌐🌐 [WebSocket] onmessage` logs
- Console shows: `📥 [BACKEND] join_session request received`
- Console shows: `USER_JOINED_ROOM` events

### ❌ Wrong Interface (Single-User Mode)
Look for these indicators:
- URL is just `/` (root)
- Header shows "NeuralEcho" with "A GoML Demo App"
- Split screen with English/French panels side-by-side
- Console shows: `[PRE-OPENAI AUDIO]` logs
- Console shows: `🎤 [MIC] Audio data` logs
- NO WebSocket connection logs
- NO chatroom-related events

---

## Current Logging (For Debugging)

When you're on the CORRECT chatroom interface, you should see these logs:

### Backend Logs (Node.js server)
```
═══════════════════════════════════════════════════════
📥 [BACKEND] join_session request received
📥 [BACKEND] Session ID: session_xxx
📥 [BACKEND] User ID: participant-xxx
📥 [BACKEND] User Name: Alice
📥 [BACKEND] Language: en-US
═══════════════════════════════════════════════════════
✅ [BACKEND] Session found. Current participants: 1
═══════════════════════════════════════════════════════
👤 [BACKEND] Participant added successfully
👤 [BACKEND] Total participants now: 2
═══════════════════════════════════════════════════════
📢 [BACKEND] Notifying existing participants about new joiner
📤 [BACKEND] Sending USER_JOINED_ROOM notification to: participant-xxx
═══════════════════════════════════════════════════════
🚀 [BACKEND] TWO PARTICIPANTS DETECTED!
🚀 [BACKEND] Initializing OpenAI sessions...
═══════════════════════════════════════════════════════
📢 [BACKEND] Sending translation_ready to all participants
```

### Frontend Logs (Browser console)
```
🌐🌐🌐 [WebSocket] onmessage fired! Raw data: {...}
📨 [WebSocket] Message type: USER_JOINED_ROOM
═══════════════════════════════════════════════════════
📥 [USER_JOINED_ROOM] Event received!
📥 [USER_JOINED_ROOM] Participant count: 2
📥 [USER_JOINED_ROOM] Joining user ID: participant-xxx
═══════════════════════════════════════════════════════
✅ [USER_JOINED_ROOM] Someone else joined! Setting otherParticipant
═══════════════════════════════════════════════════════
🚀 [translation_ready] Translation session is ready!
═══════════════════════════════════════════════════════
👥 [ChatroomInterface] otherParticipant state changed!
👥 [ChatroomInterface] Other participant details: { id, name, language }
```

---

## Quick Fix

1. **Close the current page** (you're on the wrong interface)
2. **Navigate to**: `http://localhost:5173/chatroom` or `https://neuralecho.vercel.app/chatroom`
3. **Create a room** as User A
4. **Share the link** with User B
5. **User B opens the link** and joins
6. **Both users should now see each other**

---

## Architecture Summary

```
Single-User Mode (/)
┌─────────────┐
│   Browser   │ ←──WebRTC──→ OpenAI Realtime API
└─────────────┘
(No backend relay, no peer visibility)

Chatroom Mode (/chatroom or /join/:roomId)
┌─────────────┐                    ┌─────────────┐
│  Browser A  │ ←──WebSocket──→    │  Browser B  │
└─────────────┘                    └─────────────┘
       ↓                                  ↓
       └──────────→ Backend Server ←──────┘
                         ↓
                   OpenAI Realtime API
                   (2 separate sessions)
```

The backend:
- Manages both participants
- Creates 2 OpenAI sessions (A→B translation, B→A translation)
- Relays audio from User A to OpenAI → translated audio to User B
- Relays audio from User B to OpenAI → translated audio to User A
- Sends `USER_JOINED_ROOM` and `translation_ready` events to both users

---

## If You're Still Having Issues

After confirming you're on the correct interface (`/chatroom`), check:

1. **Backend is running**: `http://localhost:3000` or your deployed backend URL
2. **WebSocket connection**: Look for `✅ [WebSocket] Connected to chatroom` in console
3. **Both users joined**: Look for `USER_JOINED_ROOM` events for both participants
4. **Translation ready**: Look for `translation_ready` event after both join
5. **OpenAI sessions**: Backend logs should show "OpenAI sessions initialized successfully"

If you see all of these and User A still can't see User B, then we have a real bug to fix. But based on your logs showing ONLY `[PRE-OPENAI AUDIO]`, you're definitely on the wrong interface.
