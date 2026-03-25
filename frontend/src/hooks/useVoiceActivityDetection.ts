/**
 * Voice Activity Detection (VAD) Hook
 * Detects speech in real-time using Web Audio API
 * Handles mid-sentence pauses and noise filtering
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface VADConfig {
  // Energy threshold for speech detection (RMS)
  energyThreshold?: number;
  // Silence duration before stopping (ms)
  silenceTimeout?: number;
  // Minimum speech duration to trigger (ms)
  minSpeechDuration?: number;
  // Sample rate for analysis
  sampleRate?: number;
  // FFT size for frequency analysis
  fftSize?: number;
  // Enable debug logging
  debug?: boolean;
}

interface VADCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onVoiceActivity?: (isActive: boolean) => void;
}

const DEFAULT_CONFIG: Required<VADConfig> = {
  energyThreshold: 0.015, // RMS threshold for speech
  silenceTimeout: 1500, // 1.5 seconds of silence before stopping
  minSpeechDuration: 300, // 300ms minimum speech to trigger
  sampleRate: 16000,
  fftSize: 2048,
  debug: false,
};

export function useVoiceActivityDetection(
  config: VADConfig = {},
  callbacks: VADCallbacks = {}
) {
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentEnergy, setCurrentEnergy] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechStartTimeRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);

  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  const log = useCallback(
    (...args: any[]) => {
      if (fullConfig.debug) {
        console.log('[VAD]', ...args);
      }
    },
    [fullConfig.debug]
  );

  // Calculate RMS energy from audio data
  const calculateEnergy = useCallback((dataArray: Uint8Array): number => {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128; // Normalize to -1 to 1
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / dataArray.length);
  }, []);

  // Handle speech start
  const handleSpeechStart = useCallback(() => {
    if (isSpeakingRef.current) return;

    const now = Date.now();
    const speechDuration = speechStartTimeRef.current
      ? now - speechStartTimeRef.current
      : 0;

    // Only trigger if speech duration exceeds minimum
    if (speechDuration >= fullConfig.minSpeechDuration) {
      log('Speech started (duration:', speechDuration, 'ms)');
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      callbacks.onSpeechStart?.();
      callbacks.onVoiceActivity?.(true);
    }
  }, [fullConfig.minSpeechDuration, callbacks, log]);

  // Handle speech end
  const handleSpeechEnd = useCallback(() => {
    if (!isSpeakingRef.current) return;

    log('Speech ended');
    isSpeakingRef.current = false;
    speechStartTimeRef.current = null;
    setIsSpeaking(false);
    callbacks.onSpeechEnd?.();
    callbacks.onVoiceActivity?.(false);
  }, [callbacks, log]);

  // Clear silence timer
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Start silence timer
  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      log('Silence timeout reached');
      handleSpeechEnd();
    }, fullConfig.silenceTimeout);
  }, [fullConfig.silenceTimeout, handleSpeechEnd, clearSilenceTimer, log]);

  // Analyze audio frame
  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current || !isActive) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(dataArray);

    const energy = calculateEnergy(dataArray);
    setCurrentEnergy(energy);

    const isSpeechDetected = energy > fullConfig.energyThreshold;

    if (isSpeechDetected) {
      // Speech detected
      if (!speechStartTimeRef.current) {
        speechStartTimeRef.current = Date.now();
        log('Potential speech detected, waiting for min duration...');
      }

      // Clear silence timer since we're hearing speech
      clearSilenceTimer();

      // Check if we should trigger speech start
      const speechDuration = Date.now() - speechStartTimeRef.current;
      if (
        speechDuration >= fullConfig.minSpeechDuration &&
        !isSpeakingRef.current
      ) {
        handleSpeechStart();
      }
    } else {
      // Silence detected
      if (isSpeakingRef.current) {
        // We were speaking, start silence timer
        if (!silenceTimerRef.current) {
          log('Silence detected, starting timer...');
          startSilenceTimer();
        }
      } else {
        // We weren't speaking yet, reset speech start time
        speechStartTimeRef.current = null;
      }
    }

    // Continue analyzing
    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, [
    isActive,
    fullConfig.energyThreshold,
    fullConfig.minSpeechDuration,
    calculateEnergy,
    handleSpeechStart,
    clearSilenceTimer,
    startSilenceTimer,
    log,
  ]);

  // Start VAD
  const start = useCallback(async () => {
    if (isActive) {
      log('VAD already active');
      return;
    }

    try {
      log('Starting VAD...');

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      micStreamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext({
        sampleRate: fullConfig.sampleRate,
      });
      audioContextRef.current = audioContext;

      // Create analyser
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = fullConfig.fftSize;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // Connect microphone to analyser
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsActive(true);
      setIsInitialized(true);
      log('VAD started successfully');

      // Start analyzing
      analyzeAudio();
    } catch (error) {
      console.error('[VAD] Failed to start:', error);
      throw error;
    }
  }, [isActive, fullConfig.sampleRate, fullConfig.fftSize, analyzeAudio, log]);

  // Stop VAD
  const stop = useCallback(() => {
    if (!isActive) return;

    log('Stopping VAD...');

    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clear timers
    clearSilenceTimer();

    // Stop microphone
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Reset state
    analyserRef.current = null;
    speechStartTimeRef.current = null;
    
    // Handle speech end if we were speaking
    if (isSpeakingRef.current) {
      handleSpeechEnd();
    }

    setIsActive(false);
    setCurrentEnergy(0);
    log('VAD stopped');
  }, [isActive, clearSilenceTimer, handleSpeechEnd, log]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  return {
    // State
    isActive,
    isSpeaking,
    currentEnergy,
    isInitialized,

    // Controls
    start,
    stop,

    // Config
    energyThreshold: fullConfig.energyThreshold,
    silenceTimeout: fullConfig.silenceTimeout,
  };
}
