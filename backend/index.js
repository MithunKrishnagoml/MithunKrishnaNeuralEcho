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

// Room expiry cleanup (10 minutes)
setInterval(() => {
  const now = Date.now();
  const expiryTime = 10 * 60 * 1000; // 10 minutes

  for (const [roomId, session] of roomSessions.entries()) {
    if (now - session.createdAt > expiryTime) {
      roomSessions.delete(roomId);
      console.log(`🏠 [ROOM] Expired room ${roomId} after 10 minutes`);
    }
  }
}, 60 * 1000); // Check every minute

// API Routes

// Create room
app.post('/api/room/create', (req, res) => {
  const { name, language } = req.body;
  if (!name || !language) {
    return res.status(400).json({ error: 'Name and language are required' });
  }

  const roomId = nanoid(10);
  const session = new RoomSession(roomId);
  roomSessions.set(roomId, session);

  // Use FRONTEND_URL from env, default to Vercel deployment (NOT the backend)
  const frontendUrl = process.env.FRONTEND_URL || 'https://neuralecho1.vercel.app';
  // Generate share link that points to /room/:roomId route (same as creator uses)
  const joinUrl = `${frontendUrl}/room/${roomId}`;

  console.log(`🏠 [ROOM] Created room ${roomId} for ${name} (${language})`);
  console.log(`🔗 [ROOM] Join URL: ${joinUrl}`);
  res.json({ roomId, joinUrl });
});

// Join room
app.post('/api/room/:roomId/join', (req, res) => {
  const { roomId } = req.params;
  const { name, language } = req.body;

  if (!name || !language) {
    return res.status(400).json({ error: 'Name and language are required' });
  }

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

  console.log(`🏠 [ROOM] ${name} (${language}) joining room ${roomId}`);
  res.json({ success: true, participantCount: liveParticipants });
});

// Get room status
app.get('/api/room/:roomId/status', (req, res) => {
  const { roomId } = req.params;
  const session = roomSessions.get(roomId);

  if (!session) {
    return res.json({ exists: false });
  }

  // Get creator info (first participant)
  const participants = Array.from(session.participants.values());
  const creator = participants[0];

  if (!creator) {
    return res.json({ exists: false });
  }

  res.json({
    exists: true,
    participantCount: participants.length,
    creatorName: creator.name,
    creatorLanguage: creator.language
  });
});

// Cancel room
app.post('/api/room/:roomId/cancel', (req, res) => {
  const { roomId } = req.params;
  const session = roomSessions.get(roomId);

  if (session) {
    roomSessions.delete(roomId);
    console.log(`🏠 [ROOM] Cancelled room ${roomId}`);
  }

  res.json({ success: true });
});

// Get OpenAI ephemeral token
app.get('/api/openai-token', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ [OpenAI Token] OPENAI_API_KEY not configured');
      return res.status(500).json({ error: 'OpenAI API key not configured on server' });
    }

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'shimmer'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [OpenAI Token] OpenAI API error (${response.status}):`, errorText);
      return res.status(response.status).json({ 
        error: `OpenAI API error: ${response.status}`,
        details: errorText.substring(0, 200)
      });
    }

    const data = await response.json();
    console.log('✅ [OpenAI Token] Successfully created session');
    res.json({ client_secret: { value: data.client_secret.value } });
  } catch (error) {
    console.error('❌ [OpenAI Token] Error:', error);
    res.status(500).json({ error: 'Failed to get OpenAI token', message: error.message });
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

        case 'AUDIO_CHUNK': {
          const { roomId, userId, audio, timestamp } = data;
          const session = roomSessions.get(roomId);

          if (!session) return;

          // Find the other participant and send them the audio chunk
          const otherParticipant = Array.from(session.participants.values())
            .find(p => p.userId !== userId);

          if (otherParticipant) {
            console.log(`🎵 [AUDIO] Relaying audio chunk from ${userId} to peer (timestamp: ${timestamp})`);
            otherParticipant.ws.send(JSON.stringify({
              type: 'PEER_AUDIO_CHUNK',
              peerId: userId,
              audio,
              timestamp
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