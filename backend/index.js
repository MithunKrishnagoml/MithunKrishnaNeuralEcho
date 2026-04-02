import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { nanoid } from 'nanoid';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });
dotenv.config({ path: join(__dirname, '.env') });

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

// Room session structure
class RoomSession {
  constructor(roomId) {
    this.roomId = roomId;
    this.participants = new Map(); // userId -> { userId, name, language, ws, openaiSessionActive }
    this.createdAt = Date.now();
  }
}

// Safe WebSocket send function
function safeSend(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
    }
  }
}

// Store active room sessions
const roomSessions = new Map();

// API Routes

// Create room
app.post('/api/room/create', (req, res) => {
  const roomId = nanoid(8);
  const session = new RoomSession(roomId);
  roomSessions.set(roomId, session);

  const joinUrl = `${req.protocol}://${req.get('host')}/room/${roomId}`;

  console.log(`🏠 [ROOM] Created room ${roomId}`);
  res.json({ roomId, joinUrl });
});

// Join room
app.post('/api/room/:roomId/join', (req, res) => {
  const { roomId } = req.params;
  const session = roomSessions.get(roomId);

  if (!session) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // Count live connections
  let liveParticipants = 0;
  for (const participant of session.participants.values()) {
    if (participant.ws.readyState === WebSocket.OPEN) {
      liveParticipants++;
    }
  }

  if (liveParticipants >= 2) {
    return res.status(400).json({ error: 'Room is full' });
  }

  res.json({ success: true, participantCount: liveParticipants });
});

// Get OpenAI ephemeral token
app.get('/api/openai-token', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'shimmer'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    res.json({ client_secret: { value: data.client_secret.value } });
  } catch (error) {
    console.error('❌ [OpenAI Token] Error:', error);
    res.status(500).json({ error: 'Failed to get OpenAI token' });
  }
});

