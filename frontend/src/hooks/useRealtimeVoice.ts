import { useRef, useCallback, useState } from "react";
import { BACKEND_URL } from "@/lib/config";
import { RealtimeAudioTap } from "@/utils/RealtimeAudioTap";

// Backend endpoint for creating OpenAI realtime sessions
const REALTIME_SESSION_URL = `${BACKEND_URL}/api/openai/realtime-session`;

// Create session via backend (secure - API key stays on server)
const createSessionViaBackend = async (config: SessionConfig) => {
  console.log('🔧 [WebRTC] Creating session via backend:', REALTIME_SESSION_URL);
  
  const turnDetection = config.voiceMode === "hands-free" ? {
    type: "server_vad",
    threshold: 0.5, // Balanced sensitivity (0.5 = default, lower = more sensitive)
    prefix_padding_ms: 300, // Capture 300ms before speech for natural start
    silence_duration_ms: 700 // Wait 700ms of silence before ending turn (allows natural pauses)
  } : null;

  const response = await fetch(REALTIME_SESSION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instructions: config.instructions,
      turn_detection: turnDetection,
      voice: config.voice || "ballad",
      input_audio_transcription: {
        model: "whisper-1",
        language: config.language || "en" // Always pass language hint to prevent hallucination
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Backend session creation failed: ${response.status} - ${errorData.error || errorData.message || 'Unknown error'}`);
  }

  const data = await response.json();
  console.log('✅ [WebRTC] Session created via backend');
  return data;
};

export type VoiceMode = "push-to-talk" | "hands-free";

export interface RealtimeResult {
  transcript: string;
  responseText: string;
  responseAudioPlayed: boolean;
}

export interface SessionConfig {
  instructions: string;
  voiceMode: VoiceMode;
  voice?: string;
  dbThreshold?: number; // dB threshold for voice detection (default: -50)
  language?: string; // Language hint for Whisper transcription (e.g., "en", "fr")
}

export interface RealtimeStreamingCallbacks {
  onVoiceActivityStarted?: () => void;
  onVoiceActivityStopped?: () => void;
  onPartialTranscript?: (delta: string, itemId: string) => void;
  onTranslationDelta?: (delta: string, responseId: string) => void;
  onAudioChunk?: (audioData: string, responseId: string) => void;
  onAIAudioChunk?: (audioData: string, sequenceNumber: number) => void;
  onSilenceDetected?: () => void;
  onError?: (error: Error) => void;
}

interface FinalizedTurnSnapshot {
  transcript: string;
  translation: string;
}

function sanitizeTranslationText(text: string): string {
  if (!text) return "";

  const stripped = text
    .replace(/^ERROR:\s*Only English and French supported\s*/i, "")
    .trim();

  return stripped;
}

export type SessionState = "disconnected" | "connecting" | "ready" | "error";

/**
 * Hook that manages a WebRTC connection to the OpenAI Realtime API.
 * Supports pre-initializing the session before the user starts speaking.
 */
export function useRealtimeVoice() {
  const AUDIO_STOP_FALLBACK_MS = 6000;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micWorkletNodeRef = useRef<AudioWorkletNode | null>(null); // For capturing mic input
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>("disconnected");
  const [currentDbLevel, setCurrentDbLevel] = useState<number | null>(null);

  const transcriptRef = useRef("");
  const responseRef = useRef("");
  const responseHasTextDeltaRef = useRef(false);
  const responseHasAudioTranscriptDeltaRef = useRef(false);
  const finalizedTurnRef = useRef<FinalizedTurnSnapshot | null>(null);
  const turnResponseDoneRef = useRef(false);
  const dbThresholdRef = useRef<number>(-50); // Default threshold: -50 dB
  
  // Refs for audio capture - store values that match the recorded audio
  const recordingTranscriptRef = useRef(""); // Original text for current recording
  const recordingResponseRef = useRef(""); // Translated text for current recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingResponseRef = useRef<boolean>(false);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  
  // Silence detection refs
  const lastTranscriptRef = useRef<string>("");
  const lastTranscriptTimeRef = useRef<number>(0);
  const speechDetectedRef = useRef<boolean>(false); // Track if OpenAI detected speech
  const micPressStartTimeRef = useRef<number | null>(null); // Track when mic button was pressed
  
  // Real-time audio tap for streaming chunks instead of blobs
  const audioTapRef = useRef<RealtimeAudioTap | null>(null);

  // Store callbacks so they can be attached after session is ready
  const callbacksRef = useRef<{
    onTranscript: (text: string, speakerId: number) => void;
    onTranslation: (translation: string, originalText: string) => void;
    onError: (err: Error) => void;
    onTranslatedAudio?: (audioData: string, originalText: string, translatedText: string) => void;
    onVoiceActivityStarted?: () => void;
    onVoiceActivityStopped?: () => void;
    onPartialTranscript?: (delta: string, itemId: string) => void;
    onTranslationDelta?: (delta: string, responseId: string) => void;
    onAudioChunk?: (audioData: string, responseId: string) => void;
    onAIAudioChunk?: (audioData: string, sequenceNumber: number) => void;
    onSilenceDetected?: () => void;
  } | null>(null);

  const handleDataChannelMessage = useCallback((evt: MessageEvent) => {
    try {
      const event = JSON.parse(evt.data);
      console.log('= [DataChannel] Received event:', event.type);
      const cbs = callbacksRef.current;
      if (!cbs) return;

      const maybeFinalizeTurn = (reason: string) => {
        const transcript = (transcriptRef.current || "").trim();
        const sanitizedTranslation = sanitizeTranslationText(responseRef.current);

        if (!turnResponseDoneRef.current || !transcript || !sanitizedTranslation) {
          return;
        }

        console.log(`= [DataChannel] Finalizing turn (${reason})`);
        cbs.onTranslation(sanitizedTranslation, transcript);
        finalizedTurnRef.current = {
          transcript,
          translation: sanitizedTranslation,
        };

        // Reset for next turn only after final commit.
        transcriptRef.current = "";
        responseRef.current = "";
        responseHasTextDeltaRef.current = false;
        responseHasAudioTranscriptDeltaRef.current = false;
        turnResponseDoneRef.current = false;
      };

      if (event.type === "conversation.item.input_audio_transcription.completed") {
        const finalTranscript = (event.transcript || "").trim();
        
        // SILENCE DETECTION APPROACH 2: Validate transcript after transcription completes
        // Check for empty, too short, or duplicate transcripts
        const now = Date.now();
        const isDuplicate = finalTranscript === lastTranscriptRef.current && 
                           (now - lastTranscriptTimeRef.current) < 5000;
        
        if (!finalTranscript || finalTranscript.length < 2 || isDuplicate) {
          console.log('ℹ️ [SILENCE DETECTION] Invalid transcript detected:', {
            empty: !finalTranscript,
            tooShort: finalTranscript.length < 2,
            duplicate: isDuplicate,
            transcript: finalTranscript
          });
          
          // Cancel the response only if one is actually active
          try {
            if (dcRef.current && dcRef.current.readyState === 'open') {
              // ✅ Only cancel if response hasn't already finished
              if (!turnResponseDoneRef.current) {
                dcRef.current.send(JSON.stringify({ type: "response.cancel" }));
                console.log('🧹 [SILENCE DETECTION] Canceled active response');
              } else {
                console.log('ℹ️ [SILENCE DETECTION] Response already done, skipping cancel');
              }
              dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
              console.log('🧹 [SILENCE DETECTION] Cleared buffer');
            }
          } catch (error) {
            console.error('❌ [SILENCE DETECTION] Error canceling response:', error);
          }
          
          // Clear refs and cancel the turn
          transcriptRef.current = "";
          recordingTranscriptRef.current = "";
          if (turnResponseDoneRef.current) {
            responseRef.current = "";
            responseHasTextDeltaRef.current = false;
            responseHasAudioTranscriptDeltaRef.current = false;
            turnResponseDoneRef.current = false;
          }
          
          // Notify callback about silence detection (not an error)
          if (cbs.onSilenceDetected) {
            cbs.onSilenceDetected();
          }
          return;
        }
        
        // Update last transcript tracking for duplicate detection
        lastTranscriptRef.current = finalTranscript;
        lastTranscriptTimeRef.current = now;
        
        transcriptRef.current = finalTranscript;
        console.log('= [DataChannel] Transcript completed:', transcriptRef.current);
        
        // Save for audio recording (will be used when MediaRecorder stops)
        recordingTranscriptRef.current = transcriptRef.current;
        console.log('📝 [AUDIO SYNC] Saved transcript for recording:', recordingTranscriptRef.current);
        
        // Call onTranscript with both transcript and speakerId (0 for current user)
        cbs.onTranscript(transcriptRef.current, 0);

        // Finalize only if terminal response signal already arrived.
        maybeFinalizeTurn("transcript.completed");
      }

      if (event.type === "input_audio_buffer.speech_started") {
        speechDetectedRef.current = true;
        cbs.onVoiceActivityStarted?.();
      }

      if (event.type === "input_audio_buffer.speech_stopped") {
        speechDetectedRef.current = false;
        cbs.onVoiceActivityStopped?.();
      }

      if (event.type === "conversation.item.input_audio_transcription.delta") {
        cbs.onPartialTranscript?.(event.delta || "", event.item_id || "unknown_item");
      }

      if (event.type === "response.audio_transcript.delta") {
        cbs.onTranslationDelta?.(event.delta || "", event.response_id || "unknown_response");
        responseHasAudioTranscriptDeltaRef.current = true;

        // Avoid mixing text from two different response streams.
        // If response.text.delta exists for this turn, prefer that as the canonical translation text.
        if (!responseHasTextDeltaRef.current) {
          responseRef.current += event.delta || "";
        }
        
        // Start recording when OpenAI starts sending audio response
        if (!isRecordingResponseRef.current && mediaRecorderRef.current) {
          // Clear any existing timeout from previous recording
          if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
          }
          
          try {
            mediaRecorderRef.current.start(100); // Capture chunks every 100ms for smoother audio
            isRecordingResponseRef.current = true;
            recordingStartedAtRef.current = Date.now();
            console.log(' [AUDIO CAPTURE] Started recording translated audio (response.audio_transcript.delta)');
          } catch (error) {
            console.warn(' [AUDIO CAPTURE] Failed to start recording:', error);
          }
        }
      }

      if (event.type === "output_audio_buffer.started") {
        console.log('🎵 ═══════════════════════════════════════════════════════');
        console.log('🎵 [OUTPUT AUDIO] OpenAI started sending audio!');
        console.log('🎵 [OUTPUT AUDIO] Response ID:', event.response_id);
        console.log('🎵 [OUTPUT AUDIO] AudioTap ready:', !!audioTapRef.current);
        console.log('🎵 ═══════════════════════════════════════════════════════');
        
        // Start real-time capture - with retry logic for race condition
        const responseId = event.response_id || `response_${Date.now()}`;
        
        const tryStartCapture = (attempt: number = 0) => {
          if (audioTapRef.current) {
            audioTapRef.current.startCapture(responseId);
            console.log('✅ [RealtimeAudioTap] Started capture (output_audio_buffer.started)');
          } else if (attempt < 5) {
            // Retry up to 5 times with 100ms delay (total 500ms max wait)
            console.warn(`⚠️ [RealtimeAudioTap] Not ready yet, retrying in 100ms (attempt ${attempt + 1}/5)...`);
            setTimeout(() => tryStartCapture(attempt + 1), 100);
          } else {
            console.error('❌ [RealtimeAudioTap] Failed to start capture after 5 attempts - audioTapRef is still null!');
          }
        };
        
        tryStartCapture();
        
        // Keep MediaRecorder as fallback
        if (!isRecordingResponseRef.current && mediaRecorderRef.current) {
          if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
          }

          try {
            mediaRecorderRef.current.start(100);
            isRecordingResponseRef.current = true;
            recordingStartedAtRef.current = Date.now();
            console.log('📦 [FALLBACK RECORDER] Started recording (output_audio_buffer.started)');
          } catch (error) {
            console.warn('⚠️ [FALLBACK RECORDER] Failed to start recording on output_audio_buffer.started:', error);
          }
        }
      }

      if (event.type === "response.text.delta") {
        cbs.onTranslationDelta?.(event.delta || "", event.response_id || "unknown_response");

        // Switch to text stream as canonical translation source if both streams appear.
        if (!responseHasTextDeltaRef.current && responseHasAudioTranscriptDeltaRef.current) {
          responseRef.current = "";
        }

        responseHasTextDeltaRef.current = true;
        responseRef.current += event.delta || "";
        // Just accumulate the translation, don't call onTranslation yet
      }

      if (event.type === "response.audio.delta") {
        cbs.onAudioChunk?.(event.delta || "", event.response_id || "unknown_response");
      }

      if (event.type === "response.done") {
        console.log('G [DataChannel] Response done');
        turnResponseDoneRef.current = true;

        // Finalize if transcript is already available.
        maybeFinalizeTurn("response.done");
        
        // Save translation for audio recording (will be used when MediaRecorder stops)
        recordingResponseRef.current = sanitizeTranslationText(responseRef.current);
        console.log('📝 [AUDIO SYNC] Saved translation for recording:', recordingResponseRef.current);
        
        // Cancel any existing fallback timer - response.done is the clean signal
        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
          console.log(' [AUDIO CAPTURE] Cancelled fallback timer - response.done received');
        }
        
        // Don't reset refs here - transcript arrives AFTER response.done
        // Refs are reset only by maybeFinalizeTurn after a committed final turn.
      }

      if (event.type === "response.audio.done") {
        // Audio generation is complete. Only set fallback if response.done hasn't arrived yet
        if (isRecordingResponseRef.current && mediaRecorderRef.current && !recordingTimeoutRef.current) {
          console.log(` [AUDIO CAPTURE] Scheduling fallback stop from response.audio.done in ${AUDIO_STOP_FALLBACK_MS}ms`);
          recordingTimeoutRef.current = setTimeout(() => {
            if (mediaRecorderRef.current && isRecordingResponseRef.current) {
              try {
                const startedAt = recordingStartedAtRef.current;
                const durationMs = startedAt ? Date.now() - startedAt : null;
                mediaRecorderRef.current.stop();
                isRecordingResponseRef.current = false;
                console.log(' [AUDIO CAPTURE] Stopped recording (response.audio.done fallback)', {
                  durationMs,
                });
              } catch (error) {
                console.warn(' [AUDIO CAPTURE] Failed to stop recording on response.audio.done:', error);
              }
            }
          }, AUDIO_STOP_FALLBACK_MS);
        }
      }

      if (event.type === "output_audio_buffer.stopped") {
        // Stop real-time capture
        if (audioTapRef.current) {
          audioTapRef.current.stopCapture();
          console.log('⏹️ [RealtimeAudioTap] Stopped capture (output_audio_buffer.stopped)');
        }
        
        // Stop MediaRecorder fallback
        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }

        if (isRecordingResponseRef.current && mediaRecorderRef.current) {
          try {
            const startedAt = recordingStartedAtRef.current;
            const durationMs = startedAt ? Date.now() - startedAt : null;
            mediaRecorderRef.current.stop();
            isRecordingResponseRef.current = false;
            console.log('📦 [FALLBACK RECORDER] Stopped recording (output_audio_buffer.stopped)', {
              durationMs,
            });
          } catch (error) {
            console.warn('⚠️ [FALLBACK RECORDER] Failed to stop recording on output_audio_buffer.stopped:', error);
          }
        }
      }

      if (event.type === "error") {
        console.error("Realtime API error:", event.error);
        cbs.onError(new Error(event.error?.message || "Realtime API error"));
      }
    } catch {
      // ignore non-JSON
    }
  }, []);

  /**
   * Pre-initialize the session: get ephemeral token, set up WebRTC, capture mic.
   * The connection will be ready for immediate use when the user presses the mic.
   */
  const initSession = useCallback(
    async (
      config: SessionConfig,
      onError?: (err: Error) => void
    ) => {
      // Clean up any existing connection first
      if (pcRef.current) {
        console.log('[initSession] Cleaning up existing connection before creating new one');
        cleanup();
        // Wait longer for cleanup to complete - especially for peer connection close
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      setSessionState("connecting");

      try {
        // 1. Get ephemeral token from backend
        // Backend has the OpenAI API key configured securely
        console.log('🔧 [WebRTC] Creating session via backend');
        const sessionData = await createSessionViaBackend(config);

        const ephemeralKey = sessionData.client_secret?.value;
        if (!ephemeralKey) {
          throw new Error("No ephemeral key returned from backend");
        }

        // 2. Create peer connection
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        // 3. Remote audio playback - capture element for relay only (muted)
        const relayCaptureAudio = document.createElement("audio");
        relayCaptureAudio.autoplay = true;
        relayCaptureAudio.muted = true; // MUTED - only for capture, not local playback
        relayCaptureAudio.volume = 0;   // Double ensure no local playback from capture element
        audioRef.current = relayCaptureAudio;
        
        pc.ontrack = (e) => {
          const remoteStream = e.streams[0];
          const track = e.track;
          
          // RELAY CAPTURE: Connect remote stream to capture element (MUTED for local, but must PLAY)
          if (relayCaptureAudio) {
            relayCaptureAudio.srcObject = remoteStream;
            // CRITICAL: Must play() to activate the audio graph, even though muted
            relayCaptureAudio.play().then(() => {
              console.log('🎵 [RELAY CAPTURE] Audio element playing (muted for local)');
            }).catch((err) => {
              console.warn('⚠️ [RELAY CAPTURE] Failed to play audio element:', err);
            });
            console.log('🎵 [RELAY CAPTURE] Remote audio connected for relay capture (MUTED)');
          }
          
          // Set up real-time audio tap for streaming chunks (uses relay capture stream)
          // Wait for track to unmute before initializing
          const initializeAudioTap = () => {
            try {
              const audioTrack = remoteStream.getAudioTracks()[0];
              if (audioTrack) {
                audioTapRef.current = new RealtimeAudioTap(
                  // onAudioChunk callback - send to local audio player
                  (pcmData: string, responseId: string, sequenceNumber: number) => {
                    // Send to local audio player
                    if (callbacksRef.current?.onAudioChunk) {
                      callbacksRef.current.onAudioChunk(pcmData, responseId);
                    }
                    
                    // ❌ DISABLED: In 2-person rooms, AI audio should NOT be relayed through backend
                    // Each participant hears their own AI directly via WebRTC
                    // Backend relay would cause duplicate audio (once local, once relayed)
                    // 
                    // RELAY TO BACKEND: Send AI audio chunk to all participants
                    // if (callbacksRef.current?.onAIAudioChunk) {
                    //   if (sequenceNumber % 50 === 0) {
                    //     console.log(`🔊 [RELAY] Sending AI audio chunk #${sequenceNumber} to backend (${pcmData.length} bytes)`);
                    //   }
                    //   callbacksRef.current.onAIAudioChunk(pcmData, sequenceNumber);
                    // } else {
                    //   if (sequenceNumber === 0) {
                    //     console.error('❌ [RELAY] onAIAudioChunk callback not registered!');
                    //   }
                    // }
                  },
                  // onStreamEnd callback
                  (responseId: string) => {
                    console.log('🏁 [RealtimeAudioTap] Stream ended for response:', responseId);
                    // Notify backend that stream ended
                    if (callbacksRef.current?.onSilenceDetected) {
                      // Reuse onSilenceDetected callback to signal stream end
                      // The parent component will send AI_AUDIO_END
                    }
                  }
                );
                
                audioTapRef.current.initialize(audioTrack);
                console.log('🎤 [RealtimeAudioTap] Initialized for real-time streaming and relay');
              }
            } catch (error) {
              console.warn('⚠️ [RealtimeAudioTap] Failed to set up real-time audio tap:', error);
            }
          };
          
          // Wait for track to unmute before initializing tap
          const handleUnmute = () => {
            console.log('🎵 [RELAY CAPTURE] Track unmuted - now initializing AudioTap');
            initializeAudioTap();
            track.removeEventListener('unmute', handleUnmute);
            
            // CRITICAL: Start capture immediately after initialization if AI is already speaking
            // This handles the race condition where output_audio_buffer.started fires before unmute
            setTimeout(() => {
              if (audioTapRef.current && !audioTapRef.current['isCapturing']) {
                console.log('🎵 [RELAY CAPTURE] AudioTap ready, checking if we missed output_audio_buffer.started...');
                // We'll rely on the next audio event to trigger capture
              }
            }, 100);
          };
          
          if (track.muted) {
            console.log('🎵 [RELAY CAPTURE] Track is muted, waiting for unmute event...');
            track.addEventListener('unmute', handleUnmute);
          } else {
            // Already unmuted, attach immediately
            console.log('🎵 [RELAY CAPTURE] Track already unmuted, initializing immediately');
            initializeAudioTap();
          }
          
          // Keep MediaRecorder as fallback for local recording/saving (uses relay capture stream)
          try {
            const mediaRecorder = new MediaRecorder(remoteStream, {
              mimeType: 'audio/webm;codecs=opus'
            });
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                console.log('📦 [FALLBACK RECORDER] Chunk received:', event.data.size, 'bytes');
                audioChunksRef.current.push(event.data);
              }
            };
            
            mediaRecorder.onstop = () => {
              const startedAt = recordingStartedAtRef.current;
              const durationMs = startedAt ? Date.now() - startedAt : null;
              recordingStartedAtRef.current = null;

              if (audioChunksRef.current.length > 0) {
                console.log('📦 [FALLBACK RECORDER] Recording stopped, chunks collected:', audioChunksRef.current.length);
                console.log('📦 [FALLBACK RECORDER] Total size:', audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0), 'bytes');
                console.log('📦 [FALLBACK RECORDER] Recording summary:', { durationMs });
                
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                console.log('📦 [FALLBACK RECORDER] Created blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
                
                // Always send fallback audio - real-time streaming may have failed
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64Audio = (reader.result as string).split(',')[1];
                  console.log('📦 [FALLBACK RECORDER] Base64 encoded length:', base64Audio.length);
                  const finalizedTurn = finalizedTurnRef.current;
                  const syncedTranscript = finalizedTurn?.transcript || recordingTranscriptRef.current;
                  const syncedTranslation = finalizedTurn?.translation || recordingResponseRef.current;
                  
                  // Send translated audio to room via callback using SAVED recording values
                  if (callbacksRef.current?.onTranslatedAudio && syncedTranscript && syncedTranslation) {
                    console.log('📦 [FALLBACK RECORDER] Sending translated audio to room with saved transcript/translation');
                    console.log('📝 [AUDIO SYNC] Using transcript:', syncedTranscript);
                    console.log('📝 [AUDIO SYNC] Using translation:', syncedTranslation);
                    callbacksRef.current.onTranslatedAudio(
                      base64Audio, 
                      syncedTranscript,
                      syncedTranslation
                    );
                    
                    // Clear saved values after use
                    recordingTranscriptRef.current = "";
                    recordingResponseRef.current = "";
                    finalizedTurnRef.current = null;
                  } else {
                    console.warn('📦 [FALLBACK RECORDER] Cannot send audio - missing callback or transcript/translation');
                    console.warn('📦 [FALLBACK RECORDER] Debug info:', {
                      hasCallback: !!callbacksRef.current?.onTranslatedAudio,
                      syncedTranscript,
                      syncedTranslation
                    });
                  }
                };
                reader.readAsDataURL(audioBlob);
                audioChunksRef.current = []; // Reset for next recording
              } else {
                console.warn('📦 [FALLBACK RECORDER] No audio chunks collected!');
              }
            };
            
            // Store in ref for use by OpenAI event handlers
            mediaRecorderRef.current = mediaRecorder;
            console.log('📦 [FALLBACK RECORDER] MediaRecorder set up as fallback');
          } catch (error) {
            console.warn('⚠️ [FALLBACK RECORDER] Failed to set up fallback audio capture:', error);
          }
        };

        // 4. Capture mic with enhanced error handling
        let stream: MediaStream;
        try {
          // First try with enhanced audio constraints
          stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              noiseSuppression: true,
              echoCancellation: true,
              autoGainControl: true,
              sampleRate: 16000,
              channelCount: 1
            }
          });
        } catch (enhancedError) {
          console.warn("Enhanced audio constraints failed, trying basic audio:", enhancedError);
          try {
            // Fallback to basic audio constraints
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (basicError) {
            // Handle specific permission errors
            if (basicError instanceof DOMException) {
              switch (basicError.name) {
                case 'NotAllowedError':
                  throw new Error("Microphone permission denied. Please allow microphone access and try again.");
                case 'NotFoundError':
                  throw new Error("No microphone found. Please connect a microphone and try again.");
                case 'NotReadableError':
                  throw new Error("Microphone is already in use by another application.");
                case 'OverconstrainedError':
                  throw new Error("Microphone doesn't support the required audio format.");
                case 'SecurityError':
                  throw new Error("Microphone access blocked due to security restrictions.");
                default:
                  throw new Error(`Microphone error: ${basicError.message}`);
              }
            }
            throw basicError;
          }
        }
        
        streamRef.current = stream;
        // Start with mic muted G user must explicitly start listening
        stream.getTracks().forEach((track) => {
          track.enabled = false;
          pc.addTrack(track, stream);
        });

        // 4a. Set up audio level monitoring
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
        
        // 4b. Set up AudioWorklet for capturing mic input and sending to OpenAI
        try {
          await audioContext.audioWorklet.addModule('/mic-input-processor.js');
          const micWorkletNode = new AudioWorkletNode(audioContext, 'mic-input-processor');
          
          // Connect microphone to worklet for audio capture
          microphone.connect(micWorkletNode);
          
          // Handle audio data from worklet
          let audioChunkCount = 0;
          micWorkletNode.port.onmessage = (event) => {
            const { type, data } = event.data;
            
            if (type === 'AUDIO_DATA' && dcRef.current?.readyState === 'open') {
              // Log every 100th chunk to avoid spam
              if (audioChunkCount % 100 === 0) {
                console.log(`🎤 [MIC AUDIO] Sending chunk #${audioChunkCount} to OpenAI (${data.byteLength} bytes)`);
              }
              audioChunkCount++;
              
              // Convert Int16Array buffer to base64
              const int16Array = new Int16Array(data);
              const uint8Array = new Uint8Array(int16Array.buffer);
              let binaryString = '';
              for (let i = 0; i < uint8Array.length; i++) {
                binaryString += String.fromCharCode(uint8Array[i]);
              }
              const base64Audio = btoa(binaryString);
              
              // Send to OpenAI via data channel
              dcRef.current.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64Audio
              }));
            } else if (type === 'AUDIO_DATA' && dcRef.current?.readyState !== 'open') {
              if (audioChunkCount === 0) {
                console.error('❌ [MIC AUDIO] DataChannel not open! Cannot send audio to OpenAI. State:', dcRef.current?.readyState);
              }
            }
          };
          
          micWorkletNodeRef.current = micWorkletNode;
          console.log('🎤 [MicWorklet] Initialized for capturing mic input');
        } catch (workletError) {
          console.error('❌ [MicWorklet] Failed to initialize:', workletError);
          // Continue without worklet - fallback to WebRTC audio track only
        }
        
        // Store threshold from config
        if (config.dbThreshold !== undefined) {
          dbThresholdRef.current = config.dbThreshold;
        }

        // 5. Data channel
        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;

        transcriptRef.current = "";
        responseRef.current = "";

        dc.onmessage = handleDataChannelMessage;

        dc.onopen = () => {
          console.log('✅ [WebRTC] Data channel opened - session is ready!');
          setIsConnected(true);
          setSessionState("ready");
        };

        dc.onclose = () => {
          console.log('⚠️ [WebRTC] Data channel closed');
          setIsConnected(false);
          setSessionState("disconnected");
        };
        
        dc.onerror = (error) => {
          console.error('❌ [WebRTC] Data channel error:', error);
        };

        // 6. SDP exchange
        console.log('🔄 [WebRTC] Creating offer and starting SDP exchange...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        console.log('🔄 [WebRTC] Sending SDP offer to OpenAI...');
        const sdpRes = await fetch(
          "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ephemeralKey}`,
              "Content-Type": "application/sdp",
            },
            body: offer.sdp,
          }
        );
        if (!sdpRes.ok) {
          const errorText = await sdpRes.text();
          console.error('❌ [WebRTC] SDP exchange failed:', sdpRes.status, errorText);
          throw new Error(`SDP exchange failed: ${sdpRes.status} - ${errorText}`);
        }

        console.log('✅ [WebRTC] SDP offer accepted, setting remote description...');
        const answerSdp = await sdpRes.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
        console.log('✅ [WebRTC] Remote description set, waiting for data channel to open...');
      } catch (err) {
        console.error('❌ [WebRTC] Session initialization failed:', err);
        cleanup();
        setSessionState("error");
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [handleDataChannelMessage]
  );

  /**
   * Attach callbacks for an active listening session.
   * Call this when the user actually starts speaking (mic press).
   */
  const attachCallbacks = useCallback(
    (
      onTranscript: (text: string, speakerId: number) => void,
      onTranslation: (translation: string, originalText: string) => void,
      onError: (err: Error) => void,
      onTranslatedAudio?: (audioData: string, originalText: string, translatedText: string) => void,
      streamingCallbacks?: RealtimeStreamingCallbacks
    ) => {
      callbacksRef.current = {
        onTranscript,
        onTranslation,
        onError,
        onTranslatedAudio,
        ...streamingCallbacks,
      };
    },
    []
  );

  /** Check microphone permissions before attempting connection */
  const checkMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      // Check if permissions API is available
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        return permission.state === 'granted';
      }
      
      // Fallback: try to get user media with minimal constraints
      try {
        const mediaDevices = globalThis.navigator?.mediaDevices;
        if (!mediaDevices) return false;
        const testStream = await mediaDevices.getUserMedia({ audio: true });
        testStream.getTracks().forEach(track => track.stop());
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }, []);

  /** Calculate current audio level in dB */
  const getAudioLevelDb = useCallback((): number | null => {
    if (!analyserRef.current || !dataArrayRef.current) return null;
    
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
    const dataArray = dataArrayRef.current;
    
    // Calculate RMS (Root Mean Square) for more accurate level
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    
    // Convert to dB (0-255 range maps to -100 to 0 dB approximately)
    // Normalize to 0-1, then convert to dB
    const normalized = rms / 255;
    const db = normalized > 0 ? 20 * Math.log10(normalized) : -100;
    
    return db;
  }, []);

  /** Start monitoring audio levels */
  const startAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current !== null) return; // Already monitoring
    
    const monitor = () => {
      const db = getAudioLevelDb();
      if (db !== null) {
        setCurrentDbLevel(db);
      }
      animationFrameRef.current = requestAnimationFrame(monitor);
    };
    
    animationFrameRef.current = requestAnimationFrame(monitor);
  }, [getAudioLevelDb]);

  /** Stop monitoring audio levels */
  const stopAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setCurrentDbLevel(null);
  }, []);

  /** Check if audio level exceeds threshold */
  const isAudioAboveThreshold = useCallback((): boolean => {
    const db = getAudioLevelDb();
    if (db === null) return false;
    return db > dbThresholdRef.current;
  }, [getAudioLevelDb]);

  /** Update dB threshold */
  const setDbThreshold = useCallback((threshold: number) => {
    dbThresholdRef.current = threshold;
  }, []);

  const cleanup = useCallback(() => {
    stopAudioMonitoring();
    
    // Clear recording timeout
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    
    // Cleanup mic worklet node
    if (micWorkletNodeRef.current) {
      try {
        micWorkletNodeRef.current.port.postMessage({ type: 'STOP_CAPTURE' });
        micWorkletNodeRef.current.disconnect();
      } catch (e) {
        console.error('Error cleaning up mic worklet:', e);
      }
      micWorkletNodeRef.current = null;
    }
    
    // Cleanup audio tap
    if (audioTapRef.current) {
      try {
        audioTapRef.current.stopCapture();
      } catch (e) {
        console.error('Error cleaning up audio tap:', e);
      }
      audioTapRef.current = null;
    }
    
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    isRecordingResponseRef.current = false;
    audioChunksRef.current = [];
    
    // Close data channel first (before peer connection)
    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch (e) {
        console.error('Error closing data channel:', e);
      }
      dcRef.current = null;
    }
    
    // Close peer connection
    if (pcRef.current) {
      try {
        // Check signalingState before closing to prevent errors
        if (pcRef.current.signalingState !== 'closed') {
          pcRef.current.close();
        }
      } catch (e) {
        console.error('Error closing peer connection:', e);
      }
      pcRef.current = null;
    }
    
    // Stop all media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (e) {
          console.error('Error stopping track:', e);
        }
      });
      streamRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch (e) {
        console.error('Error closing audio context:', e);
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
    
    // Cleanup relay capture audio element
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    
    callbacksRef.current = null;
    setIsConnected(false);
    setSessionState("disconnected");
  }, [stopAudioMonitoring]);

  /** Send a response.create to trigger manual turn in push-to-talk */
  const commitTurn = useCallback(() => {
    console.log('= [commitTurn] Called, data channel state:', dcRef.current?.readyState);
    
    // Check if data channel exists and is open
    if (!dcRef.current) {
      console.warn('⚠️ [commitTurn] Data channel does not exist');
      return false;
    }
    
    if (dcRef.current.readyState !== "open") {
      console.warn('⚠️ [commitTurn] Data channel not open, current state:', dcRef.current.readyState);
      return false;
    }
    
    // SILENCE DETECTION: Check mic hold duration
    // If user held mic button for less than 400ms, they almost certainly didn't speak
    const micPressDuration = micPressStartTimeRef.current 
      ? Date.now() - micPressStartTimeRef.current 
      : 0;
    
    console.log('⏱️ [SILENCE DETECTION] Mic hold duration:', micPressDuration, 'ms');
    
    if (micPressDuration < 400) {
      console.log('ℹ️ [SILENCE DETECTION] Mic held for less than 400ms, canceling turn');
      
      // Clear the audio buffer without committing
      try {
        dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
        console.log('🧹 [SILENCE DETECTION] Cleared audio buffer');
      } catch (error) {
        console.error('❌ [SILENCE DETECTION] Error clearing buffer:', error);
      }
      
      // Clear local audio chunks
      audioChunksRef.current = [];
      
      // Notify callback about silence detection (not an error)
      if (callbacksRef.current?.onSilenceDetected) {
        callbacksRef.current.onSilenceDetected();
      }
      
      return false;
    }
    
    try {
      console.log('✅ [commitTurn] Mic held for sufficient duration, committing turn');
      console.log('✅ [commitTurn] Sending input_audio_buffer.commit and response.create');
      dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      dcRef.current.send(JSON.stringify({ type: "response.create" }));
      return true;
    } catch (error) {
      console.error('❌ [commitTurn] Error sending messages:', error);
      return false;
    }
  }, []);

  /** Enable mic audio track (unmute) */
  /** Enable mic audio track (unmute) */
  const enableMic = useCallback(() => {
    console.log('🎤 [enableMic] Starting - enabling microphone');
    
    // Record when mic button was pressed for silence detection
    micPressStartTimeRef.current = Date.now();
    
    // Resume AudioContext if suspended (browser autoplay policy)
    if (audioContextRef.current) {
      console.log('🔊 [enableMic] AudioContext state:', audioContextRef.current.state);
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('✅ [enableMic] AudioContext resumed from suspended state');
        }).catch((error) => {
          console.error('❌ [enableMic] Failed to resume AudioContext:', error);
        });
      }
    }
    
    // Clear audio buffer before enabling mic to prevent gibberish from previous audio
    if (dcRef.current && dcRef.current.readyState === 'open') {
      console.log('🧹 [enableMic] Clearing input audio buffer to prevent contamination');
      try {
        dcRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
        console.log('✅ [enableMic] Clear command sent');
      } catch (error) {
        console.error('❌ [enableMic] Failed to clear buffer:', error);
      }
    } else {
      console.warn('⚠️ [enableMic] Data channel not open, cannot clear buffer. State:', dcRef.current?.readyState);
    }
    
    // Enable all audio tracks
    const tracks = streamRef.current?.getTracks() || [];
    console.log(`🎤 [enableMic] Enabling ${tracks.length} tracks`);
    tracks.forEach((t, index) => {
      console.log(`🎤 [enableMic] Track ${index} BEFORE enable:`, {
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState,
        muted: t.muted,
        label: t.label
      });
      t.enabled = true;
    });
    
    // Start AudioWorklet capture
    if (micWorkletNodeRef.current) {
      console.log('🎤 [enableMic] Starting AudioWorklet capture');
      micWorkletNodeRef.current.port.postMessage({ type: 'START_CAPTURE' });
    } else {
      console.warn('⚠️ [enableMic] No AudioWorklet available for mic capture');
    }
    
    // Verify tracks are enabled after a short delay
    setTimeout(() => {
      const verifyTracks = streamRef.current?.getTracks() || [];
      verifyTracks.forEach((t, index) => {
        console.log(`✅ [enableMic] Track ${index} AFTER enable:`, {
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
          muted: t.muted
        });
      });
    }, 100);
    
    startAudioMonitoring();
    console.log('✅ [enableMic] Microphone enabled and monitoring started');
  }, [startAudioMonitoring]);

  /** Disable mic audio track (mute) */
  const disableMic = useCallback(() => {
    console.log('🎤 [disableMic] Stopping microphone');
    
    // Stop AudioWorklet capture
    if (micWorkletNodeRef.current) {
      console.log('🎤 [disableMic] Stopping AudioWorklet capture');
      micWorkletNodeRef.current.port.postMessage({ type: 'STOP_CAPTURE' });
    }
    
    // ❌ REMOVED: commitTurn() handles input_audio_buffer.commit
    // Sending it here causes double-commit which corrupts the buffer
    
    streamRef.current?.getTracks().forEach((t) => (t.enabled = false));
    stopAudioMonitoring();
    console.log('✅ [disableMic] Microphone disabled');
  }, [stopAudioMonitoring]);

  const stopSession = useCallback(() => {
    cleanup();
  }, [cleanup]);

  /**
   * Get current media streams for recording
   */
  const getMediaStreams = useCallback(() => {
    return {
      micStream: streamRef.current,
      audioElement: audioRef.current,
    };
  }, []);

  return { 
    initSession, 
    attachCallbacks, 
    stopSession, 
    commitTurn, 
    enableMic, 
    disableMic, 
    isConnected, 
    sessionState,
    currentDbLevel,
    isAudioAboveThreshold,
    setDbThreshold,
    getMediaStreams,
    checkMicrophonePermission,
  };
}
