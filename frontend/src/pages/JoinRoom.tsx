import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Users, Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import { ChatroomInterface } from '@/components/ChatroomInterface';
import { ChatroomParticipant } from '@/types/chatroom';
import { BACKEND_URL } from '@/lib/config';

// Detect browser language and pre-select French if applicable
function detectLanguage(): 'en-US' | 'fr-CA' {
  const lang = navigator.language || '';
  return lang.toLowerCase().startsWith('fr') ? 'fr-CA' : 'en-US';
}

const JoinRoom = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // ✅ DEBUG: Confirm we're on the join room page
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎯 [ROUTE] /join/:roomId page loaded');
  console.log('🎯 [ROUTE] Room ID from URL:', roomId || 'MISSING');
  console.log('🎯 [ROUTE] Full URL:', window.location.href);
  console.log('═══════════════════════════════════════════════════════');

  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'en-US' | 'fr-CA'>(detectLanguage);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<ChatroomParticipant | null>(null);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);

  // If no roomId in URL at all, stay on page and show error — do NOT silently redirect
  useEffect(() => {
    if (!roomId) {
      setError('No session ID found in this link. Please ask the host to share the link again.');
    }
  }, [roomId]);

  const generateParticipantId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `participant-${crypto.randomUUID()}`;
    }
    return `participant-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  const handleJoin = async () => {
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!roomId) return;

    setError(null);
    setIsJoining(true);

    try {
      // Verify session exists and is not full
      const statusRes = await fetch(`${BACKEND_URL}/api/session/${roomId}/status`);

      if (statusRes.status === 404) {
        setError('This session does not exist or has already ended.');
        return;
      }

      if (!statusRes.ok) {
        setError('Could not reach the server. Please check your connection and try again.');
        return;
      }

      const roomStatus = await statusRes.json();

      if (roomStatus.participantCount >= 2) {
        setError('This room is full (2/2 participants). Please ask the host to create a new room.');
        return;
      }

      // Join the session on the backend
      const joinRes = await fetch(`${BACKEND_URL}/api/session/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: roomId, language }),
      });

      if (!joinRes.ok) {
        const err = await joinRes.json().catch(() => ({}));
        setError(err.error || 'Failed to join the session. Please try again.');
        return;
      }

      // All good — enter the chatroom
      const newParticipant: ChatroomParticipant = {
        id: generateParticipantId(),
        name: name.trim(),
        language,
        joinedAt: new Date(),
        isConnected: true,
      };

      setParticipant(newParticipant);
      setCurrentRoom(roomId);

    } catch {
      setError('Could not connect to the server. Please check your internet connection.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveRoom = () => {
    setParticipant(null);
    setCurrentRoom(null);
    navigate('/chatroom');
  };

  // Already joined — show chatroom directly
  if (participant && currentRoom) {
    return (
      <ChatroomInterface
        roomId={currentRoom}
        participant={participant}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Globe className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold">Join Translation Room</h1>
          </div>
          <p className="text-muted-foreground">
            Real-time voice translation between English and French
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Join form — always shown so user knows what went wrong */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5" />
              {roomId ? `Room: ${roomId}` : 'Invalid Link'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                disabled={isJoining || !roomId}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Your Language</Label>
              <Select
                value={language}
                onValueChange={(v: 'en-US' | 'fr-CA') => setLanguage(v)}
                disabled={isJoining || !roomId}
              >
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-US">🇬🇧 English</SelectItem>
                  <SelectItem value="fr-CA">🇫🇷 Français</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleJoin}
              disabled={!name.trim() || isJoining || !roomId}
              className="w-full"
            >
              {isJoining ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Join Room
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="ghost" onClick={() => navigate('/chatroom')} disabled={isJoining}>
            ← Back to Chatroom
          </Button>
        </div>
      </div>
    </div>
  );
};

export default JoinRoom;
