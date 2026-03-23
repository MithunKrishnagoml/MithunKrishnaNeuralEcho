# NeuralEcho Backend

Real-time translation server built with Node.js, Express, and WebSocket integration with OpenAI Realtime API.

## Features

- WebSocket server for real-time communication
- OpenAI Realtime API integration
- Translation session management
- Voice activity detection
- Audio streaming and processing
- Error handling and recovery

## Setup & Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- OpenAI API key

### Installation
```bash
cd backend
npm install
```

### Environment Configuration
Create a `.env` file in the backend directory:
```bash
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
NODE_ENV=production
```

### Development
```bash
npm run dev
```
Server runs on http://localhost:3001

### Production
```bash
npm start
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server health status and metrics.

### WebSocket Connection
```
WS /
```
WebSocket endpoint for real-time translation sessions.

## WebSocket Events

### Client → Server
- `join_session` - Join a translation session
- `SPEECH_TRANSCRIPT` - Send speech transcript
- `AUDIO_STREAM` - Send audio data
- `BILINGUAL_MESSAGE` - Send bilingual message
- `START_RECORDING` - Start session recording
- `STOP_RECORDING` - Stop session recording

### Server → Client
- `USER_JOINED_ROOM` - User joined session
- `TRANSLATED_AUDIO` - Translated audio stream
- `SPEECH_TRANSCRIPT` - Speech transcript
- `VOICE_ACTIVITY_STARTED/STOPPED` - Voice activity detection
- `translation_error` - Translation error occurred

## Architecture

### Core Components
1. **Express Server** - HTTP server and middleware
2. **WebSocket Server** - Real-time communication
3. **Translation Session Manager** - Session state management
4. **OpenAI Integration** - Realtime API connection
5. **Audio Processing** - Stream handling and broadcasting

### Translation Flow
1. Audio input → OpenAI Realtime API
2. Speech recognition → Translation
3. Audio synthesis → Stream to participants
4. Real-time broadcasting via WebSocket

## Performance Optimizations

- Persistent WebSocket connections
- Streaming audio processing
- Optimized VAD settings (150ms silence detection)
- Low temperature (0.3) for faster responses
- Reduced token limits (200 max tokens)

## Deployment

### Environment Variables
```bash
OPENAI_API_KEY=your_api_key
PORT=3001
NODE_ENV=production
```

### Deployment Platforms
- Render (recommended)
- Railway
- Heroku
- AWS EC2
- DigitalOcean

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## Monitoring

The server provides health checks and performance metrics:
- Active sessions count
- Connection status
- Processing times
- Error rates

Access via `/health` endpoint for monitoring integration.