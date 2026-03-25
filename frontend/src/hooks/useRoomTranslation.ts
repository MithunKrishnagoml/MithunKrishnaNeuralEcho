/**
 * Room-based Translation Hook
 * Integrates AppContext translation with room-based communication
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAppState } from '@/contexts/AppContext';
import { ChatroomParticipant } from '@/types/chatroom';
import { StreamingAudioPlayer } from '@/utils/StreamingAudioPlayer';
import { reportAudioError } from '@/utils/StreamingErrorHandler';

interface UseRoomTranslationProps {
  roomId: string;
  participant: ChatroomParticipant;
  sendTranscript: (transcript: string, language: 'en-US' | 'fr-CA') => void;
  sendTranslatedAudio: (audioData: string, originalText: string, translatedText: string) => void;
  sendBilingualMessage: (originalText: string, translatedText: string, originalLanguage: 'en-US' | 'fr-CA', messageId?: string) => void;
  sendPartialTranscript: (delta: string, itemId: string) => void;
  sendTranslationDelta: (delta: string, responseId: string, targetLanguage: 'en-US' | 'fr-CA') => void;
  sendAudioChunk: (audioData: string, responseId: string, sequenceNumber?: number) => void;
  sendAudioStreamEnd: (responseId: string) => void;
  sendAIAudioChunk: (audioData: string, sequenceNumber: number) => void;
  sendAIAudioEnd: () => void;
  sendVoiceActivity: (type: 'VOICE_ACTIVITY_STARTED' | 'VOICE_ACTIVITY_STOPPED') => void;
  isConnected: boolean;
}

export function useRoomTranslation({ 
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
}: UseRoomTranslationProps) {
  const {
    status,
    sessionState,
    startListening,
    stopListening,
    setVoiceModeAndInit,
    messages: appMessages,
    clearHistory,
    updateSpeakerLanguage,
    setActiveSpeakerId,
    setTranslatedAudioCallback,
    setAIAudioChunkCallback,
    setTranscriptCallback,
    setRealtimeStreamingCallbacks
  } = useAppState();

  const lastMessageCountRef = useRef(0);
  const processedMessagesRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);
  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);

  useEffect(() => {
    audioPlayerRef.current = new StreamingAudioPlayer({
      sampleRate: 24000,
      maxQueueSize: 48000 * 10, // 10 seconds
      debug: false,
      onError: (error) => {
        reportAudioError('Streaming audio player error', {
          roomId,
          participantId: participant.id,
          error: error.message,
        });
      },
      onPlaybackStart: () => {
        console.log('▶️ Room audio playback started');
      },
      onPlaybackEnd: () => {
        console.log('⏹️ Room audio playback ended');
      }
    });

    return () => {
      audioPlayerRef.current?.dispose();
      audioPlayerRef.current = null;
    };
  }, []);

  // Handle user gesture for autoplay policy - trigger on any user interaction
  const handleUserGesture = useCallback(async () => {
    if (audioPlayerRef.current) {
      await audioPlayerRef.current.handleUserGesture();
      console.log('🎵 User gesture handled for room audio player');
    }
  }, []);

  // Add click listener to handle autoplay policy
  useEffect(() => {
    const handleClick = () => {
      handleUserGesture();
      document.removeEventListener('click', handleClick);
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [handleUserGesture]);

  // Register translated audio callback so AppContext can send audio to room
  useEffect(() => {
    console.log('🔧 [Room Translation] Registering sendTranslatedAudio callback');
    setTranslatedAudioCallback(sendTranslatedAudio);
    
    // Cleanup on unmount
    return () => {
      console.log('🔧 [Room Translation] Clearing sendTranslatedAudio callback');
      setTranslatedAudioCallback(null);
    };
  }, [sendTranslatedAudio, setTranslatedAudioCallback]);

  // Register AI audio chunk callback so AppContext can send AI audio chunks to room
  useEffect(() => {
    console.log('🔧 [Room Translation] Registering sendAIAudioChunk callback');
    setAIAudioChunkCallback(sendAIAudioChunk);
    
    // Cleanup on unmount
    return () => {
      console.log('🔧 [Room Translation] Clearing sendAIAudioChunk callback');
      setAIAudioChunkCallback(null);
    };
  }, [sendAIAudioChunk, setAIAudioChunkCallback]);

  // Register transcript callback so AppContext can send transcripts to backend
  useEffect(() => {
    console.log('🔧 [Room Translation] Registering sendTranscript callback');
    setTranscriptCallback(sendTranscript);
    
    // Cleanup on unmount
    return () => {
      console.log('🔧 [Room Translation] Clearing sendTranscript callback');
      setTranscriptCallback(null);
    };
  }, [sendTranscript, setTranscriptCallback]);

  useEffect(() => {
    const otherLanguage = participant.language === 'en-US' ? 'fr-CA' : 'en-US';

    setRealtimeStreamingCallbacks({
      onVoiceActivityStarted: () => {
        sendVoiceActivity('VOICE_ACTIVITY_STARTED');
      },
      onVoiceActivityStopped: () => {
        sendVoiceActivity('VOICE_ACTIVITY_STOPPED');
      },
      onPartialTranscript: (delta: string, itemId: string) => {
        sendPartialTranscript(delta, itemId);
      },
      onTranslationDelta: (delta: string, responseId: string) => {
        sendTranslationDelta(delta, responseId, otherLanguage);
      },
      onAudioChunk: (audioData: string, responseId: string) => {
        sendAudioChunk(audioData, responseId);
      },
      onAIAudioChunk: (audioData: string, sequenceNumber: number) => {
        // Send AI audio chunk to backend for relay to all participants
        sendAIAudioChunk(audioData, sequenceNumber);
      },
    });

    return () => {
      setRealtimeStreamingCallbacks(null);
    };
  }, [participant.language, sendAudioChunk, sendAIAudioChunk, sendPartialTranscript, sendTranslationDelta, sendVoiceActivity, setRealtimeStreamingCallbacks]);

  // Initialize voice session when room is ready
  useEffect(() => {
    if (isConnected && !isInitializedRef.current) {
      console.log('🔧 [Room Translation] Initializing voice session for room:', roomId);
      console.log('🔧 [Room Translation] Participant language:', participant.language);
      console.log('🔧 [Room Translation] Current sessionState:', sessionState);
      
      // Clear any existing history first
      clearHistory();
      
      // Set up the speaker configuration for the participant
      // Speaker 0 = current participant, Speaker 1 = other participant
      const otherLanguage = participant.language === 'en-US' ? 'fr-CA' : 'en-US';
      
      // Update both speakers at once to avoid multiple reinitializations
      updateSpeakerLanguage(0, participant.language);
      updateSpeakerLanguage(1, otherLanguage);
      
      console.log('🔧 [Room Translation] Speaker 0 (current):', participant.language);
      console.log('🔧 [Room Translation] Speaker 1 (other):', otherLanguage);
      
      // Set the current participant as the active speaker
      setActiveSpeakerId(0);
      
      // Initialize the voice session with push-to-talk mode
      // setVoiceModeAndInit will now properly initialize even when disconnected
      setTimeout(() => {
        console.log('🔧 [Room Translation] Calling setVoiceModeAndInit to initialize WebRTC session');
        setVoiceModeAndInit('push-to-talk');
        isInitializedRef.current = true;
      }, 200);
    }
  }, [isConnected, roomId, participant.language, setVoiceModeAndInit, updateSpeakerLanguage, setActiveSpeakerId, clearHistory, sessionState]);

  // Monitor AppContext messages and send to room
  useEffect(() => {
    console.log('📊 [Room Translation] appMessages changed:', {
      length: appMessages.length,
      lastCount: lastMessageCountRef.current,
      hasNew: appMessages.length > lastMessageCountRef.current
    });
    
    // Check all messages for ones that have both sourceText and translation but haven't been sent yet
    appMessages.forEach((message, index) => {
      const messageKey = `${message.id || index}`;
      
      // Skip if already processed
      if (processedMessagesRef.current.has(messageKey)) {
        return;
      }
      
      // Get the translation for the other participant's language
      const otherLanguage = participant.language === 'en-US' ? 'fr-CA' : 'en-US';
      const translation = message.translations?.[otherLanguage];
      
      console.log('🔍 [Room Translation] Checking message:', {
        key: messageKey,
        hasSourceText: !!message.sourceText,
        hasTranslation: !!translation,
        sourceText: message.sourceText,
        translation: translation,
        otherLanguage
      });
      
      // Only send if this message has BOTH sourceText and translation
      if (message.sourceText && translation) {
        const sourceHasDisallowedScript = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(message.sourceText);
        const translationHasDisallowedScript = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(translation);

        if (sourceHasDisallowedScript || translationHasDisallowedScript) {
          console.warn('⚠️ [Room Translation] Skipping message with disallowed script', {
            messageId: message.id,
            sourcePreview: message.sourceText.slice(0, 60),
            translationPreview: translation.slice(0, 60),
            sourceHasDisallowedScript,
            translationHasDisallowedScript,
          });
          processedMessagesRef.current.add(messageKey);
          return;
        }

        console.log('📤 ═══════════════════════════════════════════════════════');
        console.log('📤 [Room Translation] SENDING MESSAGE TO SERVER');
        console.log('📤 [Room Translation] Message ID:', message.id);
        console.log('📤 [Room Translation] Original text (FULL):', message.sourceText);
        console.log('📤 [Room Translation] Original text LENGTH:', message.sourceText.length, 'chars');
        console.log('📤 [Room Translation] Translation (FULL):', translation);
        console.log('📤 [Room Translation] Translation LENGTH:', translation.length, 'chars');
        console.log('📤 [Room Translation] Participant language:', participant.language);
        console.log('📤 [Room Translation] Other language:', otherLanguage);
        console.log('📤 ═══════════════════════════════════════════════════════');
        
        // Send bilingual message with both original and translated text
        // CRITICAL: Pass the original message ID to prevent duplicates
        sendBilingualMessage(
          message.sourceText,
          translation,
          participant.language,
          message.id  // Pass the original message ID for deduplication
        );
        
        // Mark as processed
        processedMessagesRef.current.add(messageKey);
        console.log('✅ [Room Translation] Message marked as processed:', messageKey);
      } else {
        console.log('⏳ [Room Translation] Message not ready (missing sourceText or translation)');
      }
    });
    
    lastMessageCountRef.current = appMessages.length;
  }, [appMessages, sendBilingualMessage, participant.language]);

  // Room-specific start listening
  const startRoomListening = useCallback(() => {
    console.log('🎤 [Room Translation] startRoomListening called', {
      sessionState,
      isConnected,
      participantId: participant.id
    });
    
    if (sessionState === 'ready' && isConnected) {
      console.log('✅ [Room Translation] Conditions met, calling startListening()');
      startListening();
    } else if (sessionState === 'disconnected' && isConnected) {
      console.log('⚠️ [Room Translation] Session disconnected, reinitializing...');
      // Session was disconnected, need to reinitialize
      startListening();
    } else {
      console.error('❌ [Room Translation] Cannot start listening', {
        sessionState,
        isConnected,
        reason: sessionState !== 'ready' && sessionState !== 'disconnected' ? `Session in ${sessionState} state` : 'Not connected'
      });
    }
  }, [sessionState, isConnected, startListening, participant.id]);

  // Room-specific stop listening
  const stopRoomListening = useCallback(() => {
    console.log(' [Room Translation] Stopping listening for participant:', participant.id);
    stopListening();
  }, [stopListening, participant.id]);

  // Clear local history when joining room (to avoid confusion)
  const clearLocalHistory = useCallback(() => {
    console.log(' [Room Translation] Clearing local message history');
    clearHistory();
    lastMessageCountRef.current = 0;
    processedMessagesRef.current.clear();
  }, [clearHistory]);

  // Reset when room changes
  useEffect(() => {
    return () => {
      isInitializedRef.current = false;
      lastMessageCountRef.current = 0;
      processedMessagesRef.current.clear();
    };
  }, [roomId]);

  // Log state changes for debugging
  useEffect(() => {
    console.log('📊 [Room Translation] State update:', {
      status,
      sessionState,
      isVoiceReady: sessionState === 'ready',
      isConnected
    });
  }, [status, sessionState, isConnected]);

  const playIncomingAudioChunk = useCallback((audioData: string, responseId: string) => {
    const player = audioPlayerRef.current;
    if (!player || !audioData) return;

    try {
      player.addChunk({
        id: `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        data: audioData,
        timestamp: Date.now(),
        responseId,
      });
    } catch (error) {
      reportAudioError('Failed to enqueue incoming audio chunk', {
        roomId,
        participantId: participant.id,
        responseId,
        chunkLength: audioData.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [participant.id, roomId]);

  return {
    // Voice session state
    status,
    sessionState,
    isVoiceReady: sessionState === 'ready',
    
    // Room-specific controls
    startRoomListening,
    stopRoomListening,
    clearLocalHistory,
    
    // Current state
    isListening: status === 'listening',
    isTranslating: status === 'translating',
    playIncomingAudioChunk,
    handleUserGesture, // Export user gesture handler
    
    // Local messages (for debugging/fallback)
    localMessages: appMessages
  };
}
