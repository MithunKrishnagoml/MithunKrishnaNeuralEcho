/**
 * Test utility for StreamingAudioPlayer
 * Use this to verify the AudioWorklet-based streaming works correctly
 */

import { StreamingAudioPlayer } from './StreamingAudioPlayer';

export async function testStreamingAudioPlayer(): Promise<void> {
  console.log('🧪 Testing StreamingAudioPlayer...');
  
  const player = new StreamingAudioPlayer({
    sampleRate: 24000,
    debug: true,
    onPlaybackStart: () => console.log('✅ Test: Playback started'),
    onPlaybackEnd: () => console.log('✅ Test: Playback ended'),
    onError: (error) => console.error('❌ Test error:', error)
  });

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 500));

  if (!player.isReady()) {
    console.error('❌ Player not ready after initialization');
    return;
  }

  console.log('✅ Player initialized successfully');

  // Test with a simple tone
  await player.testAudio();

  console.log('✅ Test tone sent');

  // Clean up after test
  setTimeout(() => {
    player.dispose();
    console.log('✅ Test completed and cleaned up');
  }, 3000);
}

function generateDummyAudioData(): string {
  // Generate a small WebM audio file with silence (base64 encoded)
  // This is a minimal WebM container with Opus audio codec containing silence
  const webmHeader = new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, // EBML header
    0x9f, 0x42, 0x86, 0x81, 0x01, // EBML version
    0x42, 0xf7, 0x81, 0x01, // EBML read version
    0x42, 0xf2, 0x81, 0x04, // EBML max ID length
    0x42, 0xf3, 0x81, 0x08, // EBML max size length
    0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, // Doc type "webm"
    0x42, 0x87, 0x81, 0x02, // Doc type version
    0x42, 0x85, 0x81, 0x02  // Doc type read version
  ]);
  
  return btoa(String.fromCharCode(...webmHeader));
}

// Export for console testing
(window as any).testStreamingAudioPlayer = testStreamingAudioPlayer;