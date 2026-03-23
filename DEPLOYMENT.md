########### NeuralEcho Deployment Guide# ##
##### Vercel Frontend Deployment ####
### 1. Connect Repository
- Go to [Vercel Dashboard](https://vercel.com/dashboard)
- Click "New Project"
- Import the GitHub repository
- Select the `frontend` folder as the root directory

### 2. Environment Variables
In Vercel Project Settings → Environment Variables, add:

```env
VITE_BACKEND_URL=https://your-render-backend-url.onrender.com
VITE_WS_URL=wss://your-render-backend-url.onrender.com
VITE_OPENAI_API_KEY=your_openai_api_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
```

### 3. Build Settings
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## Render Backend Deployment

### 1. Create Web Service
- Go to [Render Dashboard](https://render.com/dashboard)
- Click "New" → "Web Service"
- Connect your GitHub repository
- Select the `backend` folder as the root directory

### 2. Environment Variables
In Render Service Settings → Environment, add:

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
NODE_ENV=production
```

### 3. Build Settings
- Build Command: `npm install`
- Start Command: `npm start`
- Node Version: 18

### 4. Health Check
- Health Check Path: `/health`

## Post-Deployment Steps

### 1. Update CORS Origins
After Vercel deployment, update the backend CORS configuration with your Vercel URL:

```javascript
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://your-app-name.vercel.app', // Add your actual Vercel URL
    'https://*.vercel.app'
  ],
  credentials: true
}));
```

### 2. Test Endpoints
- Backend Health: `https://your-backend.onrender.com/health`
- Frontend: `https://your-app.vercel.app`

### 3. WebSocket Connection
Ensure WebSocket connections work:
- Test at: `wss://your-backend.onrender.com`

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Add your Vercel domain to backend CORS origins
   - Redeploy backend after CORS changes

2. **Environment Variables Not Loading**
   - Ensure all `VITE_*` variables are set in Vercel
   - Redeploy frontend after adding env vars

3. **WebSocket Connection Failed**
   - Check `VITE_WS_URL` points to your Render backend
   - Ensure backend is running and accessible

4. **API Endpoints Not Found**
   - Verify backend is deployed and running
   - Check `/health` endpoint responds correctly

### Logs and Debugging

**Vercel:**
- View logs in Vercel Dashboard → Functions tab
- Check browser console for frontend errors

**Render:**
- View logs in Render Dashboard → Logs tab
- Monitor WebSocket connections and API calls

## Performance Optimization

### Frontend (Vercel)
- Enable Edge Functions for better performance
- Use Vercel Analytics for monitoring
- Configure custom domains if needed

### Backend (Render)
- Use Render's auto-scaling features
- Monitor resource usage
- Set up health checks and alerts

## Security

### Environment Variables
- Never commit `.env` files to git
- Use different API keys for development/production
- Rotate API keys regularly

### CORS Configuration
- Only allow necessary origins
- Use specific domains instead of wildcards in production
- Enable credentials only when needed
