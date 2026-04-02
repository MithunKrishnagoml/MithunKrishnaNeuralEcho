import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RoomJoinCreate } from '@/components/RoomJoinCreate';
import { ChatroomInterface } from '@/components/ChatroomInterface';
import { CreateRoomData, JoinRoomData, ChatroomParticipant } from '@/types/chatroom';
import { toast } from 'sonner';
import { BACKEND_URL } from '@/lib/config';

const Chatroom = () => {
  const [searchParams] = useSearchParams();
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [participant, setParticipant] = useState<ChatroomParticipant | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [prefilledRoomId, setPrefilledRoomId] = useState<string>('');

  // ✅ DEBUG: Confirm we're on the chatroom page
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎯 [ROUTE] /chatroom page loaded');
  console.log('🎯 [ROUTE] Current room:', currentRoom || 'none (showing join/create UI)');
  console.log('🎯 [ROUTE] Participant:', participant?.id || 'none');
  console.log('═══════════════════════════════════════════════════════');

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
      const response = await fetch(`${BACKEND_URL}/api/room/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const result = await response.json();
      const roomId = result.roomId;

      // Navigate to room
      window.location.href = `/room/${roomId}?name=${encodeURIComponent(data.name)}&language=${encodeURIComponent(data.language)}`;

    } catch (error) {
      console.error('Error creating room:', error);
      toast.error('Failed to create room');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleJoinRoom = useCallback(async (data: JoinRoomData) => {
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/room/${data.roomId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join room');
      }

      // Navigate to room
      window.location.href = `/room/${data.roomId}?name=${encodeURIComponent(data.name)}&language=${encodeURIComponent(data.language)}`;

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

  const handleLanguageSelected = useCallback((language: 'en-US' | 'fr-CA', roomId: string) => {
    // If user selected English, prompt them to suggest Canadien français to the other user
    if (language === 'en-US') {
      toast.info('Tip: Suggest Canadien français to the other participant for better translation!', {
        description: 'English and Canadien français work best together for real-time translation.',
        duration: 5000
      });
    }
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
      onLanguageSelected={handleLanguageSelected}
    />
  );
};

export default Chatroom;