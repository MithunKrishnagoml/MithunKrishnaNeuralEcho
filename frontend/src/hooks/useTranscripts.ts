/**
 * useTranscripts - Manage realtime transcript state for both input and output
 */

import { useState, useCallback } from 'react';

export interface TranscriptMessage {
  id: string;
  text: string;
  timestamp: number;
}

export interface TranscriptLane {
  partialText: string;
  messages: TranscriptMessage[];
}

export interface UseTranscriptsReturn {
  myTranscript: TranscriptLane;
  theirTranscript: TranscriptLane;
  handleInputDelta: (text: string) => void;
  handleInputDone: (text: string) => void;
  handleOutputDelta: (text: string) => void;
  handleOutputDone: (text: string) => void;
  clearMyTranscript: () => void;
  clearTheirTranscript: () => void;
  clearAllTranscripts: () => void;
}

const initialLane: TranscriptLane = {
  partialText: '',
  messages: [],
};

export function useTranscripts(): UseTranscriptsReturn {
  const [myTranscript, setMyTranscript] = useState<TranscriptLane>(initialLane);
  const [theirTranscript, setTheirTranscript] = useState<TranscriptLane>(initialLane);

  // Handle input transcript delta (my own words streaming)
  const handleInputDelta = useCallback((text: string) => {
    setMyTranscript(prev => ({
      ...prev,
      partialText: prev.partialText + text,
    }));
  }, []);

  // Handle input transcript done (my own words finalized)
  const handleInputDone = useCallback((text: string) => {
    setMyTranscript(prev => ({
      partialText: '',
      messages: [
        ...prev.messages,
        {
          id: crypto.randomUUID(),
          text: text,
          timestamp: Date.now(),
        },
      ],
    }));
  }, []);

  // Handle output transcript delta (translated text streaming)
  const handleOutputDelta = useCallback((text: string) => {
    setTheirTranscript(prev => ({
      ...prev,
      partialText: prev.partialText + text,
    }));
  }, []);

  // Handle output transcript done (translated text finalized)
  const handleOutputDone = useCallback((text: string) => {
    setTheirTranscript(prev => ({
      partialText: '',
      messages: [
        ...prev.messages,
        {
          id: crypto.randomUUID(),
          text: text,
          timestamp: Date.now(),
        },
      ],
    }));
  }, []);

  // Clear my transcript
  const clearMyTranscript = useCallback(() => {
    setMyTranscript(initialLane);
  }, []);

  // Clear their transcript
  const clearTheirTranscript = useCallback(() => {
    setTheirTranscript(initialLane);
  }, []);

  // Clear all transcripts
  const clearAllTranscripts = useCallback(() => {
    setMyTranscript(initialLane);
    setTheirTranscript(initialLane);
  }, []);

  return {
    myTranscript,
    theirTranscript,
    handleInputDelta,
    handleInputDone,
    handleOutputDelta,
    handleOutputDone,
    clearMyTranscript,
    clearTheirTranscript,
    clearAllTranscripts,
  };
}
