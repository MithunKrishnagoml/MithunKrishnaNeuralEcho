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

function buildInstructions(inputLang: string, outputLang: string) {
  const inputLangName = inputLang === "en" ? "English" : "French";
  const outputLangName = outputLang === "en" ? "English" : "French";

  return `You are a professional real-time translator specializing in conversational ${inputLangName} to ${outputLangName} translation.

CORE PRINCIPLES:
- Translate ONLY the spoken content. Never add greetings, commentary, or explanations.
- Maintain exact meaning, tone, and natural flow of conversation.
- Preserve all proper names, numbers, dates, and technical terms exactly as spoken.
- Use appropriate formality level matching the speaker's tone.
- For ambiguous words, choose the most common conversational meaning.

TRANSLATION QUALITY:
- Use natural, conversational ${outputLangName} that sounds like a native speaker.
- Maintain sentence structure and rhythm for real-time comprehension.
- Handle idioms, slang, and colloquial expressions appropriately.
- Preserve emotional tone: enthusiasm, hesitation, emphasis, questions.

TECHNICAL ACCURACY:
- Numbers: "twenty-three" → "vingt-trois", "2024" → "deux mille vingt-quatre"
- Dates: "March 15th" → "le quinze mars", "next Tuesday" → "mardi prochain"
- Names: Keep exactly as pronounced, don't translate.
- Technical terms: Use standard translations when appropriate.

CONVERSATION FLOW:
- Respond immediately to maintain conversation rhythm.
- Handle interruptions and topic changes smoothly.
- Maintain context from previous utterances when appropriate.

You are a translation engine, not a conversational AI. Output only the translation.`;
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

      // ── WORD-LEVEL AUDIO SEND LOOP ──
      preprocessNode.port.onmessage = (e) => {
        const { pcm, rms, wordBoundary } = e.data;

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

        // ── STEP 3: On word boundary — commit + request response ──
        if (wordBoundary && dc.readyState === "open") {
          lastCommitTimeRef.current = Date.now();

          // Cancel any in-progress response for this speaker
          if (responseActiveRef.current) {
            dc.send(JSON.stringify({ type: "response.cancel" }));
            responseActiveRef.current = false;
          }

          // Commit the buffered audio as a completed utterance
          dc.send(JSON.stringify({
            type: "input_audio_buffer.commit"
          }));

          // Immediately request translation + TTS
          dc.send(JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text", "audio"],
              instructions: `Translate the last utterance from ${myLanguage} to ${targetLanguage}. Output ONLY the translation. Speak it immediately.`
            }
          }));

          responseActiveRef.current = true;

          // Set up sentence end timer (2s silence = sentence done)
          clearTimeout(sentenceEndTimerRef.current);
          sentenceEndTimerRef.current = setTimeout(() => {
            if (activeSentenceRef.current) {
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
            instructions: buildInstructions(myLanguage, targetLanguage),
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
            // This fires per commit (per word)
            if (!activeSentenceRef.current) {
              activeSentenceRef.current = {
                id: nanoid(),
                speakerId: nanoid(),
                words: [],
                status: 'streaming'
              };
            }
            activeSentenceRef.current.words.push({
              original: event.transcript.trim(),
              translated: ''
            });
            // Update UI with accumulated original words
            setMyTranscripts(prev => upsert(prev, {
              id: activeSentenceRef.current!.id,
              originalText: activeSentenceRef.current!.words.map(w => w.original).join(' '),
              translatedText: activeSentenceRef.current!.words.map(w => w.translated).filter(Boolean).join(' '),
              status: 'streaming',
              timestamp: Date.now()
            }));
            break;

          case 'response.audio_transcript.delta':
            accumulatedTranscriptRef.current += event.delta;
            onIncomingTranscriptDelta(event.delta);
            break;

          case 'response.audio_transcript.done':
            // Translated word arrived
            responseActiveRef.current = false;
            const translatedWord = accumulatedTranscriptRef.current.trim();
            if (activeSentenceRef.current && activeSentenceRef.current.words.length > 0) {
              const lastWord = activeSentenceRef.current.words[activeSentenceRef.current.words.length - 1];
              if (lastWord) lastWord.translated = translatedWord;
            }

            // Update UI with accumulated translation
            if (activeSentenceRef.current) {
              setMyTranscripts(prev => upsert(prev, {
                id: activeSentenceRef.current!.id,
                originalText: activeSentenceRef.current.words.map(w => w.original).join(' '),
                translatedText: activeSentenceRef.current.words.map(w => w.translated).filter(Boolean).join(' '),
                status: 'streaming',
                timestamp: Date.now()
              }));

              // Relay accumulated translation to peer via backend WS
              sendTranscriptToBackend({
                type: 'TRANSCRIPT_DELTA',
                sentenceId: activeSentenceRef.current.id,
                originalText: activeSentenceRef.current.words.map(w => w.original).join(' '),
                translatedText: activeSentenceRef.current.words.map(w => w.translated).filter(Boolean).join(' '),
                wordCount: activeSentenceRef.current.words.length
              }, 'DELTA');
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