import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// For Node.js versions that don't have fetch built-in
if (!globalThis.fetch) {
  const { default: fetch } = await import('node-fetch');
  globalThis.fetch = fetch;
}

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for chatrooms
const chatrooms = new Map();
const participants = new Map(); // websocket -> participant info

class Chatroom {
  constructor(roomId) {
    this.roomId = roomId;
    this.participants = new Map(); // participantId -> participant data
    this.messageHistory = [];
    this.createdAt = new Date();
    this.isActive = true;
    this.maxParticipants = 2;
  }

  addParticipant(participant, ws) {
    if (this.participants.size >= this.maxParticipants) {
      return { success: false, error: 'Room is full' };
    }

    console.log(`[DEBUG] Adding participant:`, JSON.stringify(participant, null, 2));

    // Check if participant already exists (prevent duplicates)
    if (this.participants.has(participant.id)) {
      console.log(`Participant ${participant.name} already exists in room ${this.roomId}`);
      // Update the participant data instead of skipping
      const existingParticipant = this.participants.get(participant.id);
      this.participants.set(participant.id, {
        ...existingParticipant,
        ...participant,
        ws,
        joinedAt: existingParticipant.joinedAt
      });
      console.log(`[DEBUG] Updated participant language to: ${participant.language}`);
      return { success: true };
    }

    this.participants.set(participant.id, {
      ...participant,
      ws,
      joinedAt: new Date()
    });

    console.log(`Participant ${participant.name} (${participant.language}) joined room ${this.roomId}. Total participants: ${this.participants.size}`);

    // Notify ALL participants (including the new one) about the new participant
    this.broadcast({
      type: 'USER_JOINED',
      participant
    }); // Don't exclude anyone - everyone should know about all participants

    return { success: true };
  }

  removeParticipant(participantId) {
    const participant = this.participants.get(participantId);
    if (participant) {
      this.participants.delete(participantId);
      
      // Notify other participants
      this.broadcast({
        type: 'USER_LEFT',
        participantId
      });

      console.log(`Participant ${participant.name} left room ${this.roomId}`);
      
      // Clean up empty rooms
      if (this.participants.size === 0) {
        chatrooms.delete(this.roomId);
        console.log(`Room ${this.roomId} deleted (empty)`);
      }
    }
  }

  broadcast(message, excludeParticipantId = null) {
    for (const [participantId, participant] of this.participants.entries()) {
      if (participantId !== excludeParticipantId && participant.ws.readyState === 1) {
        participant.ws.send(JSON.stringify(message));
      }
    }
  }

  async handleSpeechTranscript(participantId, transcript, language) {
    const participant = this.participants.get(participantId);
    if (!participant) {
      console.log(`[ERROR] Participant ${participantId} not found in room`);
      return;
    }

    // Get the other participant for translation
    const otherParticipant = Array.from(this.participants.values())
      .find(p => p.id !== participantId);

    if (!otherParticipant) {
      console.log(`[WARN] No other participant found for translation. Waiting for second participant...`);
      return;
    }

    console.log(`\n========== TRANSLATION REQUEST ==========`);
    console.log(`[SPEAKER] ${participant.name} (${language})`);
    console.log(`[TARGET] ${otherParticipant.name} (${otherParticipant.language})`);
    console.log(`[ORIGINAL TEXT] "${transcript}"`);
    console.log(`[TRANSLATING] ${language} → ${otherParticipant.language}`);

    // Create message for translation
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      participantId,
      originalText: transcript,
      translatedText: '', // Will be filled by translation service
      originalLanguage: language,
      targetLanguage: otherParticipant.language,
      timestamp: new Date()
    };

    try {
      // Use real OpenAI translation
      message.translatedText = await this.translateWithOpenAI(transcript, language, otherParticipant.language);
      console.log(`[OPENAI SUCCESS] "${message.translatedText}"`);
    } catch (error) {
      console.error('[OPENAI FAILED]', error.message);
      // Fallback to LibreTranslate or simulation if OpenAI fails
      message.translatedText = await this.simulateTranslation(transcript, language, otherParticipant.language);
      console.log(`[FALLBACK TRANSLATION] "${message.translatedText}"`);
    }

    // Add to message history
    this.messageHistory.push(message);

