export interface ChatroomParticipant {
  id: string;
  name: string;
  language: 'en-US' | 'fr-CA';
  joinedAt: Date;
  isConnected: boolean;
}

export interface TranscriptMessage {
  messageId: string;
  roomId: string;
  speakerId: string;
  speakerName: string;
  sourceLanguage: 'en-US' | 'fr-CA';
  targetLanguage: 'en-US' | 'fr-CA';
  originalTranscript: string;
  translatedTranscript: string;
  timestamp: number;
  audioUrl?: string;
  confidence?: number;
  processingTime?: number;
}

export interface ChatroomMessage {
  id: string;
  participantId: string;
  originalText: string;
  translatedText: string;
  originalLanguage: 'en-US' | 'fr-CA';
  targetLanguage: 'en-US' | 'fr-CA';
  timestamp: Date;
  audioUrl?: string;
  // Enhanced display properties (pre-calculated in BILINGUAL_MESSAGE handler)
  displayText?: string;
  showBothTexts?: boolean;
  isOwnMessage?: boolean;
}

export interface SessionRecording {
  recordingId: string;
  roomId: string;
  startTime: number;
  endTime?: number;
  participants: string[];
  recordingUrl?: string;
  status: 'recording' | 'stopped' | 'processing' | 'ready';
  format: 'mp3' | 'wav';
  size?: number;
  duration?: number;
}

export interface TranscriptDownload {
  roomId: string;
  participants: ChatroomParticipant[];
  messages: TranscriptMessage[];
  startTime: number;
  endTime: number;
  totalMessages: number;
  format: 'txt' | 'json' | 'pdf';
}

export interface Chatroom {
  roomId: string;
  participants: ChatroomParticipant[];
  messageHistory: ChatroomMessage[];
  transcriptHistory: TranscriptMessage[];
  recording?: SessionRecording;
  createdAt: Date;
  isActive: boolean;
  maxParticipants: number;
}

export interface JoinRoomData {
  name: string;
  language: 'en-US' | 'fr-CA';
  roomId: string;
}

export interface CreateRoomData {
  name: string;
  language: 'en-US' | 'fr-CA';
}

