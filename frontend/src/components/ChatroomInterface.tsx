import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Users, 
  MessageCircle, 
  LogOut,
  Loader2,
  Share2,
  Waves,
  FileText,
  Download,
  Hand,
  Zap,
  ScrollText
} from 'lucide-react';
import { ChatroomParticipant, ChatroomMessage } from '@/types/chatroom';
import { useAppState } from '@/contexts/AppContext';
import { useChatroomConnection } from '@/hooks/useChatroomConnection';
import { useRoomTranslation } from '@/hooks/useRoomTranslation';
import { useStreamingState } from '@/hooks/useStreamingState';
import { useTranscriptRecording } from '@/hooks/useTranscriptRecording';
import { useVoiceActivityDetection } from '@/hooks/useVoiceActivityDetection';
import { useTranscripts } from '@/hooks/useTranscripts';
import { TranscriptDisplay } from '@/components/TranscriptDisplay';
import { RecordingControls } from '@/components/RecordingControls';
import { StreamingTranscript } from '@/components/StreamingTranscript';
import { TranslatingIndicator } from '@/components/TranslatingIndicator';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { FifoAudioQueue } from '@/audio/FifoAudioQueue';
import { toast } from 'sonner';

interface ChatroomInterfaceProps {
  roomId: string;
  participant: ChatroomParticipant;
  onLeaveRoom: () => void;
}

interface DisplayMessage {
  id: string;
  timestamp: number;
  isOwnMessage: boolean;
  displayText: string;
  source: 'local' | 'server';
}

const normalizeLang = (lang?: string) => (lang || '').toLowerCase().split('-')[0];
const isSameLanguage = (a?: string, b?: string) => normalizeLang(a) === normalizeLang(b);