    // Send translated message to other participant
    if (otherParticipant.ws.readyState === 1) {
      const payload = {
        type: 'TRANSLATED_MESSAGE',
        message
      };
      console.log(`[SENDING TO] ${otherParticipant.name}`);
      console.log(`[PAYLOAD]`, JSON.stringify(payload, null, 2));
      otherParticipant.ws.send(JSON.stringify(payload));
      console.log(`[SENT] ✓ Message delivered to ${otherParticipant.name}`);
    } else {
      console.log(`[ERROR] Cannot send - ${otherParticipant.name}'s connection is not open (state: ${otherParticipant.ws.readyState})`);
    }

    console.log(`========================================\n`);
  }

  async translateWithOpenAI(text, fromLang, toLang) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    
    const fromLanguage = fromLang === 'en-US' ? 'English' : 'French';
    const toLanguage = toLang === 'en-US' ? 'English' : 'French';
    
    const prompt = `Translate the following ${fromLanguage} text to ${toLanguage}. Provide only the translation, no explanations:

${text}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 150,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() || text;
    } catch (error) {
      console.error('OpenAI translation error:', error);
      throw error;
    }
  }

  async simulateTranslation(text, fromLang, toLang) {
    // Use MyMemory Translation API (free, no key required)
    try {
      const fromCode = fromLang === 'en-US' ? 'en' : 'fr';
      const toCode = toLang === 'en-US' ? 'en' : 'fr';
      
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromCode}|${toCode}`;
      
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        if (data.responseData && data.responseData.translatedText) {
          console.log(`MyMemory translation: "${text}" -> "${data.responseData.translatedText}"`);
          return data.responseData.translatedText;
        }
      }
    } catch (error) {
      console.log('MyMemory translation failed:', error.message);
    }

    // Fallback to LibreTranslate
    try {
      const fromCode = fromLang === 'en-US' ? 'en' : 'fr';
      const toCode = toLang === 'en-US' ? 'en' : 'fr';
      
      const response = await fetch('https://libretranslate.com/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: fromCode,
          target: toCode,
          format: 'text'
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.translatedText) {
          console.log(`LibreTranslate: "${text}" -> "${data.translatedText}"`);
          return data.translatedText;
        }
      }
    } catch (error) {
      console.log('LibreTranslate fallback failed:', error.message);
    }

    // Final fallback - enhanced phrase-based translation
    console.log('Using phrase-based translation fallback');
    const translations = {
      'en-US_to_fr-CA': {
        'hello': 'bonjour',
        'hi': 'salut',
        'my name is': 'je m\'appelle',
        'i work': 'je travaille',
        'currently': 'actuellement',
        'as a': 'comme',
        'as an': 'comme un',
        'engineer': 'ingénieur',
        'at': 'chez',
        'how are you': 'comment allez-vous',
        'good morning': 'bonjour',
        'thank you': 'merci',
        'goodbye': 'au revoir',
        'yes': 'oui',
        'no': 'non',
        'please': 's\'il vous plaît',
        'sorry': 'désolé',
        'excuse me': 'excusez-moi',
        'full stack': 'full stack',
        'machine learning': 'apprentissage automatique',
        'intern': 'stagiaire'
      },
      'fr-CA_to_en-US': {
        'bonjour': 'hello',
        'salut': 'hi',
        'je m\'appelle': 'my name is',
        'je travaille': 'I work',
        'actuellement': 'currently',
        'comme': 'as a',
        'comme un': 'as an',
        'ingénieur': 'engineer',
        'chez': 'at',
        'comment allez-vous': 'how are you',
        'merci': 'thank you',
        'au revoir': 'goodbye',
        'oui': 'yes',
        'non': 'no',
        's\'il vous plaît': 'please',
        'désolé': 'sorry',
        'excusez-moi': 'excuse me',
        'apprentissage automatique': 'machine learning',
        'stagiaire': 'intern'
      }
    };

    const translationKey = `${fromLang}_to_${toLang}`;
    const translationMap = translations[translationKey] || {};
    
    // Try phrase matching first (case insensitive)
    let result = text;
    for (const [phrase, translation] of Object.entries(translationMap)) {
      const regex = new RegExp(phrase, 'gi');
      result = result.replace(regex, translation);
    }

    return result;
  }
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection established');

  // Send welcome message to confirm connection
  ws.send(JSON.stringify({
    type: 'CONNECTION_ESTABLISHED',
    message: 'Connected to NeuralEcho Chatroom Server'
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received WebSocket message:', message.type);
      handleWebSocketMessage(ws, message);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    // Clean up participant from all rooms
    const participantInfo = participants.get(ws);
    if (participantInfo) {
      const room = chatrooms.get(participantInfo.roomId);
      if (room) {
        room.removeParticipant(participantInfo.participantId);
      }
      participants.delete(ws);
    }
    console.log('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error on server:', error);
  });
});

