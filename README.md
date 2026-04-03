# NeuralEcho - Real-Time Translation System

A real-time phone and web-based translation system powered by AI, enabling seamless multilingual conversations.

## 🌟 Features

- **Real-time Translation**: Instant speech-to-speech translation between languages
- **WebRTC Audio**: High-quality audio streaming with low latency
- **Multi-participant Sessions**: Support for multiple users in translation rooms
- **Transcript History**: Complete conversation history with translations
- **Recording Capabilities**: Record and download translation sessions
- **Document Translation**: Upload and translate documents
- **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS

## 🏗️ Architecture

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: Radix UI + Tailwind CSS
- **State Management**: React Query
- **Routing**: React Router v6

### Backend
- **Runtime**: Node.js (>= 18.0.0)
- **Framework**: Express.js
- **WebSocket**: ws library
- **Real-time**: WebSocket-based communication

## 🚀 Deployment

### Production URLs

**Frontend (Vercel)**:
- Primary: https://neuralecho1.vercel.app
- Alternatives: https://neuralecho.vercel.app, https://neural-echo.vercel.app

**Backend (Render)**:
- API: https://mithunkrishnaneuralecho-2.onrender.com
- WebSocket: wss://mithunkrishnaneuralecho-2.onrender.com

### Quick Deploy

1. **Backend to Render**:
   ```bash
   # See backend/README.md for detailed instructions
   # Or follow DEPLOYMENT_CHECKLIST.md
   ```

2. **Frontend to Vercel**:
   ```bash
   # See frontend/README.md for detailed instructions
   # Or follow DEPLOYMENT_CHECKLIST.md
   ```

3. **Verify Deployment**:
   ```bash
   # Windows
   ./deploy.ps1
   
   # Linux/Mac
   ./deploy.sh
   ```

## 📦 Installation

### Prerequisites
- Node.js >= 18.0.0
- npm or yarn
- Git

### Local Development

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd neural-bf6ad53765221276fa1fe1dcc701d4ef765a74ac
   ```

2. **Install dependencies**:
   ```bash
   # Backend
   cd backend
   npm install
   
   # Frontend
   cd ../frontend
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   # Backend
   cd backend
   cp .env.example .env
   # Edit .env with your API keys
   
   # Frontend
   cd ../frontend
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. **Start development servers**:
   ```bash
   # Backend (in backend directory)
   npm run dev
   
   # Frontend (in frontend directory)
   npm run dev
   ```

5. **Access the application**:
   - Frontend: http://localhost:8080
   - Backend: http://localhost:3001
   - Health Check: http://localhost:3001/health

## 🔧 Configuration

### Backend Environment Variables
```env
OPENAI_API_KEY=your_openai_api_key
FRONTEND_URL=http://localhost:8080
NODE_ENV=development
PORT=3001
CORS_ALLOWED_ORIGINS=http://localhost:8080,http://localhost:5173
```

### Frontend Environment Variables
```env
VITE_BACKEND_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_OPENAI_API_KEY=your_openai_api_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
```

## 📚 Documentation

- [Production Deployment Guide](PRODUCTION_READY.md) - Complete production deployment guide
- [Deployment Checklist](DEPLOYMENT_CHECKLIST.md) - Step-by-step deployment instructions
- [Deployment Configuration](DEPLOYMENT_CONFIG.md) - Detailed configuration reference
- [Backend Documentation](backend/README.md) - Backend-specific documentation
- [Frontend Documentation](frontend/README.md) - Frontend-specific documentation
- [Backend Architecture](backend/BACKEND_ARCHITECTURE.md) - Backend architecture details

## 🧪 Testing

### Frontend
```bash
cd frontend
npm run test        # Run tests
npm run lint        # Run linter
npm run build       # Test production build
```

### Backend
```bash
cd backend
npm start           # Start server
# Test health endpoint
curl http://localhost:3001/health
```

## 🏗️ Build

### Frontend Production Build
```bash
cd frontend
npm run build
# Output: frontend/dist/
```

### Backend
```bash
cd backend
npm install --production
npm start
```

## 📊 Project Structure

```
neural-bf6ad53765221276fa1fe1dcc701d4ef765a74ac/
├── backend/                 # Backend server
│   ├── index.js            # Main server file
│   ├── package.json        # Backend dependencies
│   ├── render.yaml         # Render deployment config
│   └── .env.example        # Environment template
├── frontend/               # Frontend application
│   ├── src/               # Source code
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom hooks
│   │   └── lib/           # Utilities
│   ├── public/            # Static assets
│   ├── package.json       # Frontend dependencies
│   ├── vercel.json        # Vercel deployment config
│   └── vite.config.ts     # Vite configuration
├── .gitignore             # Git ignore rules
├── deploy.sh              # Deployment verification (Linux/Mac)
├── deploy.ps1             # Deployment verification (Windows)
├── PRODUCTION_READY.md    # Production deployment guide
├── DEPLOYMENT_CHECKLIST.md # Deployment checklist
└── README.md              # This file
```

## 🔐 Security

- API keys stored in environment variables (never committed)
- CORS configured for specific origins only
- HTTPS/WSS enforced in production
- Environment files excluded from git
- Secure WebSocket connections

## 🐛 Troubleshooting

### Common Issues

**CORS Errors**:
- Verify backend CORS configuration includes your frontend URL
- Check environment variables are set correctly

**WebSocket Connection Failed**:
- Ensure backend is running
- Check WebSocket URL uses correct protocol (ws:// for local, wss:// for production)
- Verify firewall settings

**Build Failures**:
- Run `npm install` to ensure all dependencies are installed
- Check Node.js version (>= 18.0.0 required)
- Review build logs for specific errors

**Environment Variables Not Loading**:
- Ensure `.env` files are in correct locations
- Restart development servers after changing env vars
- Verify variable names start with `VITE_` for frontend

## 📈 Performance

- Frontend build size: ~2.5 MB (gzipped: ~700 KB)
- Backend dependencies: 4 packages
- Build time: ~17 seconds
- Cold start (Render free tier): ~30 seconds

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

[Your License Here]

## 🙏 Acknowledgments

- OpenAI for GPT and Whisper APIs
- Vercel for frontend hosting
- Render for backend hosting
- Radix UI for component primitives
- Tailwind CSS for styling

## 📞 Support

For issues and questions:
- Check [PRODUCTION_READY.md](PRODUCTION_READY.md) for deployment help
- Review [Troubleshooting](#-troubleshooting) section
- Open an issue on GitHub

---

**Status**: ✅ Production Ready  
**Version**: 1.0.0  
**Last Updated**: April 3, 2026
