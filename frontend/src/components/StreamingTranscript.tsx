import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface StreamingTranscriptProps {
  /** Current partial transcript text */
  text: string;
  /** Whether the transcript is complete */
  isComplete: boolean;
  /** Whether to show typing indicator */
  showTypingIndicator?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Animation speed in milliseconds per word */
  animationSpeed?: number;
  /** Whether to enable word-by-word animation */
  enableAnimation?: boolean;
}

interface WordState {
  word: string;
  isVisible: boolean;
  animationDelay: number;
}

const StreamingTranscriptComponent = memo(function StreamingTranscript({
  text,
  isComplete,
  showTypingIndicator = false,
  className,
  animationSpeed = 100,
  enableAnimation = true
}: StreamingTranscriptProps) {
  const [words, setWords] = useState<WordState[]>([]);
  const [displayedText, setDisplayedText] = useState('');
  const previousTextRef = useRef('');
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoized word processing
  const processWords = useCallback((newText: string) => {
    const newWords = newText.split(/\s+/).filter(word => word.length > 0);
    const previousWords = previousTextRef.current.split(/\s+/).filter(word => word.length > 0);
    
    // If text is shorter than before, it might be a correction - reset
    if (newWords.length < previousWords.length) {
      setWords([]);
      setDisplayedText('');
    }
    
    // Create word states with animation delays
    const wordStates: WordState[] = newWords.map((word, index) => {
      const wasVisible = index < previousWords.length && previousWords[index] === word;
      return {
        word,
        isVisible: !enableAnimation || wasVisible,
        animationDelay: enableAnimation ? index * animationSpeed : 0
      };
    });
    
    setWords(wordStates);
    previousTextRef.current = newText;
    
    // If animation is disabled, show all text immediately
    if (!enableAnimation) {
      setDisplayedText(newText);
      return;
    }
    
    // Clear any existing animation timeout
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }
    
    // Animate new words appearing
    const newWordsStartIndex = previousWords.length;
    if (newWordsStartIndex < newWords.length) {
      animateWords(wordStates, newWordsStartIndex);
    }
  }, [animationSpeed, enableAnimation]);

  // Process text changes
  useEffect(() => {
    if (text === previousTextRef.current) return;
    processWords(text);
  }, [text, processWords]);

  // Animate words appearing one by one
  const animateWords = useCallback((wordStates: WordState[], startIndex: number) => {
    let currentIndex = startIndex;
    
    const showNextWord = () => {
      if (currentIndex >= wordStates.length) return;
      
      setWords(prev => 
        prev.map((word, index) => 
          index === currentIndex ? { ...word, isVisible: true } : word
        )
      );
      
      // Update displayed text
      const visibleWords = wordStates
        .slice(0, currentIndex + 1)
        .map(w => w.word);
      setDisplayedText(visibleWords.join(' '));
      
      currentIndex++;
      
      if (currentIndex < wordStates.length) {
        animationTimeoutRef.current = setTimeout(showNextWord, animationSpeed);
      }
    };
    
    // Start animation
    if (startIndex < wordStates.length) {
      animationTimeoutRef.current = setTimeout(showNextWord, animationSpeed);
    }
  }, [animationSpeed]);

  // Update displayed text when words visibility changes
  useEffect(() => {
    if (!enableAnimation) return;
    
    const visibleWords = words
      .filter(word => word.isVisible)
      .map(word => word.word);
    setDisplayedText(visibleWords.join(' '));
  }, [words, enableAnimation]);

  // Cleanup animation timeout on unmount
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // Handle completion animation
  useEffect(() => {
    if (isComplete && enableAnimation) {
      // Add a subtle completion effect
      const element = document.querySelector('[data-streaming-transcript]');
      if (element) {
        element.classList.add('animate-pulse');
        setTimeout(() => {
          element.classList.remove('animate-pulse');
        }, 500);
      }
    }
  }, [isComplete, enableAnimation]);

  if (!text && !showTypingIndicator) {
    return null;
  }

  return (
    <div
      data-streaming-transcript
      className={cn(
        'streaming-transcript',
        'transition-all duration-300 ease-in-out',
        isComplete ? 'opacity-100' : 'opacity-90',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={isComplete ? 'Transcript complete' : 'Transcript in progress'}
    >
      {/* Main transcript text */}
      <div className="transcript-text">
        {enableAnimation ? (
          <span className="inline-flex flex-wrap gap-1">
            {words.map((wordState, index) => (
              <span
                key={`${wordState.word}-${index}`}
                className={cn(
                  'transition-all duration-200 ease-in-out',
                  wordState.isVisible 
                    ? 'opacity-100 transform translate-y-0' 
                    : 'opacity-0 transform translate-y-1'
                )}
                style={{
                  transitionDelay: `${wordState.animationDelay}ms`
                }}
              >
                {wordState.word}
              </span>
            ))}
          </span>
        ) : (
          <span>{displayedText}</span>
        )}
      </div>

      {/* Typing indicator */}
      {showTypingIndicator && !isComplete && (
        <span 
          className="typing-indicator ml-1 inline-flex items-center"
          aria-label="Typing"
        >
          <span className="animate-pulse">...</span>
        </span>
      )}

      {/* Completion indicator */}
      {isComplete && (
        <span 
          className="completion-indicator ml-1 text-green-500 opacity-75"
          aria-label="Complete"
        >
          ✓
        </span>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.text === nextProps.text &&
    prevProps.isComplete === nextProps.isComplete &&
    prevProps.showTypingIndicator === nextProps.showTypingIndicator &&
    prevProps.enableAnimation === nextProps.enableAnimation &&
    prevProps.animationSpeed === nextProps.animationSpeed &&
    prevProps.className === nextProps.className
  );
});

// Utility component for word-by-word streaming with custom styling
export const StreamingWord = memo(function StreamingWord({ 
  word, 
  isVisible, 
  delay = 0,
  className 
}: { 
  word: string; 
  isVisible: boolean; 
  delay?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block transition-all duration-200 ease-in-out',
        isVisible 
          ? 'opacity-100 transform translate-y-0 scale-100' 
          : 'opacity-0 transform translate-y-2 scale-95',
        className
      )}
      style={{
        transitionDelay: `${delay}ms`
      }}
    >
      {word}
    </span>
  );
});

export { StreamingTranscriptComponent as StreamingTranscript };
export default StreamingTranscriptComponent;