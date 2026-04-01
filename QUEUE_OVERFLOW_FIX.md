# Queue Overflow Fix - Real-time Conversation Audio

## Problem

```
⚠️ [TranslationAudio] Queue overflow (691ms), dropping chunk
```

### Root Cause

The system was treating audio playback like a **streaming buffer** (music/video) instead of a **real-time conversation**.

**What was happening:**
```
Incoming audio speed > Playback speed
↓
Audio chunks queue up
↓
Queue becomes too large (>600ms)
↓
System drops chunks ❌
↓
Audio becomes delayed and out of sync
```

### Why This Is Bad

1. **Delayed speech** - User hears translation seconds after it was spoken
2. **Out of sync** - Audio doesn't match real-time conversation
3. **Unnatural feel** - Doesn't feel like a phone call
4. **Lag buildup** - Each chunk adds to `nextStartTime`, creating accumulation

## Solution

### Key Changes

#### 1. Real-time Conversation Mode (Not Streaming Mode)

**Before:**
```typescript
// Streaming buffer approach
const MAX_QUEUE_MS = 600; // Too large for conversations
if (queueAheadMs > 600) {
  return; // Drop new audio
}
```

**After:**
```typescript
// Real-time conversation approach
const MAX_QUEUE_MS = 200; // Conversation-appropriate
if (queueAheadMs > MAX_QUEUE_MS) {
  interruptPlayback(); // Stop old audio, play new
}
```

#### 2. Automatic Interruption (Barge-in)

**New feature:**
```typescript
const stopAllSources = () => {
  activeSourcesRef.current.forEach(source => {
    source.stop();
    source.disconnect();
  });
  activeSourcesRef.current = [];
};

const interruptPlayback = () => {
  stopAllSources();
  nextStartTime = audioContext.currentTime; // Reset to now
};
```

#### 3. Speech Boundary Detection

**Detects new utterances via:**
- Timestamp gaps >300ms
- Speaker changes (from chunkId)

```typescript
const timeSinceLastChunk = timestamp - lastTimestamp;
const isSpeakerChange = speakerId !== lastSpeakerId;
const isNewSpeech = timeSinceLastChunk > 300 || isSpeakerChange;

if (isNewSpeech) {
  interruptPlayback(); // Clear old audio
}
```

#### 4. Track Active Sources

**Proper cleanup:**
```typescript
const source = ctx.createBufferSource();
activeSourcesRef.current.push(source);

source.onended = () => {
  // Remove from tracking when done
  const idx = activeSourcesRef.current.indexOf(source);
  if (idx > -1) activeSourcesRef.current.splice(idx, 1);
};
```

## Behavior Comparison

### Old Behavior (Streaming Buffer)

```
User A: "Hello"
  ↓ [buffering...]
User A: "How are you?"
  ↓ [buffering...]
User B hears: "Hello" [2 seconds later]
User B hears: "How are you?" [4 seconds later]
❌ Feels delayed and unnatural
```

### New Behavior (Real-time Conversation)

```
User A: "Hello"
  ↓ [plays immediately]
User A: "How are you?"
  ↓ [interrupts "Hello", plays new speech]
User B hears: "How are you?" [instantly]
✅ Feels like a phone call
```

## Technical Details

### Queue Management

**Before:**
- Max queue: 600ms
- Action on overflow: Drop new chunks
- Result: Old audio keeps playing, new audio lost

**After:**
- Max queue: 200ms
- Action on overflow: Interrupt old audio
- Result: Latest audio always plays

### Time Accumulation

**Before:**
```typescript
nextStartTime += buffer.duration; // Accumulates indefinitely
```

**After:**
```typescript
nextStartTime = Math.max(
  audioContext.currentTime,
  nextStartTime
); // Prevents runaway accumulation
```

### Speech Detection

**Triggers for interruption:**
1. Time gap >300ms between chunks
2. Speaker ID changes
3. Queue exceeds 200ms

## Verification

### Console Logs to Look For

**Success indicators:**
```
🔥 [TranslationAudio] INTERRUPTED - new speech detected
✅ [TranslationAudio] Playing chunk, queue: 150ms
✅ [TranslationAudio] Playing chunk, queue: 180ms
```

**Problem indicators (should not see):**
```
⚠️ [TranslationAudio] Queue overflow (691ms), dropping chunk
```

### Testing

1. Open two browser tabs (English + French)
2. Have rapid back-and-forth conversation
3. Check console logs
4. Verify:
   - Queue stays <200ms
   - Audio feels immediate
   - No lag buildup
   - Natural conversation flow

## Impact

### Before Fix
- ❌ Queue overflow warnings
- ❌ Audio lag buildup
- ❌ Delayed translations
- ❌ Unnatural conversation feel

### After Fix
- ✅ No queue overflow
- ✅ No lag buildup
- ✅ Instant translations
- ✅ Natural phone-call feel

## Files Changed

1. `frontend/src/hooks/useTranslationAudio.ts`
   - Added interruption support
   - Reduced max queue to 200ms
   - Added speech boundary detection
   - Track active audio sources

2. `frontend/src/hooks/useChatroomConnection.ts`
   - Pass timestamp to audio player
   - Enable speech boundary detection

3. `ARCHITECTURE.md`
   - Updated documentation
   - Added troubleshooting guide
   - Explained real-time vs streaming mode

## Key Insight

> **Streaming player** buffers audio for smooth playback (music/video)
> 
> **Conversation player** interrupts old audio for real-time feel (phone calls)

The fix transforms the system from a streaming player to a conversation player, which is the correct behavior for real-time translation.

## Commit

```
CRITICAL FIX: Real-time conversation audio player with interruption support

- Replace streaming buffer with real-time conversation mode
- Reduce max queue from 600ms to 200ms
- Add automatic interruption when new speech detected
- Detect speech boundaries via timestamp gaps (>300ms)
- Stop old audio sources on barge-in
- Track active audio sources for proper cleanup
- Prevent lag buildup by prioritizing latest audio
```

Branch: `HandsfreeChatBot`
Status: ✅ Pushed to GitHub
