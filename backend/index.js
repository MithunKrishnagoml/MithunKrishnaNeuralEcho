import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import WebSocket from 'ws';

// Load environment variables from parent directory
// Deployment trigger: Fixed syntax error - REDEPLOY NOW
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
const envOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedExactOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'https://neuralecho1.vercel.app',
  'https://neuralecho.vercel.app',
  'https://neural-echo.vercel.app',
  ...envOrigins
]);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header).
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedExactOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    try {
      const parsed = new URL(origin);
      if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.vercel.app')) {
        callback(null, true);
        return;
      }
    } catch (error) {
      console.warn('Invalid CORS origin format:', origin, error.message);
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active translation sessions
const translationSessions = new Map();
const activeConnections = new Map();

// Translation session structure
class TranslationSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.participants = new Map(); // userId -> { language, socket, openaiWs }
    this.messageHistory = []; // Array of conversation messages
    this.transcriptHistory = []; // Array of transcript messages with full details
    this.recording = null; // Recording session data
    this.createdAt = Date.now();
  }

  addParticipant(userId, language, socket, name = null) {
    this.participants.set(userId, {
      language,
      socket,
      name,
      openaiWs: null,
      audioBuffer: [],
      lastRequestTime: null,
      joinedAt: Date.now(),
      totalProcessingTime: 0,
      requestCount: 0,
      pendingMessage: null // For tracking translation in progress
    });
    console.log(`Added participant ${userId} with language ${language} to session ${this.sessionId}`);
  }

  removeParticipant(userId) {
    const participant = this.participants.get(userId);
    if (participant) {
      // Close OpenAI connection
      if (participant.openaiWs) {
        participant.openaiWs.close();
      }
      
      // Clear any pending message timeouts
      if (participant.pendingMessageTimeout) {
        clearTimeout(participant.pendingMessageTimeout);
        participant.pendingMessageTimeout = null;
      }
      
      // Clear pending message
      participant.pendingMessage = null;
    }
    
    this.participants.delete(userId);
    console.log(`Removed participant ${userId} from session ${this.sessionId}`);
  }

  getOtherParticipant(userId) {
    for (const [otherUserId, participant] of this.participants.entries()) {
      if (otherUserId !== userId) {
        return { userId: otherUserId, ...participant };
      }
    }
    return null;
  }

  addMessage(messageData) {
    // Get participant name from the participants map
    const participant = this.participants.get(messageData.participantId);
    const participantName = participant?.name || `Participant ${messageData.participantId}`;
    
    this.messageHistory.push({
      id: messageData.messageId,
      participantId: messageData.participantId,
      participantName: participantName,
      originalText: messageData.originalText,
      translatedText: messageData.translatedText,
      originalLanguage: messageData.originalLanguage,
      targetLanguage: messageData.targetLanguage,
      timestamp: messageData.timestamp
    });
    
    console.log(`=��� Added message to session ${this.sessionId} history. Total messages: ${this.messageHistory.length}`);
  }

  addTranscriptMessage(transcriptData) {
    const transcriptMessage = {
      messageId: transcriptData.messageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      roomId: this.sessionId,
      speakerId: transcriptData.speakerId,
      speakerName: transcriptData.speakerName,
      sourceLanguage: transcriptData.sourceLanguage,
      targetLanguage: transcriptData.targetLanguage,
      originalTranscript: transcriptData.originalTranscript,
      translatedTranscript: transcriptData.translatedTranscript,
      timestamp: transcriptData.timestamp || Date.now(),
      confidence: transcriptData.confidence,
      processingTime: transcriptData.processingTime
    };

    this.transcriptHistory.push(transcriptMessage);
    console.log(`=��� Added transcript message to session ${this.sessionId}. Total transcripts: ${this.transcriptHistory.length}`);
    
    return transcriptMessage;
  }

  getMessageHistory() {
    return this.messageHistory;
  }

  getTranscriptHistory() {
    return this.transcriptHistory;
  }

  startRecording() {
    this.recording = {
      recordingId: `rec_${this.sessionId}_${Date.now()}`,
      roomId: this.sessionId,
      startTime: Date.now(),
      participants: Array.from(this.participants.keys()),
      status: 'recording',
      format: 'mp3'
    };
    console.log(`=��� Started recording for session ${this.sessionId}`);
    return this.recording;
  }

  stopRecording() {
    if (this.recording) {
      this.recording.endTime = Date.now();
      this.recording.status = 'stopped';
      this.recording.duration = this.recording.endTime - this.recording.startTime;
      console.log(`GŦn+� Stopped recording for session ${this.sessionId}`);
    }
    return this.recording;
  }

  getRecording() {
    return this.recording;
  }
}

function buildTranslationInstructions(inputLang, outputLang) {
  const outputLangName = outputLang === "en-US" ? "English" : "French";

  return `You are a TRANSLATION MACHINE that translates FROM ${inputLang === "en-US" ? "English" : "French"} TO ${outputLangName}.

CRITICAL TRANSLATION RULES:
1. ONLY translate the input text word-for-word
2. DO NOT respond to questions or greetings - TRANSLATE them exactly
3. DO NOT generate, invent, or roleplay content
4. DO NOT answer questions - translate the question itself
5. If input is a greeting directed at someone, translate that greeting exactly
6. NEVER add your own responses or commentary
7. Output ONLY the direct translation of what was said
8. Preserve all punctuation, names, and formatting exactly
9. If you cannot translate, output "TRANSLATION_ERROR" only

EXAMPLES:
Input: "Good morning Prasanna, thank you for joining"
Output: "Bonjour Prasanna, merci de vous joindre"
NOT: "Bonjour, merci de me recevoir..."

Input: "How are you today?"
Output: "Comment allez-vous aujourd'hui ?"
NOT: "Je vais bien, merci"

You are a translator only. Translate the input exactly as spoken.`;
}

// API Routes

