##### NeuralEcho - Real-time Bilingual Translation System

A real-time voice translation system enabling seamless conversations between English and French speakers using OpenAI's Realtime API.

## Project Structure

```
neuralecho/
├── frontend/          # Complete React frontend application
│   ├── src/          # React components, hooks, pages, contexts
│   ├── public/       # Static assets
│   ├── supabase/     # Database configuration
│   └── README.md     # Frontend setup & deployment guide
├── backend/           # Complete Node.js backend server
│   ├── index.js      # Main server file
│   ├── ARCHITECTURE.md # System architecture documentation
│   └── README.md     # Backend setup & deployment guide
└── README.md         # This overview file
```

## Quick Start

### 1. Backend Setup
```bash
cd backend
npm install
# Configure .env with OPENAI_API_KEY
npm start
```

### 2. Frontend Setup  
```bash
cd frontend
npm install
# Configure .env with backend URLs
npm run dev
```

## Features

- **Real-time Translation**: Instant voice translation between English and French
- **Voice Chatrooms**: Multi-participant translation sessions  
- **Document Translation**: PDF and text file translation
- **WebRTC Integration**: Direct connection to OpenAI Realtime API
- **Optimized Performance**: Sub-second translation latency

## Architecture

- **Frontend**: React + TypeScript + Vite + WebRTC
- **Backend**: Node.js + Express + WebSocket + OpenAI Realtime API
- **Database**: Supabase (optional)
- **Deployment**: Frontend (Vercel) + Backend (Render)

## Deployment

Both frontend and backend are completely independent and can be deployed separately:

1. **Frontend**: Deploy the `frontend/` folder to Vercel, Netlify, or any static hosting
2. **Backend**: Deploy the `backend/` folder to Render, Railway, or any Node.js hosting

See individual README files in each folder for detailed setup and deployment instructions.

## Documentation

- [Frontend Setup Guide](./frontend/README.md)
- [Backend Setup Guide](./backend/README.md)  
- [System Architecture](./backend/ARCHITECTURE.md)
- [Backend Architecture Details](./backend/BACKEND_ARCHITECTURE.md)

## License

This project is for educational and demonstration purposes.
