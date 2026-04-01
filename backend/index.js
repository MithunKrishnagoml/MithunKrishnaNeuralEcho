import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import WebSocket from 'ws';

// Load environment variables from parent directory or current directory
// Deployment trigger: Fixed syntax error - REDEPLOY NOW
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });
dotenv.config({ path: join(__dirname, '.env') }); // Also check current directory

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://neuralecho.vercel.app',
      'https://neuralecho1.vercel.app',
      'https://neural-echo.vercel.app'
    ];
    
    // Allow all Vercel preview deployments
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active translation sessions
const translationSessions = new Map();
const activeConnections = new Map();
const chunkSeq = {}; // Track audio chunk sequence per user

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
      pendingMessage: null, // For tracking translation in progress
      audioSequenceNumber: 0, // Track audio chunk sequence
      currentResponseId: null, // Track current OpenAI response
      isStreaming: false // Track if currently streaming translation
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
    
    // Clean up chunk sequence tracking
    if (typeof chunkSeq !== 'undefined' && chunkSeq[userId] !== undefined) {
      delete chunkSeq[userId];
    }
    
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

  getParticipant(userId) {
    return this.participants.get(userId);
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
  const inputLangName = inputLang === "en-US" ? "English" : "French";
  const outputLangName = outputLang === "en-US" ? "English" : "French";

  return `You are a strict translator between English and French only.

Rules:
1. Output the translation ONLY. No explanations, no greetings, no commentary.
2. Translate word for word. Never paraphrase or summarize.
3. Never add or remove words. Never correct grammar.
4. Keep names, numbers, and dates exactly as spoken.
5. If input is not English or French, return empty string.
6. Never respond conversationally. You are a translation engine, not a chatbot.

Examples:
Input: Hello     → Output: Bonjour
Input: Thank you → Output: Merci
Input: Merci     → Output: Thank you
Input: Bonjour   → Output: Hello`;
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
  'VOICE_ACTIVITY_STOPPED'
]);

function relayStreamingMessage(data, senderWs) {
  const connection = activeConnections.get(senderWs);
  if (!connection) return;

  const { sessionId, userId } = connection;
  const translationSession = translationSessions.get(sessionId);
  if (!translationSession) return;

  // Relay streaming messages to other participants
  let payload = {
    ...data,
    participantId: data.participantId || userId,
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

        // NOTE: OpenAI connection is handled directly via WebRTC on the frontend
        // Backend only relays AI_AUDIO_CHUNK and messages between participants

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

      // Handle voice activity events (relay to all participants)
      if (data.type === 'VOICE_ACTIVITY_STARTED' || data.type === 'VOICE_ACTIVITY_STOPPED') {
        const { participantId } = data;
        const speaking = data.type === 'VOICE_ACTIVITY_STARTED';
        
        console.log(`🎤 [VAD] ${speaking ? 'Speech started' : 'Speech stopped'} for participant: ${participantId}`);
        
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        // Broadcast VAD event to ALL participants
        for (const [userId, participant] of translationSession.participants.entries()) {
          if (participant.socket?.readyState === WebSocket.OPEN) {
            participant.socket.send(JSON.stringify({
              type: 'vad_speaking',
              sessionId: sessionId,
              speakerId: participantId,
              speaking: speaking,
              timestamp: Date.now()
            }));
            
            console.log(`🎤 [VAD] Sent vad_speaking event to participant ${userId}: speakerId=${participantId}, speaking=${speaking}`);
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

      // Handle AI audio chunks from OpenAI (relay to all participants)
      if (data.type === 'AI_AUDIO_CHUNK') {
        const { participantId, audioData, seq } = data;
        
        // Log every 50th chunk to avoid spam
        if (seq % 50 === 0) {
          console.log(`[RELAY] AI_AUDIO_CHUNK from ${participantId}, seq: ${seq}, size: ${audioData?.length || 0}`);
        }
        
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId, userId: senderUserId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        // Broadcast to ALL participants (including sender for local playback)
        for (const [userId, participant] of translationSession.participants.entries()) {
          if (participant.socket?.readyState === WebSocket.OPEN) {
            const chunkMessage = {
              type: 'AUDIO_CHUNK',
              sessionId: sessionId,
              participantId: 'ai-agent',  // AI has its own ID
              audioData: audioData,
              chunkId: `ai_chunk_${seq}`,
              responseId: `ai_response_${senderUserId}`,
              timestamp: Date.now(),
              speakerId: senderUserId // Track which user's AI this is
            };

            participant.socket.send(JSON.stringify(chunkMessage));
            
            if (seq % 50 === 0) {
              console.log(`[RELAY] Sent chunk #${seq} to participant ${userId}`);
            }
          }
        }
      }

      // Handle AI audio stream end
      if (data.type === 'AI_AUDIO_END') {
        const { participantId } = data;
        console.log(`🏁 [AI_AUDIO_END] From ${participantId}`);
        
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId, userId: senderUserId } = connection;
        const translationSession = translationSessions.get(sessionId);
        if (!translationSession) return;

        // Send stream end to the other participant only
        const otherParticipant = translationSession.getOtherParticipant(senderUserId);
        
        if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
          const endMessage = {
            type: 'AUDIO_STREAM_END',
            sessionId: sessionId,
            participantId: 'ai-agent',  // ✅ Match the AI participantId
            responseId: `ai_response_${Date.now()}`,
            timestamp: Date.now()
          };

          otherParticipant.socket.send(JSON.stringify(endMessage));
          console.log(`🏁 [AI_AUDIO_END] Sent to other participant with participantId: ai-agent`);
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
            participantId: participantId,  // ✅ Consistent field name
            pcmData: pcmData,
            sampleRate: sampleRate || 24000,
            sequenceNumber: sequenceNumber || 0,
            responseId: responseId,
            timestamp: Date.now()
          };
          
          otherParticipant.socket.send(JSON.stringify(chunkMessage));
          console.log(`🎵 [AUDIO_CHUNK] Relayed to other participant: seq ${sequenceNumber}`);
        } else {
          console.log(`🎵 [AUDIO_CHUNK] No other participant to relay to`);
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

// NOTE: Backend OpenAI connection removed - frontend handles WebRTC directly to OpenAI
// Backend only relays AI_AUDIO_CHUNK and messages between participants

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
    const { instructions, turn_detection, voice, input_audio_transcription, modalities, temperature, max_response_output_tokens, input_audio_format, output_audio_format } = req.body;
    
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

    // CRITICAL: Forward language hint to Whisper to prevent wrong-language transcripts
    const audioTranscription = input_audio_transcription || { model: 'whisper-1' };
    console.log('🔧 [OpenAI Session] Whisper config:', audioTranscription);

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
        voice: voice || 'shimmer',
        input_audio_transcription: audioTranscription,
        modalities: ['text', 'audio'],
        temperature: 0.2,
        max_response_output_tokens: 512,
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
