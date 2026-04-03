import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RoomJoinCreate } from '@/components/RoomJoinCreate';
import { ChatroomInterface } from '@/components/ChatroomInterface';
import { CreateRoomData, JoinRoomData, ChatroomParticipant } from '@/types/chatroom';
import { toast } from 'sonner';
import { BACKEND_URL, APP_BASE_URL } from '@/lib/config';

const Chatroom = () => {
  const [searchParams] = useSearchParams();
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [participant, setParticipant] = useState<ChatroomParticipant | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [prefilledRoomId, setPrefilledRoomId] = useState<string>('');

  // Check for room ID in URL parameters
  useEffect(() => {
    const joinRoomId = searchParams.get('join');
    if (joinRoomId) {
      setPrefilledRoomId(joinRoomId);
      toast.info(`Ready to join room: ${joinRoomId}`, {
        description: 'Enter your name and language to join the conversation!'
      });
    }
  }, [searchParams]);

  const generateRoomId = () => {
    const randomId = Math.random().toString(36).substring(2, 8);
    return `neuralecho-${randomId}`;
  };

  const generateParticipantId = () => {
    // Use crypto.randomUUID for guaranteed uniqueness, fallback to enhanced random generation
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      const id = `participant-${crypto.randomUUID()}`;
      console.log('🆔 [GENERATE ID] Created new participant ID (UUID):', id);
      return id;
    }
    
    // Fallback: Use timestamp + multiple random components for better uniqueness
    const timestamp = Date.now();
    const random1 = Math.random().toString(36).substring(2, 9);
    const random2 = Math.random().toString(36).substring(2, 9);
    const id = `participant-${timestamp}-${random1}-${random2}`;
    console.log('🆔 [GENERATE ID] Created new participant ID (fallback):', id);
    console.log('🆔 [GENERATE ID] Timestamp:', timestamp);
    console.log('🆔 [GENERATE ID] Random parts:', random1, random2);
    return id;
  };

  const handleCreateRoom = useCallback(async (data: CreateRoomData) => {
    setIsLoading(true);
    
    try {
      // Call the server API to create a session
      const response = await fetch(`${BACKEND_URL}/api/session/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: data.language
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const result = await response.json();
      const roomId = result.sessionId;

      const newParticipant: ChatroomParticipant = {
        id: generateParticipantId(),
        name: data.name,
        language: data.language,
        joinedAt: new Date(),
        isConnected: true
      };

      setCurrentRoom(roomId);
      setParticipant(newParticipant);
      
      // Create shareable link using configured base URL
      const shareableLink = `${APP_BASE_URL}/join/${roomId}`;
      
      toast.success(`Room created: ${roomId}`, {
        description: 'Room is ready! Share the link below with someone.',
        action: {
          label: "Copy Link",
          onClick: () => {
            navigator.clipboard.writeText(shareableLink);
            toast.success("Shareable link copied to clipboard!");
          }
        }
      });
    } catch (error) {
      console.error('Error creating room:', error);
      toast.error('Failed to create room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleJoinRoom = useCallback(async (data: JoinRoomData) => {
    setIsLoading(true);
    
    try {
      // Call the server API to join a session
      const response = await fetch(`${BACKEND_URL}/api/session/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: data.roomId,
          language: data.language
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join session');
      }

      const result = await response.json();

      const newParticipant: ChatroomParticipant = {
        id: generateParticipantId(),
        name: data.name,
        language: data.language,
        joinedAt: new Date(),
        isConnected: true
      };

      setCurrentRoom(data.roomId);
      setParticipant(newParticipant);
      
      toast.success(`Joined room: ${data.roomId}`, {
        description: `Welcome ${data.name}! Translation session is ready.`
      });
    } catch (error) {
      console.error('Error joining room:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to join room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLeaveRoom = useCallback(() => {
    setCurrentRoom(null);
    setParticipant(null);
    toast.info('Left the room');
  }, []);

  // Show room interface if user is in a room
  if (currentRoom && participant) {
    return (
      <ChatroomInterface
        roomId={currentRoom}
        participant={participant}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  // Show join/create interface
  return (
    <RoomJoinCreate
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      isLoading={isLoading}
      prefilledRoomId={prefilledRoomId}
    />
  );
};

export default Chatroom;