class MicPreprocessProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRate = 24000;

    // High-pass filter (100Hz cutoff - better for speech)
    const cutoff = 100;
    const RC = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / this.sampleRate;
    this.hpAlpha = RC / (RC + dt);
    this.hpPrevInput = 0;
    this.hpPrevOutput = 0;

    // Noise gate (more sensitive for better VAD)
    this.gateThreshold = 0.008;  // Lower threshold for better sensitivity
    this.gateAttack = 0.001;     // Faster attack for immediate response
    this.gateRelease = 0.05;     // Shorter release to avoid trailing noise
    this.gateGain = 0.0;
    this.gateAttackCoef = Math.exp(-1 / (this.gateAttack * this.sampleRate));
    this.gateReleaseCoef = Math.exp(-1 / (this.gateRelease * this.sampleRate));

    // Compressor (gentler settings for speech clarity)
    this.compThreshold = 0.3;    // Lower threshold for more natural dynamics
    this.compRatio = 3.0;        // Softer compression
    this.compAttack = 0.003;     // Faster attack for speech peaks
    this.compRelease = 0.08;     // Moderate release
    this.compGain = 1.0;
    this.compAttackCoef = Math.exp(-1 / (this.compAttack * this.sampleRate));
    this.compReleaseCoef = Math.exp(-1 / (this.compRelease * this.sampleRate));

    // Normalizer/Limiter (optimized for speech)
    this.normTarget = 0.8;       // Slightly lower target for headroom
    this.normGain = 1.0;
    this.normAttack = Math.exp(-1 / (0.005 * this.sampleRate));  // Faster attack
    this.normRelease = Math.exp(-1 / (0.3 * this.sampleRate));   // Slower release

    // ── WORD BOUNDARY DETECTOR ──
    this.rmsSmoothed = 0.0;
    this.rmsAttackCoef = Math.exp(-1 / (0.008 * this.sampleRate));
    this.rmsReleaseCoef = Math.exp(-1 / (0.06 * this.sampleRate));

    // Energy tracking for hallucination filtering
    this.committedFrameCount = 0;
    this.committedEnergySum = 0;

    // Thresholds
    this.speechThreshold = 0.02;   // RMS above → speech active
    this.silenceThreshold = 0.008; // RMS below → silence

    // State machine: "silence" | "speech" | "endOfWord"
    this.vadState = "silence";

    // Silence holdoff: how long silence must persist to commit a word
    // 180ms catches natural word gaps without chopping mid-word
    this.silenceHoldSamples = Math.floor(0.18 * this.sampleRate);
    this.silenceSampleCount = 0;

    // Phrase boundary: longer silence for sentence end (800ms)
    this.silenceHoldPhraseSamples = Math.floor(0.80 * this.sampleRate);

    // Minimum word length: ignore sub-50ms bursts (plosives, clicks)
    this.minWordSamples = Math.floor(0.05 * this.sampleRate);
    this.speechSampleCount = 0;

    // Maximum word length before forced commit (prevents run-on audio)
    // At 24kHz, 3 seconds = 72000 samples
    this.maxWordSamples = Math.floor(3.0 * this.sampleRate);

    // Maximum phrase length before forced commit (4 seconds)
    this.maxPhraseSamples = Math.floor(4.0 * this.sampleRate);
    this.phraseSampleCount = 0;

    // Track committed state to prevent double-commits
    this.wordCommittedThisSpeech = false;
    this.phraseCommittedThisSpeech = false;
  }

  process(inputs, outputs) {
    const input = inputs[0][0];
    const output = outputs[0][0];
    if (!input || !output) return true;

    const N = input.length;
    const processed = new Float32Array(N);
    let sumSq = 0;

    for (let i = 0; i < N; i++) {
      let s = input[i];

      // High-pass filter
      const hpOut = this.hpAlpha * (this.hpPrevOutput + s - this.hpPrevInput);
      this.hpPrevInput = s;
      this.hpPrevOutput = hpOut;
      s = hpOut;

      // Noise gate
      const amplitude = Math.abs(s);
      if (amplitude > this.gateThreshold) {
        this.gateGain = 1 - (1 - this.gateGain) * this.gateAttackCoef;
      } else {
        this.gateGain = this.gateGain * this.gateReleaseCoef;
      }
      s = s * this.gateGain;

      // Compressor
      const level = Math.abs(s);
      let targetCompGain = 1.0;
      if (level > this.compThreshold) {
        const excess = level - this.compThreshold;
        const compressed = this.compThreshold + excess / this.compRatio;
        targetCompGain = compressed / level;
      }
      if (targetCompGain < this.compGain) {
        this.compGain = targetCompGain + (this.compGain - targetCompGain) * this.compAttackCoef;
      } else {
        this.compGain = targetCompGain + (this.compGain - targetCompGain) * this.compReleaseCoef;
      }
      s = s * this.compGain;

      // Normalizer/Limiter
      const peak = Math.abs(s);
      if (peak > 0.001) {
        const targetNormGain = this.normTarget / peak;
        if (targetNormGain < this.normGain) {
          this.normGain = targetNormGain + (this.normGain - targetNormGain) * this.normAttack;
        } else {
          this.normGain = targetNormGain + (this.normGain - targetNormGain) * this.normRelease;
        }
      }
      s = Math.max(-1.0, Math.min(1.0, s * this.normGain));

      processed[i] = s;
      sumSq += s * s;
    }
  
    // Copy processed audio to output
    output.set(processed);
  
    // ── WORD BOUNDARY STATE MACHINE ──
    sumSq = 0;
    for (let i = 0; i < processed.length; i++) sumSq += processed[i] ** 2;
    const frameRMS = Math.sqrt(sumSq / processed.length);

    // Asymmetric smoothing: fast attack, slow release
    if (frameRMS > this.rmsSmoothed) {
      this.rmsSmoothed = frameRMS + (this.rmsSmoothed - frameRMS) * this.rmsAttackCoef;
    } else {
      this.rmsSmoothed = frameRMS + (this.rmsSmoothed - frameRMS) * this.rmsReleaseCoef;
    }

    let wordBoundary = false;
    let phraseBoundary = false;

    switch (this.vadState) {
      case "silence":
        if (this.rmsSmoothed > this.speechThreshold) {
          this.vadState = "speech";
          this.speechSampleCount = 0;
          this.phraseSampleCount = 0;
          this.silenceSampleCount = 0;
          this.wordCommittedThisSpeech = false;
          this.phraseCommittedThisSpeech = false;
        }
        break;

      case "speech":
        this.speechSampleCount += processed.length;
        this.phraseSampleCount += processed.length;

        // Accumulate energy for this committed segment
        this.committedFrameCount += processed.length;
        for (let i = 0; i < processed.length; i++) {
          this.committedEnergySum += processed[i] ** 2;
        }

        if (this.rmsSmoothed < this.silenceThreshold) {
          // Energy dropped — potential end of word/phrase
          this.silenceSampleCount += processed.length;

          const isWordEnd = this.silenceSampleCount >= this.silenceHoldSamples &&
                           this.speechSampleCount >= this.minWordSamples &&
                           !this.wordCommittedThisSpeech;

          const isPhraseEnd = this.silenceSampleCount >= this.silenceHoldPhraseSamples &&
                             !this.phraseCommittedThisSpeech;

          if (isWordEnd) {
            wordBoundary = true;
            this.wordCommittedThisSpeech = true;
          }

          if (isPhraseEnd) {
            phraseBoundary = true;
            this.phraseCommittedThisSpeech = true;
          }

          if (wordBoundary || phraseBoundary) {
            this.vadState = "silence";
            this.speechSampleCount = 0;
            this.phraseSampleCount = 0;
            this.silenceSampleCount = 0;
          }
        } else {
          this.silenceSampleCount = 0;  // reset holdoff on resumed speech
        }

        // Force commit if word is too long (continuous speech)
        if (this.speechSampleCount >= this.maxWordSamples && !this.wordCommittedThisSpeech) {
          wordBoundary = true;
          this.wordCommittedThisSpeech = true;
        }

        // Force phrase commit if too long
        if (this.phraseSampleCount >= this.maxPhraseSamples && !this.phraseCommittedThisSpeech) {
          phraseBoundary = true;
          this.phraseCommittedThisSpeech = true;
          this.vadState = "silence";
          this.speechSampleCount = 0;
          this.phraseSampleCount = 0;
          this.silenceSampleCount = 0;
        }
        break;
    }

    // Send message with energy data if committing
    if (wordBoundary || phraseBoundary) {
      const avgEnergy = this.committedEnergySum / this.committedFrameCount;
      const durationMs = (this.committedFrameCount / this.sampleRate) * 1000;

      this.port.postMessage({
        pcm: processed.buffer,
        rms: this.rmsSmoothed,
        wordBoundary,
        phraseBoundary,
        commitEnergy: avgEnergy,
        commitDurationMs: durationMs
      }, [processed.buffer]);

      // Reset energy tracking after commit
      this.committedFrameCount = 0;
      this.committedEnergySum = 0;
    } else {
      // Normal message without boundary
      this.port.postMessage({
        pcm: processed.buffer,
        rms: this.rmsSmoothed,
        wordBoundary: false,
        phraseBoundary: false
      }, [processed.buffer]);
    }

    return true;
  }
}

registerProcessor('mic-preprocess-processor', MicPreprocessProcessor);