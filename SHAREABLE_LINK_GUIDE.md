# Shareable Link Configuration Guide

## Problem
When users share chatroom links from Vercel preview deployments, the links contain preview URLs (e.g., `https://neuralecho1-9aetcrwjh-smithun2004-9533s-projects.vercel.app`) instead of the production URL.

## Solution

### 1. Always Use Production URL
The production URL is: **https://neuralecho1.vercel.app**

Make sure to:
- Access the app via the production URL, not preview URLs
- Share links only from the production deployment
- Bookmark the production URL for easy access

### 2. Configure Vercel Environment Variables

In your Vercel dashboard:

1. Go to your project: **neuralecho1**
2. Navigate to **Settings** → **Environment Variables**
3. Add/verify these variables for **Production** environment:

```
VITE_APP_BASE_URL = https://neuralecho1.vercel.app
VITE_BACKEND_URL = https://mithunkrishnaneuralecho-2.onrender.com
VITE_WS_URL = wss://mithunkrishnaneuralecho-2.onrender.com
```

4. **Important**: Also add these to **Preview** environment so preview deployments generate correct links:
   - Check the "Preview" checkbox for each variable
   - This ensures even preview deployments generate production links

5. Click **Save** for each variable

### 3. Redeploy After Configuration

After setting environment variables:
1. Go to **Deployments** tab
2. Find the latest production deployment
3. Click the three dots (⋯) → **Redeploy**
4. Or push a new commit to trigger automatic deployment

### 4. Verify Configuration

After deployment:
1. Visit: https://neuralecho1.vercel.app/chatroom
2. Create a room
3. Check the shareable link - it should be: `https://neuralecho1.vercel.app/join/[room-id]`
4. Open browser console and verify:
   ```
   🌐 [CONFIG] App Base URL: https://neuralecho1.vercel.app
   ```

## How Shareable Links Work

1. **Link Generation**: When a room is created, the app uses `VITE_APP_BASE_URL` to generate the shareable link
2. **Link Format**: `https://neuralecho1.vercel.app/join/[room-id]`
3. **Link Routing**: When clicked, Vercel's SPA routing (configured in `vercel.json`) routes to the React app
4. **Join Flow**: The `/join/:roomId` route extracts the room ID and shows the join form

## Troubleshooting

### Issue: Link shows preview URL
**Cause**: Accessing the app from a preview deployment
**Solution**: Always use https://neuralecho1.vercel.app

### Issue: Link leads to Vercel homepage
**Cause**: Environment variables not set in Vercel dashboard
**Solution**: Follow step 2 above to configure environment variables

### Issue: "Room not found" error
**Cause**: Room may have expired or backend is down
**Solution**: 
- Check backend status: https://mithunkrishnaneuralecho-2.onrender.com/health
- Create a new room if the old one expired

### Issue: Preview deployments generate wrong links
**Cause**: Environment variables not set for Preview environment
**Solution**: In Vercel dashboard, enable environment variables for both Production AND Preview

## Best Practices

1. **Bookmark Production URL**: Save https://neuralecho1.vercel.app for quick access
2. **Share from Production**: Always create and share rooms from the production URL
3. **Test Before Sharing**: Click the "Copy Link" button and verify the URL before sharing
4. **Monitor Backend**: Ensure backend is running at https://mithunkrishnaneuralecho-2.onrender.com

## Quick Reference

| Environment | URL |
|-------------|-----|
| Production Frontend | https://neuralecho1.vercel.app |
| Backend API | https://mithunkrishnaneuralecho-2.onrender.com |
| WebSocket | wss://mithunkrishnaneuralecho-2.onrender.com |
| Health Check | https://mithunkrishnaneuralecho-2.onrender.com/health |

## Visual Indicator

The app now shows a warning banner when accessed from a preview deployment, reminding users to use the production URL for sharing links.
