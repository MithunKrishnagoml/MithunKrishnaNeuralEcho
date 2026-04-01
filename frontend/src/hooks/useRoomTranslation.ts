// hooks/useRoomTranslation.ts
import { useCallback } from 'react';
import { useChatroomConnection } from './useChatroomConnection';
import { ChatroomParticipant } from '@/types/chatroom';

interface UseRoomTranslationProps {
  sessionId: string;
  participant: ChatroomParticipant;
  onEvent?: (event: any) => void;
}

export function useRoomTranslation({ sessionId, participant, onEvent }: UseRoomTranslationProps) {
  const chatroom = useChatroomConnection({
    roomId: sessionId,
    participant,
    onEvent
  });

  return {
    // Connection state
    isConnected: chatroom.isConnected,
    otherParticipant: chatroom.otherParticipant,
    messages: chatroom.messages,
    micEnabled: chatroom.micEnabled,

    // Actions
    disconnect: chatroom.disconnect,
    sendEvent: chatroom.sendEvent,
    handleUserGesture: chatroom.handleUserGesture,
    startRecording: chatroom.startRecording,
    stopRecording: chatroom.stopRecording,
    endSession: chatroom.endSession,
  };
}