function handleWebSocketMessage(ws, message) {
  switch (message.type) {
    case 'JOIN_ROOM':
      handleJoinRoom(ws, message);
      break;
      
    case 'SPEECH_TRANSCRIPT':
      handleSpeechTranscript(ws, message);
      break;
      
    case 'BILINGUAL_MESSAGE':
      handleBilingualMessage(ws, message);
      break;
      
    case 'TRANSLATED_AUDIO':
      handleTranslatedAudio(ws, message);
      break;
      
    case 'AUDIO_STREAM':
      handleAudioStream(ws, message);
      break;
      
    default:
      console.log('Unknown message type:', message.type);
  }
}

function handleJoinRoom(ws, message) {
  const { participant, roomId } = message;
  
  console.log(`Processing JOIN_ROOM for participant ${participant.name} in room ${roomId}`);
  
  // Get or create room
  let room = chatrooms.get(roomId);
  if (!room) {
    room = new Chatroom(roomId);
    chatrooms.set(roomId, room);
    console.log(`Created new room: ${roomId}`);
  }

  // Add participant to room
  const result = room.addParticipant(participant, ws);
  
  if (result.success) {
    // Store participant info for cleanup
    participants.set(ws, {
      participantId: participant.id,
      roomId: roomId
    });

    console.log(`Sending ROOM_JOINED confirmation to ${participant.name}`);
    
    // Send confirmation to participant
    try {
      ws.send(JSON.stringify({
        type: 'ROOM_JOINED',
        roomId,
        participant
      }));
      console.log(`ROOM_JOINED message sent successfully`);
    } catch (error) {
      console.error('Error sending ROOM_JOINED message:', error);
    }

    // Send current room state to the new participant (list of existing participants)
    const existingParticipants = Array.from(room.participants.values())
      .filter(p => p.id !== participant.id)
      .map(p => ({
        id: p.id,
        name: p.name,
        language: p.language,
        joinedAt: p.joinedAt,
        isConnected: true
      }));

    if (existingParticipants.length > 0) {
      console.log(`Sending existing participants to ${participant.name}:`, existingParticipants);
      try {
        for (const existingParticipant of existingParticipants) {
          ws.send(JSON.stringify({
            type: 'USER_JOINED',
            participant: existingParticipant
          }));
        }
      } catch (error) {
        console.error('Error sending existing participants:', error);
      }
    }

    // If room is full, notify both participants
    if (room.participants.size === 2) {
      console.log(`Room ${roomId} is now full, notifying participants`);
      room.broadcast({
        type: 'ROOM_READY',
        roomId,
        participantCount: room.participants.size
      });
    }
  } else {
    console.log(`Failed to add participant to room: ${result.error}`);
    // Send error
    try {
      ws.send(JSON.stringify({
        type: 'ROOM_FULL',
        roomId,
        error: result.error
      }));
    } catch (error) {
      console.error('Error sending ROOM_FULL message:', error);
    }
  }
}

function handleSpeechTranscript(ws, message) {
  const participantInfo = participants.get(ws);
  if (!participantInfo) return;

  const room = chatrooms.get(participantInfo.roomId);
  if (!room) return;

  room.handleSpeechTranscript(
    message.participantId,
    message.transcript,
    message.language
  );
}

