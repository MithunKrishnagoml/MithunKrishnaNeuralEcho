import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Users, Loader2, ArrowRight } from 'lucide-react';
import { ChatroomInterface } from '@/components/ChatroomInterface';
import { ChatroomParticipant } from '@/types/chatroom';
import { toast } from 'sonner';
import { BACKEND_URL } from '@/lib/config';

const JoinRoom = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'en-US' | 'fr-CA'>('en-US');
  const [isJoining, setIsJoining] = useState(false);
  const [participant, setParticipant] = useState<ChatroomParticipant | null>(null);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) {
      toast.error('Invalid room link');
      navigate('/chatroom');
      return;
    }

    toast.info(`Ready to join room: ${roomId}`, {
      description: 'Enter your name and language to join the conversation!'
    });
  }, [roomId, navigate]);

  const generateParticipantId = () => {
    return `participant-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  };

  const handleJoinRoom = async () => {
    if (!name.trim() || !roomId) {
      toast.error('Please enter your name');
      return;
    }

    setIsJoining(true);
    
    try {
      // Check if room exists by calling the server
      const response = await fetch(`${BACKEND_URL}/api/session/${roomId}/status`);
      
      if (!response.ok) {
        if (response.status === 404) {
          toast.error('Room not found', {
            description: 'This room may have expired or the link is invalid.'
          });
          return;
        }
        throw new Error('Failed to check room status');
      }

      const roomStatus = await response.json();
      
      if (roomStatus.participantCount >= 2) {
        toast.error('Room is full', {
          description: 'This room already has 2 participants.'
        });
        return;
      }

      // Create participant and join
      const newParticipant: ChatroomParticipant = {
        id: generateParticipantId(),
        name: name.trim(),
        language,
        joinedAt: new Date(),
        isConnected: true
      };

      setParticipant(newParticipant);
      setCurrentRoom(roomId);
      
      toast.success(`Joined room: ${roomId}`, {
        description: `Welcome ${name}! Connecting to translation session...`
      });

    } catch (error) {
      console.error('Error joining room:', error);
      toast.error('Failed to join room', {
        description: 'Please check your connection and try again.'
      });
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveRoom = () => {
    setParticipant(null);
    setCurrentRoom(null);
    navigate('/chatroom');
  };

  // If already joined, show the chatroom interface
  if (participant && currentRoom) {
    return (
      <ChatroomInterface 
        roomId={currentRoom}
        participant={participant}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  // Show join form
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

        {/* Room Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5" />
              Room: {roomId}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                disabled={isJoining}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Your Language</Label>
              <Select value={language} onValueChange={(value: 'en-US' | 'fr-CA') => setLanguage(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-US"> English</SelectItem>
                  <SelectItem value="fr-CA"> Franais</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleJoinRoom} 
              disabled={!name.trim() || isJoining}
              className="w-full"
            >
              {isJoining ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Joining Room...
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

        {/* Back to Chatroom */}
        <div className="text-center">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/chatroom')}
            disabled={isJoining}
          >
             Back to Chatroom
          </Button>
        </div>
      </div>
    </div>
  );
};

export default JoinRoom;