// Create a new translation session
app.post('/api/session/create', (req, res) => {
  try {
    const { language } = req.body;

    // Validate language
    if (!["en-US", "fr-CA"].includes(language)) {
      return res.status(400).json({ error: "Language must be en-US or fr-CA" });
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const translationSession = new TranslationSession(sessionId);
    translationSessions.set(sessionId, translationSession);

    res.json({
      success: true,
      sessionId,
      message: `Translation session created for ${language === "en-US" ? "English" : "French"} speaker`,
    });

  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Join an existing translation session
app.post('/api/session/join', (req, res) => {
  try {
    const { sessionId, language } = req.body;

    // Validate language
    if (!["en-US", "fr-CA"].includes(language)) {
      return res.status(400).json({ error: "Language must be en-US or fr-CA" });
    }

    const translationSession = translationSessions.get(sessionId);
    if (!translationSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (translationSession.participants.size >= 2) {
      return res.status(400).json({ error: "Session is full" });
    }

    res.json({
      success: true,
      sessionId,
      participantCount: translationSession.participants.size,
      message: `Ready to join session for ${language === "en-US" ? "English" : "French"} speaker`,
    });

  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session status
app.get('/api/session/:sessionId/status', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const translationSession = translationSessions.get(sessionId);
    if (!translationSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    const participants = Array.from(translationSession.participants.entries()).map(([userId, participant]) => ({
      userId,
      language: participant.language,
      connected: participant.socket?.readyState === WebSocket.OPEN
    }));

    res.json({
      sessionId,
      participantCount: translationSession.participants.size,
      participants,
      createdAt: translationSession.createdAt,
      status: translationSession.participants.size === 2 ? 'active' : 'waiting',
      messageCount: translationSession.messageHistory?.length || 0
    });

  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session transcript history
app.get('/api/session/:sessionId/transcript', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { format = 'json' } = req.query;
    
    const translationSession = translationSessions.get(sessionId);
    if (!translationSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    const transcriptHistory = translationSession.getTranscriptHistory() || [];
    const messageHistory = translationSession.getMessageHistory() || [];
    
    // Get participant names
    const participantNames = {};
    translationSession.participants.forEach((participant, userId) => {
      participantNames[userId] = participant.name || `Participant ${userId}`;
    });
    
    if (format === 'txt') {
      // Generate plain text transcript
      let txtContent = `NeuralEcho Translation Session Transcript\n`;
      txtContent += `Session ID: ${sessionId}\n`;
      txtContent += `Generated: ${new Date().toISOString()}\n`;
      txtContent += `Total Messages: ${messageHistory.length}\n\n`;
      txtContent += `${'='.repeat(50)}\n\n`;
      
      messageHistory.forEach((message, index) => {
        const timestamp = new Date(message.timestamp).toLocaleString();
        const speakerName = message.participantName || participantNames[message.participantId] || `Participant ${message.participantId}`;
        txtContent += `[${timestamp}] ${speakerName}\n`;
        txtContent += `Original (${message.originalLanguage}): ${message.originalText}\n`;
        txtContent += `Translation (${message.targetLanguage}): ${message.translatedText}\n\n`;
      });
      
      // Create filename with participant names
      const namesArray = Object.values(participantNames);
      const namesStr = namesArray.join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="neuralecho_transcript_${namesStr}_${dateStr}.txt"`);
      res.send(txtContent);
    } else {
      // Return JSON format
      res.json({
        sessionId,
        generatedAt: new Date().toISOString(),
        messageHistory,
        transcriptHistory,
        totalMessages: messageHistory.length,
        participants: Array.from(translationSession.participants.entries()).map(([userId, participant]) => ({
          userId,
          name: participant.name,
          language: participant.language,
          joinedAt: participant.joinedAt,
          totalProcessingTime: participant.totalProcessingTime,
          requestCount: participant.requestCount
        }))
      });
    }

  } catch (error) {
    console.error('Error getting transcript:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session recording
app.get('/api/session/:sessionId/recording', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const translationSession = translationSessions.get(sessionId);
    if (!translationSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    const recording = translationSession.getRecording();
    if (!recording) {
      return res.status(404).json({ error: "No recording found for this session" });
    }

    res.json({
      sessionId,
      recording: {
        recordingId: recording.recordingId,
        startTime: recording.startTime,
        endTime: recording.endTime,
        duration: recording.duration,
        status: recording.status,
        format: recording.format,
        participants: recording.participants
      }
    });

  } catch (error) {
    console.error('Error getting recording:', error);
    res.status(500).json({ error: error.message });
  }
});

const STREAMING_MESSAGE_TYPES = new Set([
  'PARTIAL_TRANSCRIPT',
  'TRANSLATION_DELTA',
  'AUDIO_CHUNK',
  'VOICE_ACTIVITY_STARTED',
  'VOICE_ACTIVITY_STOPPED',
  'CLEAR_AUDIO'
]);

function relayStreamingMessage(data, senderWs) {
  const connection = activeConnections.get(senderWs);
  if (!connection) return;

  const { sessionId } = connection;
  const translationSession = translationSessions.get(sessionId);
  if (!translationSession) return;

  const payload = {
    ...data,
    sessionId: data.sessionId || sessionId,
    timestamp: data.timestamp || Date.now(),
  };

  for (const participant of translationSession.participants.values()) {
    if (participant.socket !== senderWs && participant.socket?.readyState === WebSocket.OPEN) {
      participant.socket.send(JSON.stringify(payload));
    }
  }
}

// WebSocket handler for real-time translation
wss.on('connection', (ws, req) => {
  console.log('WebSocket connection opened for translation');
  
  // Send connection confirmation
  ws.send(JSON.stringify({ 
    type: 'CONNECTION_ESTABLISHED', 
    message: 'Connected to NeuralEcho translation server' 
  }));
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('=��� [SERVER] Received message:', data.type);

      if (STREAMING_MESSAGE_TYPES.has(data.type)) {
        relayStreamingMessage(data, ws);
        return;
      }
      
      if (data.type === 'join_session') {
        const { sessionId, userId, language } = data;
        const name = data.name || 'Anonymous';
        
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
          return;
        }

        if (translationSession.participants.size >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session is full' }));
          return;
        }

        // Add participant to session
        translationSession.addParticipant(userId, language, ws, name);
        activeConnections.set(ws, { sessionId, userId });

        console.log(`G�� Participant ${userId} joined session ${sessionId}. Total participants: ${translationSession.participants.size}`);

        // Notify successful join
        ws.send(JSON.stringify({ 
          type: 'USER_JOINED_ROOM', 
          sessionId, 
          userId,
          participantCount: translationSession.participants.size,
          language: language,
          newParticipantName: name
        }));

        // Notify all existing participants about the new joiner
        for (const participant of translationSession.participants.values()) {
          if (participant.socket?.readyState === WebSocket.OPEN && participant.socket !== ws) {
            participant.socket.send(JSON.stringify({
              type: 'USER_JOINED_ROOM',
              sessionId,
              participantCount: translationSession.participants.size,
              newParticipantLanguage: language,
              newParticipantName: name,
              userId: userId
            }));
          }
        }

        // Send conversation history to new participant
        if (translationSession.messageHistory && translationSession.messageHistory.length > 0) {
          ws.send(JSON.stringify({
            type: 'ROOM_HISTORY_UPDATE',
            sessionId,
            messageHistory: translationSession.messageHistory,
            totalMessages: translationSession.messageHistory.length
          }));
        }

        // Notify participants once both peers are connected.
        // Translation/TTS is handled on the client WebRTC->OpenAI path.
        if (translationSession.participants.size === 2) {
          console.log(`=��� Session ${sessionId} now has 2 participants! Ready for relay-only streaming.`);
          
          // Notify all participants that translation is ready
          for (const [currentUserId, participant] of translationSession.participants.entries()) {
            if (participant.socket?.readyState === WebSocket.OPEN) {
              // Find the other participant
              const otherParticipant = Array.from(translationSession.participants.entries())
                .find(([userId]) => userId !== currentUserId);
              
              participant.socket.send(JSON.stringify({ 
                type: 'translation_ready',
                message: 'Translation session is now active with 2 participants',
                participantCount: 2,
                otherParticipant: otherParticipant ? {
                  id: otherParticipant[0],
                  name: otherParticipant[1].name || 'Other Participant',
                  language: otherParticipant[1].language
                } : null
              }));
            }
          }
        }
      }

      // Handle speech transcript for room-based translation
      if (data.type === 'SPEECH_TRANSCRIPT') {
        const { participantId, transcript, language } = data;
        console.log(`=��� [ROOM TRANSCRIPT] From ${participantId} (${language}): "${transcript}"`);
        console.log(`=��� [TRANSCRIPT DEBUG] Processing transcript at ${new Date().toISOString()}`);
        
        const connection = activeConnections.get(ws);
        if (!connection) {
          console.error('G�� No connection found for transcript');
          return;
        }

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) {
          console.error('G�� No translation session found');
          return;
        }

        // Only process if we have 2 participants
        if (translationSession.participants.size !== 2) {
          console.log('GŦ Waiting for second participant before processing transcript');
          console.log(`=��� [TRANSCRIPT DEBUG] Current participant count: ${translationSession.participants.size}`);
          return;
        }

        // Get the participant who sent the transcript
        const participant = translationSession.participants.get(participantId);
        if (!participant) {
          console.error('G�� Participant not found in session');
          return;
        }

        // Get the other participant (target for translation)
        const otherParticipant = translationSession.getOtherParticipant(participantId);
        if (!otherParticipant) {
          console.error('G�� Other participant not found');
          return;
        }

        console.log(`🎤 [TRANSCRIPT DEBUG] Participants ready - relaying transcript`);
        
        // Send transcript to ORIGINAL participant for immediate local bubble updates
        if (participant.socket?.readyState === WebSocket.OPEN) {
          participant.socket.send(JSON.stringify({
            type: 'SPEECH_TRANSCRIPT',
            fromParticipant: participantId,
            originalText: transcript,
            originalLanguage: language,
            timestamp: Date.now()
          }));
          console.log(`✅ [TRANSCRIPT DEBUG] Transcript sent to original participant (${language})`);
        } else {
          console.warn(`⚠️ [TRANSCRIPT DEBUG] Original participant socket not available`);
        }

        // Relay transcript to other participant only - no server-side translation re-processing.
        if (otherParticipant.socket?.readyState === WebSocket.OPEN) {
          otherParticipant.socket.send(JSON.stringify({
            type: 'SPEECH_TRANSCRIPT',
            fromParticipant: participantId,
            originalText: transcript,
            originalLanguage: language,
            timestamp: Date.now(),
          }));
        }
      }

      // Handle recording start
      if (data.type === 'START_RECORDING') {
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        const recording = translationSession.startRecording();
        
        // Notify all participants that recording started
        for (const participant of translationSession.participants.values()) {
          if (participant.socket?.readyState === WebSocket.OPEN) {
            participant.socket.send(JSON.stringify({
              type: 'RECORDING_STARTED',
              sessionId,
              recordingId: recording.recordingId,
              startTime: recording.startTime
            }));
          }
        }
      }

      // Handle recording stop
      if (data.type === 'STOP_RECORDING') {
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        const recording = translationSession.stopRecording();
        
        // Notify all participants that recording stopped
        for (const participant of translationSession.participants.values()) {
          if (participant.socket?.readyState === WebSocket.OPEN) {
            participant.socket.send(JSON.stringify({
              type: 'RECORDING_STOPPED',
              sessionId,
              recordingId: recording?.recordingId,
              endTime: recording?.endTime,
              duration: recording?.duration
            }));
          }
        }
      }

      // Handle transcript history request
      if (data.type === 'GET_TRANSCRIPT_HISTORY') {
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        ws.send(JSON.stringify({
          type: 'TRANSCRIPT_HISTORY_UPDATE',
          sessionId,
          transcriptHistory: translationSession.getTranscriptHistory(),
          totalMessages: translationSession.transcriptHistory.length
        }));
      }

      // Handle session end
      if (data.type === 'END_SESSION') {
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        // Stop recording if active
        if (translationSession.recording?.status === 'recording') {
          translationSession.stopRecording();
        }

        // Send session_complete to all participants
        const sessionSummary = {
          type: 'session_complete',
          sessionId: sessionId,
          endTime: Date.now(),
          totalMessages: translationSession.messageHistory?.length || 0,
          transcriptDownloadUrl: `/api/session/${sessionId}/transcript`,
          recordingDownloadUrl: translationSession.recording ? `/api/session/${sessionId}/recording` : null
        };

        // Notify all participants that session ended
        for (const participant of translationSession.participants.values()) {
          if (participant.socket?.readyState === WebSocket.OPEN) {
            participant.socket.send(JSON.stringify(sessionSummary));
          }
        }
      }

      // Handle bilingual message from frontend (text with translation)
      if (data.type === 'SEND_BILINGUAL_MESSAGE' || data.type === 'BILINGUAL_MESSAGE') {
        console.log(`📨 [BILINGUAL_MESSAGE] Received from client:`, data);
        
        // Extract message from nested structure
        const messageData = data.message || data;
        const { id: messageId, speakerId: participantId, originalText, translatedText, originalLanguage, targetLanguage } = messageData;
        
        console.log(`📨 [BILINGUAL_MESSAGE] From ${participantId}: "${originalText}" -> "${translatedText}"`);
        
        const connection = activeConnections.get(ws);
        if (!connection) {
          console.warn('⚠️ No connection found for BILINGUAL_MESSAGE');
          return;
        }

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) {
          console.warn('⚠️ No translation session found for BILINGUAL_MESSAGE');
          return;
        }

        // Create message object
        const message = {
          id: messageId,
          speakerId: participantId,
          originalText: originalText,
          translatedText: translatedText,
          originalLanguage: originalLanguage,
          targetLanguage: targetLanguage,
          timestamp: messageData.timestamp || Date.now()
        };

        // Add to session message history
        translationSession.addMessage({
          messageId: messageId,
          participantId: participantId,
          originalText: originalText,
          translatedText: translatedText,
          originalLanguage: originalLanguage,
          targetLanguage: targetLanguage,
          timestamp: new Date(message.timestamp)
        });

        console.log(`✅ [BILINGUAL_MESSAGE] Added to session history. Total messages: ${translationSession.messageHistory.length}`);

        // Broadcast to ALL participants in the room (including sender)
        for (const [userId, participant] of translationSession.participants.entries()) {
          if (participant.socket?.readyState === WebSocket.OPEN) {
            participant.socket.send(JSON.stringify({
              type: 'BILINGUAL_MESSAGE',
              sessionId: sessionId,
              message: message
            }));
            console.log(`📤 [BILINGUAL_MESSAGE] Sent to participant ${userId}`);
          }
        }
      }

      // Handle translated audio from frontend
      if (data.type === 'TRANSLATED_AUDIO') {
        const { participantId, audioData, originalText, translatedText, messageId } = data;
        console.log(`🎧 [TRANSLATED_AUDIO] From ${participantId}, audio size: ${audioData?.length || 0}`);
        
        const connection = activeConnections.get(ws);
        if (!connection) {
          console.warn('⚠️ No connection found for TRANSLATED_AUDIO');
          return;
        }

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) {
          console.warn('⚠️ No translation session found for TRANSLATED_AUDIO');
          return;
        }

        const audioEvent = {
          type: 'TRANSLATED_AUDIO',
          sessionId: translationSession.sessionId,
          fromParticipant: participantId,
          audioData: audioData,
          originalText: originalText,
          translatedText: translatedText,
          messageId: messageId,
          timestamp: Date.now()
        };

        // Send translated audio to ALL participants (including sender)
        let sentCount = 0;
        for (const [userId, participant] of translationSession.participants.entries()) {
          if (participant.socket && participant.socket.readyState === WebSocket.OPEN) {
            participant.socket.send(JSON.stringify(audioEvent));
            sentCount++;
            console.log(`🎧 [ROOM AUDIO] Sent translated audio to participant ${userId}`);
          }
        }
        
        if (sentCount === 0) {
          console.warn(`⚠️ [ROOM AUDIO] No participants available to receive audio`);
        } else {
          console.log(`🎧 [ROOM AUDIO] Broadcast translated audio to ${sentCount} participant(s) (${audioData?.length || 0} bytes)`);
        }
        
        // Add to recording if active
        if (translationSession.recording?.status === 'recording') {
          translationSession.addAudioToRecording({
            type: 'translated_audio',
            fromParticipant: participantId,
            audioData: audioData,
            originalText: originalText,
            translatedText: translatedText,
            timestamp: Date.now()
          });
        }
      }

      // Handle real-time audio chunks
      if (data.type === 'AUDIO_CHUNK') {
        const { participantId, pcmData, sampleRate, sequenceNumber, responseId } = data;
        console.log(`🎵 [AUDIO_CHUNK] From ${participantId}, seq: ${sequenceNumber}, size: ${pcmData?.length || 0}`);
        
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        // Immediately relay audio chunk to other participant with zero buffering
        const otherParticipant = translationSession.getOtherParticipant(participantId);
        if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
          const chunkMessage = {
            type: 'AUDIO_CHUNK',
            sessionId: sessionId,
            fromParticipant: participantId,
            pcmData: pcmData,
            sampleRate: sampleRate || 24000,
            sequenceNumber: sequenceNumber || 0,
            responseId: responseId,
            timestamp: Date.now()
          };
          
          otherParticipant.socket.send(JSON.stringify(chunkMessage));
          console.log(`🎵 [AUDIO_CHUNK] Relayed to other participant: seq ${sequenceNumber}`);
        }
      }

      // Handle audio stream end
      if (data.type === 'AUDIO_STREAM_END') {
        const { participantId, responseId } = data;
        console.log(`🏁 [AUDIO_STREAM_END] From ${participantId}, response: ${responseId}`);
        
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        // Relay stream end to other participant
        const otherParticipant = translationSession.getOtherParticipant(participantId);
        if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
          const endMessage = {
            type: 'AUDIO_STREAM_END',
            sessionId: sessionId,
            fromParticipant: participantId,
            responseId: responseId,
            timestamp: Date.now()
          };
          
          otherParticipant.socket.send(JSON.stringify(endMessage));
          console.log(`🏁 [AUDIO_STREAM_END] Relayed to other participant`);
        }
      }

      // Handle CLEAR_AUDIO (for interruptions)
      if (data.type === 'CLEAR_AUDIO') {
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId, userId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        console.log(`🧹 [CLEAR_AUDIO] From ${userId} - relaying to other participant`);

        // Relay CLEAR_AUDIO to other participant
        const otherParticipant = translationSession.getOtherParticipant(userId);
        if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
          const clearMessage = {
            type: 'CLEAR_AUDIO',
            sessionId: sessionId,
            participantId: userId,
            timestamp: Date.now()
          };
          
          otherParticipant.socket.send(JSON.stringify(clearMessage));
          console.log(`🧹 [CLEAR_AUDIO] Relayed to other participant`);
        }
      }

      // Handle room-based audio data
      if (data.type === 'ROOM_AUDIO_DATA') {
        const { participantId, audioData } = data;
        console.log(`=�Ħ [ROOM AUDIO] From ${participantId}`);
        
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        const participant = translationSession.participants.get(participantId);
        if (!participant?.openaiWs || participant.openaiWs.readyState !== WebSocket.OPEN) {
          return;
        }

        // Track processing start time
        participant.lastRequestTime = Date.now();

        // Send audio to OpenAI for real-time processing
        const audioMessage = {
          type: 'input_audio_buffer.append',
          audio: audioData
        };

        participant.openaiWs.send(JSON.stringify(audioMessage));
        
        console.log(`=�Ħ [Audio] Processing audio for user ${participantId} in room ${sessionId}`);
      }

    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    
    // Handle user leaving room
    const connection = activeConnections.get(ws);
    if (connection) {
      const { sessionId, userId } = connection;
      const translationSession = translationSessions.get(sessionId);
      
      if (translationSession) {
        // Notify other participants that user left
        for (const participant of translationSession.participants.values()) {
          if (participant.socket?.readyState === WebSocket.OPEN && participant.socket !== ws) {
            participant.socket.send(JSON.stringify({
              type: 'USER_LEFT_ROOM',
              sessionId,
              userId,
              participantCount: translationSession.participants.size - 1
            }));
          }
        }
        
        // If this was the last participant or session becomes empty, send session_complete
        if (translationSession.participants.size <= 1) {
          const sessionSummary = {
            type: 'session_complete',
            sessionId: sessionId,
            reason: 'participant_left',
            endTime: Date.now(),
            totalMessages: translationSession.messageHistory?.length || 0,
            transcriptDownloadUrl: `/api/session/${sessionId}/transcript`,
            recordingDownloadUrl: translationSession.recording ? `/api/session/${sessionId}/recording` : null
          };

          // Notify remaining participants
          for (const participant of translationSession.participants.values()) {
            if (participant.socket?.readyState === WebSocket.OPEN) {
              participant.socket.send(JSON.stringify(sessionSummary));
            }
          }
        }
      }
    }
    
    cleanupConnection(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

async function initializeOpenAIConnection(userId, translationSession) {
  const participant = translationSession.participants.get(userId);
  if (!participant) return;

  try {
    // Get OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('OpenAI API key not configured');
      return;
    }

    // Create OpenAI Realtime WebSocket connection
    const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-mini-2025-12-15', {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    participant.openaiWs = openaiWs;

    openaiWs.on('open', () => {
      console.log(`OpenAI Realtime connected for user ${userId}`);
      
      // Configure the session for bilingual translation
      const otherParticipant = translationSession.getOtherParticipant(userId);
      const inputLang = participant.language;
      const outputLang = otherParticipant?.language || (inputLang === 'en-US' ? 'fr-CA' : 'en-US');
      
      console.log(`=��� [OpenAI Config] User ${userId}:`);
      console.log(`=��� [OpenAI Config] Input language: ${inputLang}`);
      console.log(`=��� [OpenAI Config] Output language: ${outputLang}`);
      console.log(`=��� [OpenAI Config] Instructions: ${buildTranslationInstructions(inputLang, outputLang)}`);
      
      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: buildTranslationInstructions(inputLang, outputLang),
          voice: 'alloy',                        // faster than ballad
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1',
            language: inputLang === 'en-US' ? 'en' : 'fr'  // Set language based on participant's language
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.45,                     // increased for better detection
            silence_duration_ms: 150,            // was 300 — fires translation faster
            prefix_padding_ms: 100               // was 200 — less pre-roll
          },
          temperature: 0.3,                      // low = more deterministic, faster
          max_response_output_tokens: 200,       // cap prevents runaway generation
          tools: [],
          tool_choice: 'none'
        }
      };

      openaiWs.send(JSON.stringify(sessionConfig));
    });

    openaiWs.on('message', async (data) => {
      await handleOpenAIResponse(data, userId, translationSession);
    });

    openaiWs.on('error', (error) => {
      console.error(`OpenAI WebSocket error for user ${userId}:`, error);
    });

    openaiWs.on('close', () => {
      console.log(`OpenAI WebSocket closed for user ${userId}`);
    });

  } catch (error) {
    console.error(`Failed to initialize OpenAI connection for user ${userId}:`, error);
  }
}

async function processAudioForTranslation(data, ws) {
  const connection = activeConnections.get(ws);
  if (!connection) return;

  const { sessionId, userId } = connection;
  const translationSession = translationSessions.get(sessionId);
  if (!translationSession) return;

  const participant = translationSession.participants.get(userId);
  if (!participant?.openaiWs || participant.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  // Track processing start time for performance metrics
  participant.lastRequestTime = Date.now();

  // Send audio to OpenAI for real-time processing with enhanced metadata
  const audioMessage = {
    type: 'input_audio_buffer.append',
    audio: data.audio
  };

  participant.openaiWs.send(JSON.stringify(audioMessage));
  
  // Log audio processing for monitoring
  console.log(`=�Ħ [Audio] Processing audio for user ${userId} (${data.audio?.length || 0} bytes)`);
}

async function handleOpenAIResponse(data, userId, translationSession) {
  try {
    const response = JSON.parse(data.toString());
    const participant = translationSession.participants.get(userId);
    const processingTime = Date.now() - (participant.lastRequestTime || Date.now());
    
    console.log(`=��� [OpenAI Response] Type: ${response.type} for user ${userId}`);
    console.log(`=��� [OpenAI Response] Full response:`, JSON.stringify(response, null, 2));
    
    // Declare variables at function scope to avoid reference errors
    let otherParticipant;
    let allParticipants;
    
    // Handle completed response with translation
    if (response.type === 'response.done') {
      console.log(`=��� Translation completed for user ${userId}`);
      
      // Look for text content OR audio content with transcript in the response
      let translatedText = null;
      
      // First try to find text content
      const textContent = response.response?.output?.find(item => item.type === 'message')?.content?.find(content => content.type === 'text');
      
      if (textContent && textContent.text) {
        translatedText = textContent.text;
        console.log(`G�� Text translation found: "${translatedText}"`);
      } else {
        // Try to find audio content with transcript
        const audioContent = response.response?.output?.find(item => item.type === 'message')?.content?.find(content => content.type === 'audio');
        
        if (audioContent && audioContent.transcript) {
          translatedText = audioContent.transcript;
          console.log(`G�� Audio transcript translation found: "${translatedText}"`);
        }
      }
      
      if (translatedText) {
        // VALIDATION: Check if AI rejected the language
        if (translatedText.trim() === "INVALID_LANGUAGE") {
          console.error(`🚫 [LANGUAGE VALIDATION] AI rejected non-English/French input from user ${userId}`);
          
          // Send rejection message to speaker
          if (participant?.socket && participant.socket.readyState === WebSocket.OPEN) {
            const rejectionMessage = {
              type: 'language_rejected',
              error: 'Only English and French are supported',
              originalText: participant.pendingMessage?.originalText || '',
              timestamp: Date.now()
            };
            participant.socket.send(JSON.stringify(rejectionMessage));
          }
          
          // Clear pending message
          participant.pendingMessage = null;
          if (participant.pendingMessageTimeout) {
            clearTimeout(participant.pendingMessageTimeout);
            participant.pendingMessageTimeout = null;
          }
          
          // Don't process this message further
          return;
        }
        
        console.log(`✅ Translation completed for user ${userId}: "${translatedText}"`);
        
        const pendingMessage = participant.pendingMessage;
        if (!pendingMessage) {
          console.warn('G��n+� No pending message found for completed translation');
        } else {
          // Clear the pending message timeout since we got a successful response
          if (participant.pendingMessageTimeout) {
            clearTimeout(participant.pendingMessageTimeout);
            participant.pendingMessageTimeout = null;
          }
          
          // Create complete message with translation
          const completeMessage = {
            messageId: pendingMessage.messageId,
            participantId: userId,
            originalText: pendingMessage.originalText,
            translatedText: translatedText,
            originalLanguage: pendingMessage.originalLanguage,
            targetLanguage: pendingMessage.targetLanguage,
            timestamp: pendingMessage.timestamp,
            processingTime: processingTime
          };

          // Add to session history
          translationSession.addMessage(completeMessage);

          // Add to transcript history with full details
          otherParticipant = translationSession.getOtherParticipant(userId);
          const participantName = participant.name || `Participant ${userId}`;
          
          const transcriptMessage = translationSession.addTranscriptMessage({
            speakerId: userId,
            speakerName: participantName,
            sourceLanguage: pendingMessage.originalLanguage,
            targetLanguage: pendingMessage.targetLanguage,
            originalTranscript: pendingMessage.originalText,
            translatedTranscript: translatedText,
            timestamp: Date.now(),
            confidence: response.confidence || 0.95,
            processingTime: processingTime
          });

          // Send LANGUAGE-SPECIFIC TRANSCRIPTS to participants
          allParticipants = Array.from(translationSession.participants.values());
          allParticipants.forEach(p => {
            if (p.socket?.readyState === WebSocket.OPEN) {
              let messageToSend;
              
              // Send transcript in participant's own language only
              if (p.socket === participant.socket) {
                // Original speaker gets their own transcript in their language
                messageToSend = {
                  type: 'SPEECH_TRANSCRIPT',
                  fromParticipant: userId,
                  originalText: completeMessage.originalText,
                  originalLanguage: completeMessage.originalLanguage,
                  timestamp: Date.now(),
                  isOwnTranscript: true
                };
                console.log(`🎤 [TRANSCRIPT] Sending original transcript to speaker (${completeMessage.originalLanguage})`);
              } else {
                // Other participant gets translated transcript in their language
                messageToSend = {
                  type: 'SPEECH_TRANSCRIPT',
                  fromParticipant: userId,
                  originalText: completeMessage.translatedText,
                  originalLanguage: completeMessage.targetLanguage,
                  timestamp: Date.now(),
                  isTranslatedTranscript: true
                };
                console.log(`🎤 [TRANSCRIPT] Sending translated transcript to other participant (${completeMessage.targetLanguage})`);
              }
              
              p.socket.send(JSON.stringify(messageToSend));
            }
          });

          // Clear pending message
          participant.pendingMessage = null;
        }
      }
      
      console.log(`G�� Translation processing completed for user ${userId}`);
    }

    if (response.type === 'input_audio_buffer.speech_started') {
      otherParticipant = translationSession.getOtherParticipant(userId);
      if (otherParticipant?.socket && otherParticipant.socket.readyState === WebSocket.OPEN) {
        otherParticipant.socket.send(JSON.stringify({
          type: 'VOICE_ACTIVITY_STARTED',
          sessionId: translationSession.sessionId,
          participantId: userId,
          timestamp: Date.now(),
        }));
      }
    }

    if (response.type === 'input_audio_buffer.speech_stopped') {
      otherParticipant = translationSession.getOtherParticipant(userId);
      if (otherParticipant?.socket && otherParticipant.socket.readyState === WebSocket.OPEN) {
        otherParticipant.socket.send(JSON.stringify({
          type: 'VOICE_ACTIVITY_STOPPED',
          sessionId: translationSession.sessionId,
          participantId: userId,
          timestamp: Date.now(),
        }));
      }
    }

    // Handle translated audio streaming for room broadcast
    if (response.type === 'response.audio.delta') {
      const audioData = response.delta;
      
      console.log(`=��� [AUDIO DELTA] Received audio chunk for user ${userId}, size: ${audioData?.length || 0}`);
      
      // Broadcast translated audio to the other participant in the room
      otherParticipant = translationSession.getOtherParticipant(userId);
      if (otherParticipant?.socket && otherParticipant.socket.readyState === WebSocket.OPEN) {
        const audioEvent = {
          type: 'TRANSLATED_AUDIO',
          sessionId: translationSession.sessionId,
          fromParticipant: userId,
          audioData: audioData,
          timestamp: Date.now(),
          quality: 'high',
          processingTime: processingTime
        };

        const chunkEvent = {
          type: 'AUDIO_CHUNK',
          sessionId: translationSession.sessionId,
          participantId: userId,
          audioData,
          responseId: response.response_id || `response_${Date.now()}`,
          chunkId: `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
        };
        
        console.log(`=��� [ROOM AUDIO] Broadcasting translated audio to other participant (${audioData?.length || 0} bytes)`);
        otherParticipant.socket.send(JSON.stringify(audioEvent));
        otherParticipant.socket.send(JSON.stringify(chunkEvent));
      } else {
        console.warn(`G��n+� [ROOM AUDIO] Cannot broadcast - other participant socket not available`);
      }
    }
    
    // Log when audio transcript is done to track audio generation
    if (response.type === 'response.audio.done') {
      console.log(`G�� [AUDIO DONE] Audio generation completed for user ${userId}`);
    }

    // Handle real-time transcript streaming
    if (response.type === 'conversation.item.input_audio_transcription.delta') {
      otherParticipant = translationSession.getOtherParticipant(userId);
      if (otherParticipant?.socket && otherParticipant.socket.readyState === WebSocket.OPEN) {
        otherParticipant.socket.send(JSON.stringify({
          type: 'PARTIAL_TRANSCRIPT',
          sessionId: translationSession.sessionId,
          participantId: userId,
          delta: response.delta,
          itemId: response.item_id || `item_${Date.now()}`,
          timestamp: Date.now(),
        }));
      }
    }

    if (response.type === 'response.audio_transcript.delta') {
      otherParticipant = translationSession.getOtherParticipant(userId);
      if (otherParticipant?.socket && otherParticipant.socket.readyState === WebSocket.OPEN) {
        const transcriptDelta = {
          type: 'transcript_delta',
          sessionId: translationSession.sessionId,
          fromParticipant: userId,
          delta: response.delta,
          timestamp: Date.now(),
          confidence: 0.9
        };

        const translationDelta = {
          type: 'TRANSLATION_DELTA',
          sessionId: translationSession.sessionId,
          participantId: userId,
          delta: response.delta,
          responseId: response.response_id || `response_${Date.now()}`,
          targetLanguage: otherParticipant.language,
          timestamp: Date.now(),
        };
        
        otherParticipant.socket.send(JSON.stringify(transcriptDelta));
        otherParticipant.socket.send(JSON.stringify(translationDelta));
      }
    }

    if (response.type === 'response.audio_transcript.done') {
      console.log(`G�� Audio transcript completed for user ${userId}: "${response.transcript}"`);
      
      // Don't create/overwrite pending message here - it should already exist from SPEECH_TRANSCRIPT
      // The pending message contains the ORIGINAL text, not the translated text
      console.log(`=��� [TRANSCRIPT] Audio transcript done, pending message should already exist`);
      
      // Send quality feedback to original speaker
      if (participant?.socket && participant.socket.readyState === WebSocket.OPEN) {
        const qualityFeedback = {
          type: 'quality_feedback',
          processingTime: processingTime,
          qualityScore: processingTime < 2000 ? 0.9 : 0.7,
          recommendations: processingTime > 3000 ? ['Consider speaking more clearly or checking connection'] : [],
          timestamp: Date.now()
        };
        
        participant.socket.send(JSON.stringify(qualityFeedback));
      }
      
      // The translation will be handled by response.done when OpenAI provides the translated text
    }

    if (response.type === 'error') {
      console.error(`G�� OpenAI error for user ${userId}:`, response.error);
      
      // Broadcast error to room participants
      const errorMessage = {
        type: 'translation_error',
        sessionId: translationSession.sessionId,
        fromParticipant: userId,
        error: response.error,
        timestamp: Date.now(),
        recovery: getErrorRecoveryAdvice(response.error),
        retryable: isRetryableError(response.error)
      };

      // Send error to all participants in room
      allParticipants = Array.from(translationSession.participants.values());
      allParticipants.forEach(p => {
        if (p.socket?.readyState === WebSocket.OPEN) {
          p.socket.send(JSON.stringify(errorMessage));
        }
      });

      // Clear pending message on error
      if (participant) {
        participant.pendingMessage = null;
      }
    }

    // Log performance metrics for monitoring
    if (processingTime > 0) {
      console.log(`=��� [Performance] User ${userId}: ${processingTime}ms processing time`);
    }

  } catch (error) {
    console.error(`G�� Error handling OpenAI response for user ${userId}:`, error);
    
    // Send generic error to room participants
    const genericError = {
      type: 'system_error',
      sessionId: translationSession.sessionId,
      message: 'Translation processing error occurred',
      timestamp: Date.now(),
      recovery: 'Please try again or refresh the page'
    };

    const allParticipants = Array.from(translationSession.participants.values());
    allParticipants.forEach(p => {
      if (p.socket?.readyState === WebSocket.OPEN) {
        p.socket.send(JSON.stringify(genericError));
      }
    });

    // Clear pending message on error
    const participant = translationSession.participants.get(userId);
    if (participant) {
      participant.pendingMessage = null;
    }
  }
}

// Helper function to provide error recovery advice
function getErrorRecoveryAdvice(error) {
  if (error?.message?.includes('rate_limit')) {
    return 'Rate limit exceeded. Please wait a moment before trying again.';
  }
  if (error?.message?.includes('network') || error?.message?.includes('connection')) {
    return 'Network issue detected. Please check your internet connection.';
  }
  if (error?.message?.includes('audio') || error?.message?.includes('format')) {
    return 'Audio processing issue. Try speaking more clearly or check your microphone.';
  }
  return 'Please try again or refresh the page if the issue persists.';
}

// Helper function to determine if error is retryable
function isRetryableError(error) {
  const retryableErrors = ['rate_limit', 'network', 'timeout', 'temporary'];
  return retryableErrors.some(type => error?.message?.toLowerCase().includes(type));
}

function cleanupConnection(ws) {
  const connection = activeConnections.get(ws);
  if (!connection) return;

  const { sessionId, userId } = connection;
  activeConnections.delete(ws);

  // Clean up from translation session
  const translationSession = translationSessions.get(sessionId);
  if (translationSession) {
    translationSession.removeParticipant(userId);
    
    // Remove empty translation sessions
    if (translationSession.participants.size === 0) {
      translationSessions.delete(sessionId);
      console.log(`Cleaned up empty translation session: ${sessionId}`);
    }
  }
  
  console.log(`Cleaned up connection for user ${userId} in session ${sessionId}`);
}

// Home page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>NeuralEcho Translation</title></head>
      <body>
        <h1>=��� NeuralEcho Real-time Translation Server</h1>
        <p>G�� Server is running and ready for real-time translation!</p>
        <p>=��� <a href="/health">Health Check</a></p>
        <p>=��� WebSocket endpoint: ws://localhost:3001</p>
      </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeConnections: activeConnections.size,
    translationSessions: translationSessions.size,
    activeTranslations: Array.from(translationSessions.values()).map(session => ({
      sessionId: session.sessionId,
      participants: session.participants.size,
      languages: Array.from(session.participants.values()).map(p => p.language)
    })),
    openai: {
      apiKey: process.env.OPENAI_API_KEY ? 'configured' : 'missing'
    }
  });
});

// Room status endpoint
app.get('/api/session/:roomId/status', (req, res) => {
  const { roomId } = req.params;
  
  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }
  
  const session = translationSessions.get(roomId);
  
  if (!session) {
    return res.status(404).json({ 
      error: 'Room not found',
      roomId: roomId 
    });
  }
  
  const participants = Array.from(session.participants.values()).map(p => ({
    id: p.userId,
    name: p.name,
    language: p.language,
    isConnected: p.socket?.readyState === 1 // WebSocket.OPEN
  }));
  
  res.json({
    roomId: roomId,
    participantCount: session.participants.size,
    maxParticipants: 2,
    isActive: session.participants.size > 0,
    participants: participants,
    messageCount: session.messageHistory?.length || 0,
    transcriptCount: session.transcriptHistory?.length || 0,
    isRecording: session.isRecording || false
  });
});

// Create OpenAI Realtime Session endpoint (for frontend WebRTC)
app.post('/api/openai/realtime-session', async (req, res) => {
  try {
    const { instructions, turn_detection, voice } = req.body;
    
    console.log('🔧 [OpenAI Session] Request received');
    console.log('🔧 [OpenAI Session] Checking for OPENAI_API_KEY...');
    console.log('🔧 [OpenAI Session] Available env vars with OPENAI:', Object.keys(process.env).filter(k => k.includes('OPENAI')));
    
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ [OpenAI Session] OPENAI_API_KEY not found in environment variables');
      console.error('❌ [OpenAI Session] All env vars:', Object.keys(process.env).join(', '));
      return res.status(500).json({ 
        error: 'OpenAI API key not configured on server',
        hint: 'Please set OPENAI_API_KEY environment variable in Render dashboard'
      });
    }

    console.log('✅ [OpenAI Session] OPENAI_API_KEY found, creating realtime session');
    console.log('🔧 [OpenAI Session] API Key (first 10 chars):', process.env.OPENAI_API_KEY.substring(0, 10) + '...');

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        instructions: instructions || 'You are a helpful assistant.',
        turn_detection: turn_detection || null,
        voice: voice || 'ballad',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        modalities: ['text', 'audio'],
        temperature: 0.6,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        tools: [],
        tool_choice: 'none'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [OpenAI Session] Failed to create session:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Failed to create OpenAI session: ${response.status}`,
        details: errorText 
      });
    }

    const data = await response.json();
    console.log('✅ [OpenAI Session] Session created successfully');
    res.json(data);
  } catch (error) {
    console.error('❌ [OpenAI Session] Error creating session:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=��� NeuralEcho Translation Server running on http://0.0.0.0:${PORT}`);
  console.log(`=��� Health Check: http://0.0.0.0:${PORT}/health`);
  console.log(`=��� WebSocket Server: ws://0.0.0.0:${PORT}`);
  console.log(`=��� Environment Check:`);
  console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`   - OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'configured ✅' : 'MISSING ❌'}`);
  console.log(`   - Available env vars: ${Object.keys(process.env).filter(k => k.includes('OPENAI') || k.includes('API')).join(', ')}`);
});

export default app;
