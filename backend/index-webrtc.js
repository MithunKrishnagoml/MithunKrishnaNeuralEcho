/**
 * NeuralEcho Full-Duplex WebRTC Translation Server
 * Hybrid architecture: WebRTC for audio, WebSocket for signaling
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import WebSocket from 'ws';
import { WebRTCSessionManager } from './webrtc-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });
dotenv.config({ path: join(__dirname, '.env') });

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const webrtcManager = new WebRTCSessionManager();

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

// Store active sessions
const translationSessions = new Map();
const activeConnections = new Map();

class TranslationSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.participants = new Map();
    this.messageHistory = [];
    this.transcriptHistory = [];
    this.createdAt = Date.now();
  }

  addParticipant(userId, language, socket, name = null) {
    this.participants.set(userId, {
      language,
      socket,
      name,
      openaiWs: null,
      webrtcHandler: null,
      joinedAt: Date.now()
    });
    console.log(`✅ Added participant ${userId} (${language}) to session ${this.sessionId}`);
  }

  removeParticipant(userId) {
    const participant = this.participants.get(userId);
    if (participant) {
      if (participant.openaiWs) {
        participant.openaiWs.close();
      }
      if (participant.webrtcHandler) {
        participant.webrtcHandler.close();
      }
    }
    this.participants.delete(userId);
    console.log(`🗑️ Removed participant ${userId} from session ${this.sessionId}`);
  }

  getOtherParticipant(userId) {
    for (const [otherUserId, participant] of this.participants.entries()) {
      if (otherUserId !== userId) {
        return { userId: otherUserId, ...participant };
      }
    }
    return null;
  }
}

function buildTranslationInstructions(inputLang, outputLang) {
  const inputLangName = inputLang === "en" ? "English" : "French";
  const outputLangName = outputLang === "en" ? "English" : "French";

  return `You are a strict real-time translator for phone-call-like conversations.

Your role:
- Listen to ${inputLangName} speech
- Translate to ${outputLangName} in real-time
- Speak the translation naturally with appropriate tone

Rules:
1. Translate ONLY. No explanations, no greetings, no commentary.
2. Preserve meaning and tone exactly as spoken.
3. Keep names, numbers, and dates exactly as heard.
4. Never respond conversationally. You are a translation engine.
5. Speak naturally in ${outputLangName} with appropriate emotion and pacing.
6. Handle interruptions gracefully - stop mid-sentence if needed.

Examples:
${inputLangName}: "Hello, how are you?" → ${outputLangName}: "Bonjour, comment allez-vous?"
${inputLangName}: "Thank you very much" → ${outputLangName}: "Merci beaucoup"`;
}

async function createOpenAISession(inputLang, outputLang) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    ws.on('open', () => {
      console.log(`✅ [OpenAI] Session opened for ${inputLang} → ${outputLang}`);
      
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: buildTranslationInstructions(inputLang, outputLang),
          voice: 'shimmer',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: { 
            model: 'whisper-1', 
            language: inputLang 
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.4,
            prefix_padding_ms: 200,
            silence_duration_ms: 400,
            create_response: true
          }
        }
      }));
      
      resolve(ws);
    });

    ws.on('error', (error) => {
      console.error(`❌ [OpenAI] Session error:`, error);
      reject(error);
    });
  });
}

function wireOpenAIOutput(openaiWs, targetParticipant, session, speakerId) {
  let chunkSeq = 0;
  let currentResponseId = null;

  const pingInterval = setInterval(() => {
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.ping?.();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  openaiWs.on('message', (raw) => {
    try {
      const event = JSON.parse(raw);

      // Track response ID for interruption handling
      if (event.type === 'response.created') {
        currentResponseId = event.response.id;
        console.log(`🆕 [OpenAI] New response started: ${currentResponseId}`);
      }

      // Stream translated audio chunks
      if (event.type === 'response.audio.delta') {
        if (targetParticipant.socket?.readyState === WebSocket.OPEN) {
          targetParticipant.socket.send(JSON.stringify({
            type: 'TRANSLATED_AUDIO_CHUNK',
            audioData: event.delta,
            chunkId: `chunk_${speakerId}_${chunkSeq}`,
            sequenceNumber: chunkSeq++,
            speakerId,
            responseId: currentResponseId,
            timestamp: Date.now()
          }));
        }
      }

      // Handle response completion
      if (event.type === 'response.done') {
        console.log(`✅ [OpenAI] Response completed: ${currentResponseId}`);
        if (targetParticipant.socket?.readyState === WebSocket.OPEN) {
          targetParticipant.socket.send(JSON.stringify({
            type: 'AUDIO_STREAM_COMPLETE',
            speakerId,
            responseId: currentResponseId,
            timestamp: Date.now()
          }));
        }
      }

      // Handle interruption
      if (event.type === 'response.cancelled') {
        console.log(`⚠️ [OpenAI] Response cancelled (interrupted): ${currentResponseId}`);
        if (targetParticipant.socket?.readyState === WebSocket.OPEN) {
          targetParticipant.socket.send(JSON.stringify({
            type: 'AUDIO_INTERRUPTED',
            speakerId,
            responseId: currentResponseId,
            timestamp: Date.now()
          }));
        }
      }

      // Send transcript to speaker
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        const speakerParticipant = session.participants.get(speakerId);
        if (speakerParticipant?.socket?.readyState === WebSocket.OPEN) {
          speakerParticipant.socket.send(JSON.stringify({
            type: 'MY_TRANSCRIPT',
            text: event.transcript,
            speakerId,
            timestamp: Date.now()
          }));
        }
      }

      // Send translation to listener
      if (event.type === 'response.audio_transcript.done') {
        if (targetParticipant.socket?.readyState === WebSocket.OPEN) {
          targetParticipant.socket.send(JSON.stringify({
            type: 'INCOMING_TRANSCRIPT',
            text: event.transcript,
            speakerId,
            timestamp: Date.now()
          }));
        }
      }

    } catch (error) {
      console.error('❌ [OpenAI] Error processing message:', error);
    }
  });

  openaiWs.on('close', () => {
    clearInterval(pingInterval);
    console.log(`🔌 [OpenAI] Session closed for speaker ${speakerId}`);
  });
}

// WebSocket handler
wss.on('connection', (ws, req) => {
  console.log('🔌 WebSocket connection opened');
  
  ws.send(JSON.stringify({ 
    type: 'CONNECTION_ESTABLISHED', 
    message: 'Connected to NeuralEcho WebRTC server' 
  }));
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`📨 [Server] Received: ${data.type}`);

      // Handle session join
      if (data.type === 'join_session') {
        const { sessionId, userId, language, name } = data;
        
        let session = translationSessions.get(sessionId);
        if (!session) {
          session = new TranslationSession(sessionId);
          translationSessions.set(sessionId, session);
        }

        if (session.participants.size >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session is full' }));
          return;
        }

        session.addParticipant(userId, language, ws, name);
        activeConnections.set(ws, { sessionId, userId });

        ws.send(JSON.stringify({ 
          type: 'USER_JOINED_ROOM', 
          sessionId, 
          userId,
          participantCount: session.participants.size
        }));

        // Initialize OpenAI sessions when both participants join
        if (session.participants.size === 2) {
          console.log(`🚀 Both participants joined session ${sessionId}`);
          
          const [userA, userB] = Array.from(session.participants.entries());
          const langA = userA[1].language.toLowerCase().startsWith('en') ? 'en' : 'fr';
          const langB = userB[1].language.toLowerCase().startsWith('en') ? 'en' : 'fr';
          
          try {
            const sessionA = await createOpenAISession(langA, langB);
            userA[1].openaiWs = sessionA;
            
            const sessionB = await createOpenAISession(langB, langA);
            userB[1].openaiWs = sessionB;
            
            wireOpenAIOutput(sessionA, userB[1], session, userA[0]);
            wireOpenAIOutput(sessionB, userA[1], session, userB[0]);
            
            console.log(`✅ OpenAI sessions initialized for ${sessionId}`);
            
            // Notify participants
            for (const [currentUserId, participant] of session.participants.entries()) {
              if (participant.socket?.readyState === WebSocket.OPEN) {
                const otherParticipant = Array.from(session.participants.entries())
                  .find(([uid]) => uid !== currentUserId);
                
                participant.socket.send(JSON.stringify({ 
                  type: 'translation_ready',
                  message: 'Translation is live - start WebRTC connection',
                  participantCount: 2,
                  otherParticipant: otherParticipant ? {
                    id: otherParticipant[0],
                    name: otherParticipant[1].name,
                    language: otherParticipant[1].language
                  } : null
                }));
              }
            }
          } catch (error) {
            console.error(`❌ Failed to initialize OpenAI:`, error);
          }
        }
      }

      // Handle WebRTC signaling
      if (data.type === 'webrtc_offer') {
        const { roomId, userId, offer } = data;
        const session = translationSessions.get(roomId);
        if (!session) return;

        // Forward offer to other participant
        const otherParticipant = session.getOtherParticipant(userId);
        if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
          otherParticipant.socket.send(JSON.stringify({
            type: 'webrtc_offer',
            fromUserId: userId,
            offer
          }));
        }
      }

      if (data.type === 'webrtc_answer') {
        const { roomId, userId, answer } = data;
        const session = translationSessions.get(roomId);
        if (!session) return;

        const otherParticipant = session.getOtherParticipant(userId);
        if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
          otherParticipant.socket.send(JSON.stringify({
            type: 'webrtc_answer',
            fromUserId: userId,
            answer
          }));
        }
      }

      if (data.type === 'webrtc_ice_candidate') {
        const { roomId, userId, candidate } = data;
        const session = translationSessions.get(roomId);
        if (!session) return;

        const otherParticipant = session.getOtherParticipant(userId);
        if (otherParticipant?.socket?.readyState === WebSocket.OPEN) {
          otherParticipant.socket.send(JSON.stringify({
            type: 'webrtc_ice_candidate',
            fromUserId: userId,
            candidate
          }));
        }
      }

      // Handle WebRTC audio (forwarded from client via data channel or separate mechanism)
      // In practice, WebRTC audio goes peer-to-peer or through TURN server
      // For OpenAI integration, we need to capture it server-side
      
      if (data.type === 'WEBRTC_AUDIO_DATA') {
        const { audioData } = data;
        const connection = activeConnections.get(ws);
        if (!connection) return;

        const { sessionId, userId } = connection;
        const session = translationSessions.get(sessionId);
        if (!session) return;

        const participant = session.participants.get(userId);
        if (participant?.openaiWs?.readyState === WebSocket.OPEN) {
          participant.openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: audioData
          }));
        }
      }

    } catch (error) {
      console.error('❌ Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket closed');
    const connection = activeConnections.get(ws);
    if (connection) {
      const { sessionId, userId } = connection;
      const session = translationSessions.get(sessionId);
      if (session) {
        session.removeParticipant(userId);
        if (session.participants.size === 0) {
          translationSessions.delete(sessionId);
        }
      }
      activeConnections.delete(ws);
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    architecture: 'WebRTC + OpenAI Full-Duplex',
    activeSessions: translationSessions.size
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 NeuralEcho WebRTC Server running on port ${PORT}`);
  console.log(`📡 Full-duplex translation architecture active`);
});

export default app;
