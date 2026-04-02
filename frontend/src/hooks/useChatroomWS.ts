import { useState, useEffect, useCallback, useRef } from 'react';
import { WS_URL } from '@/lib/config';

interface TranscriptMessage {
  id: string;
  speakerId: string;
  speakerName?: string;
  originalText: string;
  translatedText: string;
  status: 'streaming' | 'done';
  timestamp: number;
  wordCount?: number;
}

interface OtherParticipant {
  id: string;
  name: string;
  language: string;
}

interface UseChatroomWSProps {
  roomId: string;
  userId: string;
  userName: string;
  userLanguage: string;
  onRoomReady?: (otherParticipant: OtherParticipant) => void;
  onMyTranscript?: (text: string) => void;
  onIncomingTranscript?: (text: string, speakerId: string) => void;
  onPeerLeft?: () => void;
  onPeerMuteState?: (peerId: string, isMuted: boolean) => void;
  onPeerAudioChunk?: (chunk: { audio: string; timestamp: number; peerId: string }) => void;
}

export function useChatroomWS({
  roomId,
  userId,
  userName,
  userLanguage,
  onRoomReady,
  onMyTranscript,
  onIncomingTranscript,
  onPeerLeft,
  onPeerMuteState,
  onPeerAudioChunk
}: UseChatroomWSProps) {
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'ready' | 'disconnected'>('connecting');
  const [otherParticipant, setOtherParticipant] = useState<OtherParticipant | null>(null);
  const [myTranscripts, setMyTranscripts] = useState<TranscriptMessage[]>([]);
  const [incomingTranscripts, setIncomingTranscripts] = useState<TranscriptMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deltaBufferRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const destroyedRef = useRef<boolean>(false);
  
  // Use refs to avoid re-creating connect callback on every prop change
  const userNameRef = useRef(userName);
  const userLanguageRef = useRef(userLanguage);
  
  // Update refs when props change (they won't trigger useEffect re-run)
  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);
  
  useEffect(() => {
    userLanguageRef.current = userLanguage;
  }, [userLanguage]);

  // Connection handler - moved into useEffect to avoid dependency array issues
  // This creates a stable function that doesn't cause the effect to re-run

  const sendTranscript = useCallback((data: string | object, direction: 'MY' | 'INCOMING' | 'DELTA' | 'SENTENCE_DONE') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (direction === 'DELTA' && typeof data === 'object') {
        wsRef.current.send(JSON.stringify({
          type: 'TRANSCRIPT_DELTA',
          roomId,
          userId,
          ...data
        }));
      } else if (direction === 'SENTENCE_DONE') {
        wsRef.current.send(JSON.stringify({
          type: 'SENTENCE_DONE',
          roomId,
          userId,
          sentenceId: (data as any).sentenceId
        }));
      } else {
        // Legacy format for backward compatibility
        wsRef.current.send(JSON.stringify({
          type: 'TRANSCRIPT',
          roomId,
          userId,
          text: data,
          direction
        }));
      }
    }
  }, [roomId, userId]);

  const sendMuteState = useCallback((isMuted: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'MUTE_STATE',
        roomId,
        userId,
        isMuted
      }));
    }
  }, [roomId, userId]);

  const sendAudioChunk = useCallback((audio: string, timestamp: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'AUDIO_CHUNK',
        roomId,
        userId,
        audio,
        timestamp
      }));
    }
  }, [roomId, userId]);

  const leaveRoom = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'LEAVE_ROOM',
        roomId,
        userId
      }));
    }
  }, [roomId, userId]);

  // Connection handler - moved into useEffect to avoid dependency array issues
  // This creates a stable function that doesn't cause the effect to re-run

  useEffect(() => {
    // Reset destroyed flag when component mounts
    destroyedRef.current = false;

    const connect = () => {
      // Guard: don't reconnect if component was unmounted
      if (destroyedRef.current) {
        console.log('🔌 [WS] Ignoring connect() after unmount');
        return;
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('🔌 [WS] Already connected, skipping');
        return;
      }

      // Use backend WebSocket URL from environment
      console.log('🔌 [WS] Connecting to:', WS_URL);
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🔌 [WS] Connected to backend');
        setStatus('connecting');

        // Send JOIN_ROOM immediately after connect
        ws.send(JSON.stringify({
          type: 'JOIN_ROOM',
          roomId,
          userId,
          name: userNameRef.current,
          language: userLanguageRef.current
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 [WS] Received:', data.type);

          switch (data.type) {
            case 'WAITING':
              setStatus('waiting');
              break;

            case 'ROOM_READY':
              setStatus('ready');
              setOtherParticipant(data.otherParticipant);
              onRoomReady?.(data.otherParticipant);
              break;

            case 'MY_TRANSCRIPT':
              const myTranscript: TranscriptMessage = {
                id: `my-${Date.now()}`,
                speakerId: userId,
                speakerName: userNameRef.current,
                originalText: data.text,
                translatedText: data.text,
                status: 'done',
                timestamp: Date.now()
              };
              setMyTranscripts(prev => [...prev, myTranscript]);
              onMyTranscript?.(data.text);
              break;

            case 'INCOMING_TRANSCRIPT':
              const incomingTranscript: TranscriptMessage = {
                id: `incoming-${Date.now()}`,
                speakerId: data.speakerId,
                speakerName: data.speakerName,
                originalText: data.text,
                translatedText: data.text,
                status: 'done',
                timestamp: Date.now()
              };
              setIncomingTranscripts(prev => [...prev, incomingTranscript]);
              onIncomingTranscript?.(data.text, data.speakerId);
              break;

            case 'PEER_LEFT':
              setStatus('disconnected');
              setOtherParticipant(null);
              onPeerLeft?.();
              break;

            case 'PEER_TRANSCRIPT_DELTA':
              // Accumulate deltas and flush with rAF debouncing
              deltaBufferRef.current = {
                sentenceId: data.sentenceId,
                speakerId: data.speakerId,
                speakerName: data.speakerName,
                originalText: data.originalText,
                translatedText: data.translatedText,
                timestamp: data.timestamp
              };

              if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(() => {
                  const d = deltaBufferRef.current;
                  setIncomingTranscripts(prev => {
                    const exists = prev.find(t => t.id === d.sentenceId);
                    if (!exists) {
                      return [...prev, {
                        id: d.sentenceId,
                        speakerId: d.speakerId,
                        speakerName: d.speakerName,
                        originalText: d.originalText,
                        translatedText: d.translatedText,
                        status: 'streaming',
                        timestamp: d.timestamp
                      }];
                    }
                    return prev.map(t =>
                      t.id === d.sentenceId
                        ? { ...t,
                            originalText: d.originalText,
                            translatedText: d.translatedText }
                        : t
                    );
                  });
                  rafRef.current = null;
                });
              }
              break;

            case 'PEER_TRANSCRIPT_SENTENCE_DONE':
              setIncomingTranscripts(prev =>
                prev.map(t =>
                  t.id === data.sentenceId
                    ? { ...t, status: 'done' }
                    : t
                )
              );
              break;

            case 'PEER_AUDIO_CHUNK':
              // Pass audio chunk to parent component for playback
              onPeerAudioChunk?.({
                audio: data.audio,
                timestamp: data.timestamp,
                peerId: data.peerId
              });
              break;

            case 'ERROR':
              console.error('❌ [WS] Error:', data.message);
              setStatus('disconnected');
              break;
          }
        } catch (error) {
          console.error('❌ [WS] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log('🔌 [WS] Disconnected');
        setStatus('disconnected');
        wsRef.current = null;

        // Auto-reconnect after 3 seconds, but guard against unmounted components
        if (!destroyedRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!destroyedRef.current) {
              connect();
            }
          }, 3000);
        }
      };

      ws.onerror = (event: Event) => {
        const wsEvent = event as Event;
        console.error('❌ [WS] WebSocket error:', wsEvent);
        setStatus('disconnected');
      };
    };

    // Initiate connection
    connect();

    // Cleanup: runs on unmount or when roomId/userId changes
    return () => {
      destroyedRef.current = true;  // ← Stop reconnect loop

      // Cancel any pending reconnect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Cancel any pending rAF
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // Close the WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      console.log('🔌 [WS] Component unmounted, cleanup complete');
    };
  }, [roomId, userId]);

  return {
    status,
    otherParticipant,
    myTranscripts,
    incomingTranscripts,
    sendTranscript,
    sendMuteState,
    sendAudioChunk,
    leaveRoom
  };
}