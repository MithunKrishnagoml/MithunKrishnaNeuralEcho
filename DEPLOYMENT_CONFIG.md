# NeuralEcho Deployment Configuration

## 🌐 Vercel (Frontend)

### URLs
- **Primary**: https://neuralecho1.vercel.app
- **Alternatives**: 
  - https://neuralecho.vercel.app
  - https://neural-echo.vercel.app

### Configuration
- **Auto-deploys**: From GitHub on push
- **Build Tool**: Vite
- **Output Directory**: `frontend/dist`
- **Root Directory**: `frontend`

### Environment Variables (Set in Vercel Dashboard)
```env
VITE_APP_BASE_URL=https://neuralecho1.vercel.app
VITE_BACKEND_URL=https://mithunkrishnaneuralecho-2.onrender.com
VITE_WS_URL=wss://mithunkrishnaneuralecho-2.onrender.com
VITE_OPENAI_API_KEY=your_openai_api_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
VITE_ELEVENLABS_API_KEY=your_elevenlabs_key
VITE_SARVAM_API_KEY=your_sarvam_key
```

---

## 🚀 Render.com (Backend)

### URLs
- **API**: https://mithunkrishnaneuralecho-2.onrender.com
- **WebSocket**: wss://mithunkrishnaneuralecho-2.onrender.com
- **Health Check**: https://mithunkrishnaneuralecho-2.onrender.com/health

### Configuration
- **Region**: Oregon
- **Plan**: Free tier
- **Root Directory**: `backend`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### Environment Variables (Set in Render Dashboard)
```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://neuralecho1.vercel.app
CORS_ALLOWED_ORIGINS=https://neuralecho1.vercel.app,https://neuralecho.vercel.app,https://neural-echo.vercel.app
OPENAI_API_KEY=sk-proj-... (your actual key)
```

### Optional (if using Twilio)
```env
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone
```

---

## 🔄 Deployment Workflow

### Initial Setup (One-time)

1. **Render Backend**:
   - Connect GitHub repository
   - Set root directory to `backend`
   - Add all environment variables
   - Deploy and copy the URL

2. **Vercel Frontend**:
   - Connect GitHub repository
   - Set root directory to `frontend`
   - Add environment variables with Render URL
   - Deploy

### Continuous Deployment

- **Frontend**: Auto-deploys on every push to GitHub
- **Backend**: Auto-deploys on every push to GitHub
- Both platforms watch the repository and deploy automatically

---

## ✅ Verification Steps

### 1. Backend Health Check
```bash
curl https://mithunkrishnaneuralecho-2.onrender.com/health
```
Expected response:
```json
{
  "status": "ok",
  "timestamp": "...",
  "uptime": "..."
}
```

### 2. Frontend Access
Visit: https://neuralecho1.vercel.app

### 3. WebSocket Connection
The frontend should automatically connect to:
```
wss://mithunkrishnaneuralecho-2.onrender.com
```

### 4. CORS Verification
- Open browser console on https://neuralecho1.vercel.app
- Check for CORS errors (there should be none)
- Test API calls to backend

---

## 🐛 Troubleshooting

### CORS Issues
If you see CORS errors:
1. Verify `CORS_ALLOWED_ORIGINS` in Render includes all Vercel URLs
2. Check backend logs in Render dashboard
3. Redeploy backend after changes

### WebSocket Connection Failed
1. Check backend is running: visit `/health` endpoint
2. Verify `VITE_WS_URL` uses `wss://` (not `ws://`)
3. Render free tier has cold starts (~30s first request)

### Environment Variables Not Working
1. Ensure all `VITE_*` variables are set in Vercel
2. Redeploy after adding/changing env vars
3. Check build logs for missing variables

### Backend Cold Starts (Free Tier)
- Render free tier spins down after 15 minutes of inactivity
- First request after inactivity takes ~30 seconds
- Consider upgrading to paid plan for always-on service

---

## 📝 Files Updated

- ✅ `backend/.env.example` - Updated with production URLs
- ✅ `backend/render.yaml` - Configured with actual service name and URLs
- ✅ `backend/index.js` - CORS configured for all Vercel domains
- ✅ `frontend/.env.example` - Updated with production URLs
- ✅ `frontend/.env.production` - Updated with production URLs
- ✅ `frontend/vercel.json` - Vercel configuration created

---

## 🔐 Security Notes

1. **Never commit `.env` files** - They contain sensitive API keys
2. **Use environment variables** - Set them in Vercel/Render dashboards
3. **Rotate API keys regularly** - Especially OpenAI keys
4. **Monitor usage** - Check OpenAI and other service dashboards
5. **CORS is restrictive** - Only allows specific Vercel domains

---

## 📊 Monitoring

### Vercel
- Dashboard: https://vercel.com/dashboard
- View deployment logs
- Check Analytics tab
- Monitor function execution

### Render
- Dashboard: https://render.com/dashboard
- View service logs (Logs tab)
- Monitor health checks (Events tab)
- Check resource usage

---

## 🚀 Next Steps

1. ✅ Push code to GitHub (triggers auto-deploy)
2. ✅ Verify both services are running
3. ✅ Test the application end-to-end
4. ⬜ Set up custom domains (optional)
5. ⬜ Configure monitoring/alerts
6. ⬜ Consider upgrading plans for production use

---

## 💡 Tips

- **Preview Deployments**: Vercel creates preview URLs for each branch/PR
- **Logs**: Always check logs first when debugging issues
- **Cold Starts**: Keep backend warm with uptime monitoring (e.g., UptimeRobot)
- **Costs**: Monitor API usage to avoid unexpected charges
- **Backups**: Keep environment variables documented securely
