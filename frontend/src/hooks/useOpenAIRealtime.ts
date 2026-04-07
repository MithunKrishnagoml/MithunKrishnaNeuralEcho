import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';

interface UseOpenAIRealtimeProps {
  myLanguage: string;
  targetLanguage: string;
  onMyTranscript: (text: string) => void;
  onIncomingTranscriptDelta: (delta: string) => void;
  onIncomingTranscriptDone: (text: string) => void;
  onVoiceActivityStart: () => void;
  onVoiceActivityStop: () => void;
  sendTranscriptToBackend: (text: string | object, direction: 'MY' | 'INCOMING' | 'DELTA' | 'SENTENCE_DONE') => void;
  onTranslatedAudioChunk?: (chunk: { audio: string; timestamp: number; sequenceNumber?: number; responseId?: string }) => void;
}

type Register = "formal" | "casual" | "technical" | "emotional";

interface ConversationHistory {
  original: string;
  translated: string;
}

interface ConversationContext {
  currentSentenceOriginal: string;
  currentSentenceTranslated: string;
  fullHistory: ConversationHistory[];
}

function detectRegister(history: ConversationHistory[]): Register {
  const recentText = history
    .slice(-3)
    .map(h => h.original)
    .join(" ")
    .toLowerCase();

  const casualMarkers = /\b(yo|hey|gonna|wanna|gotta|yeah|nah|bro|dude|man|lol|omg|wtf)\b/;
  const formalMarkers = /\b(therefore|regarding|pursuant|sincerely|accordingly|whereas)\b/;
  const technicalMarkers = /\b(api|function|variable|deploy|server|debug|error|stack|async)\b/;
  const emotionalMarkers = /(!{2,}|\?{2,}|please|urgent|help|sorry|thank|love|hate)/;

  if (casualMarkers.test(recentText)) return "casual";
  if (formalMarkers.test(recentText)) return "formal";
  if (technicalMarkers.test(recentText)) return "technical";
  if (emotionalMarkers.test(recentText)) return "emotional";
  return "casual"; // default to casual for natural conversation
}

function isHallucination(text: string): boolean {
  const cleaned = text.trim().toLowerCase();

  // Empty or whitespace only
  if (!cleaned) return true;

  // Too short to be meaningful
  if (cleaned.length < 2) return true;

  // Known Whisper hallucination phrases
  const hallucinations = [
    "thank you.", "thanks.", "bye.", "bye bye.",
    "you.", "okay.", "ok.", "mm-hmm.", "hmm.",
    "uh.", "um.", "ah.", "oh.", "yeah.", "yes.",
    "no.", "merci.", "au revoir.", "bonjour.",
    "d'accord.", "oui.", "non.", "eh.",
    "subtitles by", "transcript by",
    "[ silence ]", "[silence]", "[ music ]"
  ];

  if (hallucinations.includes(cleaned)) return true;

  // Repetition loop: "hello hello hello hello"
  const words = cleaned.split(" ");
  if (words.length >= 4) {
    const unique = new Set(words);
    if (unique.size === 1) return true; // all same word
  }

  return false;
}

function buildInstructions(
  myLanguage: string,
  targetLanguage: string,
  register: Register,
  contextHistory: ConversationHistory[]
): string {
  const registerGuides = {
    casual: "Informal, natural, conversational. Contractions fine.",
    formal: "Formal, professional. No contractions.",
    technical: "Preserve all technical terms. Do not translate code or variable names.",
    emotional: "Match emotional intensity. Urgent stays urgent. Warm stays warm."
  };

  const historyBlock = contextHistory.length > 0
    ? `RECENT CONVERSATION:\n` +
      contextHistory.slice(-5)
        .map(h => `  "${h.original}" → "${h.translated}"`)
        .join("\n")
    : "";

  const sourceLang = myLanguage === 'en' ? 'English' : 'French';
  const targetLang = targetLanguage === 'en' ? 'English' : 'French';

  return `You are a professional real-time interpreter translating from ${sourceLang} to ${targetLang}.

${historyBlock}

CRITICAL TRANSLATION RULES:
1. ONLY translate the input - never add commentary, greetings, or explanations
2. Translate word-for-word preserving exact meaning and structure
3. If input is a question, translate the question - do NOT answer it
4. If input is a greeting to someone, translate that greeting exactly
5. Preserve all proper nouns, names, numbers, dates, and technical terms
6. Match the emotional tone and urgency exactly
7. Keep sentence structure as close to source as possible
8. Never invent, add, or remove content
9. If unclear, make best contextual guess - never say "I didn't understand"
10. For idioms, use equivalent idiom in ${targetLang} if one exists

REGISTER: ${registerGuides[register]}

EXAMPLES OF CORRECT TRANSLATION:
Input (EN): "Good morning Sarah, thank you for joining us today"
Output (FR): "Bonjour Sarah, merci de vous joindre à nous aujourd'hui"
NOT: "Bonjour, je suis content que vous soyez là"

Input (FR): "Comment allez-vous aujourd'hui?"
Output (EN): "How are you today?"
NOT: "I'm doing well, thank you"

Input (EN): "The meeting starts at 3 PM"
Output (FR): "La réunion commence à 15 heures"

Input (FR): "J'ai besoin d'aide avec ce projet"
Output (EN): "I need help with this project"

Remember: You are a translator, not a conversation participant. Translate exactly what is said.`;
}

