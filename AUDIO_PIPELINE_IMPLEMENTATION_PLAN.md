# Audio Pipeline Implementation Plan

## CRITICAL ISSUE SUMMARY
Based on logs: `AudioWorklet → queue: 0/480` means NO audio is entering the pipeline.
Root cause: Microphone is NOT connected to AudioWorklet processor.

## DECISION: Use WebRTC Audio Track (Current Approach) vs DataChannel

After analysis, the current implementation uses **WebRTC audio track** which is CORRECT for OpenAI Realtime API.
The issue is NOT the approach, but likely:
1. Microphone permissions
2. Audio track not enabled at the right time
3. Session initialization timing

## ACTUAL PROBLEMS TO FIX

### Problem 1: Session Recreation Loop
**Location**: `useRoomTranslation.ts` lines ~130-150
**Symptom**: "Reinitializing session" + "Data channel closed"
**Fix**: Add session state check before calling `setVoiceModeAndInit()`

```typescript
// BEFORE (BROKEN):
useEffect(() => {
  clearHistory();
  updateSpeakerLanguage(0, participant.language);
  setActiveSpeakerId(0);
  setVoiceModeAndInit(voiceMode);
}, [participant.language]);

// AFTER (FIXED):
useEffect(() => {
  if (sessionState === "ready" || sessionState === "connecting") {
    console.log("⚠️ Session already active, skipping reinit");
    return;
  }
  
  clearHistory();
  updateSpeakerLanguage(0, participant.language);
  setActiveSpeakerId(0);
  setVoiceModeAndInit(voiceMode);
}, [participant.language, sessionState]);
```

### Problem 2: Microphone Not Enabled
**Location**: `useRealtimeVoice.ts` `enableMic()` function
**Current**: Enables tracks but may not trigger audio capture
**Fix**: Ensure audio context is resumed and tracks are properly enabled

```typescript
const enableMic = useCallback(() => {
  console.log('🎤 [enableMic] Starting');
  
  // Record when mic button was pressed
  micPressStartTimeRef.current = Date.now();
  
  // Resume AudioContext if suspended (browser autoplay policy)
  if (audioContextRef.current?.state === 'suspended') {
    audioContextRef.current.resume().then(() => {
      console.log('✅ [AudioContext] Resumed from suspended state');
    });
  }
  
  // Clear audio buffer
  if (dcRef.current && dcRef.current.readyState === 'open') {
    try {
      dcRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
      console.log('✅ [Audio Buffer] Cleared');
    } catch (error) {
      console.error('❌ [Audio Buffer] Failed to clear:', error);
    }
  }
  
  // Enable all audio tracks
  const tracks = streamRef.current?.getTracks() || [];
  console.log(`🎤 [enableMic] Enabling ${tracks.length} tracks`);
  tracks.forEach((t, index) => {
    console.log(`🎤 [enableMic] Track ${index}:`, {
      kind: t.kind,
      enabled: t.enabled,
      readyState: t.readyState,
      muted: t.muted
    });
    t.enabled = true;
  });
  
  // Verify tracks are enabled
  setTimeout(() => {
    const verifyTracks = streamRef.current?.getTracks() || [];
    verifyTracks.forEach((t, index) => {
      console.log(`✅ [enableMic] Track ${index} after enable:`, {
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState
      });
    });
  }, 100);
  
  startAudioMonitoring();
}, [startAudioMonitoring]);
```

### Problem 3: Peer Connection Audio Track Not Added Correctly
**Location**: `useRealtimeVoice.ts` `initSession()` around line 600
**Current**: Tracks added but may be disabled too early
**Fix**: Ensure tracks are added to peer connection BEFORE creating offer

```typescript
// Current code around line 600:
streamRef.current = stream;
// Start with mic muted – user must explicitly start listening
stream.getTracks().forEach((track) => {
  track.enabled = false;  // ← This might be the problem!
  pc.addTrack(track, stream);
});

// POTENTIAL FIX:
streamRef.current = stream;

// Add tracks to peer connection FIRST (enabled)
stream.getTracks().forEach((track) => {
  pc.addTrack(track, stream);
  console.log('✅ [WebRTC] Added track to peer connection:', {
    kind: track.kind,
    enabled: track.enabled,
    readyState: track.readyState
  });
});

// THEN disable them (user will enable via button)
stream.getTracks().forEach((track) => {
  track.enabled = false;
});
```

### Problem 4: Audio Context Suspended
**Location**: `useRealtimeVoice.ts` `initSession()`
**Issue**: Browser autoplay policy may suspend AudioContext
**Fix**: Resume on user gesture

```typescript
// After creating AudioContext:
const audioContext = new AudioContext();

// Check if suspended and log
console.log('🔊 [AudioContext] State:', audioContext.state);
if (audioContext.state === 'suspended') {
  console.warn('⚠️ [AudioContext] Created in suspended state - will resume on user gesture');
}

audioContextRef.current = audioContext;
```

## IMPLEMENTATION STEPS

### Step 1: Fix Session Recreation (HIGHEST PRIORITY)
**File**: `frontend/src/hooks/useRoomTranslation.ts`
**Line**: ~130-150
**Action**: Add sessionState dependency and check

### Step 2: Add Detailed Logging to enableMic()
**File**: `frontend/src/hooks/useRealtimeVoice.ts`
**Line**: ~880
**Action**: Add track state logging

### Step 3: Fix Track Addition Order
**File**: `frontend/src/hooks/useRealtimeVoice.ts`
**Line**: ~600
**Action**: Add tracks before disabling them

### Step 4: Add AudioContext State Logging
**File**: `frontend/src/hooks/useRealtimeVoice.ts`
**Line**: ~605
**Action**: Log AudioContext state

### Step 5: Test and Verify
1. Open browser console
2. Join room
3. Click mic button
4. Verify logs show:
   - ✅ Tracks enabled
   - ✅ AudioContext active
   - ✅ No session recreation
   - ✅ Data channel stays open

## WHY NOT AudioWorklet + DataChannel?

The current WebRTC approach is CORRECT because:
1. OpenAI Realtime API supports WebRTC audio tracks natively
2. Less code complexity
3. Better browser compatibility
4. Automatic audio routing

The AudioWorklet approach would require:
1. Manual PCM conversion
2. Base64 encoding
3. DataChannel message overhead
4. More complex error handling

## CONCLUSION

The issue is NOT the audio pipeline architecture.
The issue is:
1. **Session recreation breaking the connection**
2. **Microphone tracks not properly enabled**
3. **AudioContext suspended by browser policy**

Fix these three issues and audio will flow correctly through the existing WebRTC pipeline.