export function ChatroomInterface({ roomId, participant, onLeaveRoom }: ChatroomInterfaceProps) {
  const [isMuted, setIsMuted] = useState(true); // Start muted by default
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [incomingTranscript, setIncomingTranscript] = useState(''); // Translated transcript from other speaker
  const [isOtherSpeaking, setIsOtherSpeaking] = useState(false); // Is other person speaking?
  const [isHandsFreeMode, setIsHandsFreeMode] = useState(false); // Hands-free mode toggle
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false); // VAD indicator for remote user
  const isPlayingAudioRef = useRef(false); // Track if we're playing incoming audio
  const audioQueueRef = useRef<FifoAudioQueue | null>(null); // Streaming audio queue

  // Realtime transcript management
  const {
    myTranscript,
    theirTranscript,
    handleInputDelta,
    handleInputDone,
    handleOutputDelta,
    handleOutputDone,
    clearMyTranscript,
    clearTheirTranscript,
  } = useTranscripts();

  const {
    streamingState,
    addPartialTranscript,
    addTranslationDelta,
    addAudioChunk,
    setVoiceActivity,
    completePartialTranscript,
    completeTranslationStream,
    getPartialTranscriptText,
    getTranslationText,
  } = useStreamingState();

  // Room connection and messaging
  const { 
    isConnected, 
    messages, 
    otherParticipant,
    lastTranslation,
    sendTranscript,
    sendAudioStream,
    sendTranslatedAudio,
    sendBilingualMessage,
    sendPartialTranscript,
    sendTranslationDelta,
    sendAudioChunk,
    sendAudioStreamEnd,
    sendAIAudioChunk,
    sendAIAudioEnd,
    sendVoiceActivity,
    handleUserGesture: handleChatroomUserGesture
  } = useChatroomConnection({
    roomId,
    participant,
    onEvent: (event) => {
      console.log(' [ChatroomInterface] Room event received:', event.type);
      
      // Handle streaming audio chunks
      if (event.type === 'translation_audio_chunk') {
        console.log(` [STREAMING AUDIO] Received chunk #${event.seq} from ${event.speakerId}`);
        // Only play translation audio if it's from the OTHER participant (not your own voice)
        if (audioQueueRef.current && event.speakerId !== participant.id) {
          audioQueueRef.current.enqueue(event.audio, event.seq);
        }
        return;
      }
      
      // Handle translation interruption
      if (event.type === 'translation_interrupted') {
        console.log(` [STREAMING AUDIO] Translation interrupted by ${event.speakerId}`);
        if (audioQueueRef.current) {
          audioQueueRef.current.flush();
        }
        setIsRemoteSpeaking(false);
        return;
      }
      
      // Handle audio done signal
      if (event.type === 'translation_audio_done') {
        console.log(` [STREAMING AUDIO] Translation audio complete from ${event.speakerId}`);
        // Queue drains itself, no action needed
        return;
      }
      
      // Handle VAD speaking indicator
      if (event.type === 'vad_speaking') {
        console.log(` [VAD] Speaker ${event.speakerId} speaking: ${event.speaking}`);
        if (event.speakerId !== participant.id) {
          setIsRemoteSpeaking(event.speaking);
        }
        return;
      }

      // Handle input transcript delta (my own words streaming)
      if (event.type === 'transcript_input_delta') {
        console.log(` [INPUT TRANSCRIPT DELTA] "${event.text}"`);
        handleInputDelta(event.text);
        return;
      }

      // Handle input transcript done (my own words finalized)
      if (event.type === 'transcript_input_done') {
        console.log(` [INPUT TRANSCRIPT DONE] "${event.text}"`);
        handleInputDone(event.text);
        return;
      }

      // Handle output transcript delta (translated text streaming)
      if (event.type === 'transcript_output_delta') {
        console.log(` [OUTPUT TRANSCRIPT DELTA] "${event.text}"`);
        handleOutputDelta(event.text);
        return;
      }

      // Handle output transcript done (translated text finalized)
      if (event.type === 'transcript_output_done') {
        console.log(` [OUTPUT TRANSCRIPT DONE] "${event.text}"`);
        handleOutputDone(event.text);
        return;
      }
      
      if (event.type === 'USER_JOINED_ROOM') {
        console.log(' [ChatroomInterface] New participant joined! Total:', event.participantCount);
        
        // If the other user joined and we selected English, prompt them to select Canadien français
        if (event.participantCount === 2 && participant.language === 'en-US' && event.newParticipantLanguage !== 'fr-CA') {
          toast.info('Suggest Canadien français', {
            description: `${event.newParticipantName || 'The other participant'} joined! For best translation results, suggest they select "Canadien français" as their language.`,
            duration: 6000
          });
        }
      }
      
      if (event.type === 'WAITING_FOR_PARTICIPANT') {
        console.log('⏳ [ChatroomInterface] Waiting for other participant to join');
        toast.info('Waiting for participant', {
          description: 'Waiting for the other participant to join...',
          duration: 5000
        });
      }
      
      if (event.type === 'translation_ready') {
        console.log('✅ ═══════════════════════════════════════════════════════');
        console.log('✅ [ChatroomInterface] Translation session is ready with 2 participants!');
        console.log('✅ [ChatroomInterface] Initializing audio session now');
        console.log('✅ ═══════════════════════════════════════════════════════');
        
        // Initialize audio session now that both users are present
        initAudioSession();
        
        toast.success('Connected — translation is live', {
          description: 'Both participants connected. You can now start speaking.',
          duration: 3000
        });
      }
      
      if (event.type === 'PARTICIPANT_LEFT') {
        console.log('⚠️ [ChatroomInterface] Other participant left the room');
        
        // Pause audio session
        pauseAudioSession();
        
        toast.warning('Participant disconnected', {
          description: 'Other participant disconnected. Waiting for them to rejoin...',
          duration: 5000
        });
      }
      
      if (event.type === 'SPEECH_TRANSCRIPT') {
        // When other person starts speaking, show "translating" indicator
        if (event.fromParticipant !== participant.id) {
          console.log(' [ChatroomInterface] Other participant started speaking');
          console.log(' [ChatroomInterface] Original text:', event.originalText);
          console.log(' [ChatroomInterface] Original language:', event.originalLanguage);
          setIsOtherSpeaking(true);
          setIncomingTranscript(''); // Clear any previous transcript
        } else {
          console.log(' [ChatroomInterface] My own speech transcript received (ignoring)');
        }
      }

      if (event.type === 'PARTIAL_TRANSCRIPT') {
        if (!participant.id) {
          console.warn('⚠️ [PARTIAL_TRANSCRIPT] participant.id is not set, allowing audio through');
        } else if (event.participantId === participant.id) {
          console.log('ℹ️ [PARTIAL_TRANSCRIPT] Filtering own transcript');
          return;
        }
        addPartialTranscript(event.delta, event.itemId);
      }

      if (event.type === 'TRANSLATION_DELTA') {
        if (!participant.id) {
          console.warn('⚠️ [TRANSLATION_DELTA] participant.id is not set, allowing through');
        } else if (event.participantId === participant.id) {
          console.log('ℹ️ [TRANSLATION_DELTA] Filtering own translation');
          return;
        }
        addTranslationDelta(event.delta, event.responseId, event.targetLanguage);
      }

      // Handle AI audio chunks (from OpenAI, relayed by backend)
      if (event.type === 'AI_AUDIO_CHUNK') {
        console.log(`🤖 [AI_AUDIO_CHUNK] Received seq ${event.seq} from ${event.fromParticipant}`);
        // Play AI audio for ALL participants (both users hear the AI voice)
        playIncomingAudioChunk(event.audioData, `ai_${event.fromParticipant}_${event.seq}`);
      }

      if (event.type === 'AUDIO_CHUNK') {
        if (!participant.id) {
          console.warn('⚠️ [AUDIO_CHUNK] participant.id is not set, allowing audio through');
        } else if (event.participantId === participant.id) {
          console.log('ℹ️ [AUDIO_CHUNK] Filtering own audio');
          return;
        }
        addAudioChunk(event.audioData, event.responseId);
        playIncomingAudioChunk(event.audioData, event.responseId);
      }

      if (event.type === 'VOICE_ACTIVITY_STARTED') {
        if (!participant.id) {
          console.warn('⚠️ [VOICE_ACTIVITY_STARTED] participant.id is not set, allowing through');
        } else if (event.participantId === participant.id) {
          console.log('ℹ️ [VOICE_ACTIVITY_STARTED] Filtering own activity');
          return;
        }
        setVoiceActivity(true);
      }

      if (event.type === 'VOICE_ACTIVITY_STOPPED') {
        if (!participant.id) {
          console.warn('⚠️ [VOICE_ACTIVITY_STOPPED] participant.id is not set, allowing through');
        } else if (event.participantId === participant.id) {
          console.log('ℹ️ [VOICE_ACTIVITY_STOPPED] Filtering own activity');
          return;
        }
        setVoiceActivity(false);
      }
      
      if (event.type === 'TRANSLATED_MESSAGE') {
        console.log(' [ChatroomInterface] Received translated message:', event.message.translatedText);
        
        // Clear the "other speaking" indicator
        setIsOtherSpeaking(false);
        
        // Add to transcript history
        addTranscriptMessage(
          event.message.participantId,
          event.message.participantId === participant.id ? participant.name : (otherParticipant?.name || 'Other'),
          event.message.originalText,
          event.message.translatedText,
          event.message.originalLanguage,
          event.message.targetLanguage
        );
      }
      
      if (event.type === 'BILINGUAL_MESSAGE') {
        console.log(' [BILINGUAL] Received bilingual message:', event.message);
        console.log(' [BILINGUAL] Speaker ID:', event.message.speakerId, 'My ID:', participant.id);
        console.log(' [BILINGUAL] Original language:', event.message.originalLanguage, 'My language:', participant.language);
        console.log(' [BILINGUAL] Original text:', event.message.originalText);
        console.log(' [BILINGUAL] Translated text:', event.message.translatedText);
        
        // Clear the "other speaking" indicator
        setIsOtherSpeaking(false);
        setVoiceActivity(false);
        completePartialTranscript();
        completeTranslationStream();
        
        // Determine what text to show based on participant's language
        const shouldShowOriginal = isSameLanguage(participant.language, event.message.originalLanguage);
        const displayText = shouldShowOriginal ? event.message.originalText : event.message.translatedText;
        
        console.log(' [BILINGUAL] Should show original?', shouldShowOriginal);
        console.log(' [BILINGUAL] Display text:', displayText);
        
        // Show the text in real-time for BOTH participants
        // If it's from the other person, show it as incoming
        // If it's from me, it's already shown in currentTranscript
        if (event.message.speakerId !== participant.id) {
          console.log(' [BILINGUAL] Message from OTHER participant, showing as incoming');
          setIncomingTranscript(displayText);
          
          // Clear after a short delay (message will be in chat history)
          setTimeout(() => {
            setIncomingTranscript('');
          }, 3000);
        } else {
          console.log(' [BILINGUAL] Message from ME, already shown in currentTranscript');
        }
      }
      
      if (event.type === 'USER_LEFT_ROOM') {
        toast.info('Other participant left the room');
      }
    }
  });

  // Room-based translation integration
  const {
    status,
    sessionState,
    isVoiceReady,
    bothUsersReady,
    initAudioSession,
    pauseAudioSession,
    startRoomListening,
    stopRoomListening,
    isListening,
    isTranslating,
    localMessages,
    playIncomingAudioChunk,
    handleUserGesture: handleRoomUserGesture
  } = useRoomTranslation({
    roomId,
    participant,
    sendTranscript,
    sendTranslatedAudio,
    sendBilingualMessage,
    sendPartialTranscript,
    sendTranslationDelta,
    sendAudioChunk,
    sendAudioStreamEnd,
    sendAIAudioChunk,
    sendAIAudioEnd,
    sendVoiceActivity,
    isConnected
  });

  // Transcript and recording management
  const {
    transcriptHistory,
    addTranscriptMessage,
    getTranscriptForUser,
    recording,
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    downloadRecording,
    downloadTranscriptTXT,
    downloadTranscriptJSON,
    downloadServerTranscriptTXT,
    downloadServerTranscriptJSON,
    getSessionStats,
    sessionStats,
    formatDuration
  } = useTranscriptRecording({
    roomId,
    participant,
    otherParticipant
  });

  // Get actual audio level from the voice hook
  const { currentDbLevel, dbThreshold } = useAppState();
  const audioLevel = currentDbLevel || -100;
  const isVoiceRecording = isListening || isTranslating;

  // Voice Activity Detection for hands-free mode
  const vad = useVoiceActivityDetection(
    {
      energyThreshold: 0.015,
      silenceTimeout: 1500, // 1.5 seconds for mid-sentence pauses
      minSpeechDuration: 300, // 300ms minimum to avoid noise
      debug: true,
    },
    {
      onSpeechStart: () => {
        console.log('🎤 [VAD] Speech started');
        if (isHandsFreeMode && !isPlayingAudioRef.current && isVoiceReady && otherParticipant) {
          console.log('🎤 [VAD] Starting room listening (hands-free)');
          startRoomListening();
        }
      },
      onSpeechEnd: () => {
        console.log('🎤 [VAD] Speech ended');
        if (isHandsFreeMode && isListening) {
          console.log('🎤 [VAD] Stopping room listening (hands-free)');
          stopRoomListening();
        }
      },
    }
  );

  // Initialize audio queue on mount
  useEffect(() => {
    console.log(' [AUDIO QUEUE] Initializing FifoAudioQueue');
    audioQueueRef.current = new FifoAudioQueue();
    
    return () => {
      console.log(' [AUDIO QUEUE] Cleaning up FifoAudioQueue');
      if (audioQueueRef.current) {
        audioQueueRef.current.destroy();
        audioQueueRef.current = null;
      }
    };
  }, []);

  // Toggle mute/unmute - when unmuting, enable hands-free mode
  const toggleMute = useCallback(async () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    
    if (!newMutedState) {
      // Unmuting - enable hands-free mode and resume AudioContext
      setIsHandsFreeMode(true);
      
      // Resume AudioContext for autoplay policy
      if (audioQueueRef.current) {
        try {
          await audioQueueRef.current.resume();
          console.log(' [AUDIO QUEUE] AudioContext resumed on unmute');
        } catch (error) {
          console.error(' [AUDIO QUEUE] Failed to resume AudioContext:', error);
        }
      }
      
      toast.success('Microphone enabled', {
        description: 'Speak naturally - your voice will be detected automatically',
      });
      
      // Start VAD for hands-free mode
      try {
        await vad.start();
      } catch (error) {
        console.error('Failed to start VAD:', error);
        toast.error('Failed to start microphone. Please check microphone permissions.');
        setIsMuted(true);
        setIsHandsFreeMode(false);
      }
    } else {
      // Muting - disable hands-free mode
      setIsHandsFreeMode(false);
      toast.info('Microphone muted', {
        description: 'Click the mic button to speak again',
      });
      
      // Stop VAD
      vad.stop();
      
      // Stop any active listening
      if (isListening) {
        stopRoomListening();
      }
    }
  }, [isMuted, vad, isListening, stopRoomListening]);

  // Handle incoming audio playback - stop VAD temporarily to avoid echo
  useEffect(() => {
    if (streamingState.isOtherSpeaking || isOtherSpeaking) {
      console.log('🔊 [Audio] Other person speaking, pausing VAD');
      isPlayingAudioRef.current = true;
      
      // If we're currently speaking in hands-free mode, stop
      if (isHandsFreeMode && isListening) {
        console.log('🔊 [Audio] Interruption detected - stopping local speech');
        stopRoomListening();
      }
    } else {
      console.log('🔊 [Audio] Other person stopped speaking, resuming VAD');
      isPlayingAudioRef.current = false;
    }
  }, [streamingState.isOtherSpeaking, isOtherSpeaking, isHandsFreeMode, isListening, stopRoomListening]);

  // Cleanup VAD on unmount or when leaving hands-free mode
  useEffect(() => {
    return () => {
      if (vad.isActive) {
        vad.stop();
      }
    };
  }, []);

  // Keyboard shortcut: M key toggles mute
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        // Don't trigger if user is typing in an input field
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }
        
        e.preventDefault();
        toggleMute();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [toggleMute]);

  const displayMessages = useMemo(() => {
    const combined: DisplayMessage[] = [];

    localMessages.forEach(msg => {
      const translationForParticipant = msg.translations?.[participant.language];
      const displayText = isSameLanguage(participant.language, msg.sourceLang)
        ? msg.sourceText
        : (translationForParticipant || '');
      const hasNonLatinScript = !!displayText && /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(displayText);

      if (displayText && displayText.trim() && !hasNonLatinScript) {
        combined.push({
          id: msg.id,
          timestamp: msg.timestamp,
          isOwnMessage: true,
          displayText,
          source: 'local',
        });
      }
    });

    messages.forEach(msg => {
      let displayText = '';
      // Show text in participant's language
      // If original is in their language, show original; otherwise show translation
      console.log('🔍 [ChatroomInterface] Processing message for display:', {
        messageId: msg.id,
        participantLanguage: participant.language,
        originalLanguage: msg.originalLanguage,
        targetLanguage: msg.targetLanguage,
        originalText: msg.originalText?.substring(0, 30),
        translatedText: msg.translatedText?.substring(0, 30)
      });
      
      if (isSameLanguage(msg.originalLanguage, participant.language)) {
        displayText = msg.originalText;
        console.log('🔍 [ChatroomInterface] Showing ORIGINAL (matches participant language)');
      } else {
        // The translation should be in the participant's language (targetLanguage)
        displayText = msg.translatedText;
        console.log('🔍 [ChatroomInterface] Showing TRANSLATION (different from participant language)');
      }
      const hasNonLatinScript = !!displayText && /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u0900-\u097F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(displayText);

      if (displayText && displayText.trim() && !hasNonLatinScript) {
        combined.push({
          id: msg.id,
          timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : new Date(msg.timestamp).getTime(),
          isOwnMessage: msg.participantId === participant.id,
          displayText,
          source: 'server',
        });
        console.log('✅ [ChatroomInterface] Added message to display:', {
          id: msg.id,
          displayText: displayText.substring(0, 30)
        });
      } else {
        console.log('⚠️ [ChatroomInterface] Skipped message (empty or non-Latin):', {
          id: msg.id,
          hasText: !!displayText,
          hasNonLatinScript
        });
      }
    });

    const serverMessageIds = new Set(messages.map(m => m.id));
    const dedupedBySource = combined.filter(msg => msg.source === 'server' || !serverMessageIds.has(msg.id));
    const uniqueById = dedupedBySource.filter((msg, index, self) => index === self.findIndex(m => m.id === msg.id));

    uniqueById.sort((a, b) => a.timestamp - b.timestamp);
    return uniqueById;
  }, [localMessages, messages, participant.id, participant.language]);

  // Set up global callback for sending translated audio to room
  useEffect(() => {
    (window as any).sendTranslatedAudioToRoom = (audioData: string, originalText: string, translatedText: string) => {
      console.log(' [GLOBAL CALLBACK] Sending translated audio to room');
      sendTranslatedAudio(audioData, originalText, translatedText);
    };
    
    return () => {
      delete (window as any).sendTranslatedAudioToRoom;
    };
  }, [sendTranslatedAudio]);

  // Debug: Log the individual states that make up isVoiceRecording
  useEffect(() => {
    console.log(' [isVoiceRecording calculation]:', {
      isVoiceRecording,
      isListening,
      isTranslating,
      calculation: `${isListening} || ${isTranslating} = ${isVoiceRecording}`
    });
  }, [isVoiceRecording, isListening, isTranslating]);

  // Debug: Monitor voice recording state changes
  useEffect(() => {
    console.log(' [ChatroomInterface] Voice recording state changed:', {
      isVoiceRecording,
      isListening,
      isTranslating,
      status,
      sessionState
    });
  }, [isVoiceRecording, isListening, isTranslating, status, sessionState]);

  // Debug: Monitor button disabled state
  useEffect(() => {
    const isButtonDisabled = !isVoiceReady || !isConnected || !otherParticipant;
    console.log(' [ChatroomInterface] Button state:', {
      isButtonDisabled,
      isVoiceReady,
      isConnected,
      hasOtherParticipant: !!otherParticipant,
      otherParticipantId: otherParticipant?.id
    });
  }, [isVoiceReady, isConnected, otherParticipant]);

  // Debug: Monitor transcript history changes
  useEffect(() => {
    console.log(' [ChatroomInterface] Transcript history updated:', {
      count: transcriptHistory.length,
      messages: transcriptHistory.map(m => ({
        id: m.messageId,
        speaker: m.speakerId,
        text: m.originalTranscript?.substring(0, 50) + '...'
      }))
    });
  }, [transcriptHistory]);

  // Debug: Monitor room messages
  useEffect(() => {
    console.log(' [ChatroomInterface] Room messages updated:', {
      count: messages.length,
      localCount: localMessages.length,
      messages: messages.map(m => ({
        id: m.id,
        participant: m.participantId,
        text: m.originalText?.substring(0, 30) + '...'
      }))
    });
  }, [messages.length, localMessages.length]);

  const getLanguageDisplay = (lang: 'en-US' | 'fr-CA') => {
    return lang === 'en-US' ? '🇺🇸 English' : '🇨🇦 Français';
  };

  const getOtherLanguage = () => {
    return participant.language === 'en-US' ? 'fr-CA' : 'en-US';
  };

  // Handle mic toggle with room integration - now just toggles mute state
  const handleMicToggle = useCallback(async () => {
    console.log(' [MIC TOGGLE] Button clicked. Current state:', {
      isMuted,
      isVoiceReady,
      sessionState,
      isConnected,
      hasOtherParticipant: !!otherParticipant
    });
    
    if (!isVoiceReady) {
      console.error(' [MIC TOGGLE] Voice session not ready!', { sessionState });
      toast.error('Voice session not ready. Please wait...');
      return;
    }
    if (!otherParticipant) {
      console.error(' [MIC TOGGLE] No other participant!');
      toast.error('Waiting for another participant to join...');
      return;
    }
    
    // In push-to-talk mode: press to start, release to stop and process
    if (!isMuted) {
      // Currently speaking - stop and process
      console.log('🛑 [MIC TOGGLE] Stopping listening and processing audio');
      stopRoomListening();
      setIsMuted(true);
    } else {
      // Currently muted - start listening
      console.log('🎤 [MIC TOGGLE] Starting listening');
      startRoomListening();
      setIsMuted(false);
    }
  }, [isMuted, isVoiceReady, sessionState, isConnected, otherParticipant, startRoomListening, stopRoomListening]);

  const copyShareableLink = useCallback(() => {
    const baseUrl = import.meta.env.VITE_APP_BASE_URL || window.location.origin;
    const shareableLink = `${baseUrl}/join/${roomId}`;
    navigator.clipboard.writeText(shareableLink);
    toast.success("Shareable link copied!", {
      description: shareableLink
    });
  }, [roomId]);

  // Update current transcript from local messages
  useEffect(() => {
    console.log(' [TRANSCRIPT UPDATE] Local messages changed:', localMessages.length);
    if (localMessages.length > 0) {
      const latestMessage = localMessages[localMessages.length - 1];
      console.log(' [TRANSCRIPT UPDATE] Latest message:', latestMessage);
      console.log(' [TRANSCRIPT UPDATE] SourceText:', latestMessage.sourceText);
      console.log(' [TRANSCRIPT UPDATE] Translations:', latestMessage.translations);
      
      // Strict language rule: only show text in this participant's window language
      const displayText = latestMessage.sourceLang === participant.language
        ? (latestMessage.sourceText || '')
        : (latestMessage.translations?.[participant.language] || '');
      console.log(' [TRANSCRIPT UPDATE] Setting currentTranscript to:', displayText);
      setCurrentTranscript(displayText);
      
      // Keep it visible for 5 seconds after speaking
      setTimeout(() => {
        console.log(' [TRANSCRIPT UPDATE] Clearing currentTranscript after timeout');
        setCurrentTranscript('');
      }, 5000);
    } else {
      setCurrentTranscript('');
    }
  }, [localMessages, participant.language]);

  // Clear transcript only when starting a new session or when there are no messages
  useEffect(() => {
    if (!isListening && !isTranslating && localMessages.length === 0) {
      console.log(' [TRANSCRIPT] Clearing transcript (no messages)');
      setCurrentTranscript('');
    }
  }, [isListening, isTranslating, localMessages.length]);

  // Debug: Log current transcript state
  useEffect(() => {
    console.log(' [CURRENT TRANSCRIPT STATE]:', {
      currentTranscript,
      isListening,
      localMessagesCount: localMessages.length
    });
  }, [currentTranscript, isListening, localMessages.length]);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden relative">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-primary/20 relative z-10">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" alt="NeuralEcho" className="w-10 h-10 rounded-lg border border-border/50" />
          <div className="flex flex-col justify-center">
            <h1 className="font-mono-display text-lg font-semibold text-foreground tracking-tight">NeuralEcho Chatroom</h1>
            <p className="text-[11px] text-muted-foreground/50">Room: {roomId}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyShareableLink}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Share room"
          >
            <Share2 className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {otherParticipant ? '2' : '1'}/2
            </span>
          </div>
          <button
            onClick={onLeaveRoom}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Leave room"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Split screen panels */}
      <div className="flex-1 min-h-0 flex flex-col relative z-10">
        {/* Participants Info Bar */}
        <div className="px-4 py-3 border-b border-border/50 bg-secondary/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${!isMuted && (isListening || vad.isSpeaking) ? 'bg-primary animate-pulse' : 'bg-primary'}`} />
                <span className="text-sm font-medium text-foreground">{participant.name}</span>
                <span className="text-xs text-muted-foreground">
                  {getLanguageDisplay(participant.language)}
                </span>
                {!isMuted && (isListening || vad.isSpeaking) && (
                  <span className="text-xs text-primary font-medium">Speaking...</span>
                )}
              </div>
              {otherParticipant && (
                <>
                  <span className="text-muted-foreground"></span>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isRemoteSpeaking ? 'bg-green-500 animate-pulse' : 'bg-green-500'}`} />
                    <span className="text-sm font-medium text-foreground">{otherParticipant.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {getLanguageDisplay(getOtherLanguage())}
                    </span>
                    {isRemoteSpeaking && (
                      <span className="text-xs text-green-600 font-medium">Speaking...</span>
                    )}
                  </div>
                </>
              )}
            </div>
            {isListening && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-full">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-medium text-primary">Speaking</span>
              </div>
            )}
          </div>

          <TranslatingIndicator
            isVisible={streamingState.showTranslatingIndicator}
            participantName={otherParticipant?.name}
            sourceLanguage={getOtherLanguage()}
            targetLanguage={participant.language}
            audioLevel={audioLevel > -100 ? Math.max(0, Math.min(1, (audioLevel + 60) / 60)) : 0}
            className="mt-2"
          />
        </div>

        {/* Chat History and Transcript - Main Area */}
        <div className="flex-1 overflow-hidden">
          {otherParticipant ? (
            <Tabs defaultValue="chat" className="h-full flex flex-col">
              <div className="px-4 pt-3 border-b border-border/50">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="chat" className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Chat ({messages.length})
                  </TabsTrigger>
                  <TabsTrigger value="live" className="flex items-center gap-2">
                    <ScrollText className="w-4 h-4" />
                    Live Transcripts
                  </TabsTrigger>
                  <TabsTrigger value="transcript" className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    History ({transcriptHistory.length})
                  </TabsTrigger>
                  <TabsTrigger value="recording" className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Recording
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
                <div className="h-full overflow-y-auto p-4 bg-background">
                  <div className="max-w-4xl mx-auto space-y-3">
                    {(streamingState.partialTranscript || streamingState.translationStream) && (
                      <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                        <StreamingTranscript
                          text={getPartialTranscriptText()}
                          isComplete={!!streamingState.partialTranscript?.isComplete}
                          showTypingIndicator={streamingState.isOtherSpeaking}
                        />
                        <StreamingTranscript
                          text={getTranslationText()}
                          isComplete={!!streamingState.translationStream?.isComplete}
                          showTypingIndicator={streamingState.showTranslatingIndicator}
                          className="text-primary"
                        />
                      </div>
                    )}

                    {/* Removed temporary "you said" display - messages will appear in chat history below */}
                    
                    {/* Chat Bubbles - Show local messages for instant feedback + server messages */}
                    {displayMessages.length > 0 ? (
                        <div className="space-y-3 mb-4">
                          {displayMessages.map((message) => {
                            return (
                              <div key={message.id} className={`flex ${message.isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[70%] rounded-lg p-3 shadow-md ${
                                  message.isOwnMessage 
                                    ? 'bg-primary text-primary-foreground' 
                                    : 'bg-secondary text-foreground border border-border'
                                }`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold">
                                      {message.isOwnMessage ? 'You' : otherParticipant?.name || 'Other'}
                                    </span>
                                    <span className={`text-xs ${message.isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="text-xs text-primary-foreground/60">
                                      {participant.language === 'en-US' ? '🇺🇸' : '🇫🇷'}
                                    </span>
                                  </div>
                                  <p className="text-sm leading-relaxed">{message.displayText}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                          <p className="text-sm text-muted-foreground">No messages yet</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">Click the mic button to unmute and start speaking</p>
                        </div>
                      )}
                    
                    {/* Incoming Transcript - Other person speaking, showing TRANSLATED text in YOUR language */}
                    {(isOtherSpeaking || incomingTranscript) && !isListening && localMessages.length > 0 && (
                      <div className="sticky top-0 z-10 bg-green-500/10 border-2 border-green-500 rounded-lg p-4 mb-4 shadow-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                          <span className="text-sm font-semibold text-green-600">
                            {otherParticipant?.name || 'Other'} is speaking...
                          </span>
                        </div>
                        {incomingTranscript ? (
                          <>
                            <p className="text-lg text-foreground font-medium">{incomingTranscript}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {participant.language === 'en-US' ? ' English' : ' Franais'}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Translating to {participant.language === 'en-US' ? 'English' : 'Franais'}...</p>
                        )}
                      </div>
                    )}
                    
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="live" className="flex-1 overflow-hidden mt-0">
                <div className="h-full p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                    {/* My Transcript (Input) */}
                    <TranscriptPanel
                      title="You said"
                      languageName={participant.language === 'en-US' ? 'English' : 'Français'}
                      transcript={myTranscript}
                      onClear={clearMyTranscript}
                    />
                    
                    {/* Their Transcript (Output/Translation) */}
                    <TranscriptPanel
                      title="Translation"
                      languageName={participant.language === 'en-US' ? 'Français → English' : 'English → Français'}
                      transcript={theirTranscript}
                      onClear={clearTheirTranscript}
                    />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="transcript" className="flex-1 overflow-hidden mt-0">
                <div className="h-full p-4">
                  <TranscriptDisplay
                    transcriptHistory={transcriptHistory}
                    currentParticipant={participant}
                    otherParticipant={otherParticipant}
                    className="h-full"
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="recording" className="flex-1 overflow-hidden mt-0">
                <div className="h-full p-4">
                  <RecordingControls
                    recording={recording}
                    isRecording={isRecording}
                    recordingDuration={recordingDuration}
                    onStartRecording={startRecording}
                    onStopRecording={stopRecording}
                    onDownloadRecording={downloadRecording}
                    onDownloadTranscriptTXT={downloadServerTranscriptTXT}
                    onDownloadTranscriptJSON={downloadServerTranscriptJSON}
                    sessionStats={sessionStats}
                    formatDuration={formatDuration}
                    className="h-full"
                  />
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-5 max-w-sm w-full px-4">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Waiting for someone to join...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Share this link with the other participant
                  </p>
                </div>
                {/* Persistent copyable link — always visible, never disappears */}
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
                  <span className="flex-1 text-xs text-muted-foreground truncate select-all font-mono">
                    {`${import.meta.env.VITE_APP_BASE_URL || window.location.origin}/join/${roomId}`}
                  </span>
                  <button
                    onClick={copyShareableLink}
                    className="shrink-0 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="border-t border-border/50 p-4 bg-secondary/30">
          <div className="max-w-4xl mx-auto space-y-3">
            
            {/* Main Mic Control - Single button for mute/unmute */}
            {otherParticipant && isVoiceReady && (
              <div className="flex items-center gap-2 relative">
                {/* Pulsing ring when speaking (VAD active) */}
                {!isMuted && (isListening || vad.isSpeaking) && (
                  <>
                    <span className="absolute left-0 right-0 mx-auto w-[calc(100%-8px)] h-16 rounded-lg bg-primary/20 animate-pulse" style={{ animationDuration: '1.5s' }} />
                    <span className="absolute left-0 right-0 mx-auto w-[calc(100%-8px)] h-16 rounded-lg bg-primary/10 animate-pulse" style={{ animationDuration: '1.5s', animationDelay: '0.75s' }} />
                  </>
                )}
                
                <button
                  onClick={handleMicToggle}
                  disabled={!bothUsersReady || !isVoiceReady || !isConnected || !otherParticipant}
                  title={!bothUsersReady ? 'Waiting for other participant...' : ''}
                  className={`relative z-10 flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-lg border-2 transition-all text-base font-medium ${
                    !bothUsersReady
                      ? 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-60'
                      : isMuted
                      ? 'border-border bg-secondary hover:bg-muted text-muted-foreground hover:scale-[1.02] active:scale-95'
                      : isListening || vad.isSpeaking
                        ? 'border-primary/40 bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'border-primary bg-primary/10 text-primary hover:bg-primary/20'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {!bothUsersReady ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Waiting for other participant...</span>
                    </>
                  ) : isMuted ? (
                    <>
                      <MicOff className="w-5 h-5" />
                      <span>Click to Unmute & Speak</span>
                    </>
                  ) : isListening || vad.isSpeaking ? (
                    <>
                      <Mic className="w-5 h-5 animate-pulse" />
                      <span>Speaking...</span>
                      <div className="w-2 h-2 rounded-full bg-primary-foreground animate-pulse" />
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5" />
                      <span>Speak Naturally (Hands-Free)</span>
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                    </>
                  )}
                </button>
              </div>
            )}
            
            {/* Voice Level (only when speaking) */}
            {!isMuted && (isListening || vad.isSpeaking) && audioLevel !== null && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Waves className="w-3 h-3" />
                  <span>Voice Level</span>
                  <span className="text-primary">(Hands-Free Active)</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-primary h-1.5 rounded-full transition-all duration-150"
                    style={{ width: `${Math.min(Math.max(0, (audioLevel + 100) / 100) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mode Instructions */}
      {otherParticipant && isVoiceReady && (
        <div className="border-t border-border/50 bg-secondary/30 px-5 py-3 relative z-10">
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
            {isMuted ? (
              <>
                <div className="flex items-center gap-2">
                  <MicOff className="w-4 h-4 text-muted-foreground" />
                  <span>Microphone is muted</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Click the microphone button to start speaking</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 text-xs font-mono bg-background border border-border rounded">M</kbd>
                  <span>Press M to toggle mute</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="text-primary font-medium">Hands-Free Mode Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span>Speak naturally - voice detected automatically</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 text-xs font-mono bg-background border border-border rounded">M</kbd>
                  <span>Press M to mute</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border/50 py-2 px-5 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>Room: {isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isVoiceReady ? 'bg-primary' : 'bg-yellow-500'}`} />
            <span>AI: {isVoiceReady ? 'Ready' : 'Connecting...'}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/40 tracking-wide">
          Real-time translation: {participant.language === 'en-US' ? 'English  French' : 'French  English'}
        </p>
      </footer>
    </div>
  );
}
