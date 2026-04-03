######### NeuralEcho Deployment Guide# ##
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

### Render Log Workflow (Recommended)

Use this sequence every time a Render deploy fails:

1. Open Render Dashboard → Your Service → **Events**
2. Click the failed deploy event
3. Open **Build Logs** first (install/build issues)
4. Open **Runtime Logs** next (crashes after deploy)
5. Copy the first real error (not the summary line)
6. Verify **Root Directory**, **Build Command**, and **Start Command** match the service folder

### Render Monorepo Settings (This Repo)

This repository has separate apps under `frontend` and `backend`. Do not use `src` as a Render root directory.

- Backend service:
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Node Version: `20` (recommended)

- Frontend static site on Render (optional if not using Vercel):
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`

### Fix For ENOENT /opt/render/project/src/package.json

If you see:

- `ENOENT: no such file or directory, open '/opt/render/project/src/package.json'`

Then Render is building from the wrong folder.

Fix:

1. Render Dashboard → Service → Settings
2. Change **Root Directory** from `src` to `backend` (for API service)
3. Save changes and trigger **Manual Deploy**

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