function handleBilingualMessage(ws, message) {
  console.log(' [BILINGUAL] Received bilingual message from client');
  const participantInfo = participants.get(ws);
  if (!participantInfo) {
    console.log(' [BILINGUAL ERROR] No participant info found for this websocket');
    return;
  }

  const room = chatrooms.get(participantInfo.roomId);
  if (!room) {
    console.log(' [BILINGUAL ERROR] No room found:', participantInfo.roomId);
    return;
  }

  console.log(' [BILINGUAL] Broadcasting to room:', room.roomId);
  console.log(' [BILINGUAL] Message details:', {
    speakerId: message.message.speakerId,
    originalLanguage: message.message.originalLanguage,
    targetLanguage: message.message.targetLanguage,
    originalText: message.message.originalText?.substring(0, 50),
    translatedText: message.message.translatedText?.substring(0, 50)
  });

  // Add to message history
  room.messageHistory.push({
    id: message.message.id,
    participantId: message.message.speakerId,
    originalText: message.message.originalText,
    translatedText: message.message.translatedText,
    originalLanguage: message.message.originalLanguage,
    targetLanguage: message.message.targetLanguage,
    timestamp: new Date(message.message.timestamp)
  });

  // Broadcast to ALL participants in the room (including sender)
  // This ensures both participants receive the bilingual message
  for (const [participantId, participant] of room.participants.entries()) {
    if (participant.ws.readyState === 1) {
      console.log(` [BILINGUAL] Sending to participant:`, participant.name);
      participant.ws.send(JSON.stringify({
        type: 'BILINGUAL_MESSAGE',
        message: message.message
      }));
    } else {
      console.log(` [BILINGUAL WARNING] Participant ${participant.name} connection not open (state: ${participant.ws.readyState})`);
    }
  }
  
  console.log(' [BILINGUAL] Broadcast complete');
}

function handleTranslatedAudio(ws, message) {
  console.log(' [TRANSLATED_AUDIO] Received translated audio from client');
  const participantInfo = participants.get(ws);
  if (!participantInfo) {
    console.log(' [TRANSLATED_AUDIO ERROR] No participant info found');
    return;
  }

  const room = chatrooms.get(participantInfo.roomId);
  if (!room) {
    console.log(' [TRANSLATED_AUDIO ERROR] No room found:', participantInfo.roomId);
    return;
  }

  console.log(' [TRANSLATED_AUDIO] Broadcasting to other participants');
  console.log(' [TRANSLATED_AUDIO] Audio data length:', message.audioData?.length);
  console.log(' [TRANSLATED_AUDIO] Original text:', message.originalText?.substring(0, 50));
  console.log(' [TRANSLATED_AUDIO] Translated text:', message.translatedText?.substring(0, 50));

  // Broadcast to OTHER participants (not sender)
  for (const [participantId, participant] of room.participants.entries()) {
    if (participantId !== message.participantId && participant.ws.readyState === 1) {
      console.log(` [TRANSLATED_AUDIO] Sending to participant:`, participant.name);
      participant.ws.send(JSON.stringify({
        type: 'TRANSLATED_AUDIO',
        messageId: message.messageId,
        participantId: message.participantId,
        audioData: message.audioData,
        originalText: message.originalText,
        translatedText: message.translatedText,
        timestamp: message.timestamp
      }));
    }
  }
  
  console.log(' [TRANSLATED_AUDIO] Broadcast complete');
}

function handleAudioStream(ws, message) {
  const participantInfo = participants.get(ws);
  if (!participantInfo) return;

  const room = chatrooms.get(participantInfo.roomId);
  if (!room) return;

  // Forward audio to target participant
  const targetParticipant = room.participants.get(message.targetParticipantId);
  if (targetParticipant && targetParticipant.ws.readyState === 1) {
    targetParticipant.ws.send(JSON.stringify({
      type: 'AUDIO_STREAM',
      participantId: message.participantId,
      audioData: message.audioData
    }));
  }
}

// REST API endpoints
app.get('/api/chatroom/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeRooms: chatrooms.size,
    totalParticipants: participants.size,
    rooms: Array.from(chatrooms.values()).map(room => ({
      roomId: room.roomId,
      participants: room.participants.size,
      createdAt: room.createdAt
    }))
  });
});

app.get('/api/chatroom/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = chatrooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const participantsList = Array.from(room.participants.values()).map(p => ({
    id: p.id,
    name: p.name,
    language: p.language,
    joinedAt: p.joinedAt,
    isConnected: p.ws.readyState === 1
  }));

  res.json({
    roomId: room.roomId,
    participantCount: room.participants.size,
    maxParticipants: room.maxParticipants,
    isActive: room.isActive,
    createdAt: room.createdAt,
    participants: participantsList
  });
});

// Start server
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`🚀 NeuralEcho Chatroom Server running on http://localhost:${PORT}`);
  console.log(`🔧 Health Check: http://localhost:${PORT}/api/chatroom/health`);
  console.log(`🌐 WebSocket Server: ws://localhost:${PORT}/chatroom`);
});

export default app;