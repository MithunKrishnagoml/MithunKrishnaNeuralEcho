# NeuralEcho Deployment Guide

## Backend Setup (Render)

### Required Environment Variables

Add these to Render dashboard: Dashboard → Your Service → Environment

```
OPENAI_API_KEY=sk_...your_key_here...
FRONTEND_URL=https://neuralecho1.vercel.app
NODE_ENV=production
PORT=3001
```

### Getting OpenAI API Key

1. Go to https://platform.openai.com/account/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk_`)
4. Add to Render Environment Variables
5. Service auto-redeploys (5-10 minutes)

### Verify Backend is Running

Test endpoint:
```bash
curl https://mithunkrishnaneuralecho-2.onrender.com/api/openai-token
```

Should return JSON with `client_secret`, not HTML error.

## Frontend Setup (Vercel)

No special configuration needed - automatically deploys from GitHub.

## Testing

1. Create room at: https://neuralecho1.vercel.app
2. Enter your name + select language
3. You get share link: `/room/{roomId}`
4. Other user clicks link, enters their name + language
5. Both should see each other in same room
6. Audio/transcripts start flowing when OpenAI token loads

## Troubleshooting

### "Invalid token response format" error
→ OPENAI_API_KEY not set on Render

### "WebSocket connection refused"
→ Backend service crashed or not running

### HTML error instead of JSON
→ Endpoint not found (backend needs redeploy after env var changes)

### No audio from peer
→ Check firewall/CORS settings allow WebSocket connections
