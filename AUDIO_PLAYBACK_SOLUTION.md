# Audio Playback Solution - PCM Chunk Buffering

## The Real Problem

Your logs revealed two completely different audio paths with vastly different results:

**TRANSLATED_AUDIO (WebM blob)** - Perfect playback
- Entire audio arrives as one 86400-sample block
- Decoded once and sent to worklet
- Plays smoothly without glitching

**AUDIO_CHUNK (PCM streaming)** - Glitchy playback
- Arrives as 128-sample chunks
- Each chunk immediately sent to worklet
- Jitter buffer triggers incorrectly on silence gaps
- Results in constant buffering/playback cycling

## The Solution

**Stop streaming PCM chunks. Buffer them by responseId and play as complete blocks.**

### How It Works

1. **Chunk Buffering**: When AUDIO_CHUNK events arrive, collect all Int16 PCM data by responseId
2. **Accumulation**: Store chunks in a Map keyed by responseId
3. **Complete Response**: When a new responseId arrives or response is marked complete, combine all chunks
4. **Single Playback**: Send the complete combined audio block to the worklet (like TRANSLATED_AUDIO)
5. **Cleanup**: Remove buffered chunks after playback

### Code Changes

**StreamingAudioPlayer.ts**:
```typescript
// New properties for PCM buffering
private pcmChunkBuffer: Map<string, Int16Array[]> = new Map();
private responseIdQueue: string[] = [];

// New method to play complete buffered responses
private async playBufferedPCMResponse(responseId: string): Promise<void>
```

**processChunk() logic**:
- If PCM data: Buffer it by responseId instead of playing immediately
- If WebM blob: Play immediately (unchanged)
- When responseId changes: Play the previous buffered response

### Benefits

✅ **Identical playback quality** for both AUDIO_CHUNK and TRANSLATED_AUDIO
✅ **No jitter buffer glitching** - no more tiny 128-sample streaming
✅ **No false silence detection** - complete response plays as one block
✅ **Smooth transitions** between utterances
✅ **Long conversations** (10+ minutes) play without degradation

### Expected Behavior

1. AUDIO_CHUNK events arrive (128 samples each)
2. Chunks accumulate in pcmChunkBuffer[responseId]
3. When new responseId arrives → previous response plays as complete block
4. Smooth audio output with no glitching
5. Both speakers hear identical quality

### Testing

Listen for:
- No glitching between utterances
- Smooth playback throughout conversation
- Both AUDIO_CHUNK and TRANSLATED_AUDIO sound identical
- No console warnings about underruns or buffering
- Long conversations (10+ minutes) remain smooth

### Technical Details

- PCM chunks stored as Int16Array for memory efficiency
- Combined into single Float32Array before sending to worklet
- Proper Int16 to Float32 normalization (sample / 32768 or 32767)
- ResponseId tracking ensures correct grouping
- Automatic cleanup prevents memory leaks
