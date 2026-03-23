/**
 * Hook for managing transcript history and session recording
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TranscriptMessage, SessionRecording, TranscriptDownload, ChatroomParticipant } from '@/types/chatroom';

interface UseTranscriptRecordingProps {
  roomId: string;
  participant: ChatroomParticipant;
  otherParticipant?: ChatroomParticipant | null;
}

export function useTranscriptRecording({ 
  roomId, 
  participant, 
  otherParticipant 
}: UseTranscriptRecordingProps) {
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptMessage[]>([]);
  const [recording, setRecording] = useState<SessionRecording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // Audio context and mixer for recording multiple streams
  const audioContextRef = useRef<AudioContext | null>(null);
  const mixerRef = useRef<GainNode | null>(null);
  const microphoneSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const translatedAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const translatedAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio element on mount (separate from mixer initialization)
  useEffect(() => {
    if (!translatedAudioElementRef.current) {
      translatedAudioElementRef.current = new Audio();
      translatedAudioElementRef.current.autoplay = false;
      console.log(' [AUDIO ELEMENT] Created persistent audio element for translated audio');
    }
  }, []);

  // Initialize audio context and mixer
  const initializeAudioMixer = useCallback(async () => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      mixerRef.current = audioContextRef.current.createGain();
      
      // Create destination for mixed audio
      const destination = audioContextRef.current.createMediaStreamDestination();
      mixerRef.current.connect(destination);
      
      mixedStreamRef.current = destination.stream;
      
      console.log(' [AUDIO MIXER] Initialized audio context and mixer');
      return true;
    } catch (error) {
      console.error(' [AUDIO MIXER] Failed to initialize:', error);
      return false;
    }
  }, []);

  // Add microphone stream to mixer
  const addMicrophoneToMixer = useCallback((micStream: MediaStream) => {
    if (!audioContextRef.current || !mixerRef.current) return;
    
    try {
      microphoneSourceRef.current = audioContextRef.current.createMediaStreamSource(micStream);
      microphoneSourceRef.current.connect(mixerRef.current);
      console.log(' [AUDIO MIXER] Added microphone stream to mixer');
    } catch (error) {
      console.error(' [AUDIO MIXER] Failed to add microphone:', error);
    }
  }, []);

  // Setup translated audio element to connect to mixer
  const setupTranslatedAudioCapture = useCallback(() => {
    if (!audioContextRef.current || !mixerRef.current || !translatedAudioElementRef.current) {
      console.warn(' [AUDIO MIXER] Cannot setup translated audio - context not ready');
      return;
    }
    
    try {
      // Only create the source once
      if (!translatedAudioSourceRef.current) {
        translatedAudioSourceRef.current = audioContextRef.current.createMediaElementSource(translatedAudioElementRef.current);
        translatedAudioSourceRef.current.connect(mixerRef.current);
        // Also connect to destination so we can hear it
        translatedAudioSourceRef.current.connect(audioContextRef.current.destination);
        console.log(' [AUDIO MIXER] Connected translated audio element to mixer');
      }
    } catch (error) {
      console.error(' [AUDIO MIXER] Failed to setup translated audio capture:', error);
    }
  }, []);

  // Play translated audio through the persistent element with enhanced mixing
  const playTranslatedAudio = useCallback((audioData: string) => {
    if (!translatedAudioElementRef.current) {
      console.warn(' [AUDIO MIXER] Audio element not ready');
      return;
    }
    
    try {
      // Enhanced audio processing for better mixing
      const binaryString = atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Create AudioContext for better control
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });
      
      // Resume context if suspended
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      // Convert PCM16 to Float32Array
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }
      
      // Create audio buffer
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);
      
      // Create gain node for volume control
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0;
      
      // Connect to both destination (for hearing) and mixer (for recording)
      gainNode.connect(audioContext.destination);
      
      // If mixer is available, also connect to it for recording
      if (audioContextRef.current && mixerRef.current) {
        // Create a separate gain node for the mixer to avoid double connection
        const mixerGainNode = audioContextRef.current.createGain();
        mixerGainNode.gain.value = 1.0;
        mixerGainNode.connect(mixerRef.current);
        
        // Connect the audio to the mixer as well
        const source2 = audioContextRef.current.createBufferSource();
        source2.buffer = audioBuffer;
        source2.connect(mixerGainNode);
        source2.start();
        
        console.log(' [AUDIO MIXER] Connected translated audio to recording mixer');
      }
      
      // Play the audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gainNode);
      source.start();
      
      console.log(' [AUDIO MIXER] Playing translated audio with enhanced mixing');
      
      source.onended = () => {
        console.log(' [AUDIO MIXER] Translated audio playback completed');
        // Clean up AudioContext
        setTimeout(() => {
          if (audioContext.state !== 'closed') {
            audioContext.close();
          }
        }, 100);
      };
    } catch (error) {
      console.error(' [AUDIO MIXER] Failed to process translated audio:', error);
    }
  }, []);

  // Expose method to play translated audio (called from useChatroomConnection)
  useEffect(() => {
    (window as any).playTranslatedAudioForRecording = playTranslatedAudio;
    
    return () => {
      delete (window as any).playTranslatedAudioForRecording;
    };
  }, [playTranslatedAudio]);

  // Add a new transcript message
  const addTranscriptMessage = useCallback((
    speakerId: string,
    speakerName: string,
    originalText: string,
    translatedText: string,
    sourceLanguage: 'en-US' | 'fr-CA',
    targetLanguage: 'en-US' | 'fr-CA',
    confidence?: number,
    processingTime?: number
  ) => {
    const message: TranscriptMessage = {
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      roomId,
      speakerId,
      speakerName,
      sourceLanguage,
      targetLanguage,
      originalTranscript: originalText,
      translatedTranscript: translatedText,
      timestamp: Date.now(),
      confidence,
      processingTime
    };

    setTranscriptHistory(prev => [...prev, message]);
    return message;
  }, [roomId]);

  // Get transcript messages for current user's view
  const getTranscriptForUser = useCallback((userLanguage: 'en-US' | 'fr-CA') => {
    return transcriptHistory.map(message => {
      // User sees original text when they speak, translated text when others speak
      const isOwnMessage = message.speakerId === participant.id;
      const displayText = isOwnMessage ? message.originalTranscript : message.translatedTranscript;
      
      return {
        ...message,
        displayText,
        isOwnMessage
      };
    });
  }, [transcriptHistory, participant.id]);

  // Start recording session with mixed audio streams
  const startRecording = useCallback(async () => {
    try {
      console.log(' [RECORDING] Starting mixed audio recording...');
      
      // Initialize audio mixer
      const mixerReady = await initializeAudioMixer();
      if (!mixerReady) {
        throw new Error('Failed to initialize audio mixer');
      }
      
      // Get user media for microphone
      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 2
        } 
      });

      // Add microphone to mixer
      addMicrophoneToMixer(micStream);
      
      // Setup translated audio capture
      setupTranslatedAudioCapture();
      
      // Use the mixed stream for recording
      const recordingStream = mixedStreamRef.current || micStream;
      
      const mediaRecorder = new MediaRecorder(recordingStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        setRecording(prev => prev ? {
          ...prev,
          status: 'ready',
          endTime: Date.now(),
          recordingUrl: audioUrl,
          duration: Date.now() - recordingStartTimeRef.current,
          size: audioBlob.size
        } : null);
        
        // Don't close audio context immediately - keep it for next recording
        console.log(' [RECORDING] Recording stopped, keeping audio context for reuse');
      };

      const recordingId = `rec_${roomId}_${Date.now()}`;
      const newRecording: SessionRecording = {
        recordingId,
        roomId,
        startTime: recordingStartTimeRef.current,
        participants: [participant.id, otherParticipant?.id].filter(Boolean) as string[],
        status: 'recording',
        format: 'mp3'
      };

      setRecording(newRecording);
      setIsRecording(true);
      
      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(Date.now() - recordingStartTimeRef.current);
      }, 1000);

      mediaRecorder.start(1000); // Collect data every second
      
      console.log(' [RECORDING] Mixed audio recording started:', recordingId);
      console.log(' [RECORDING] Translated audio will be captured through persistent audio element');
      return recordingId;
    } catch (error) {
      console.error(' [RECORDING] Failed to start mixed recording:', error);
      throw error;
    }
  }, [roomId, participant.id, otherParticipant?.id, initializeAudioMixer, addMicrophoneToMixer, setupTranslatedAudioCapture]);

  // Stop recording session
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      
      // Stop all tracks
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      
      setIsRecording(false);
      
      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      console.log(' Recording stopped');
    }
  }, [isRecording]);

  // Download recording
  const downloadRecording = useCallback(() => {
    if (recording?.recordingUrl) {
      const link = document.createElement('a');
      link.href = recording.recordingUrl;
      
      // Create filename with participant names
      const participantNames = [participant.name];
      if (otherParticipant) participantNames.push(otherParticipant.name);
      const namesStr = participantNames.join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      
      link.download = `neuralecho_${namesStr}_${dateStr}.webm`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [recording, roomId, participant.name, otherParticipant]);

  // Generate transcript download data
  const generateTranscriptDownload = useCallback((format: 'txt' | 'json' | 'pdf' = 'txt'): TranscriptDownload => {
    const participants = [participant];
    if (otherParticipant) participants.push(otherParticipant);

    return {
      roomId,
      participants,
      messages: transcriptHistory,
      startTime: transcriptHistory[0]?.timestamp || Date.now(),
      endTime: transcriptHistory[transcriptHistory.length - 1]?.timestamp || Date.now(),
      totalMessages: transcriptHistory.length,
      format
    };
  }, [roomId, participant, otherParticipant, transcriptHistory]);

  // Download transcript as TXT
  const downloadTranscriptTXT = useCallback(() => {
    const transcriptData = generateTranscriptDownload('txt');
    
    let content = `NeuralEcho Conversation Transcript\n`;
    content += `Room ID: ${roomId}\n`;
    content += `Date: ${new Date(transcriptData.startTime).toLocaleString()}\n`;
    content += `Participants: ${transcriptData.participants.map(p => `${p.name} (${p.language})`).join(', ')}\n`;
    content += `Total Messages: ${transcriptData.totalMessages}\n`;
    content += `Duration: ${Math.round((transcriptData.endTime - transcriptData.startTime) / 1000 / 60)} minutes\n\n`;
    content += `--- CONVERSATION ---\n\n`;

    transcriptData.messages.forEach((message, index) => {
      const timestamp = new Date(message.timestamp).toLocaleTimeString();
      content += `[${timestamp}] ${message.speakerName} (${message.sourceLanguage}):\n`;
      content += `Original: ${message.originalTranscript}\n`;
      content += `Translation: ${message.translatedTranscript}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Create filename with participant names
    const participantNames = transcriptData.participants.map(p => p.name).join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    link.download = `neuralecho_transcript_${participantNames}_${dateStr}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generateTranscriptDownload, roomId]);

  // Download transcript as JSON
  const downloadTranscriptJSON = useCallback(() => {
    const transcriptData = generateTranscriptDownload('json');
    
    const jsonData = {
      metadata: {
        roomId: transcriptData.roomId,
        startTime: transcriptData.startTime,
        endTime: transcriptData.endTime,
        duration: transcriptData.endTime - transcriptData.startTime,
        totalMessages: transcriptData.totalMessages,
        participants: transcriptData.participants,
        exportedAt: Date.now()
      },
      messages: transcriptData.messages
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Create filename with participant names
    const participantNames = transcriptData.participants.map(p => p.name).join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    link.download = `neuralecho_transcript_${participantNames}_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generateTranscriptDownload, roomId]);

  // Clear transcript history
  const clearTranscriptHistory = useCallback(() => {
    setTranscriptHistory([]);
  }, []);

  // Memoize session statistics to prevent excessive re-renders
  const sessionStats = useMemo(() => {
    const totalMessages = transcriptHistory.length;
    const userMessages = transcriptHistory.filter(m => m.speakerId === participant.id).length;
    const otherMessages = totalMessages - userMessages;
    
    // Calculate averages only from messages with valid data
    const messagesWithProcessingTime = transcriptHistory.filter(m => m.processingTime && m.processingTime > 0);
    const avgProcessingTime = messagesWithProcessingTime.length > 0 
      ? messagesWithProcessingTime.reduce((sum, m) => sum + (m.processingTime || 0), 0) / messagesWithProcessingTime.length 
      : 0;
    
    const messagesWithConfidence = transcriptHistory.filter(m => m.confidence && m.confidence > 0);
    const avgConfidence = messagesWithConfidence.length > 0
      ? messagesWithConfidence.reduce((sum, m) => sum + (m.confidence || 0), 0) / messagesWithConfidence.length
      : 0;

    const stats = {
      totalMessages,
      userMessages,
      otherMessages,
      avgProcessingTime: Math.round(avgProcessingTime),
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      sessionDuration: recordingDuration,
      hasRecording: !!recording
    };
    
    // Reduced logging - only log stats periodically
    if (stats.totalMessages % 5 === 0 && stats.totalMessages > 0) {
      console.log('📊 [SESSION STATS] Statistics update:', {
        totalMessages: stats.totalMessages,
        avgConfidence: stats.avgConfidence,
        recordingDuration: stats.recordingDuration
      });
    }
    
    return stats;
  }, [transcriptHistory, participant.id, recordingDuration, recording]);

  // Get session statistics (deprecated - use sessionStats directly)
  const getSessionStats = useCallback(() => {
    return sessionStats;
  }, [sessionStats]);

  // Format duration for display
  const formatDuration = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }, []);

  // Listen for server transcript updates and sync with messages
  useEffect(() => {
    // This will be called by the ChatroomInterface when transcript events are received
    const handleTranscriptUpdate = (message: TranscriptMessage) => {
      console.log(' [TRANSCRIPT HOOK] Received transcript update:', message);
      
      setTranscriptHistory(prev => {
        // Avoid duplicates
        const exists = prev.find(m => m.messageId === message.messageId);
        if (exists) {
          console.log(' [TRANSCRIPT HOOK] Duplicate message, skipping:', message.messageId);
          return prev;
        }
        
        console.log(' [TRANSCRIPT HOOK] Adding message to transcript history. Total will be:', prev.length + 1);
        return [...prev, message];
      });
    };

    // Expose the handler for ChatroomInterface to call
    (window as any).handleTranscriptUpdate = handleTranscriptUpdate;
    
    return () => {
      delete (window as any).handleTranscriptUpdate;
    };
  }, []);

  // Sync transcript history with room messages for statistics
  useEffect(() => {
    // This effect will run when messages change to update statistics
    console.log(' [TRANSCRIPT HOOK] Messages updated, current count:', transcriptHistory.length);
  }, [transcriptHistory]);

  // Download transcript from server
  const downloadServerTranscriptTXT = useCallback(async () => {
    try {
      console.log(' [DOWNLOAD] Requesting TXT transcript from server for room:', roomId);
      const serverUrl = import.meta.env.VITE_BACKEND_URL;
      if (!serverUrl) {
        throw new Error('VITE_BACKEND_URL environment variable is not set');
      }
      const response = await fetch(`${serverUrl}/api/session/${roomId}/transcript?format=txt`);
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Create filename with participant names
      const participantNames = [participant.name];
      if (otherParticipant) participantNames.push(otherParticipant.name);
      const namesStr = participantNames.join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      
      link.download = `neuralecho_transcript_${namesStr}_${dateStr}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(' [DOWNLOAD] TXT transcript downloaded successfully');
    } catch (error) {
      console.error(' [DOWNLOAD] Failed to download server transcript:', error);
      
      // Fallback to local transcript if server fails
      console.log(' [DOWNLOAD] Falling back to local transcript');
      downloadTranscriptTXT();
    }
  }, [roomId, participant.name, otherParticipant, downloadTranscriptTXT]);

  // Download transcript JSON from server
  const downloadServerTranscriptJSON = useCallback(async () => {
    try {
      console.log(' [DOWNLOAD] Requesting JSON transcript from server for room:', roomId);
      const serverUrl = import.meta.env.VITE_BACKEND_URL;
      if (!serverUrl) {
        throw new Error('VITE_BACKEND_URL environment variable is not set');
      }
      const response = await fetch(`${serverUrl}/api/session/${roomId}/transcript?format=json`);
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Create filename with participant names
      const participantNames = [participant.name];
      if (otherParticipant) participantNames.push(otherParticipant.name);
      const namesStr = participantNames.join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      
      link.download = `neuralecho_transcript_${namesStr}_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(' [DOWNLOAD] JSON transcript downloaded successfully');
    } catch (error) {
      console.error(' [DOWNLOAD] Failed to download server transcript JSON:', error);
      
      // Fallback to local transcript if server fails
      console.log(' [DOWNLOAD] Falling back to local transcript');
      downloadTranscriptJSON();
    }
  }, [roomId, participant.name, otherParticipant, downloadTranscriptJSON]);

  return {
    // Transcript management
    transcriptHistory,
    addTranscriptMessage,
    getTranscriptForUser,
    clearTranscriptHistory,
    
    // Recording management
    recording,
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    downloadRecording,
    
    // Download functions
    downloadTranscriptTXT,
    downloadTranscriptJSON,
    downloadServerTranscriptTXT,
    downloadServerTranscriptJSON,
    generateTranscriptDownload,
    
    // Utilities
    getSessionStats,
    sessionStats,
    formatDuration
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        stopRecording();
      }
      // Cleanup audio context and element
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (translatedAudioElementRef.current) {
        translatedAudioElementRef.current.pause();
        translatedAudioElementRef.current.src = '';
        translatedAudioElementRef.current = null;
      }
    };
  }, [isRecording, stopRecording]);
}