function formatTranscript(text: string): string {
  if (!text) return text;

  let t = text.trim();

  // Capitalize first letter
  t = t.charAt(0).toUpperCase() + t.slice(1);

  // Add period if no terminal punctuation
  if (!/[.!?…]$/.test(t)) t += ".";

  // Fix common ASR artifacts
  t = t
    .replace(/\bi\b/g, "I")               // lowercase i → I
    .replace(/\s+/g, " ")                  // collapse spaces
    .replace(/\s([.,!?])/g, "$1")          // remove space before punctuation

  return t;
}

// Helper function to upsert transcripts
function upsert<T extends { id: string }>(array: T[], item: T): T[] {
  const index = array.findIndex(existing => existing.id === item.id);
  if (index >= 0) {
    return [...array.slice(0, index), item, ...array.slice(index + 1)];
  } else {
    return [...array, item];
  }
}

export function useOpenAIRealtime({
  myLanguage,
  targetLanguage,
  onMyTranscript,
  onIncomingTranscriptDelta,
  onIncomingTranscriptDone,
  onVoiceActivityStart,
  onVoiceActivityStop,
  sendTranscriptToBackend,
  onTranslatedAudioChunk
}: UseOpenAIRealtimeProps) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isMuted, setIsMuted] = useState(true); // Start muted
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [myTranscripts, setMyTranscripts] = useState<Array<{
    id: string;
    originalText: string;
    translatedText: string;
    status: 'streaming' | 'done';
    timestamp: number;
  }>>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const accumulatedTranscriptRef = useRef('');
  const audioOutputCtxRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<AudioWorkletNode | null>(null);

  // Conversation context for coherent translations
  const conversationContextRef = useRef<ConversationContext>({
    currentSentenceOriginal: '',
    currentSentenceTranslated: '',
    fullHistory: []
  });

  // Current register detection
  const currentRegisterRef = useRef<Register>('casual');

  // Word-level streaming state
  const activeSentenceRef = useRef<{
    id: string;
    speakerId: string;
    words: { original: string; translated: string }[];
    status: 'streaming' | 'done';
  } | null>(null);
  const responseActiveRef = useRef(false);
  const sentenceEndTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCommitTimeRef = useRef(0);
  const isMutedRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const onTranslatedAudioChunkRef = useRef<((chunk: { audio: string; timestamp: number; sequenceNumber?: number; responseId?: string }) => void) | undefined>();

  // Sequence number tracking for audio chunks (persists across renders)
  const sequenceNumberRef = useRef(0);
  const currentResponseIdRef = useRef<string | null>(null);

  // Update the callback ref when it changes
  useEffect(() => {
    onTranslatedAudioChunkRef.current = onTranslatedAudioChunk;
  }, [onTranslatedAudioChunk]);

  const startMic = useCallback(async () => {
    try {
      setStatus('connecting');

      // Step A: Get ephemeral token
      const tokenResponse = await fetch('/api/openai-token');
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('❌ [OpenAI] Token response:', errorText);
        throw new Error(`Failed to get OpenAI token (${tokenResponse.status}): Check backend API key configuration`);
      }
      
      let tokenData;
      try {
        const responseText = await tokenResponse.text();
        tokenData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ [OpenAI] JSON parse error:', parseError);
        throw new Error('Invalid token response format from backend');
      }
      
      if (!tokenData.client_secret?.value) {
        throw new Error('Invalid token data structure');
      }
      
      const token = tokenData.client_secret.value;
      console.log('✅ [OpenAI] Got ephemeral token');

      // Step B: Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Step C: Capture TTS track for relay, do NOT play locally
      pc.ontrack = (e) => {
        console.log('🔊 [OpenAI] TTS track received — capturing for relay, NOT playing locally');
        const remoteStream = e.streams[0];

        // Set up AudioContext to tap the incoming TTS
        const captureCtx = new AudioContext({ sampleRate: 24000 });

        captureCtx.audioWorklet.addModule('/audio-capture-processor.js').then(() => {
          const source = captureCtx.createMediaStreamSource(remoteStream);
          const captureNode = new AudioWorkletNode(captureCtx, 'audio-capture-processor');

          captureNode.port.onmessage = (evt) => {
            const { base64Chunk } = evt.data;
            if (base64Chunk && onTranslatedAudioChunkRef.current) {
              onTranslatedAudioChunkRef.current({
                audio: base64Chunk,
                timestamp: Date.now(),
                sequenceNumber: sequenceNumberRef.current++,
                responseId: currentResponseIdRef.current || 'unknown'
              });
            }
          };

          source.connect(captureNode);
          // Connect to silent destination — AudioContext requires connection
          const silentDest = captureCtx.createGain();
          silentDest.gain.value = 0;
          captureNode.connect(silentDest);
          silentDest.connect(captureCtx.destination);

          captureCtx.resume();

          // Store ref for mute/unmute pause
          (captureNode as any)._captureCtx = captureCtx;
          audioProcessorRef.current = captureNode;
        });
      };

      // Step D: Capture mic with preprocessing
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const audioCtx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = audioCtx;
      await audioCtx.audioWorklet.addModule('/mic-preprocess-processor.js');

      const source = audioCtx.createMediaStreamSource(stream);
      const preprocessNode = new AudioWorkletNode(audioCtx, 'mic-preprocess-processor');

      // Pipe processed audio back into a MediaStream
      const processedDest = audioCtx.createMediaStreamDestination();
      source.connect(preprocessNode);
      preprocessNode.connect(processedDest);

      // ── CONTINUOUS AUDIO STREAMING (Server VAD Mode) ──
      preprocessNode.port.onmessage = (e) => {
        const { pcm, rms } = e.data;

        // Update VAD meter
        setMicLevel(Math.min(100, Math.round(rms * 500)));

        // Skip sending if muted
        if (isMutedRef.current) return;

        // Only send audio if RMS is above noise threshold (filter silence)
        const NOISE_THRESHOLD = 0.0003;
        if (rms < NOISE_THRESHOLD) {
          return; // Skip silent frames to reduce OpenAI processing load
        }

        // ── Convert Float32 → PCM16 → base64 ──
        const float32 = new Float32Array(pcm);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32767));
        }
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(int16.buffer))
        );

        // ── Check WebSocket backpressure before sending ──
        if (dc.readyState === "open") {
          // Check bufferedAmount to prevent self-inflicted latency
          const BACKPRESSURE_THRESHOLD = 64 * 1024; // 64KB
          
          if ((dc as any).bufferedAmount !== undefined && (dc as any).bufferedAmount > BACKPRESSURE_THRESHOLD) {
            console.warn(`⚠️ WebSocket backpressure — skipping chunk (buffered: ${(dc as any).bufferedAmount} bytes)`);
            return; // Skip this chunk rather than blocking
          }
          
          // ── Continuously append audio to OpenAI buffer ──
          // Server VAD will automatically detect speech and trigger translation
          dc.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64
          }));
        }
      };

      // Use processed track
      const processedTrack = processedDest.stream.getAudioTracks()[0];
      processedTrack.enabled = false; // Start muted
      micTrackRef.current = processedTrack;
      pc.addTrack(processedTrack, processedDest.stream);

      // Step E: Set up DataChannel
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        console.log('📡 [OpenAI] DataChannel open');
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: buildInstructions(myLanguage, targetLanguage, currentRegisterRef.current, conversationContextRef.current.fullHistory),
            voice: 'shimmer',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
              language: myLanguage === 'en' ? 'en' : 'fr', // Use ISO 639-1 codes for Whisper
              temperature: 0.0, // Maximum accuracy for transcription
              prompt: `This is a conversation in ${myLanguage === 'en' ? 'English' : 'French'}. Transcribe exactly what is said, including filler words, repetitions, and natural speech patterns.`
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.4,        // Lower threshold for faster detection (0.0-1.0)
              prefix_padding_ms: 100, // Minimal padding for low latency
              silence_duration_ms: 200 // Short silence for continuous streaming
            },
            temperature: 0.1, // Lower temperature for more consistent translations
            max_response_output_tokens: 250 // Reasonable limit for translations
          }
        }));
      };

      // Step F: Handle DataChannel events
      dc.onmessage = (e) => {
        const event = JSON.parse(e.data);
        console.log('🎯 [OpenAI] Event:', event.type);

        switch (event.type) {
          case 'input_audio_buffer.speech_started':
            console.log('🎤 [OpenAI] Speech started - Server VAD detected voice activity');
            setIsVoiceActive(true);
            onVoiceActivityStart();
            
            // Cancel any in-progress response when new speech starts (interruption)
            if (responseActiveRef.current) {
              console.log('🛑 [OpenAI] Interrupting previous response');
              dc.send(JSON.stringify({ type: "response.cancel" }));
              responseActiveRef.current = false;
              
              // Send CLEAR_AUDIO to backend to flush other user's audio queue
              sendTranscriptToBackend({
                type: 'CLEAR_AUDIO',
                participantId: 'self',
                timestamp: Date.now()
              }, 'DELTA');
            }
            break;

          case 'input_audio_buffer.speech_stopped':
            console.log('🔇 [OpenAI] Speech stopped - Server VAD detected silence');
            setIsVoiceActive(false);
            onVoiceActivityStop();
            break;

          case 'conversation.item.input_audio_transcription.completed':
            // Filter hallucinations
            if (isHallucination(event.transcript)) {
              console.warn("[VAD] Hallucination filtered:", event.transcript);
              return;
            }

            // Format transcript
            const formattedTranscript = formatTranscript(event.transcript);

            // Initialize sentence if needed
            if (!activeSentenceRef.current) {
              activeSentenceRef.current = {
                id: nanoid(),
                speakerId: nanoid(),
                words: [],
                status: 'streaming'
              };
            }

            // Accumulate original text
            conversationContextRef.current.currentSentenceOriginal += (conversationContextRef.current.currentSentenceOriginal ? ' ' : '') + formattedTranscript;

            // Update UI
            setMyTranscripts(prev => upsert(prev, {
              id: activeSentenceRef.current!.id,
              originalText: conversationContextRef.current.currentSentenceOriginal,
              translatedText: conversationContextRef.current.currentSentenceTranslated,
              status: 'streaming',
              timestamp: Date.now()
            }));

            // Send delta to peer
            sendTranscriptToBackend({
              type: 'TRANSCRIPT_DELTA',
              sentenceId: activeSentenceRef.current.id,
              originalText: conversationContextRef.current.currentSentenceOriginal,
              translatedText: conversationContextRef.current.currentSentenceTranslated,
              wordCount: activeSentenceRef.current.words.length
            }, 'DELTA');
            break;

          case 'response.created':
            console.log('🎬 [OpenAI] Response created:', event.response.id);
            responseActiveRef.current = true;
            
            // Reset sequence number for new response
            if (currentResponseIdRef.current !== event.response.id) {
              console.log('🔢 [OpenAI] New response ID - resetting sequence counter');
              sequenceNumberRef.current = 0;
              currentResponseIdRef.current = event.response.id;
            }
            break;

          case 'response.audio_transcript.delta':
            accumulatedTranscriptRef.current += event.delta;
            // Update current sentence translation
            conversationContextRef.current.currentSentenceTranslated = accumulatedTranscriptRef.current;

            // Update UI with rAF debouncing
            if (!rafRef.current) {
              rafRef.current = requestAnimationFrame(() => {
                setMyTranscripts(prev => upsert(prev, {
                  id: activeSentenceRef.current!.id,
                  originalText: conversationContextRef.current.currentSentenceOriginal,
                  translatedText: conversationContextRef.current.currentSentenceTranslated,
                  status: 'streaming',
                  timestamp: Date.now()
                }));
                rafRef.current = undefined;
              });
            }

            // Send delta to peer
            sendTranscriptToBackend({
              type: 'TRANSCRIPT_DELTA',
              sentenceId: activeSentenceRef.current?.id || '',
              originalText: conversationContextRef.current.currentSentenceOriginal,
              translatedText: conversationContextRef.current.currentSentenceTranslated,
              wordCount: activeSentenceRef.current?.words.length || 0
            }, 'DELTA');
            break;

          case 'response.audio_transcript.done':
            // Full translation arrived
            responseActiveRef.current = false;
            const fullTranslation = accumulatedTranscriptRef.current.trim();

            // Update context
            conversationContextRef.current.currentSentenceTranslated = fullTranslation;

            // Update UI
            if (activeSentenceRef.current) {
              setMyTranscripts(prev => upsert(prev, {
                id: activeSentenceRef.current!.id,
                originalText: conversationContextRef.current.currentSentenceOriginal,
                translatedText: fullTranslation,
                status: 'streaming',
                timestamp: Date.now()
              }));
            }

            accumulatedTranscriptRef.current = '';
            break;

          case 'response.done':
            console.log('✅ [OpenAI] Response complete');
            responseActiveRef.current = false;
            
            // Archive completed sentence after a delay
            clearTimeout(sentenceEndTimerRef.current);
            sentenceEndTimerRef.current = setTimeout(() => {
              if (activeSentenceRef.current) {
                // Archive completed sentence
                conversationContextRef.current.fullHistory.push({
                  original: conversationContextRef.current.currentSentenceOriginal,
                  translated: conversationContextRef.current.currentSentenceTranslated
                });

                // Keep only last 10 exchanges
                if (conversationContextRef.current.fullHistory.length > 10) {
                  conversationContextRef.current.fullHistory.shift();
                }

                // Update register for next sentence
                currentRegisterRef.current = detectRegister(conversationContextRef.current.fullHistory);

                // Reset current sentence
                conversationContextRef.current.currentSentenceOriginal = "";
                conversationContextRef.current.currentSentenceTranslated = "";

                // Mark sentence as done
                setMyTranscripts(prev => upsert(prev, {
                  id: activeSentenceRef.current!.id,
                  originalText: activeSentenceRef.current!.words.map(w => w.original).join(' '),
                  translatedText: activeSentenceRef.current!.words.map(w => w.translated).filter(Boolean).join(' '),
                  status: "done",
                  timestamp: Date.now()
                }));

                // Send sentence done to backend
                sendTranscriptToBackend("", "SENTENCE_DONE");
                activeSentenceRef.current = null;
              }
            }, 1500);
            break;

          case 'response.cancelled':
            console.log('🛑 [OpenAI] Response cancelled');
            responseActiveRef.current = false;
            
            // Send CLEAR_AUDIO to backend when response is cancelled
            sendTranscriptToBackend({
              type: 'CLEAR_AUDIO',
              participantId: 'self',
              timestamp: Date.now()
            }, 'DELTA');
            break;

          case 'error':
            console.error('[OpenAI] Error:', event.error);
            setStatus('error');
            break;
        }
      };

      // Step G: SDP offer/answer exchange
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/sdp'
        },
        body: offer.sdp
      });

      if (!sdpResponse.ok) throw new Error('SDP exchange failed');

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setStatus('connected');
      console.log('✅ [OpenAI] WebRTC connection established');

    } catch (error) {
      console.error('❌ [OpenAI] Setup failed:', error);
      setStatus('error');
    }
  }, [myLanguage, targetLanguage, onMyTranscript, onIncomingTranscriptDelta, onIncomingTranscriptDone, onVoiceActivityStart, onVoiceActivityStop, sendTranscriptToBackend, onTranslatedAudioChunk]);

  const mute = useCallback(() => {
    if (micTrackRef.current) {
      micTrackRef.current.enabled = false;
      setIsMuted(true);
    }
    isMutedRef.current = true;
    
    // Clear any buffered audio when muting
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    }
    
    // PAUSE capture so silence isn't relayed to peer
    if (audioProcessorRef.current) {
      (audioProcessorRef.current as any).port.postMessage({ paused: true });
    }
  }, []);

  const unmute = useCallback(() => {
    if (micTrackRef.current) {
      micTrackRef.current.enabled = true;
      setIsMuted(false);
    }
    isMutedRef.current = false;
    if (audioCtxRef.current) {
      audioCtxRef.current.resume();
    }
    
    // RESUME capture
    if (audioProcessorRef.current) {
      (audioProcessorRef.current as any).port.postMessage({ paused: false });
    }
  }, []);

  const stopMic = useCallback(() => {
    if (micTrackRef.current) {
      micTrackRef.current.stop();
      micTrackRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }
    if (audioOutputCtxRef.current) {
      audioOutputCtxRef.current.close();
      audioOutputCtxRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  return {
    status,
    isMuted,
    isVoiceActive,
    startMic,
    stopMic,
    mute,
    unmute
  };
}