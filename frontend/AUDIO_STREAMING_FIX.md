# Audio Streaming Fix - AudioWorklet Implementation

## Problem Solved
Fixed broken and choppy translated audio playback caused by using independent `createBufferSource()` calls per chunk, which created gaps and overlaps between audio chunks.

## Solution Implemented
Replaced the per-chunk buffer source approach with an **AudioWorklet-based streaming queue** that maintains a single continuous playback timeline.

## Key Changes

### 1. AudioWorklet Processor (`/public/audio-streaming-processor.js`)
- Maintains an internal PCM sample queue
- Drains samples continuously in `process()` calls
- Fills silence when queue is empty (prevents AudioContext stalls)
- Handles transferable objects for efficient memory usage

### 2. StreamingAudioPlayer Rewrite (`/src/utils/StreamingAudioPlayer.ts`)
- **AudioContext sampleRate**: Set to 24000 Hz (matches OpenAI Realtime API)
- **Continuous timeline**: Single AudioWorkletNode maintains playback continuity
- **Chunk processing**: Decodes base64 → AudioBuffer → Float32Array → Worklet queue
- **Autoplay handling**: Resumes AudioContext on first user gesture
- **Memory management**: Uses transferable objects, proper cleanup on dispose

### 3. Event Handler Updates
- **useChatroomConnection**: TRANSLATED_AUDIO events now feed into StreamingAudioPlayer
- **useRoomTranslation**: Updated to use new StreamingAudioPlayer options
- **Removed**: Old HTML Audio element queue system

## Architecture

```
TRANSLATED_AUDIO WebSocket Event
    ↓
useChatroomConnection.addChunk()
    ↓
StreamingAudioPlayer.processChunk()
    ↓ (decode base64 → AudioBuffer → Float32Array)
AudioWorkletNode.port.postMessage()
    ↓
AudioStreamingProcessor.sampleQueue
    ↓ (continuous drain in process())
AudioContext.destination (speakers)
```

## Testing

### Manual Testing
1. Join a chatroom with translation enabled
2. Speak in one language - audio should translate and play smoothly
3. No gaps, pops, or breaks between chunks

### Programmatic Testing
```javascript
// In browser console:
import('/src/utils/testStreamingAudioPlayer.js').then(m => m.testStreamingAudioPlayer());
```

## Key Benefits
- ✅ **Continuous playback**: No gaps between chunks
- ✅ **Low latency**: Direct PCM streaming without buffer scheduling
- ✅ **Memory efficient**: Transferable objects, automatic cleanup
- ✅ **Autoplay compliant**: Handles browser autoplay policies
- ✅ **Error resilient**: Graceful fallback to silence when queue empty

## Browser Compatibility
- **AudioWorklet**: Chrome 66+, Firefox 76+, Safari 14.1+
- **Transferable Objects**: All modern browsers
- **AudioContext**: Universal support

## Performance
- **Sample Rate**: 24000 Hz (optimized for OpenAI Realtime API)
- **Queue Size**: 10 seconds max (configurable)
- **Memory**: Minimal - samples are consumed immediately
- **CPU**: Low - AudioWorklet runs on audio thread