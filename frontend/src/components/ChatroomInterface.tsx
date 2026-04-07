import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Download
} from 'lucide-react';
import { ChatroomParticipant, ChatroomMessage } from '@/types/chatroom';
import { useAppState } from '@/contexts/AppContext';
import { useChatroomConnection } from '@/hooks/useChatroomConnection';
import { useRoomTranslation } from '@/hooks/useRoomTranslation';
import { useStreamingState } from '@/hooks/useStreamingState';
import { useTranscriptRecording } from '@/hooks/useTranscriptRecording';
import { TranscriptDisplay } from '@/components/TranscriptDisplay';
import { RecordingControls } from '@/components/RecordingControls';
import { StreamingTranscript } from '@/components/StreamingTranscript';
import { TranslatingIndicator } from '@/components/TranslatingIndicator';
import { toast } from 'sonner';
import { APP_BASE_URL } from '@/lib/config';

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
  const [isMuted, setIsMuted] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [incomingTranscript, setIncomingTranscript] = useState(''); // Translated transcript from other speaker
  const [isOtherSpeaking, setIsOtherSpeaking] = useState(false); // Is other person speaking?

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
    sendVoiceActivity,
    handleUserGesture: handleChatroomUserGesture
  } = useChatroomConnection({
    roomId,
    participant,
    onEvent: (event) => {
      console.log(' [ChatroomInterface] Room event received:', event.type);
      
      if (event.type === 'USER_JOINED_ROOM') {
        console.log(' [ChatroomInterface] New participant joined! Total:', event.participantCount);
      }
      
      if (event.type === 'translation_ready') {
        console.log(' [ChatroomInterface] Translation session is ready with 2 participants!');
        toast.success('Translation ready! Both participants connected.');
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
        console.log('📝 [ChatroomInterface] PARTIAL_TRANSCRIPT event:', {
          participantId: event.participantId,
          myId: participant.id,
          delta: event.delta,
          isOwnTranscript: event.isOwnTranscript
        });
        
        // SPEAKER sees their own words appearing in real-time
        // LISTENER sees the original words (before translation) appearing in real-time
        // Both should see partial transcripts!
        addPartialTranscript(event.delta, event.itemId);
      }

      if (event.type === 'TRANSLATION_DELTA') {
        console.log('🌐 [ChatroomInterface] TRANSLATION_DELTA event:', {
          participantId: event.participantId,
          myId: participant.id,
          delta: event.delta,
          targetLanguage: event.targetLanguage
        });
        
        // Only show translation deltas to the LISTENER (not the speaker)
        // The listener sees the translated words appearing in real-time
        if (event.participantId !== participant.id) {
          addTranslationDelta(event.delta, event.responseId, event.targetLanguage);
        } else {
          console.log('ℹ️ [TRANSLATION_DELTA] Filtering own translation (speaker sees original, not translation)');
        }
      }

      if (event.type === 'AUDIO_CHUNK') {
        if (!participant.id) {
          console.warn('⚠️ [AUDIO_CHUNK] participant.id is not set, allowing audio through');
        } else if (event.participantId === participant.id) {
          console.log('ℹ️ [AUDIO_CHUNK] Filtering own audio');
          return;
        }
        addAudioChunk(event.audioData || event.pcmData, event.responseId);
        playIncomingAudioChunk(event.audioData || event.pcmData, event.responseId);
      }

      if (event.type === 'VOICE_ACTIVITY_STARTED') {
        console.log('🎤 [ChatroomInterface] VOICE_ACTIVITY_STARTED:', {
          participantId: event.participantId,
          myId: participant.id,
          isOwnActivity: event.participantId === participant.id
        });
        
        // Show voice activity for the OTHER participant (not yourself)
        if (event.participantId !== participant.id) {
          setVoiceActivity(true);
        }
      }

      if (event.type === 'VOICE_ACTIVITY_STOPPED') {
        console.log('🎤 [ChatroomInterface] VOICE_ACTIVITY_STOPPED:', {
          participantId: event.participantId,
          myId: participant.id,
          isOwnActivity: event.participantId === participant.id
        });
        
        // Clear voice activity for the OTHER participant (not yourself)
        if (event.participantId !== participant.id) {
          setVoiceActivity(false);
        }
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

  const [isPressing, setIsPressing] = useState(false);
  const [pressStartTime, setPressStartTime] = useState<number | null>(null);

  // Get actual audio level from the voice hook
  const { currentDbLevel, dbThreshold } = useAppState();
  const audioLevel = currentDbLevel || -100;
  const isVoiceRecording = isListening || isTranslating;

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
      if (isSameLanguage(msg.originalLanguage, participant.language)) {
        displayText = msg.originalText;
      } else if (isSameLanguage(msg.targetLanguage, participant.language)) {
        displayText = msg.translatedText;
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

  // Handle mic toggle with room integration
  const handleMicToggle = useCallback(async () => {
    console.log(' [MIC TOGGLE] Button clicked. Current state:', {
      isVoiceRecording,
      isVoiceReady,
      sessionState,
      isConnected,
      hasOtherParticipant: !!otherParticipant
    });
    
    if (isVoiceRecording) {
      console.log(' [MIC TOGGLE] Stopping listening...');
      stopRoomListening();
    } else {
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
      
      // Check microphone permission before starting
      try {
        const hasPermission = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
        if (hasPermission?.state === 'denied') {
          toast.error('Microphone permission denied. Please allow microphone access in your browser settings.');
          return;
        }
      } catch (permError) {
        console.warn('Could not check microphone permission:', permError);
      }
      
      console.log(' [MIC TOGGLE] Starting listening...');
      try {
        startRoomListening();
      } catch (error) {
        console.error(' [MIC TOGGLE] Failed to start listening:', error);
        if (error instanceof Error) {
          toast.error(error.message);
        } else {
          toast.error('Failed to start microphone. Please check your microphone permissions.');
        }
      }
    }
  }, [isVoiceRecording, isVoiceReady, sessionState, isConnected, otherParticipant, startRoomListening, stopRoomListening]);

  // Press-and-talk handlers
  const handleMicPress = useCallback(async () => {
    console.log(' [handleMicPress] Called with state:', { isPressing, isVoiceRecording, isVoiceReady, otherParticipant: !!otherParticipant });
    
    // Don't check isVoiceRecording here - it can be stale due to closure issues
    // The button is already disabled when needed via the disabled prop
    if (isPressing) {
      console.log(' [handleMicPress] Blocked - already pressing');
      return;
    }
    
    console.log(' [PRESS-TO-TALK] Button pressed down');
    
    if (!isVoiceReady) {
      console.error('❌ [PRESS-TO-TALK] Voice session not ready!', { sessionState, isConnected });
      toast.error('Connection lost — reconnecting...');
      return;
    }
    if (!otherParticipant) {
      toast.error('Waiting for another participant to join...');
      return;
    }
    
    // Check microphone permission before starting
    try {
      const hasPermission = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
      if (hasPermission?.state === 'denied') {
        toast.error('Microphone permission denied. Please allow microphone access in your browser settings.');
        return;
      }
    } catch (permError) {
      console.warn('Could not check microphone permission:', permError);
    }
    
    setIsPressing(true);
    setPressStartTime(Date.now());
    
    // Handle user gesture for audio playback (autoplay policy)
    try {
      await handleRoomUserGesture();
      await handleChatroomUserGesture();
    } catch (gestureError) {
      console.warn('Failed to handle user gesture:', gestureError);
    }
    
    try {
      console.log(' [PRESS-TO-TALK] Starting listening...');
      startRoomListening();
    } catch (error) {
      console.error(' [PRESS-TO-TALK] Failed to start listening:', error);
      setIsPressing(false);
      setPressStartTime(null);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to start microphone. Please check your microphone permissions.');
      }
    }
  }, [isPressing, isRecording, isVoiceReady, otherParticipant, startRoomListening, handleRoomUserGesture, handleChatroomUserGesture]);

  const handleMicRelease = useCallback(() => {
    if (!isPressing) return;
    
    console.log(' [PRESS-TO-TALK] Button released');
    
    setIsPressing(false);
    setPressStartTime(null);
    stopRoomListening();
  }, [isPressing, stopRoomListening]);

  // Handle mouse/touch events with proper cleanup
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    console.log(' [handleMouseDown] Mouse down event fired');
    e.preventDefault();
    handleMicPress();
  }, [handleMicPress]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleMicRelease();
  }, [handleMicRelease]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't prevent default for touch events to avoid passive listener issues
    handleMicPress();
  }, [handleMicPress]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Don't prevent default for touch events to avoid passive listener issues
    handleMicRelease();
  }, [handleMicRelease]);

  // Cleanup on component unmount or when user leaves
  useEffect(() => {
    const handleMouseUpGlobal = () => {
      if (isPressing) {
        handleMicRelease();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isPressing && !isVoiceRecording) {
        e.preventDefault();
        handleMicPress();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isPressing) {
        e.preventDefault();
        handleMicRelease();
      }
    };

    if (isPressing) {
      document.addEventListener('mouseup', handleMouseUpGlobal);
      document.addEventListener('touchend', handleMouseUpGlobal);
    }

    // Always listen for spacebar
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('mouseup', handleMouseUpGlobal);
      document.removeEventListener('touchend', handleMouseUpGlobal);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPressing, isVoiceRecording, handleMicPress, handleMicRelease]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted]);

  const copyShareableLink = useCallback(() => {
    const shareableLink = `${APP_BASE_URL}/join/${roomId}`;
    navigator.clipboard.writeText(shareableLink);
    toast.success("Shareable link copied to clipboard!", {
      description: "Send this link to someone to join your translation room"
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
      {/* GoML Background */}
      <div className="goml-bg">
        <div className="goml-pattern goml-pattern-1">GoML</div>
        <div className="goml-pattern goml-pattern-2">GoML</div>
        <div className="goml-pattern goml-pattern-3">GoML</div>
      </div>

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
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-sm font-medium text-foreground">{participant.name}</span>
                <span className="text-xs text-muted-foreground">
                  {getLanguageDisplay(participant.language)}
                </span>
              </div>
              {otherParticipant && (
                <>
                  <span className="text-muted-foreground"></span>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-sm font-medium text-foreground">{otherParticipant.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {getLanguageDisplay(getOtherLanguage())}
                    </span>
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
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="chat" className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Chat ({messages.length})
                  </TabsTrigger>
                  <TabsTrigger value="transcript" className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Transcript ({transcriptHistory.length})
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
                          <p className="text-xs text-muted-foreground/70 mt-1">Hold the microphone button or press spacebar to speak</p>
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
              <div className="text-center space-y-3 max-w-sm">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Waiting for someone to join...</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Share the room link to invite someone
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="border-t border-border/50 p-4 bg-secondary/30">
          <div className="max-w-4xl mx-auto space-y-3">
            {/* Voice Level (only when speaking) */}
            {isListening && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Waves className="w-3 h-3" />
                  <span>Voice Level</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-primary h-1.5 rounded-full transition-all duration-150"
                    style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Press-to-Talk Mic Control */}
            <div className="flex items-center gap-2">
              <button
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                disabled={!isVoiceReady || !isConnected || !otherParticipant}
                className={`press-to-talk-button flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all text-sm font-medium ${
                  isPressing || isListening
                    ? 'border-primary/40 bg-primary text-primary-foreground press-to-talk-active mic-recording'
                    : 'border-border bg-secondary hover:bg-muted text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95'
                }`}
              >
                {isPressing || isListening ? (
                  <>
                    <Mic className="w-4 h-4 animate-pulse" />
                    <span className="flex items-center gap-1">
                      Speaking...
                      {pressStartTime && (
                        <span className="text-xs opacity-75">
                          ({Math.floor((Date.now() - pressStartTime) / 1000)}s)
                        </span>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>
                      {!otherParticipant 
                        ? 'Waiting for participant...' 
                        : 'Hold to Speak'
                      }
                    </span>
                  </>
                )}
              </button>
              <button
                onClick={handleMuteToggle}
                className="p-3 rounded-lg border border-border bg-secondary hover:bg-muted transition-colors"
                title={isMuted ? "Unmute incoming audio" : "Mute incoming audio"}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Volume2 className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>
            
            {/* Audio Level Indicator */}
            {(isPressing || isListening) && audioLevel !== null && (
              <div className="mt-3 px-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                  <span className="flex items-center gap-2">
                    <span>Audio Level</span>
                    {isPressing && (
                      <span className="text-primary live-indicator"> LIVE</span>
                    )}
                  </span>
                  <span className={`font-mono ${audioLevel > dbThreshold ? 'text-primary' : 'text-muted-foreground'}`}>
                    {Math.round(audioLevel)}dB {audioLevel > dbThreshold ? '' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1 h-4">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
                    const normalizedLevel = Math.max(0, Math.min(1, (audioLevel + 100) / 100));
                    const isBarActive = normalizedLevel > (i / 10);
                    const isAboveThreshold = audioLevel > dbThreshold;
                    return (
                      <div
                        key={i}
                        className={`flex-1 h-2 rounded-sm transition-all duration-100 ${
                          isBarActive && isAboveThreshold 
                            ? "bg-primary shadow-sm" 
                            : isBarActive 
                              ? "bg-primary/40" 
                              : "bg-secondary"
                        }`}
                        style={{
                          transform: isBarActive ? 'scaleY(1.2)' : 'scaleY(1)',
                          boxShadow: isBarActive && isAboveThreshold ? '0 0 4px hsl(var(--primary)/0.5)' : 'none'
                        }}
                      />
                    );
                  })}
                </div>
                {isPressing && (
                  <div className="mt-2 text-xs text-center text-muted-foreground">
                    Release button or spacebar to stop speaking
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Press-to-Talk Instructions */}
      {otherParticipant && isVoiceReady && (
        <div className="border-t border-border/50 bg-secondary/30 px-5 py-3 relative z-10">
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded border border-border bg-background flex items-center justify-center">
                <Mic className="w-3 h-3" />
              </div>
              <span>Hold button to speak</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 text-xs font-mono bg-background border border-border rounded">Space</kbd>
              <span>Press & hold spacebar</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              <span>Real-time translation active</span>
            </div>
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
