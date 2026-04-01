import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatroomEvent, ChatroomParticipant, ChatroomMessage, Chatroom } from '@/types/chatroom';
import { reportNetworkError, reportWebSocketError } from '@/utils/StreamingErrorHandler';
import { PCM16Player } from '@/utils/PCM16Player';

interface UseChatroomConnectionProps {
  roomId: string;
  participant: ChatroomParticipant;
  onEvent?: (event: ChatroomEvent) => void;
}

const normalizeLang = (lang?: string) => (lang || '').toLowerCase().split('-')[0];
const isSameLanguage = (a?: string, b?: string) => normalizeLang(a) === normalizeLang(b);

export function useChatroomConnection({ roomId, participant, onEvent }: UseChatroomConnectionProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<Chatroom | null>(null);
  const [messages, setMessages] = useState<ChatroomMessage[]>([]);
  const [otherParticipant, setOtherParticipant] = useState<ChatroomParticipant | null>(null);
  const [lastTranslation, setLastTranslation] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);
  const connectionAttemptRef = useRef<boolean>(false);
  const translatedAudioPlayerRef = useRef<PCM16Player | null>(null);

  // Initialize translated audio player with PCM16Player
  useEffect(() => {
    translatedAudioPlayerRef.current = new PCM16Player();
    console.log('🎵 [PCM16Player] Initialized for translated audio playback');

    return () => {
      translatedAudioPlayerRef.current?.dispose();
      translatedAudioPlayerRef.current = null;
    };
  }, []);

  // Handle user gesture for autoplay policy - trigger on any user interaction
  const handleUserGesture = useCallback(async () => {
    if (translatedAudioPlayerRef.current) {
      await translatedAudioPlayerRef.current.resume();
      console.log('🎵 User gesture handled for PCM16Player');
    }
  }, []);

  // Add multiple event listeners to handle autoplay policy
  useEffect(() => {
    const events = ['click', 'touchstart', 'keydown', 'mousedown'];
    
    const handleInteraction = () => {
      handleUserGesture();
      // Remove listeners after first interaction
      events.forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
    };

    events.forEach(event => {
      document.addEventListener(event, handleInteraction);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
    };
  }, [handleUserGesture]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || connectionAttemptRef.current) {
      console.log('Connection already exists or in progress, skipping...');
      return;
    }

    connectionAttemptRef.current = true;
    console.log('Attempting to connect to chatroom WebSocket...');
    
    // Use WebSocket for real-time communication
    const serverUrl = import.meta.env.VITE_WS_URL || 'wss://neural-ix2j.onrender.com';
    console.log('🔧 [WebSocket] Using server URL:', serverUrl);
    const ws = new WebSocket(serverUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to chatroom:', roomId);
      setIsConnected(true);
      connectionAttemptRef.current = false;
      
      // Wait a moment before sending join_session to ensure connection is stable
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const joinMessage = {
            type: 'join_session',
            sessionId: roomId,
            userId: participant.id,
            language: participant.language,
            name: participant.name
          };
          console.log('Sending join_session message:', joinMessage);
          ws.send(JSON.stringify(joinMessage));
        }
      }, 100);
    };

    ws.onmessage = (event) => {
      console.log('🌐🌐🌐 [WebSocket] onmessage fired! Raw data:', event.data);
      try {
        const data: ChatroomEvent = JSON.parse(event.data);
        console.log('🔄 [FRONTEND] Parsed event type:', data.type);
        console.log('🔄 [FRONTEND] Full event data:', data);
        
        // Handle connection confirmation
        if (data.type === 'CONNECTION_ESTABLISHED') {
          console.log('✅ Server connection confirmed');
          return;
        }
        
        switch (data.type) {
          case 'USER_JOINED_ROOM':
            console.log('✅ Successfully joined room:', data.sessionId);
            console.log('✅ Participant count:', data.participantCount);
            console.log('✅ Received data:', data);
            console.log('✅ New participant name:', data.newParticipantName);
            console.log('✅ Current participant ID:', participant.id);
            console.log('✅ Joining user ID:', data.userId);
            
            // Set other participant if someone else joined
            if (data.participantCount === 2 && data.userId !== participant.id) {
              console.log('✅ Setting other participant with name:', data.newParticipantName);
              setOtherParticipant({
                id: data.userId || 'other-participant',
                name: data.newParticipantName || 'Other Participant',
                language: data.newParticipantLanguage || (participant.language === 'en-US' ? 'fr-CA' : 'en-US'),
                joinedAt: new Date(),
                isConnected: true
              });
            } else {
              console.log('✅ Not setting other participant. Reason:', {
                participantCount: data.participantCount,
                isSameUser: data.userId === participant.id
              });
            }
            break;
            
          case 'translation_ready':
            console.log('✅ Translation session is ready with 2 participants');
            console.log('✅ Both participants are now connected!');
            
            // Set other participant if not already set (using fallback since translation_ready doesn't include participant info)
            if (!otherParticipant) {
              console.log('✅ Setting other participant from translation_ready (fallback)');
              setOtherParticipant({
                id: 'other-participant',
                name: 'Other Participant',
                language: participant.language === 'en-US' ? 'fr-CA' : 'en-US',
                joinedAt: new Date(),
                isConnected: true
              });
            }
            break;
            
          case 'TRANSLATED_MESSAGE':
            console.log('✅ [FRONTEND] Received translated message from room:', data.message);
            console.log('✅ [FRONTEND] Message details:', {
              id: data.message.id,
              participantId: data.message.participantId,
              originalText: data.message.originalText,
              translatedText: data.message.translatedText,
              originalLanguage: data.message.originalLanguage,
              targetLanguage: data.message.targetLanguage
            });
            console.log('✅ [FRONTEND] Current messages count before adding:', messages.length);
            
            // Add the translated message to our messages array
            const newMessage = {
              id: data.message.id,
              participantId: data.message.participantId,
              originalText: data.message.originalText,
              translatedText: data.message.translatedText,
              originalLanguage: data.message.originalLanguage,
              targetLanguage: data.message.targetLanguage,
              timestamp: new Date(data.message.timestamp)
            };
            
            setMessages(prevMessages => {
              console.log('✅ [FRONTEND] Processing message with ID:', newMessage.id);
              console.log('✅ [FRONTEND] Current messages in state:', prevMessages.map(m => m.id));
              
              // Avoid duplicates
              const exists = prevMessages.find(msg => msg.id === newMessage.id);
              if (exists) {
                console.log('✅ [FRONTEND] Duplicate message, skipping:', newMessage.id);
                return prevMessages;
              }
              console.log('✅ [FRONTEND] Adding new message to state. Total will be:', prevMessages.length + 1);
              const newMessages = [...prevMessages, newMessage];
              console.log('✅ [FRONTEND] New messages array:', newMessages.map(m => ({ id: m.id, text: m.originalText })));
              return newMessages;
            });
            
            // Update the last translation display
            setLastTranslation(data.message.translatedText);
            break;
            
          case 'ROOM_HISTORY_UPDATE':
            console.log('✅ Received room history update:', data.messageHistory?.length, 'messages');
            if (data.messageHistory && data.messageHistory.length > 0) {
              const historyMessages = data.messageHistory.map(msg => ({
                id: msg.id,
                participantId: msg.participantId,
                originalText: msg.originalText,
                translatedText: msg.translatedText,
                originalLanguage: msg.originalLanguage,
                targetLanguage: msg.targetLanguage,
                timestamp: new Date(msg.timestamp)
              }));
              
              setMessages(historyMessages);
            }
            break;
            
          case 'SPEECH_TRANSCRIPT':
            console.log('✅ Received speech transcript from other participant:', data.originalText);
            
            // Don't add SPEECH_TRANSCRIPT to messages - wait for BILINGUAL_MESSAGE with translation
            // This ensures we only show translated text, not the original
            console.log('✅ [FRONTEND] Waiting for translation, not adding to messages yet');
            break;
            
          case 'translation_error':
            console.warn('⚠️ Translation error received:', data.message);
            // Don't block transcript processing - just log the error
            if (data.retryable) {
              console.log('✅ Translation error is retryable, continuing transcript processing');
            }
            break;
            
          case 'translation_timeout':
            console.warn('⚠️ Translation timeout for:', data.originalText);
            console.log('✅ Continuing transcript processing despite timeout');
            break;
            
          case 'AUDIO_CHUNK':
            console.log('🎵 ═══════════════════════════════════════════════════════');
            console.log('🎵 [AUDIO_CHUNK] Received audio chunk');
            console.log('🎵 [AUDIO_CHUNK] From participant:', data.participantId);
            console.log('🎵 [AUDIO_CHUNK] Speaker ID:', data.speakerId ?? 'not provided');
            console.log('🎵 [AUDIO_CHUNK] My participant ID:', participant.id);
            console.log('🎵 [AUDIO_CHUNK] Response ID:', data.responseId);
            console.log('🎵 [AUDIO_CHUNK] Audio data size:', data.audioData?.length || 0, 'bytes');
            console.log('🎵 [AUDIO_CHUNK] Player ready:', !!translatedAudioPlayerRef.current);
            console.log('🎵 ═══════════════════════════════════════════════════════');
            
            // ✅ BUG FIX #1: REMOVED speaker ID filter - both users must hear AI translation
            // The speaker SHOULD hear their own words translated back to them
            // That is the core product feature - real-time translation playback
            
            if (!data.audioData) {
              console.error('❌ [AUDIO_CHUNK] FAILED - No audioData in event');
              break;
            }
            
            if (!translatedAudioPlayerRef.current) {
              console.error('❌ [AUDIO_CHUNK] FAILED - Player not initialized');
              break;
            }
            
            try {
              // Resume audio context on first chunk (autoplay policy)
              translatedAudioPlayerRef.current.resume();
              
              // Enqueue PCM16 chunk directly - no conversion needed
              translatedAudioPlayerRef.current.enqueue(data.audioData);
              console.log('✅ [AUDIO_CHUNK] Successfully enqueued to PCM16Player');
            } catch (error) {
              console.error('❌ [AUDIO_CHUNK] FAILED to enqueue chunk:', error);
            }
            break;
            
          case 'TRANSLATED_AUDIO':
            console.log('🔊 ═══════════════════════════════════════════════════════');
            console.log('🔊 [TRANSLATED_AUDIO] Received translated audio');
            console.log('🔊 [TRANSLATED_AUDIO] From participant:', data.fromParticipant);
            console.log('🔊 [TRANSLATED_AUDIO] My participant ID:', participant.id);
            console.log('🔊 [TRANSLATED_AUDIO] Audio data size:', data.audioData?.length || 0, 'bytes');
            console.log('🔊 [TRANSLATED_AUDIO] Player ready:', !!translatedAudioPlayerRef.current);
            console.log('🔊 ═══════════════════════════════════════════════════════');
            
            if (!data.audioData) {
              console.error('❌ [TRANSLATED_AUDIO] FAILED - No audioData in event');
              break;
            }
            
            if (!translatedAudioPlayerRef.current) {
              console.error('❌ [TRANSLATED_AUDIO] FAILED - Player not initialized');
              break;
            }
            
            try {
              // Resume audio context (autoplay policy)
              translatedAudioPlayerRef.current.resume();
              
              // Enqueue PCM16 chunk directly
              translatedAudioPlayerRef.current.enqueue(data.audioData);
              console.log('✅ [TRANSLATED_AUDIO] Successfully enqueued to PCM16Player');
              console.log('🔊 [TRANSLATED_AUDIO] Playing for participant:', participant.id);
            } catch (error) {
              console.error('❌ [TRANSLATED_AUDIO] FAILED to enqueue chunk:', error);
            }
            break;
            
          case 'BILINGUAL_MESSAGE':
            console.log('📨 [BILINGUAL] Received bilingual message:', data.message);
            console.log('📨 [BILINGUAL] Message details:', {
              speakerId: data.message.speakerId,
              currentParticipant: participant.id,
              originalLanguage: data.message.originalLanguage,
              targetLanguage: data.message.targetLanguage,
              participantLanguage: participant.language,
              originalText: data.message.originalText?.substring(0, 50),
              translatedText: data.message.translatedText?.substring(0, 50)
            });
            
            // STRICT language separation (matching rajesh folder):
            // If viewer's language == message original language: they see original
            // Else: they see translation
            const isOwnMessage = data.message.speakerId === participant.id;
            const shouldShowOriginal = isSameLanguage(participant.language, data.message.originalLanguage);
            const displayText = shouldShowOriginal ? data.message.originalText : data.message.translatedText;
            
            console.log('✅ [BILINGUAL] Display logic:', {
              participantLanguage: participant.language,
              messageOriginalLanguage: data.message.originalLanguage,
              isOwnMessage,
              shouldShowOriginal,
              displayText: displayText.substring(0, 50) + '...'
            });
            
            // Create message for chat display
            const bilingualMessage = {
              id: data.message.id,
              participantId: data.message.speakerId,
              originalText: data.message.originalText,
              translatedText: data.message.translatedText,
              originalLanguage: data.message.originalLanguage,
              targetLanguage: data.message.targetLanguage,
              timestamp: new Date(data.message.timestamp)
            };
            
            setMessages(prevMessages => {
              // Avoid duplicates
              const exists = prevMessages.find(msg => msg.id === bilingualMessage.id);
              if (exists) {
                console.log('⚠️ [BILINGUAL] Duplicate message, skipping:', bilingualMessage.id);
                return prevMessages;
              }
              
              const newMessages = [...prevMessages, bilingualMessage];
              console.log('✅ [BILINGUAL] Added bilingual message to state. Total messages:', newMessages.length);
              console.log('✅ [BILINGUAL] New message details:', {
                id: bilingualMessage.id,
                participantId: bilingualMessage.participantId,
                originalText: bilingualMessage.originalText,
                translatedText: bilingualMessage.translatedText,
                originalLanguage: bilingualMessage.originalLanguage,
                targetLanguage: bilingualMessage.targetLanguage
              });
              console.log('✅ [BILINGUAL] All messages in array:', newMessages.map(m => ({
                id: m.id,
                participant: m.participantId,
                original: m.originalText?.substring(0, 30),
                translated: m.translatedText?.substring(0, 30)
              })));
              return newMessages;
            });
            
            // Also add to transcript history
            if ((window as any).handleTranscriptUpdate) {
              const transcriptHistoryMessage = {
                messageId: bilingualMessage.id,
                roomId: roomId,
                speakerId: data.message.speakerId,
                speakerName: data.message.speakerId === participant.id ? participant.name : (otherParticipant?.name || 'Other Participant'),
                sourceLanguage: data.message.originalLanguage,
                targetLanguage: data.message.targetLanguage,
                originalTranscript: data.message.originalText,
                translatedTranscript: data.message.translatedText,
                timestamp: data.timestamp,
                confidence: 0.9,
                processingTime: data.message.processingTime || 0
              };
              
              console.log('✅ [BILINGUAL] Adding to transcript history:', transcriptHistoryMessage);
              (window as any).handleTranscriptUpdate(transcriptHistoryMessage);
            }
            break;
            
          case 'transcript_delta':
            console.log('✅ Received transcript delta:', data.delta);
            // Handle real-time transcript streaming
            break;

          case 'PARTIAL_TRANSCRIPT':
            console.log('✅ Received partial transcript chunk:', data.delta);
            break;

          case 'TRANSLATION_DELTA':
            console.log('✅ Received translation delta:', data.delta);
            break;

          case 'VOICE_ACTIVITY_STARTED':
            console.log('✅ Voice activity started for participant:', data.participantId);
            break;

          case 'VOICE_ACTIVITY_STOPPED':
            console.log('✅ Voice activity stopped for participant:', data.participantId);
            break;
          
          case 'vad_speaking':
            console.log('🎤 [VAD] Received vad_speaking event:', {
              speakerId: data.speakerId,
              speaking: data.speaking,
              myId: participant.id
            });
            // This will be handled by the parent component to show speaking indicators
            break;
            
          case 'USER_LEFT_ROOM':
            console.log('✅ User left room:', data.userId);
            if (data.userId !== participant.id) {
              setOtherParticipant(null);
            }
            break;
            
          case 'translation_sent':
            console.log('✅ Translation sent confirmation:', data);
            // Optionally show confirmation to user
            break;
            
          case 'quality_feedback':
            console.log('✅ Quality feedback:', data);
            // Handle quality feedback display
            break;
            
          case 'session_complete':
            console.log('✅ Session complete:', data);
            // Handle session completion
            break;
            
          case 'TRANSCRIPT_MESSAGE_ADDED':
            console.log('✅ [FRONTEND] Received transcript message:', data.message);
            // Update transcript history via the recording hook
            if ((window as any).handleTranscriptUpdate) {
              (window as any).handleTranscriptUpdate(data.message);
            }
            break;
            
          case 'TRANSCRIPT_HISTORY_UPDATE':
            console.log('✅ [FRONTEND] Received transcript history update:', data.transcriptHistory?.length, 'messages');
            // This will be handled by the transcript recording hook
            break;
            
          case 'RECORDING_STARTED':
            console.log('✅ [FRONTEND] Recording started:', data.recordingId);
            // This will be handled by the transcript recording hook
            break;
            
          case 'RECORDING_STOPPED':
            console.log('✅ [FRONTEND] Recording stopped:', data.recordingId);
            // This will be handled by the transcript recording hook
            break;
            
          case 'RECORDING_READY':
            console.log('✅ [FRONTEND] Recording ready for download:', data.recordingUrl);
            // This will be handled by the transcript recording hook
            break;
            
          case 'SESSION_ENDED':
            console.log('✅ [FRONTEND] Session ended');
            if (data.transcriptDownloadUrl) {
              console.log('✅ Transcript available at:', data.transcriptDownloadUrl);
            }
            if (data.recordingDownloadUrl) {
              console.log('✅ Recording available at:', data.recordingDownloadUrl);
            }
            break;
            
          case 'system_error':
            console.error('❌ System error:', data.message);
            break;
            
          case 'error':
            console.error('❌ Server error:', data.message);
            break;
        }
        
        onEvent?.(data);
      } catch (error) {
        console.error('❌ Error parsing room message:', error);
        reportWebSocketError('Failed to parse WebSocket message', {
          roomId,
          rawData: String(event.data).slice(0, 500),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    ws.onclose = (event) => {
      console.log('Disconnected from chatroom. Code:', event.code, 'Reason:', event.reason);
      setIsConnected(false);
      setOtherParticipant(null);
      connectionAttemptRef.current = false;
      
      // Only auto-reconnect on unexpected disconnections, not normal closures
      if (event.code !== 1000 && event.code !== 1001) { // 1000 = normal, 1001 = going away
        console.log('Unexpected disconnection, will retry in 3 seconds...');
        reportWebSocketError('Unexpected WebSocket disconnection', {
          roomId,
          code: event.code,
          reason: event.reason,
        });
        setTimeout(() => {
          if (!connectionAttemptRef.current && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
            connect();
          }
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('Chatroom WebSocket error:', error);
      reportWebSocketError('WebSocket runtime error', {
        roomId,
        readyState: ws.readyState,
      });
      setIsConnected(false);
      connectionAttemptRef.current = false;
    };
  }, [roomId, participant, onEvent]);

  const disconnect = useCallback(() => {
    connectionAttemptRef.current = false;
    
    // Clean up translated audio player
    if (translatedAudioPlayerRef.current) {
      translatedAudioPlayerRef.current.dispose();
      translatedAudioPlayerRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected'); // Normal closure
      wsRef.current = null;
    }
    setIsConnected(false);
    setOtherParticipant(null);
  }, []);

  const sendEvent = useCallback((event: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Log ROOM_AUDIO_DATA less frequently to avoid spam
      if (event.type === 'ROOM_AUDIO_DATA') {
        // Only log every 100th audio chunk
        if (!(window as any)._audioChunkCount) (window as any)._audioChunkCount = 0;
        (window as any)._audioChunkCount++;
        if ((window as any)._audioChunkCount % 100 === 0) {
          console.log(`📤 [WebSocket] Sent ${event.type} #${(window as any)._audioChunkCount}`);
        }
      } else {
        console.log(`📤 [WebSocket] Sending ${event.type}`, event.participantId ? `from ${event.participantId}` : '');
      }
      wsRef.current.send(JSON.stringify(event));
    } else {
      console.warn(`⚠️ [WebSocket] Cannot send ${event.type} - connection not open (state: ${wsRef.current?.readyState})`);
    }
  }, []);

  const sendTranscript = useCallback((transcript: string, language: 'en-US' | 'fr-CA') => {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sendEvent({
      type: 'SPEECH_TRANSCRIPT',
      messageId,
      participantId: participant.id,
      transcript,
      language,
      timestamp: Date.now()
    });
  }, [participant.id, sendEvent]);

  const sendAudioStream = useCallback((audioData: string, targetParticipantId: string) => {
    sendEvent({
      type: 'AUDIO_STREAM',
      participantId: participant.id,
      audioData,
      targetParticipantId
    });
  }, [participant.id, sendEvent]);

  const sendTranslatedAudio = useCallback((audioData: string, originalText: string, translatedText: string) => {
    // ⚠️ DISABLED: Backend now handles all translation and TTS generation
    // Frontend no longer sends translated audio - backend generates it via TTS-1
    console.log('⚠️ [DISABLED] sendTranslatedAudio called but DISABLED - backend handles TTS now');
    return;
    
    /* ========== OLD CODE - DISABLED ========== */
    /*
    const messageId = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sendEvent({
      type: 'TRANSLATED_AUDIO',
      messageId,
      participantId: participant.id,
      audioData,
      originalText,
      translatedText,
      timestamp: Date.now()
    });
    */
    /* ========== END OLD CODE ========== */
  }, [participant.id, sendEvent]);

  const sendBilingualMessage = useCallback((originalText: string, translatedText: string, originalLanguage: 'en-US' | 'fr-CA', messageId?: string) => {
    // Use provided message ID or generate new one if not provided
    const finalMessageId = messageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const targetLanguage = originalLanguage === 'en-US' ? 'fr-CA' : 'en-US';
    const sanitizedTranslation = (translatedText || '')
      .replace(/^ERROR:\s*Only English and French supported\s*/i, '')
      .trim();

    if (!sanitizedTranslation) {
      console.warn('⚠️ [sendBilingualMessage] Skipping send due to empty sanitized translation', {
        messageId: finalMessageId,
        originalLanguage,
      });
      return;
    }
    
    console.log('📤 [sendBilingualMessage] Sending to server:', {
      messageId: finalMessageId,
      providedId: messageId,
      isOriginalId: !!messageId,
      originalText: originalText?.substring(0, 50),
      translatedText: sanitizedTranslation?.substring(0, 50),
      originalLanguage,
      targetLanguage,
      wsReady: wsRef.current?.readyState === WebSocket.OPEN
    });
    
    sendEvent({
      type: 'BILINGUAL_MESSAGE',
      message: {
        id: finalMessageId,
        speakerId: participant.id,
        originalText,
        translatedText: sanitizedTranslation,
        originalLanguage,
        targetLanguage,
        timestamp: Date.now()
      }
    });
    
    console.log('✅ [sendBilingualMessage] Message sent via WebSocket');
  }, [participant.id, sendEvent]);

  const sendPartialTranscript = useCallback((delta: string, itemId: string) => {
    sendEvent({
      type: 'PARTIAL_TRANSCRIPT',
      sessionId: roomId,
      participantId: participant.id,
      delta,
      itemId,
      timestamp: Date.now(),
    });
  }, [participant.id, roomId, sendEvent]);

  const sendTranslationDelta = useCallback((delta: string, responseId: string, targetLanguage: 'en-US' | 'fr-CA') => {
    sendEvent({
      type: 'TRANSLATION_DELTA',
      sessionId: roomId,
      participantId: participant.id,
      delta,
      responseId,
      targetLanguage,
      timestamp: Date.now(),
    });
  }, [participant.id, roomId, sendEvent]);

  const sendAudioChunk = useCallback((audioData: string, responseId: string, sequenceNumber?: number) => {
    sendEvent({
      type: 'AUDIO_CHUNK',
      sessionId: roomId,
      participantId: participant.id,
      audioData: audioData,
      responseId,
      chunkId: `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    });
  }, [participant.id, roomId, sendEvent]);

  const sendAudioStreamEnd = useCallback((responseId: string) => {
    // Note: AUDIO_STREAM_END is not in the ChatroomEvent type definition
    // Sending as generic event
    sendEvent({
      type: 'AUDIO_STREAM_END',
      sessionId: roomId,
      participantId: participant.id,
      responseId,
      timestamp: Date.now(),
    });
  }, [participant.id, roomId, sendEvent]);

  const sendAIAudioChunk = useCallback((audioData: string, sequenceNumber: number) => {
    sendEvent({
      type: 'AI_AUDIO_CHUNK',
      sessionId: roomId,
      participantId: participant.id,
      audioData: audioData,
      seq: sequenceNumber,
      timestamp: Date.now(),
    });
  }, [participant.id, roomId, sendEvent]);

  const sendAIAudioEnd = useCallback(() => {
    sendEvent({
      type: 'AI_AUDIO_END',
      sessionId: roomId,
      participantId: participant.id,
      timestamp: Date.now(),
    });
  }, [participant.id, roomId, sendEvent]);

  const sendVoiceActivity = useCallback((type: 'VOICE_ACTIVITY_STARTED' | 'VOICE_ACTIVITY_STOPPED') => {
    sendEvent({
      type,
      sessionId: roomId,
      participantId: participant.id,
      timestamp: Date.now(),
    });
  }, [participant.id, roomId, sendEvent]);

  const sendRoomAudioData = useCallback((audioData: string) => {
    sendEvent({
      type: 'ROOM_AUDIO_DATA',
      participantId: participant.id,
      sessionId: roomId,
      audioData,
    });
  }, [participant.id, roomId, sendEvent]);

  const sendStopSpeaking = useCallback(() => {
    sendEvent({
      type: 'STOP_SPEAKING',
      participantId: participant.id,
      sessionId: roomId,
    });
  }, [participant.id, roomId, sendEvent]);

  const startRecording = useCallback(() => {
    sendEvent({
      type: 'START_RECORDING'
    });
  }, [sendEvent]);

  const stopRecording = useCallback(() => {
    sendEvent({
      type: 'STOP_RECORDING'
    });
  }, [sendEvent]);

  const requestTranscriptHistory = useCallback(() => {
    sendEvent({
      type: 'GET_TRANSCRIPT_HISTORY'
    });
  }, [sendEvent]);

  const endSession = useCallback(() => {
    sendEvent({
      type: 'END_SESSION'
    });
  }, [sendEvent]);

  useEffect(() => {
    // Only connect once when component mounts
    let mounted = true;
    
    const connectOnce = () => {
      if (mounted && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
        connect();
      }
    };
    
    connectOnce();
    
    return () => {
      mounted = false;
      disconnect();
    };
  }, []); // Remove dependencies to prevent reconnections

  // Separate effect for participant/roomId changes - removed since we handle this in connect()
  // The WebSocket connection handles participant joining automatically

  return {
    isConnected,
    room,
    messages,
    otherParticipant,
    lastTranslation,
    connect,
    disconnect,
    sendEvent,
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
    sendRoomAudioData, // NEW: Send mic audio to backend
    sendStopSpeaking, // NEW: Tell backend to flush audio
    startRecording,
    stopRecording,
    requestTranscriptHistory,
    endSession,
    handleUserGesture // Export user gesture handler
  };
}
