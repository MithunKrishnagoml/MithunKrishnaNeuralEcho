# Hands-Free Mode - Quick Start Guide

## For Users

### How to Enable Hands-Free Mode

1. **Join a chatroom** with another participant
2. **Wait for both participants to connect** (you'll see "2/2" in the header)
3. **Click the mode toggle button** in the control bar
   - Look for the button that says "Push-to-Talk Mode"
   - Click it to switch to "Hands-Free Mode"
4. **Start speaking naturally** - no button pressing needed!

### Visual Indicators

When hands-free mode is active, you'll see:
- ⚡ **Zap icon** on the mode button (instead of hand icon)
- 🟢 **Green pulse dot** with "Listening..." text
- **"Ready - Speak naturally"** status when idle
- **"Speaking..."** with animation when you're talking

### How It Works

1. **Automatic Detection**: The system listens for your voice continuously
2. **Smart Pauses**: You can pause for up to 1.5 seconds without being cut off
3. **Natural Flow**: Speak as you normally would in a conversation
4. **Auto Translation**: Your speech is translated in real-time to the other person
5. **Turn-Taking**: When the other person speaks, your mic automatically pauses

### Tips for Best Results

✅ **DO:**
- Speak clearly and at normal volume
- Use natural pauses (up to 1.5 seconds is fine)
- Wear headphones to prevent echo
- Use in a relatively quiet environment

❌ **DON'T:**
- Whisper (may not be detected)
- Speak in very noisy environments
- Use without headphones if possible (can cause echo)
- Expect instant switching (there's a small delay for detection)

### Switching Back to Push-to-Talk

1. Click the **"Hands-Free Mode"** button
2. It will switch back to **"Push-to-Talk Mode"**
3. Now you need to hold the button or spacebar to speak

### Troubleshooting

**Problem: Voice not being detected**
- Check microphone permissions in your browser
- Speak louder or closer to the microphone
- Make sure you're not muted
- Try refreshing the page

**Problem: Too sensitive (picks up background noise)**
- Switch back to Push-to-Talk mode
- Use in a quieter environment
- Consider using a better microphone with noise cancellation

**Problem: Cuts off mid-sentence**
- This shouldn't happen with the 1.5s pause tolerance
- If it does, try speaking with shorter pauses
- Report the issue for threshold adjustment

**Problem: Echo or feedback**
- **Always use headphones** when in hands-free mode
- Make sure your speakers aren't too loud
- Check that the other person is also using headphones

### Comparison: Push-to-Talk vs Hands-Free

| Feature | Push-to-Talk | Hands-Free |
|---------|-------------|------------|
| Button Press | Required | Not needed |
| Hands Free | No | Yes |
| Noise Filtering | Manual (you control) | Automatic |
| Best For | Noisy environments | Quiet environments |
| Battery Usage | Lower | Higher |
| Ease of Use | More control | More natural |

### When to Use Each Mode

**Use Push-to-Talk when:**
- You're in a noisy environment
- You want precise control over when to transmit
- You're on a mobile device (to save battery)
- You need to cough, sneeze, or make other sounds

**Use Hands-Free when:**
- You're in a quiet environment
- You want a natural conversation flow
- You need your hands for other tasks
- You're having a long conversation

## For Developers

### Quick Integration Test

1. **Start the development server:**
   ```bash
   cd neuralecho/frontend
   npm run dev
   ```

2. **Open two browser windows:**
   - Window 1: Create a room
   - Window 2: Join the same room

3. **Test hands-free mode:**
   - Enable hands-free in one window
   - Speak and verify translation appears in other window
   - Check console for VAD debug logs

### Key Configuration

Located in `ChatroomInterface.tsx`:

```typescript
const vad = useVoiceActivityDetection(
  {
    energyThreshold: 0.015,      // Adjust for sensitivity
    silenceTimeout: 1500,        // Pause tolerance (ms)
    minSpeechDuration: 300,      // Min speech to trigger (ms)
    debug: true,                 // Enable console logs
  },
  {
    onSpeechStart: () => { /* ... */ },
    onSpeechEnd: () => { /* ... */ },
  }
);
```

### Adjusting Sensitivity

If users report issues, adjust these values:

**Too sensitive (picks up noise):**
```typescript
energyThreshold: 0.025,  // Increase (was 0.015)
minSpeechDuration: 500,  // Increase (was 300)
```

**Not sensitive enough (misses speech):**
```typescript
energyThreshold: 0.010,  // Decrease (was 0.015)
minSpeechDuration: 200,  // Decrease (was 300)
```

**Cuts off too quickly:**
```typescript
silenceTimeout: 2000,    // Increase (was 1500)
```

### Debug Logging

Enable debug mode to see VAD activity:

```typescript
debug: true  // In VAD config
```

Console output will show:
- `[VAD] Starting VAD...`
- `[VAD] Potential speech detected...`
- `[VAD] Speech started`
- `[VAD] Silence detected, starting timer...`
- `[VAD] Speech ended`

### Testing Checklist

- [ ] Voice detection works in quiet environment
- [ ] Mid-sentence pauses don't cut off (1.5s tolerance)
- [ ] Background noise doesn't trigger false positives
- [ ] Interruption handling works (both users speaking)
- [ ] Mode toggle switches correctly
- [ ] Visual indicators update properly
- [ ] Works on mobile devices
- [ ] Works in different browsers
- [ ] No memory leaks (check DevTools)
- [ ] Audio cleanup on unmount

## FAQ

**Q: Does hands-free mode work on mobile?**
A: Yes, but battery usage will be higher due to continuous microphone monitoring.

**Q: Can I adjust the sensitivity?**
A: Currently no user-facing controls, but developers can adjust the threshold in the code.

**Q: Why do I need headphones?**
A: To prevent echo/feedback. Without headphones, the microphone can pick up the speaker output.

**Q: How much battery does it use?**
A: Moderate impact due to continuous microphone access. Push-to-talk uses less battery.

**Q: Is my audio being recorded?**
A: No. VAD only analyzes audio locally for detection. Audio is only sent when you're speaking.

**Q: Can both users use hands-free mode?**
A: Yes! Both users can enable hands-free mode independently.

**Q: What if we both speak at the same time?**
A: The system handles interruptions - when one person starts speaking, the other's mic pauses.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the full documentation in `HANDS_FREE_MODE.md`
3. Check browser console for error messages
4. Report issues with details about your environment

## Version

- **Feature:** Hands-Free Mode
- **Version:** 1.0.0
- **Date:** 2025
- **Status:** Production Ready ✅
