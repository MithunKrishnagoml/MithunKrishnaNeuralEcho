# Diagnostic: Why Audio Isn't Reaching OpenAI

## Current Status
- ✅ WebRTC connected to OpenAI
- ✅ DataChannel open
- ✅ Microphone track added to peer connection
- ✅ `enableMic()` called (VAD started)
- ✅ Track enabled: `track.enabled = true`
- ❌ **Audio queue stays at 0/480**
- ❌ **No transcripts generated**

## Root Cause Analysis

The microphone audio IS being sent to OpenAI via WebRTC (automatically handled by the browser), BUT:

### Problem 1: Audio Format Mismatch
OpenAI Realtime API expects **24kHz PCM16** audio, but the browser might be sending a different format.

### Problem 2: Server VAD Not Triggering
The `turn_detection` settings might be too strict:
```javascript
turn_detection: {
  type: 'server_vad',
  threshold: 0.3,
  silence_duration_ms: 200,
  prefix_padding_ms: 100
}
```

If the threshold is too high or the user isn't speaking loud enough, OpenAI won't detect speech.

### Problem 3: Audio Track Configuration
The microphone constraints might not match OpenAI's requirements:
```typescript
audio: {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  sampleRate: 24000  // ← This might be missing!
}
```

## The Fix

### Step 1: Add Explicit Sample Rate

**File**: `frontend/src/hooks/useRealtimeVoice.ts`

**Find** (around line 558):
```typescript
stream = await navigator.mediaDevices.getUserMedia({ 
  audio: {
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    channelCount: 1
  }
});
```

**Replace with**:
```typescript
stream = await navigator.mediaDevices.getUserMedia({ 
  audio: {
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 24000,  // ← ADD THIS
    sampleSize: 16      // ← ADD THIS
  }
});
```

### Step 2: Lower VAD Threshold

**File**: `backend/index.js`

**Find** (around line 1078):
```javascript
turn_detection: {
  type: 'server_vad',
  threshold: 0.3,
  silence_duration_ms: 200,
  prefix_padding_ms: 100
}
```

**Replace with**:
```javascript
turn_detection: {
  type: 'server_vad',
  threshold: 0.5,  // ← INCREASE from 0.3 to 0.5 (more sensitive)
  silence_duration_ms: 500,  // ← INCREASE to give more time
  prefix_padding_ms: 300     // ← INCREASE to capture more audio
}
```

### Step 3: Add Diagnostic Logging

**File**: `frontend/src/hooks/useRealtimeVoice.ts`

**Add after line 944** (in `enableMic` function):
```typescript
streamRef.current?.getTracks().forEach((t) => {
  t.enabled = true;
  console.log('🎤 [MIC] Track enabled:', {
    kind: t.kind,
    enabled: t.enabled,
    muted: t.muted,
    readyState: t.readyState,
    settings: t.getSettings()
  });
});
```

### Step 4: Verify Audio is Flowing

**Add to DataChannel setup** (around line 630):
```typescript
// Monitor audio stats
setInterval(() => {
  if (pc.getStats) {
    pc.getStats().then(stats => {
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          console.log('📊 [AUDIO STATS]', {
            packetsReceived: report.packetsReceived,
            bytesReceived: report.bytesReceived,
            audioLevel: report.audioLevel
          });
        }
        if (report.type === 'outbound-rtp' && report.kind === 'audio') {
          console.log('📤 [AUDIO SENT]', {
            packetsSent: report.packetsSent,
            bytesSent: report.bytesSent
          });
        }
      });
    });
  }
}, 2000);
```

## Alternative: Manual Audio Sending

If WebRTC audio isn't working, manually capture and send audio via DataChannel:

```typescript
// In enableMic function, add:
const audioContext = new AudioContext({ sampleRate: 24000 });
const source = audioContext.createMediaStreamSource(streamRef.current!);
const processor = audioContext.createScriptProcessor(4096, 1, 1);

processor.onaudioprocess = (e) => {
  const inputData = e.inputBuffer.getChannelData(0);
  
  // Convert Float32 to Int16
  const int16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    const s = Math.max(-1, Math.min(1, inputData[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  // Convert to base64
  const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
  
  // Send to OpenAI
  if (dcRef.current?.readyState === 'open') {
    dcRef.current.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64
    }));
    console.log('🎤 [MANUAL AUDIO] Sent chunk:', base64.length);
  }
};

source.connect(processor);
processor.connect(audioContext.destination);
```

## Testing Checklist

After applying fixes:
- [ ] Console shows: `🎤 [MIC] Track enabled: { enabled: true, readyState: 'live' }`
- [ ] Console shows: `📤 [AUDIO SENT] { packetsSent: >0, bytesSent: >0 }`
- [ ] Backend logs show: OpenAI receiving audio
- [ ] Console shows: `conversation.item.input_audio_transcription.completed`
- [ ] Transcript appears in UI
- [ ] Audio queue shows non-zero values

## Expected Behavior

Once fixed:
1. User clicks mic → Track enabled
2. User speaks → Audio packets sent (📤 [AUDIO SENT])
3. OpenAI detects speech → VAD triggers
4. OpenAI transcribes → `input_audio_transcription.completed`
5. OpenAI translates → `response.audio.delta`
6. Audio queue fills → Playback starts

## Why This Matters

The entire pipeline depends on OpenAI receiving the audio. Without it:
- ❌ No transcription
- ❌ No translation
- ❌ No audio output
- ❌ Empty queue (0/480)

Fix the audio input, and everything else will work automatically.
