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

  return `
    You are a professional real-time interpreter.
    Input language: ${myLanguage}
    Output language: ${targetLanguage}
    Register: ${registerGuides[register]}

    ${historyBlock}

    RULES:
    1. Translate ONLY. No commentary, no additions, no greetings.
    2. Output the complete updated translation of the sentence so far.
    3. Never translate proper nouns, phone numbers, URLs, or code.
    4. Preserve tone, emotion, and urgency exactly.
    5. If a word is unclear, use best contextual guess.
       Never output "I didn't understand" or "[inaudible]".
    6. Keep translations concise — do not pad or expand meaning.
    7. For idiomatic expressions, use the equivalent idiom in
       ${targetLanguage} — do not translate literally.
  `;
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
  sendTranscriptToBackend
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

  const startMic = useCallback(async () => {
    try {
      setStatus('connecting');

      // Step A: Get ephemeral token
      const tokenResponse = await fetch('/api/openai-token');
      if (!tokenResponse.ok) throw new Error('Failed to get OpenAI token');
      const tokenData = await tokenResponse.json();
      const token = tokenData.client_secret.value;

      // Step B: Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Step C: Set up remote audio
      const audioEl = new Audio();
      audioEl.autoplay = true;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
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

      // ── TWO-TIER AUDIO SEND LOOP ──
      preprocessNode.port.onmessage = (e) => {
        const { pcm, rms, wordBoundary, phraseBoundary, commitEnergy, commitDurationMs } = e.data;

        // Update VAD meter
        setMicLevel(Math.min(100, Math.round(rms * 500)));

        // Skip sending if muted
        if (isMutedRef.current) return;

        // ── STEP 1: Convert Float32 → PCM16 → base64 ──
        const float32 = new Float32Array(pcm);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32767));
        }
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(int16.buffer))
        );

        // ── STEP 2: Append audio chunk to OpenAI buffer ──
        if (dc.readyState === "open") {
          dc.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64
          }));
        }

        // ── STEP 3: Handle boundaries ──
        if ((wordBoundary || phraseBoundary) && dc.readyState === "open") {
          lastCommitTimeRef.current = Date.now();

          // Energy-based hallucination filter
          const MIN_ENERGY = 0.0003;  // minimum average RMS² to be real speech
          const MIN_DURATION = 120;   // minimum 120ms of speech to commit

          if (commitEnergy < MIN_ENERGY || commitDurationMs < MIN_DURATION) {
            // Too short or too quiet — likely noise, not speech
            console.warn("[VAD] Low energy/duration, clearing buffer:", { commitEnergy, commitDurationMs });
            dc.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
            return;
          }

          // Cancel any in-progress response
          if (responseActiveRef.current) {
            dc.send(JSON.stringify({ type: "response.cancel" }));
            responseActiveRef.current = false;
          }

          // Commit the buffered audio
          dc.send(JSON.stringify({
            type: "input_audio_buffer.commit"
          }));

          // Choose modalities based on boundary type
          const modalities = phraseBoundary ? ["text", "audio"] : ["text"];
          const instructions = phraseBoundary
            ? buildInstructions(myLanguage, targetLanguage, currentRegisterRef.current, conversationContextRef.current.fullHistory)
            : `Transcribe the new audio fragment. Output only the transcription.`;

          // Request response
          dc.send(JSON.stringify({
            type: "response.create",
            response: {
              modalities,
              instructions
            }
          }));

          responseActiveRef.current = true;

          // Set up sentence end timer (2s silence = sentence done)
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
          }, 2000);
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
              language: myLanguage,
              temperature: 0.0, // Maximum accuracy for transcription
              prompt: `This is a conversation in ${myLanguage === 'en' ? 'English' : 'French'}. Transcribe exactly what is said, including filler words, repetitions, and natural speech patterns.`
            },
            turn_detection: null,   // ← MANUAL CONTROL — no server VAD
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
          case 'conversation.item.input_audio_transcription.completed':
            // Filter hallucinations
            if (isHallucination(event.transcript)) {
              console.warn("[VAD] Hallucination filtered:", event.transcript);
              dc.send(JSON.stringify({ type: "response.cancel" }));
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

          case 'input_audio_buffer.speech_started':
            setIsVoiceActive(true);
            onVoiceActivityStart();
            break;

          case 'input_audio_buffer.speech_stopped':
            setIsVoiceActive(false);
            onVoiceActivityStop();
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
  }, [myLanguage, targetLanguage, onMyTranscript, onIncomingTranscriptDelta, onIncomingTranscriptDone, onVoiceActivityStart, onVoiceActivityStop, sendTranscriptToBackend]);

  const mute = useCallback(() => {
    if (micTrackRef.current) {
      micTrackRef.current.enabled = false;
      setIsMuted(true);
    }
    isMutedRef.current = true;
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