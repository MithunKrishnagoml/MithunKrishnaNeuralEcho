import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, LogOut } from 'lucide-react';
import { useChatroomWS } from '@/hooks/useChatroomWS';
import { useOpenAIRealtime } from '@/hooks/useOpenAIRealtime';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';

interface TranscriptMessage {
  text: string;
  timestamp: number;
}

interface TranscriptEntry {
  id: string;
  originalText: string;
  translatedText: string;
  status: 'streaming' | 'done';
  timestamp: number;
}

// Virtualized Transcript List Component
const TranscriptList = React.memo(({ entries, emptyMessage }: {
  entries: TranscriptEntry[];
  emptyMessage: string;
}) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only scroll on new entry, not on delta updates
    if (entries.length > 0) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length]); // Only depend on length, not content

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {entries.map((entry, i) =>
        i < entries.length - 1
          ? <FrozenTranscriptEntry key={entry.id} entry={entry} />
          : <LiveTranscriptEntry key={entry.id} entry={entry} />
      )}
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
      <div ref={endRef} />
    </div>
  );
});

const FrozenTranscriptEntry = React.memo(({ entry }: { entry: TranscriptEntry }) => (
  <div className={`p-2 rounded bg-slate-800`}>
    <p className="text-sm text-foreground">{entry.originalText}</p>
    {entry.translatedText && (
      <p className="text-sm text-blue-400 mt-1">{entry.translatedText}</p>
    )}
    <p className="text-xs text-muted-foreground">
      {new Date(entry.timestamp).toLocaleTimeString()}
    </p>
  </div>
), () => true); // Never re-render frozen entries

const LiveTranscriptEntry = ({ entry }: { entry: TranscriptEntry }) => (
  <div className={`p-2 rounded ${entry.status === 'streaming' ? 'bg-blue-950 border-l-2 border-blue-500' : 'bg-slate-800'}`}>
    <p className="text-sm text-foreground">{entry.originalText}</p>
    {entry.translatedText && (
      <p className="text-sm text-blue-400 mt-1">{entry.translatedText}</p>
    )}
    <p className="text-xs text-muted-foreground">
      {new Date(entry.timestamp).toLocaleTimeString()}
      {entry.status === 'streaming' && <span className="ml-2 text-blue-500">•</span>}
    </p>
  </div>
);

export function RoomInterface() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [userId] = useState(() => `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  
  // Check if user needs to enter name/language
  const hasUserInfo = searchParams.has('name') && searchParams.has('language');
  const [showJoinForm, setShowJoinForm] = useState(!hasUserInfo);
  const [formName, setFormName] = useState('');
  const [formLanguage, setFormLanguage] = useState('en');
  
  const userName = searchParams.get('name') || 'User';
  const userLanguage = searchParams.get('language') || 'en';
  const [incomingTranscriptAccumulator, setIncomingTranscriptAccumulator] = useState('');
  const audioQueueRef = useRef<{ audio: string; timestamp: number }[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);

  const {
    status: wsStatus,
    errorMessage,
    otherParticipant,
    myTranscripts,
    incomingTranscripts,
    sendTranscript,
    sendMuteState,
    sendAudioChunk,
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
    },
    onPeerAudioChunk: (chunk) => {
      // Queue audio chunk for playback
      audioQueueRef.current.push(chunk);
      console.log('🎵 [Audio] Queued chunk from peer, queue size:', audioQueueRef.current.length);
      
      // Start playback if not already playing
      if (!isPlayingRef.current) {
        playNextAudioChunk();
      }
    }
  });

  // Function to play audio chunks sequentially
  const playNextAudioChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift();
    if (!chunk) {
      isPlayingRef.current = false;
      return;
    }

    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      
      // Decode base64 to PCM16
      const binaryString = atob(chunk.audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert PCM16 to Float32
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Create audio buffer
      const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      // Play buffer
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        // Play next chunk after this one finishes
        playNextAudioChunk();
      };
      source.start(0);

      console.log('🎵 [Audio] Playing chunk, queue remaining:', audioQueueRef.current.length);
    } catch (error) {
      console.error('❌ [Audio] Error playing chunk:', error);
      // Try next chunk
      playNextAudioChunk();
    }
  }, []);

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
    sendTranscriptToBackend: sendTranscript,
    onTranslatedAudioChunk: (chunk) => {
      // Send translated audio to peer via WebSocket
      console.log('🎵 [Audio] Got translated audio chunk, sending to peer');
      sendAudioChunk(chunk.audio, chunk.timestamp);
    }
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

  const handleJoinFormSubmit = () => {
    if (!formName.trim()) {
      alert('Please enter your name');
      return;
    }
    // Navigate with name and language in query params
    navigate(`/room/${roomId}?name=${encodeURIComponent(formName)}&language=${formLanguage}`);
    setShowJoinForm(false);
  };

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
    <div className="min-h-screen bg-background p-4 relative">
      {/* Background Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <span className="text-8xl font-bold text-muted-foreground/10 select-none whitespace-nowrap">
          GoML - NeuralEcho
        </span>
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Join Form Dialog */}
        {showJoinForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="bg-card border-border w-96">
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold mb-4">Join Bilingual Chatroom</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Your Name</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-3 py-2 border border-border rounded bg-background text-foreground placeholder:text-muted-foreground"
                      onKeyPress={(e) => e.key === 'Enter' && handleJoinFormSubmit()}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Language</label>
                    <select
                      value={formLanguage}
                      onChange={(e) => setFormLanguage(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded bg-background text-foreground"
                    >
                      <option value="en">English</option>
                      <option value="fr">Français</option>
                      <option value="es">Español</option>
                      <option value="de">Deutsch</option>
                      <option value="it">Italiano</option>
                      <option value="pt">Português</option>
                      <option value="ja">日本語</option>
                      <option value="zh">中文</option>
                    </select>
                  </div>
                  <Button onClick={handleJoinFormSubmit} className="w-full bg-blue-600 hover:bg-blue-700">
                    Join Room
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

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
        {errorMessage === 'Room not found' && (
          <div className="mb-4 p-4 bg-red-950 border border-red-700 rounded-lg">
            <p className="text-sm font-semibold text-red-200 mb-2">
              ⚠️ Critical Error: Room Not Found
            </p>
            <p className="text-sm text-red-300 mb-2">
              The room does not exist on the server. This usually happens when:
            </p>
            <ul className="text-sm text-red-300 space-y-1 ml-4">
              <li>• Server restarted (daily on free tier)</li>
              <li>• Room expired after 2 hours of inactivity</li>
              <li>• Link is invalid or from an old session</li>
            </ul>
            <p className="text-sm text-red-300 mt-2">
              <strong>Solution:</strong> Ask the creator to share a new fresh invite link.
            </p>
            <Button 
              onClick={handleLeaveRoom} 
              variant="destructive" 
              size="sm"
              className="mt-3"
            >
              Go Back & Get New Link
            </Button>
          </div>
        )}

        {/* Connection Error Alert */}
        {wsStatus === 'disconnected' && errorMessage !== 'Room not found' && (
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
              <TranscriptList
                entries={myTranscripts}
                emptyMessage="Start speaking to see your transcript..."
              />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3 text-foreground">Translated Speech</h3>
              <TranscriptList
                entries={incomingTranscripts}
                emptyMessage="Waiting for translation..."
              />
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