export type ChatroomEvent = 
  | { type: 'CONNECTION_ESTABLISHED'; message: string }
  | { type: 'joined_session'; sessionId: string; userId: string; participantCount: number }
  | { type: 'participant_joined'; sessionId: string; participantCount: number; newParticipantLanguage: 'en-US' | 'fr-CA' }
  | { type: 'translation_ready'; message: string; participantCount: number; otherParticipant?: { id: string; name: string; language: 'en-US' | 'fr-CA' } }
  | { type: 'USER_JOINED_ROOM'; sessionId: string; userId?: string; participantCount: number; language?: 'en-US' | 'fr-CA'; newParticipantLanguage?: 'en-US' | 'fr-CA'; newParticipantName?: string }
  | { type: 'USER_LEFT_ROOM'; sessionId: string; userId: string; participantCount: number }
  | { type: 'SPEECH_TRANSCRIPT'; participantId: string; transcript: string; language: 'en-US' | 'fr-CA'; fromParticipant?: string; originalText?: string; originalLanguage?: 'en-US' | 'fr-CA'; timestamp?: number }
  | { type: 'TRANSLATED_MESSAGE'; sessionId?: string; fromParticipant?: string; message: ChatroomMessage; timestamp: number }
  | { type: 'TRANSLATED_AUDIO'; sessionId?: string; fromParticipant?: string; audioData: string; timestamp: number; quality?: string; processingTime?: number }
  | { type: 'translation_audio_chunk'; audio: string; seq: number; speakerId: string; sessionId: string; timestamp: number }
  | { type: 'translation_audio_done'; speakerId: string; sessionId: string; timestamp: number }
  | { type: 'translation_interrupted'; speakerId: string; timestamp: number }
  | { type: 'vad_speaking'; speakerId: string; speaking: boolean; timestamp: number }
  | { type: 'transcript_input_delta'; text: string; speakerId: string; timestamp: number }
  | { type: 'transcript_input_done'; text: string; speakerId: string; timestamp: number }
  | { type: 'transcript_output_delta'; text: string; speakerId: string; timestamp: number }
  | { type: 'transcript_output_done'; text: string; speakerId: string; timestamp: number }
  | { type: 'ROOM_HISTORY_UPDATE'; sessionId: string; messageHistory: ChatroomMessage[]; totalMessages?: number; latestMessage?: ChatroomMessage }
  | { type: 'TRANSCRIPT_HISTORY_UPDATE'; sessionId: string; transcriptHistory: TranscriptMessage[]; totalMessages?: number; latestMessage?: TranscriptMessage }
  | { type: 'TRANSCRIPT_MESSAGE_ADDED'; sessionId: string; message: TranscriptMessage }
  | { type: 'RECORDING_STARTED'; sessionId: string; recordingId: string; startTime: number }
  | { type: 'RECORDING_STOPPED'; sessionId: string; recordingId: string; endTime: number; recordingUrl?: string }
  | { type: 'RECORDING_READY'; sessionId: string; recordingId: string; recordingUrl: string; duration: number; size: number }
  | { type: 'TRANSCRIPT_DOWNLOAD_READY'; sessionId: string; downloadUrl: string; format: 'txt' | 'json' | 'pdf' }
  | { type: 'SESSION_ENDED'; sessionId: string; endTime: number; transcriptDownloadUrl?: string; recordingDownloadUrl?: string }
  | { type: 'translation_sent'; messageId: string; originalText: string; translatedText: string; processingTime: number; timestamp: number }
  | { type: 'translated_audio'; audio: string; fromUser: string; timestamp: number; quality: string; processingTime: number }
  | { type: 'transcript_complete'; sessionId?: string; fromParticipant?: string; transcript: string; language?: 'en-US' | 'fr-CA'; timestamp: number; processingTime?: number; confidence?: number; qualityScore?: number }
  | { type: 'transcript_delta'; sessionId?: string; fromParticipant?: string; delta: string; timestamp: number; confidence: number }
  | { type: 'PARTIAL_TRANSCRIPT'; sessionId: string; participantId: string; delta: string; itemId: string; timestamp: number }
  | { type: 'TRANSLATION_DELTA'; sessionId: string; participantId: string; delta: string; responseId: string; targetLanguage: 'en-US' | 'fr-CA'; timestamp: number }
  | { type: 'AUDIO_CHUNK'; sessionId: string; participantId: string; audioData: string; responseId: string; chunkId: string; timestamp: number; speakerId?: string }
  | { type: 'AI_AUDIO_CHUNK'; sessionId: string; fromParticipant: string; audioData: string; seq: number; timestamp: number }
  | { type: 'VOICE_ACTIVITY_STARTED'; sessionId: string; participantId: string; timestamp: number }
  | { type: 'VOICE_ACTIVITY_STOPPED'; sessionId: string; participantId: string; timestamp: number }
  | { type: 'translation_error'; sessionId?: string; fromParticipant?: string; error: any; message?: string; timestamp: number; recovery?: string; retryable?: boolean }
  | { type: 'quality_feedback'; processingTime: number; qualityScore: number; recommendations: string[]; timestamp: number }
  | { type: 'session_complete'; sessionId?: string; fromParticipant?: string; userId?: string; totalProcessingTime: number; timestamp: number; performance: string }
  | { type: 'system_error'; message: string; timestamp: number; recovery: string }
  | { type: 'AUDIO_STREAM'; participantId: string; audioData: string; targetParticipantId: string }
  | { type: 'ROOM_FULL'; roomId: string }
  | { type: 'ROOM_CREATED'; roomId: string }
  | { type: 'ROOM_JOINED'; roomId: string; participant: ChatroomParticipant }
  | { type: 'ROOM_READY'; roomId: string; participantCount: number }
  | { type: 'ERROR'; message: string }
  | { type: 'error'; message: string }
  | { type: 'BILINGUAL_MESSAGE'; sessionId?: string; message: { id: string; speakerId: string; originalText: string; translatedText: string; originalLanguage: 'en-US' | 'fr-CA'; targetLanguage: 'en-US' | 'fr-CA'; timestamp?: number; processingTime?: number; }; timestamp?: number; }
  | { type: 'translation_timeout'; originalText: string; timestamp: number; message: string; }
  | { type: 'LANGUAGE_SELECTED'; sessionId: string; participantId: string; language: 'en-US' | 'fr-CA'; participantName: string }
  | { type: 'TRANSLATED_AUDIO_CHUNK'; audioData: string; chunkId: string; speakerId: string; timestamp: number }
  | { type: 'MY_TRANSCRIPT'; text: string; speakerId: string; timestamp: number }
  | { type: 'INCOMING_TRANSCRIPT'; text: string; speakerId: string; timestamp: number };