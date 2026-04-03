# Vercel Deployment Setup Instructions

## Step-by-Step Guide to Configure Environment Variables

### 1. Access Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Sign in to your account
3. Navigate to your project: **neuralecho1**

### 2. Configure Environment Variables

1. Click on **Settings** tab
2. Click on **Environment Variables** in the left sidebar
3. Add the following variables:

#### Required Variables for Production

| Variable Name | Value | Environment |
|---------------|-------|-------------|
| `VITE_APP_BASE_URL` | `https://neuralecho1.vercel.app` | Production + Preview |
| `VITE_BACKEND_URL` | `https://mithunkrishnaneuralecho-2.onrender.com` | Production + Preview |
| `VITE_WS_URL` | `wss://mithunkrishnaneuralecho-2.onrender.com` | Production + Preview |

#### How to Add Each Variable

For each variable above:

1. Click **Add New** button
2. Enter the **Variable Name** (e.g., `VITE_APP_BASE_URL`)
3. Enter the **Value** (e.g., `https://neuralecho1.vercel.app`)
4. Select environments:
   - ✅ Check **Production**
   - ✅ Check **Preview** (important for correct link generation)
   - ⬜ Leave **Development** unchecked (uses local .env)
5. Click **Save**

#### Optional API Keys (if needed)

| Variable Name | Value | Environment |
|---------------|-------|-------------|
| `VITE_OPENAI_API_KEY` | Your OpenAI API key | Production + Preview |
| `VITE_SUPABASE_URL` | Your Supabase URL | Production + Preview |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase key | Production + Preview |
| `VITE_ELEVENLABS_API_KEY` | Your ElevenLabs key | Production + Preview |

### 3. Redeploy the Application

After adding all environment variables:

#### Option A: Redeploy Latest Deployment
1. Go to **Deployments** tab
2. Find the latest deployment
3. Click the three dots (⋯) menu
4. Select **Redeploy**
5. Confirm the redeployment

#### Option B: Push New Commit
1. Make any small change to your code (or use `git commit --allow-empty`)
2. Push to GitHub
3. Vercel will automatically deploy

### 4. Verify Configuration

After deployment completes:

1. Visit: https://neuralecho1.vercel.app
2. Open browser console (F12)
3. Look for these log messages:
   ```
   🌐 [CONFIG] App Base URL: https://neuralecho1.vercel.app
   🔌 [CONFIG] Backend API URL: https://mithunkrishnaneuralecho-2.onrender.com
   🔌 [CONFIG] WebSocket URL: wss://mithunkrishnaneuralecho-2.onrender.com
   ```

4. Test shareable link:
   - Go to `/chatroom`
   - Create a new room
   - Click "Copy Link"
   - Verify the link is: `https://neuralecho1.vercel.app/join/[room-id]`
   - NOT: `https://neuralecho1-[hash]-[user].vercel.app/join/[room-id]`

### 5. Test the Join Flow

1. Copy the shareable link
2. Open in a new incognito/private window
3. You should see the "Join Translation Room" page
4. Enter name and language
5. Click "Join Room"
6. Should successfully connect to the chatroom

## Common Issues and Solutions

### Issue: Links still show preview URL

**Symptoms**: Shareable links contain hash in domain (e.g., `neuralecho1-abc123-user.vercel.app`)

**Causes**:
- Environment variables not set for Preview environment
- Accessing app from preview deployment URL
- Old deployment cached

**Solutions**:
1. Ensure environment variables are enabled for **both** Production and Preview
2. Clear browser cache and hard refresh (Ctrl+Shift+R)
3. Always access via production URL: https://neuralecho1.vercel.app
4. Redeploy after setting environment variables

### Issue: "Room not found" when joining

**Symptoms**: Clicking join link shows "Room not found" error

**Causes**:
- Backend is down or restarting
- Room expired (backend restarted)
- Wrong backend URL configured

**Solutions**:
1. Check backend health: https://mithunkrishnaneuralecho-2.onrender.com/health
2. Verify `VITE_BACKEND_URL` is correct in Vercel
3. Create a new room (old rooms expire when backend restarts)
4. Check Render.com dashboard for backend status

### Issue: WebSocket connection fails

**Symptoms**: "Connecting..." status never changes, no audio

**Causes**:
- Wrong WebSocket URL
- Backend WebSocket not working
- CORS issues

**Solutions**:
1. Verify `VITE_WS_URL` starts with `wss://` (not `https://`)
2. Check browser console for WebSocket errors
3. Verify backend CORS allows your frontend domain
4. Check Render.com logs for WebSocket errors

### Issue: Preview deployment warning shows on production

**Symptoms**: Yellow warning banner appears on https://neuralecho1.vercel.app

**Causes**:
- `VITE_APP_BASE_URL` not set correctly
- Accessing via alternate domain (neuralecho.vercel.app)

**Solutions**:
1. Verify `VITE_APP_BASE_URL` is exactly: `https://neuralecho1.vercel.app`
2. Always use the primary domain
3. Redeploy after fixing environment variable

## Production Checklist

Before sharing the app with users:

- [ ] All environment variables set in Vercel dashboard
- [ ] Environment variables enabled for Production AND Preview
- [ ] Latest deployment successful
- [ ] Console shows correct URLs (no warnings)
- [ ] Create room works
- [ ] Shareable link uses production URL
- [ ] Join link works in incognito window
- [ ] Backend health check passes
- [ ] WebSocket connection establishes
- [ ] Audio translation works both directions
- [ ] No preview deployment warning on production URL

## Quick Reference

### Production URLs
- Frontend: https://neuralecho1.vercel.app
- Backend: https://mithunkrishnaneuralecho-2.onrender.com
- WebSocket: wss://mithunkrishnaneuralecho-2.onrender.com
- Health: https://mithunkrishnaneuralecho-2.onrender.com/health

### Vercel Dashboard Links
- Project: https://vercel.com/[your-username]/neuralecho1
- Settings: https://vercel.com/[your-username]/neuralecho1/settings
- Environment Variables: https://vercel.com/[your-username]/neuralecho1/settings/environment-variables
- Deployments: https://vercel.com/[your-username]/neuralecho1/deployments

### Support
If issues persist:
1. Check Vercel deployment logs
2. Check Render.com backend logs
3. Check browser console for errors
4. Verify all environment variables are set correctly