// WebSocket Server (signaling + transcript relay only)
wss.on('connection', (ws, req) => {
  console.log('🔌 [WS] New connection established');
  let connectionId = null;
  let currentRoomId = null;
  let currentUserId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('📨 [WS] Received:', data.type);

      switch (data.type) {
        case 'JOIN_ROOM': {
          const { roomId, userId, name, language } = data;
          const session = roomSessions.get(roomId);

          if (!session) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found' }));
            return;
          }

          // Count live connections
          let liveParticipants = 0;
          for (const participant of session.participants.values()) {
            if (participant.ws.readyState === WebSocket.OPEN) {
              liveParticipants++;
            }
          }

          if (liveParticipants >= 2) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Room is full' }));
            return;
          }

          // Add participant
          session.participants.set(userId, {
            userId,
            name,
            language,
            ws,
            openaiSessionActive: false
          });

          connectionId = userId;
          currentRoomId = roomId;
          currentUserId = userId;

          console.log(`👤 [ROOM] ${userId} joined room ${roomId}, participants: ${liveParticipants + 1}`);

          if (liveParticipants + 1 === 1) {
            // First participant
            ws.send(JSON.stringify({
              type: 'WAITING',
              participantCount: 1
            }));
          } else {
            // Second participant - room is ready
            const otherParticipant = Array.from(session.participants.values())
              .find(p => p.userId !== userId);

            // Notify both participants
            for (const participant of session.participants.values()) {
              participant.ws.send(JSON.stringify({
                type: 'ROOM_READY',
                participantCount: 2,
                otherParticipant: {
                  id: otherParticipant.userId,
                  name: otherParticipant.name,
                  language: otherParticipant.language
                }
              }));
            }
          }
          break;
        }

        case 'TRANSCRIPT': {
          const { roomId, userId, text, direction } = data;
          const session = roomSessions.get(roomId);

          if (!session) return;

          // Find the other participant
          const otherParticipant = Array.from(session.participants.values())
            .find(p => p.userId !== userId);

          if (!otherParticipant) return;

          if (direction === 'MY') {
            // Send to sender as their own transcript
            ws.send(JSON.stringify({
              type: 'MY_TRANSCRIPT',
              text,
              speakerId: userId
            }));
          } else if (direction === 'INCOMING') {
            // Send to other participant as incoming transcript
            otherParticipant.ws.send(JSON.stringify({
              type: 'INCOMING_TRANSCRIPT',
              text,
              speakerId: userId
            }));
          }
          break;
        }

        case 'TRANSCRIPT_DELTA': {
          // Word-level update — forward to peer immediately
          const { roomId, userId, sentenceId, originalText, translatedText, wordCount } = data;
          const session = roomSessions.get(roomId);

          if (!session) return;

          // Find the other participant
          const otherParticipant = Array.from(session.participants.values())
            .find(p => p.userId !== userId);

          if (!otherParticipant) return;

          safeSend(otherParticipant.ws, {
            type: 'PEER_TRANSCRIPT_DELTA',
            speakerId: userId,
            speakerName: session.participants.get(userId)?.name || 'Unknown',
            sentenceId,
            originalText,
            translatedText,
            wordCount,
            timestamp: Date.now()
          });
          break;
        }

        case 'SENTENCE_DONE': {
          // Speaker paused long enough — sentence is complete
          const { roomId, userId } = data;
          const session = roomSessions.get(roomId);

          if (!session) return;

          // Find the other participant
          const otherParticipant = Array.from(session.participants.values())
            .find(p => p.userId !== userId);

          if (!otherParticipant) return;

          safeSend(otherParticipant.ws, {
            type: 'PEER_TRANSCRIPT_SENTENCE_DONE',
            speakerId: userId,
            sentenceId: data.sentenceId,
            timestamp: Date.now()
          });
          break;
        }

        case 'MUTE_STATE': {
          const { roomId, userId, isMuted } = data;
          const session = roomSessions.get(roomId);

          if (!session) return;

          // Find the other participant
          const otherParticipant = Array.from(session.participants.values())
            .find(p => p.userId !== userId);

          if (otherParticipant) {
            otherParticipant.ws.send(JSON.stringify({
              type: 'PEER_MUTE_STATE',
              peerId: userId,
              isMuted
            }));
          }
          break;
        }

        case 'LEAVE_ROOM': {
          const { roomId, userId } = data;
          const session = roomSessions.get(roomId);

          if (session) {
            session.participants.delete(userId);

            // Notify remaining participant
            const remainingParticipant = Array.from(session.participants.values())[0];
            if (remainingParticipant) {
              remainingParticipant.ws.send(JSON.stringify({
                type: 'PEER_LEFT'
              }));
            }

            // Clean up empty rooms after a delay
            setTimeout(() => {
              if (session.participants.size === 0) {
                roomSessions.delete(roomId);
                console.log(`🗑️ [ROOM] Cleaned up empty room ${roomId}`);
              }
            }, 30000);
          }
          break;
        }
      }
    } catch (error) {
      console.error('❌ [WS] Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('🔌 [WS] Connection closed');

    if (currentRoomId && currentUserId) {
      const session = roomSessions.get(currentRoomId);
      if (session) {
        session.participants.delete(currentUserId);

        // Notify remaining participant
        const remainingParticipant = Array.from(session.participants.values())[0];
        if (remainingParticipant) {
          remainingParticipant.ws.send(JSON.stringify({
            type: 'PEER_LEFT'
          }));
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error('❌ [WS] Connection error:', error);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 NeuralEcho Chatroom Server running on http://0.0.0.0:${PORT}`);
  console.log(`✅ Health Check: http://0.0.0.0:${PORT}/health`);
  console.log(`🔌 WebSocket Server: ws://0.0.0.0:${PORT}`);
  console.log(`🔧 Environment Check:`);
  console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`   - OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'configured ✅' : 'MISSING ❌'}`);
  console.log(`📡 Direct WebRTC to OpenAI architecture active`);
});

export default app;