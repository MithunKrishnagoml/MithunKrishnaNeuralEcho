import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, LogOut } from 'lucide-react';
import { useChatroomWS } from '@/hooks/useChatroomWS';
import { useOpenAIRealtime } from '@/hooks/useOpenAIRealtime';
import { useParams, useSearchParams } from 'react-router-dom';

interface TranscriptMessage {
  text: string;
  timestamp: number;
}

export function RoomInterface() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const [userId] = useState(() => `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const userName = searchParams.get('name') || 'User';
  const userLanguage = searchParams.get('language') || 'en';
  const [incomingTranscriptAccumulator, setIncomingTranscriptAccumulator] = useState('');

  const {
    status: wsStatus,
    otherParticipant,
    myTranscripts,
    incomingTranscripts,
    sendTranscript,
    sendMuteState,
    leaveRoom
  } = useChatroomWS({
    roomId: roomId!,
    userId,
    userName,
    userLanguage,
    onRoomReady: (participant) => {
      console.log('Room ready with participant:', participant);
    },
    onMyTranscript: (text) => {
      // Already handled by sendTranscript in hook
    },
    onIncomingTranscript: (text, speakerId) => {
      // Already handled by sendTranscript in hook
    },
    onPeerLeft: () => {
      console.log('Peer left');
    },
    onPeerMuteState: (peerId, isMuted) => {
      console.log('Peer mute state:', peerId, isMuted);
    }
  });

  const {
    status: openaiStatus,
    isMuted,
    isVoiceActive,
    startMic,
    stopMic,
    mute,
    unmute
  } = useOpenAIRealtime({
    myLanguage: userLanguage,
    targetLanguage: otherParticipant?.language === 'en' ? 'fr' : 'en',
    onMyTranscript: (text) => {
      sendTranscript(text, 'MY');
    },
    onIncomingTranscriptDelta: (delta) => {
      setIncomingTranscriptAccumulator(prev => prev + delta);
    },
    onIncomingTranscriptDone: (text) => {
      sendTranscript(text, 'INCOMING');
      setIncomingTranscriptAccumulator('');
    },
    onVoiceActivityStart: () => {
      console.log('Voice activity started');
    },
    onVoiceActivityStop: () => {
      console.log('Voice activity stopped');
    },
    sendTranscriptToBackend: sendTranscript
  });

  const handleMuteToggle = useCallback(() => {
    if (isMuted) {
      unmute();
      sendMuteState(false);
    } else {
      mute();
      sendMuteState(true);
    }
  }, [isMuted, mute, unmute, sendMuteState]);

  const handleLeaveRoom = useCallback(() => {
    stopMic();
    leaveRoom();
    // Navigate back to chatroom page
    window.location.href = '/chatroom';
  }, [stopMic, leaveRoom]);

  // Start OpenAI connection when room is ready
  useEffect(() => {
    if (wsStatus === 'ready' && openaiStatus === 'disconnected') {
      startMic();
    }
  }, [wsStatus, openaiStatus, startMic]);

  const connectionStatus = wsStatus === 'ready' && openaiStatus === 'connected' ? 'ready' :
                          wsStatus === 'connecting' || openaiStatus === 'connecting' ? 'connecting' :
                          wsStatus === 'waiting' ? 'waiting' : 'disconnected';

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-foreground">Bilingual Chatroom</h1>
            <Badge variant={connectionStatus === 'ready' ? 'default' : connectionStatus === 'disconnected' ? 'destructive' : 'secondary'} className={connectionStatus === 'ready' ? 'bg-green-600' : connectionStatus === 'disconnected' ? 'bg-red-600' : 'bg-yellow-600'}>
              {connectionStatus === 'ready' ? '🟢 Connected' :
               connectionStatus === 'connecting' ? '🟡 Connecting...' :
               connectionStatus === 'waiting' ? '🟡 Waiting for participant...' :
               '🔴 Disconnected'}
            </Badge>
          </div>
          <Button onClick={handleLeaveRoom} variant="outline" className="border-border">
            <LogOut className="w-4 h-4 mr-2" />
            Leave Room
          </Button>
        </div>

        {/* Connection Error Alert */}
        {wsStatus === 'disconnected' && (
          <div className="mb-4 p-4 bg-red-950 border border-red-700 rounded-lg">
            <p className="text-sm text-red-200">
              ⚠️ WebSocket connection lost. Attempting to reconnect...
            </p>
          </div>
        )}

        {/* Participant Info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{userName} (You)</h3>
                  <p className="text-sm text-muted-foreground">{userLanguage.toUpperCase()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isVoiceActive && <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                  <Button
                    onClick={handleMuteToggle}
                    variant={isMuted ? 'destructive' : 'default'}
                    size="sm"
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {otherParticipant ? otherParticipant.name : 'Waiting...'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {otherParticipant ? otherParticipant.language.toUpperCase() : ''}
                  </p>
                </div>
                {otherParticipant && (
                  <div className="text-sm text-muted-foreground">
                    {otherParticipant.language === userLanguage ? 'Same language' : 'Different language'}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transcripts */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3 text-foreground">Your Speech</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {myTranscripts.map((transcript) => (
                  <div key={transcript.id} className={`p-2 rounded ${transcript.status === 'streaming' ? 'bg-blue-950 border-l-2 border-blue-500' : 'bg-slate-800'}`}>
                    <p className="text-sm text-foreground">{transcript.originalText}</p>
                    {transcript.translatedText && (
                      <p className="text-sm text-blue-400 mt-1">{transcript.translatedText}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(transcript.timestamp).toLocaleTimeString()}
                      {transcript.status === 'streaming' && <span className="ml-2 text-blue-500">•</span>}
                    </p>
                  </div>
                ))}
                {myTranscripts.length === 0 && (
                  <p className="text-sm text-muted-foreground">Start speaking to see your transcript...</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3 text-foreground">Translated Speech</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {incomingTranscripts.map((transcript) => (
                  <div key={transcript.id} className={`p-2 rounded ${transcript.status === 'streaming' ? 'bg-green-950 border-l-2 border-green-500' : 'bg-slate-800'}`}>
                    <p className="text-sm text-foreground">{transcript.originalText}</p>
                    {transcript.translatedText && (
                      <p className="text-sm text-green-400 mt-1">{transcript.translatedText}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(transcript.timestamp).toLocaleTimeString()}
                      {transcript.status === 'streaming' && <span className="ml-2 text-green-500">•</span>}
                    </p>
                  </div>
                ))}
                {incomingTranscripts.length === 0 && (
                  <p className="text-sm text-muted-foreground">Waiting for translation...</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        {isMuted && (
          <div className="mt-6 p-4 bg-yellow-950 border border-yellow-700 rounded-lg">
            <p className="text-sm text-yellow-200">
              You are currently muted. Click the microphone button to start speaking.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}