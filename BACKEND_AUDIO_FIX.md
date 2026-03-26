# Backend Audio Broadcasting Fixes

## 🔴 Critical Issues Found

### Issue 1: AI_AUDIO_CHUNK uses sender's participantId (Line 799)
**Problem:** AI audio is tagged with YOUR participantId, so frontend filters it out thinking it's your own echo.

**Current Code:**
```javascript
participantId: participantId,  // ❌ This is the sender's ID!
```

**Fix:**
```javascript
participantId: 'ai-agent',  // ✅ AI has its own unique ID
```

### Issue 2: AUDIO_CHUNK uses inconsistent field name (Line 931)
**Problem:** Uses `fromParticipant` instead of `participantId`, causing frontend confusion.

**Current Code:**
```javascript
fromParticipant: participantId,  // ❌ Wrong field name
```

**Fix:**
```javascript
participantId: participantId,  // ✅ Consistent with other messages
```

### Issue 3: AI_AUDIO_CHUNK broadcasts to wrong participants (Line 809)
**Problem:** Logic tries to exclude sender, but AI has sender's ID, so it excludes the wrong person.

**Current Code:**
```javascript
for (const [userId, participant] of translationSession.participants.entries()) {
  if (userId !== participantId && ...) {  // ❌ Backwards logic
    participant.socket.send(JSON.stringify(chunkMessage));
  }
}
```

**Fix:**
```javascript
// Get the other participant directly
const otherParticipant = translationSession.getOtherParticipant(senderUserId);
if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
  otherParticipant.socket.send(JSON.stringify(chunkMessage));
}
```

## ✅ Complete Fixed Code

### Fix 1: AI_AUDIO_CHUNK Handler (Lines 783-819)

Replace the entire `AI_AUDIO_CHUNK` handler with:

```javascript
      // Handle AI audio chunks from OpenAI (relay to all participants)
      if (data.type === 'AI_AUDIO_CHUNK') {
        const { participantId, audioData, seq } = data;
        console.log(`🤖 [AI_AUDIO_CHUNK] From ${participantId}, seq: ${seq}, size: ${audioData?.length || 0}`);
        
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId, userId: senderUserId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        // Get the other participant (the one who should receive AI audio)
        const otherParticipant = translationSession.getOtherParticipant(senderUserId);
        
        if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
          // Use "ai-agent" as participantId so frontend knows it's AI, not the sender
          const chunkMessage = {
            type: 'AUDIO_CHUNK',
            sessionId: sessionId,
            participantId: 'ai-agent',  // ✅ AI has its own ID
            pcmData: audioData,
            sampleRate: 24000,
            sequenceNumber: seq,
            responseId: `ai_response_${Date.now()}`,
            timestamp: Date.now()
          };

          otherParticipant.socket.send(JSON.stringify(chunkMessage));
          console.log(`🤖 [AI_AUDIO_CHUNK] Sent to other participant as AUDIO_CHUNK with participantId: ai-agent`);
        } else {
          console.log(`🤖 [AI_AUDIO_CHUNK] No other participant available to receive AI audio`);
        }
      }
```

### Fix 2: AUDIO_CHUNK Handler (Lines 913-942)

Change line 931 from:
```javascript
fromParticipant: participantId,
```

To:
```javascript
participantId: participantId,
```

And add logging after line 941:
```javascript
        } else {
          console.log(`🎵 [AUDIO_CHUNK] No other participant to relay to`);
        }
```

### Fix 3: AI_AUDIO_END Handler (Lines 822-850)

Replace the broadcast loop with direct send:

```javascript
      // Handle AI audio stream end
      if (data.type === 'AI_AUDIO_END') {
        const { participantId } = data;
        console.log(`🏁 [AI_AUDIO_END] From ${participantId}`);
        
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId, userId: senderUserId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        // Send stream end to the other participant only
        const otherParticipant = translationSession.getOtherParticipant(senderUserId);
        
        if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
          const endMessage = {
            type: 'AUDIO_STREAM_END',
            sessionId: sessionId,
            participantId: 'ai-agent',  // ✅ Match the AI participantId
            responseId: `ai_response_${Date.now()}`,
            timestamp: Date.now()
          };

          otherParticipant.socket.send(JSON.stringify(endMessage));
          console.log(`🏁 [AI_AUDIO_END] Sent to other participant with participantId: ai-agent`);
        }
      }
```

## 🎯 Why These Fixes Work

1. **AI gets unique ID** → Frontend won't filter it as "own audio"
2. **Consistent field names** → Frontend always reads `participantId`
3. **Direct participant targeting** → No broadcast loops, just send to the other person
4. **Better logging** → You'll see exactly what's being sent where

## 🧪 Testing After Fix

1. Start backend with fixes
2. Join session with 2 participants
3. Check logs for:
   - `🤖 [AI_AUDIO_CHUNK] Sent to other participant as AUDIO_CHUNK with participantId: ai-agent`
   - `🎵 [AUDIO_CHUNK] Relayed to other participant`
4. Frontend should now receive audio with `participantId: 'ai-agent'` instead of your own ID
