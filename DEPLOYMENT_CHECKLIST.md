# Deployment Checklist for Vercel + Render

## Step 1: Deploy Backend to Render

1. Go to [Render Dashboard](https://render.com/dashboard)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: neuralecho-backend (or your choice)
   - **Root Directory**: `backend`
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or your choice)

5. Add Environment Variables in Render:
   ```
   NODE_ENV=production
   PORT=3001
   OPENAI_API_KEY=your_openai_api_key_here
   TWILIO_ACCOUNT_SID=your_twilio_sid (if using Twilio)
   TWILIO_AUTH_TOKEN=your_twilio_token (if using Twilio)
   TWILIO_PHONE_NUMBER=your_twilio_phone (if using Twilio)
   CORS_ALLOWED_ORIGINS=https://your-app.vercel.app
   ```

6. Click "Create Web Service"
7. Wait for deployment to complete
8. **Copy your Render URL** (e.g., `https://neuralecho-backend.onrender.com`)

## Step 2: Deploy Frontend to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

5. Add Environment Variables in Vercel (use your Render URL from Step 1):
   ```
   VITE_BACKEND_URL=https://your-backend.onrender.com
   VITE_WS_URL=wss://your-backend.onrender.com
   VITE_OPENAI_API_KEY=your_openai_api_key
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
   VITE_ELEVENLABS_API_KEY=your_elevenlabs_key (if using)
   VITE_SARVAM_API_KEY=your_sarvam_key (if using)
   ```

6. Click "Deploy"
7. Wait for deployment to complete
8. **Copy your Vercel URL** (e.g., `https://your-app.vercel.app`)

## Step 3: Update Backend CORS

1. Go back to Render Dashboard → Your Backend Service
2. Add your Vercel URL to environment variables:
   ```
   CORS_ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app-git-main.vercel.app
   ```
3. Or update the `backend/index.js` file directly:
   ```javascript
   const allowedExactOrigins = new Set([
     'http://localhost:3000',
     'http://localhost:5173',
     'https://your-app.vercel.app', // Add your actual Vercel URL
     ...envOrigins
   ]);
   ```
4. Redeploy backend if you changed the code

## Step 4: Test Your Deployment

1. Visit your Vercel URL: `https://your-app.vercel.app`
2. Test backend health: `https://your-backend.onrender.com/health`
3. Test WebSocket connection in your app
4. Create a translation session and verify it works

## Common Issues & Solutions

### CORS Errors
- Make sure your Vercel URL is added to `CORS_ALLOWED_ORIGINS` in Render
- The backend already supports `*.vercel.app` wildcard for preview deployments
- Redeploy backend after CORS changes

### Environment Variables Not Loading
- Ensure all `VITE_*` variables are set in Vercel
- Redeploy frontend after adding env vars
- Check Vercel deployment logs for missing variables

### WebSocket Connection Failed
- Verify `VITE_WS_URL` uses `wss://` (not `ws://`)
- Check backend is running: visit `/health` endpoint
- Render free tier may have cold starts (first request takes longer)

### Backend Not Starting
- Check Render logs for errors
- Verify `Root Directory` is set to `backend`
- Ensure all required environment variables are set

### Build Failures
- Frontend: Check TypeScript errors with `npm run build` locally
- Backend: Verify Node version (requires >= 18.0.0)
- Check build logs in Vercel/Render dashboard

## Important Notes

1. **Render Free Tier**: Services spin down after 15 minutes of inactivity. First request after inactivity takes ~30 seconds.

2. **Vercel Preview Deployments**: Every git push creates a preview deployment. The wildcard `*.vercel.app` in CORS handles these automatically.

3. **Environment Variables**: Never commit `.env` files. Always use platform-specific environment variable settings.

4. **Custom Domains**: You can add custom domains in both Vercel and Render settings after deployment.

5. **Monitoring**: 
   - Vercel: Check Analytics and Function logs
   - Render: Check Logs tab for backend errors

## Files Modified for Deployment

- ✅ `backend/render.yaml` - Added rootDir and healthCheckPath
- ✅ `frontend/vercel.json` - Created Vercel configuration
- ✅ `backend/index.js` - CORS already configured for Vercel
- ✅ `frontend/.env.production` - Update with your actual URLs

## Next Steps After Deployment

1. Update `frontend/.env.production` with your actual Render URL
2. Set up custom domains (optional)
3. Configure monitoring and alerts
4. Set up CI/CD for automatic deployments
5. Consider upgrading to paid plans for better performance
