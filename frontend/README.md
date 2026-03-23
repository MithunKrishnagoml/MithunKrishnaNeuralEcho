# NeuralEcho Frontend

Real-time bilingual translation frontend built with React, TypeScript, and Vite.

## Features

- Real-time voice translation between English and French
- WebRTC integration with OpenAI Realtime API
- Voice chatroom functionality
- Document translation (PDF/TXT)
- Responsive UI with Tailwind CSS

## Setup & Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation
```bash
cd frontend
npm install
```

### Environment Configuration
Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

Required environment variables:
- `VITE_BACKEND_URL` - Backend API URL
- `VITE_WS_URL` - WebSocket server URL
- `VITE_OPENAI_API_KEY` - OpenAI API key
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase public key

### Development
```bash
npm run dev
```
Runs on http://localhost:3000

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/     # React components
│   ├── hooks/         # Custom React hooks
│   ├── pages/         # Page components
│   ├── contexts/      # React contexts
│   ├── lib/          # Utilities and constants
│   └── styles/       # CSS and styling
├── public/           # Static assets
└── supabase/        # Database configuration
```

## Key Technologies

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **WebRTC** - Real-time communication
- **Supabase** - Database and authentication

## Deployment

The frontend can be deployed to any static hosting service:
- Vercel (recommended)
- Netlify
- AWS S3 + CloudFront
- GitHub Pages

Make sure to set environment variables in your deployment platform.