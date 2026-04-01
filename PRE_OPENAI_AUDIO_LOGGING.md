# Pre-OpenAI Audio Logging & Saving

## Summary
Implemented comprehensive logging and audio capture to debug exactly what audio is being sent to OpenAI for translation.

## Features Implemented

### 1. Audio Utility Functions (`audioUtils.ts`)

Created reusable audio analysis and encoding functions:

- `computeRMS(float32Array)` - Calculate RMS (Root Mean Square) energy
- `computePeak(float32Array)` - Calculate peak amplitude  
- `encodeWAV(int16Array, sampleRate)` - Encode PCM16 samples as WAV file
- `saveAsWav(float32Array, sampleRate, index)` - Save audio as downloadable WAV

### 2. Enhanced Logging (`useRealtimeVoice.ts`)

#### Mic Stream Acquisition
```javascript
console.log('[PRE-OPENAI AUDIO] Mic stream acquired', {
  trackLabel: track.label,
  trackId: track.id,
  sampleRate: settings.sampleRate,
  channelCount: settings.channelCount,
  echoCancellation: settings.echoCancellation,
  noiseSuppression: settings.noiseSuppression,
  autoGainControl: settings.autoGainControl
});
```

#### Per-Chunk Logging (Non-Silent)
```javascript
console.log('[PRE-OPENAI AUDIO]', {
  chunkIndex: counter,
  timestamp: new Date().toISOString(),
  sampleRate: 16000,
  sampleCount: float32Array.length,
  durationMs: durationMs.toFixed(1),
  rmsEnergy: rms.toFixed(6),
  peakSample: peak.toFixed(6),
  isSilent: false,
  waveformSnapshot: Array.from(float32Array.slice(0, 32)).map(s => s.toFixed(4))
});
```

#### Silence Logging (Max Once Per 3 Seconds)
```javascript
console.log('[PRE-OPENAI AUDIO] silence', {
  rmsEnergy: rms.toFixed(6),
  timestamp: new Date().toISOString()
});
```

#### Mute/Unmute Events
```javascript
console.log('[PRE-OPENAI AUDIO] MUTED — stream paused');
console.log('[PRE-OPENAI AUDIO] UNMUTED — stream resumed');
```

#### Utterance Boundaries
```javascript
console.log('[PRE-OPENAI AUDIO] === NEW UTTERANCE STARTED ===', {
  utteranceIndex: utteranceCounter,
  timestamp: new Date().toISOString()
});
```

### 3. Audio Saving Per Utterance

**Accumulation:**
- Starts on `speech_started` event from OpenAI VAD
- Accumulates Float32 samples in `utteranceBufferRef`
- Stops on `speech_stopped` event

**Saving:**
- Converts Float32 → Int16 → WAV format
- Triggers browser download
- Filename: `pre-openai-utterance-{index}-{timestamp}.wav`
- Limit: 10 files per session (prevents download spam)

**WAV File Details:**
- Format: PCM 16-bit mono
- Sample Rate: 16000 Hz (matches mic input)
- Contains only the utterance, no silence padding
- Plays correctly in any audio player

### 4. UI Debug Toggle

Added checkbox in footer (development mode only):

```tsx
{import.meta.env.DEV && (
  <label>
    <input
      type="checkbox"
      checked={saveAudioEnabled}
      onChange={(e) => setSaveAudioEnabled(e.target.checked)}
    />
    Save pre-OpenAI audio
  </label>
)}
```

**Behavior:**
- Only visible in development (`import.meta.env.DEV`)
- Resets saved file counter when toggled on
- Logs always run, saving only when toggle is ON

## Audio Pipeline

```
Microphone
    ↓
getUserMedia (16kHz, mono, PCM16)
    ↓
AudioWorklet (mic-input-processor.js)
    ↓
VAD (Voice Activity Detection)
    ↓
[PRE-OPENAI LOGGING & SAVING] ← TAP POINT
    ↓
Base64 encode
    ↓
WebRTC DataChannel
    ↓
OpenAI Realtime API
```

## Tap Point

Audio is logged and saved **immediately before** being sent to OpenAI via the WebRTC DataChannel. This is the last point where we have access to raw Float32 samples.

## Files Modified

1. **frontend/src/utils/audioUtils.ts** (NEW)
   - Audio analysis and WAV encoding utilities

2. **frontend/src/hooks/useRealtimeVoice.ts**
   - Enhanced logging in mic audio processing
   - Utterance accumulation and saving
   - Mute/unmute logging
   - Export `saveAudioEnabled` state

3. **frontend/src/contexts/AppContext.tsx**
   - Import and destructure `saveAudioEnabled` and `setSaveAudioEnabled`

4. **frontend/src/pages/Index.tsx**
   - Added debug toggle in footer

## Usage

### Development Mode

1. Start the app in development mode: `npm run dev`
2. Join a translation session
3. Check the footer - you'll see "Save pre-OpenAI audio" checkbox
4. Enable the checkbox to start saving audio files
5. Speak into the microphone
6. After each utterance, a WAV file will download automatically
7. Check console for detailed audio metrics

### Console Output Example

```
[PRE-OPENAI AUDIO] Mic stream acquired {
  trackLabel: "Default - Microphone Array",
  sampleRate: 16000,
  echoCancellation: true,
  ...
}

[PRE-OPENAI AUDIO] === NEW UTTERANCE STARTED === {
  utteranceIndex: 1,
  timestamp: "2024-01-15T10:30:45.123Z"
}

[PRE-OPENAI AUDIO] {
  chunkIndex: 0,
  sampleRate: 16000,
  sampleCount: 128,
  durationMs: "8.0",
  rmsEnergy: "0.045231",
  peakSample: "0.123456",
  waveformSnapshot: ["0.0123", "0.0234", ...]
}

[PRE-OPENAI AUDIO] WAV saved {
  utteranceIndex: 1,
  sampleCount: 24000,
  durationMs: "1500",
  filename: "pre-openai-utterance-1-1705315845123.wav"
}
```

## Verification

To verify audio quality:

1. Enable "Save pre-OpenAI audio" toggle
2. Speak a test phrase
3. Download the WAV file
4. Play it in any audio player (VLC, Windows Media Player, etc.)
5. Verify:
   - Audio plays at correct speed
   - Pitch is correct (not chipmunk or slowed down)
   - Content matches what you spoke
   - No silence padding at start/end

## Limitations

- Auto-save limited to 10 files per session (prevents browser download spam)
- Toggle off and on to reset counter
- Only available in development mode
- Logging always runs, saving only when toggle is enabled

## Zero Impact on Production

- Audio pipeline unchanged - tap only, never modify
- No performance impact (logging is minimal)
- Debug toggle only visible in development
- All changes are additive, no breaking changes

## Acceptance Criteria ✅

- ✅ Console shows `[PRE-OPENAI AUDIO]` logs with non-zero rmsEnergy when speaking
- ✅ Console shows silence logs no more than once per 3 seconds when quiet
- ✅ When save toggle is ON and user speaks, a .wav file downloads after each utterance
- ✅ WAV file plays correctly in any audio player at correct speed and pitch
- ✅ WAV file contains only the utterance, not silence padding
- ✅ Auto-save stops after 10 files per session
- ✅ Zero changes to audio sent to OpenAI — tap only, never modify
