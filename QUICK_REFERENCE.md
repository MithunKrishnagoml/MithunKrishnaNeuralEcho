# 🚀 NeuralEcho - Quick Reference Card

## 📋 Essential URLs

### Production
```
Frontend:  https://neuralecho1.vercel.app
Backend:   https://mithunkrishnaneuralecho-2.onrender.com
Health:    https://mithunkrishnaneuralecho-2.onrender.com/health
WebSocket: wss://mithunkrishnaneuralecho-2.onrender.com
```

### Dashboards
```
Vercel:    https://vercel.com/dashboard
Render:    https://render.com/dashboard
```

---

## ⚡ Quick Commands

### Local Development
```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

### Build & Test
```bash
# Frontend build
cd frontend
npm run build

# Backend test
cd backend
npm start

# Verify deployment readiness
./deploy.ps1  # Windows
./deploy.sh   # Linux/Mac
```

### Health Check
```bash
# Local
curl http://localhost:3001/health

# Production
curl https://mithunkrishnaneuralecho-2.onrender.com/health
```

---

## 🔑 Environment Variables

### Backend (Render)
```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://neuralecho1.vercel.app
CORS_ALLOWED_ORIGINS=https://neuralecho1.vercel.app,https://neuralecho.vercel.app,https://neural-echo.vercel.app
OPENAI_API_KEY=<your-key>
```

### Frontend (Vercel)
```env
VITE_APP_BASE_URL=https://neuralecho1.vercel.app
VITE_BACKEND_URL=https://mithunkrishnaneuralecho-2.onrender.com
VITE_WS_URL=wss://mithunkrishnaneuralecho-2.onrender.com
VITE_OPENAI_API_KEY=<your-key>
VITE_SUPABASE_URL=<your-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-key>
VITE_SUPABASE_PROJECT_ID=<your-id>
```

---

## 📁 Project Structure

```
neural-bf6ad53765221276fa1fe1dcc701d4ef765a74ac/
├── backend/              # Node.js + Express + WebSocket
│   ├── index.js         # Main server
│   ├── render.yaml      # Render config
│   └── package.json     # Dependencies
├── frontend/            # React + TypeScript + Vite
│   ├── src/            # Source code
│   ├── vercel.json     # Vercel config
│   └── package.json    # Dependencies
└── docs/               # Documentation
```

---

## 🐛 Quick Troubleshooting

### CORS Error
```
Problem: "CORS policy blocked"
Fix: Add your domain to CORS_ALLOWED_ORIGINS in Render
```

### WebSocket Failed
```
Problem: "WebSocket connection failed"
Fix: Check backend is running, verify WSS URL
```

### Build Error
```
Problem: "Build failed"
Fix: Run npm install, check Node version >= 18
```

### Env Vars Not Loading
```
Problem: "undefined environment variable"
Fix: Add to platform dashboard, redeploy
```

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Project overview |
| `PRODUCTION_READY.md` | Complete deployment guide |
| `DEPLOYMENT_CHECKLIST.md` | Step-by-step instructions |
| `DEPLOYMENT_CONFIG.md` | Configuration details |
| `DEPLOYMENT_SUMMARY.md` | Quick summary |
| `FINAL_CHECKLIST.md` | Pre-deployment checklist |
| `QUICK_REFERENCE.md` | This file |

---

## 🚀 Deployment Steps (5 min each)

### 1. Backend (Render)
1. New Web Service
2. Root: `backend`
3. Build: `npm install`
4. Start: `npm start`
5. Add env vars
6. Deploy

### 2. Frontend (Vercel)
1. New Project
2. Root: `frontend`
3. Framework: Vite
4. Add env vars
5. Deploy

### 3. Verify
```bash
curl https://mithunkrishnaneuralecho-2.onrender.com/health
open https://neuralecho1.vercel.app
```

---

## 💡 Pro Tips

- **Cold Starts**: Render free tier sleeps after 15 min
- **Logs**: Check platform dashboards for errors
- **Testing**: Test WebSocket from different networks
- **Monitoring**: Use UptimeRobot to keep backend warm
- **Updates**: Auto-deploy on git push

---

## 📊 Build Stats

- **Frontend**: 16s build, 2.5MB total, 700KB gzipped
- **Backend**: 4 dependencies, <1MB, <1s startup
- **Status**: ✅ Production Ready

---

## 🔗 Quick Links

- [Vercel Docs](https://vercel.com/docs)
- [Render Docs](https://render.com/docs)
- [Vite Docs](https://vitejs.dev/)
- [Express Docs](https://expressjs.com/)

---

**Print this page for quick reference during deployment!**
