# 🚀 Quick Fix Guide - Shareable Links Not Working

## The Problem
Your shareable link is using a preview deployment URL instead of production:
```
❌ https://neuralecho1-9aetcrwjh-smithun2004-9533s-projects.vercel.app/join/...
✅ https://neuralecho1.vercel.app/join/...
```

## The Fix (5 Minutes)

### Step 1: Open Vercel Dashboard
1. Go to https://vercel.com
2. Sign in
3. Click on your project: **neuralecho1**

### Step 2: Add Environment Variables
1. Click **Settings** (top menu)
2. Click **Environment Variables** (left sidebar)
3. Add these 3 variables:

#### Variable 1: VITE_APP_BASE_URL
```
Name: VITE_APP_BASE_URL
Value: https://neuralecho1.vercel.app
Environments: ✅ Production ✅ Preview
```
Click **Save**

#### Variable 2: VITE_BACKEND_URL
```
Name: VITE_BACKEND_URL
Value: https://mithunkrishnaneuralecho-2.onrender.com
Environments: ✅ Production ✅ Preview
```
Click **Save**

#### Variable 3: VITE_WS_URL
```
Name: VITE_WS_URL
Value: wss://mithunkrishnaneuralecho-2.onrender.com
Environments: ✅ Production ✅ Preview
```
Click **Save**

### Step 3: Redeploy
1. Click **Deployments** (top menu)
2. Find the latest deployment (should be automatic from my push)
3. Wait for it to complete (green checkmark)

### Step 4: Test
1. Visit: https://neuralecho1.vercel.app/chatroom
2. Create a room
3. Click "Copy Link"
4. Verify the link is: `https://neuralecho1.vercel.app/join/[room-id]`
5. Open in incognito window
6. Should work! ✅

## What Changed

I've added:
1. **Warning Banner** - Shows when you're on a preview deployment
2. **Auto-detection** - Prevents sharing wrong URLs
3. **Documentation** - Complete guides for setup and troubleshooting

## Important Rules

### ✅ DO:
- Always use: https://neuralecho1.vercel.app
- Bookmark the production URL
- Share links from production only
- Check environment variables are set

### ❌ DON'T:
- Use preview URLs (those with hashes)
- Share links from preview deployments
- Access app from preview URLs

## How to Tell Which URL You're On

### Production URL (GOOD):
```
https://neuralecho1.vercel.app
```
- Clean domain
- No hash/random characters
- This is what you should use

### Preview URL (BAD):
```
https://neuralecho1-9aetcrwjh-smithun2004-9533s-projects.vercel.app
```
- Has hash (9aetcrwjh)
- Has username (smithun2004-9533s-projects)
- Don't share links from here

## Troubleshooting

### "Room not found" error
- Backend might be restarting (Render free tier)
- Check: https://mithunkrishnaneuralecho-2.onrender.com/health
- Create a new room

### Warning banner still shows
- Clear browser cache (Ctrl+Shift+R)
- Make sure you're on https://neuralecho1.vercel.app
- Check environment variables are set correctly

### Links still wrong
- Verify all 3 environment variables are set
- Make sure "Preview" is checked for each variable
- Redeploy after setting variables
- Clear browser cache

## Need More Help?

Read the detailed guides:
- `SHAREABLE_LINK_FIX.md` - Complete problem analysis
- `VERCEL_SETUP_INSTRUCTIONS.md` - Detailed Vercel setup
- `SHAREABLE_LINK_GUIDE.md` - How links work

## Summary

1. ✅ Code changes pushed to GitHub
2. ⏳ Configure Vercel environment variables (YOU DO THIS)
3. ⏳ Wait for deployment
4. ✅ Test with production URL
5. ✅ Share links with users

That's it! The fix is ready, you just need to configure Vercel. 🎉
