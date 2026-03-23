import React, { useEffect, useState, memo, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface TranslatingIndicatorProps {
  /** Whether to show the indicator */
  isVisible: boolean;
  /** Participant name who is speaking */
  participantName?: string;
  /** Source language being spoken */
  sourceLanguage?: string;
  /** Target language being translated to */
  targetLanguage?: string;
  /** Current audio level (0-1) for voice activity visualization */
  audioLevel?: number;
  /** Additional CSS classes */
  className?: string;
  /** Custom indicator text */
  customText?: string;
  /** Animation style variant */
  variant?: 'dots' | 'pulse' | 'wave' | 'typing';
}

const LANGUAGE_NAMES: Record<string, string> = {
  'en-US': 'English',
  'fr-CA': 'French',
  'es-ES': 'Spanish',
  'de-DE': 'German',
  'it-IT': 'Italian',
  'pt-BR': 'Portuguese',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'zh-CN': 'Chinese'
};

const TranslatingIndicatorComponent = memo(function TranslatingIndicator({
  isVisible,
  participantName,
  sourceLanguage,
  targetLanguage,
  audioLevel = 0,
  className,
  customText,
  variant = 'dots'
}: TranslatingIndicatorProps) {
  const [animationPhase, setAnimationPhase] = useState(0);

  // Cycle animation phases
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setAnimationPhase(prev => (prev + 1) % 4);
    }, 500);

    return () => clearInterval(interval);
  }, [isVisible]);

  // Reset animation when becoming visible
  useEffect(() => {
    if (isVisible) {
      setAnimationPhase(0);
    }
  }, [isVisible]);

  // Memoized animation renderer
  const renderAnimation = useCallback(() => {
    switch (variant) {
      case 'dots':
        return (
          <span className="inline-flex items-center space-x-1">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className={cn(
                  'w-2 h-2 bg-current rounded-full transition-all duration-300',
                  animationPhase === i ? 'opacity-100 scale-125' : 'opacity-40 scale-100'
                )}
              />
            ))}
          </span>
        );

      case 'pulse':
        return (
          <span className="inline-flex items-center">
            <span
              className={cn(
                'w-3 h-3 bg-current rounded-full transition-all duration-500',
                'animate-pulse'
              )}
            />
          </span>
        );

      case 'wave':
        return (
          <span className="inline-flex items-center space-x-1">
            {[0, 1, 2, 3].map(i => (
              <span
                key={i}
                className={cn(
                  'w-1 bg-current rounded-full transition-all duration-300',
                  animationPhase === i ? 'h-4 opacity-100' : 'h-2 opacity-60'
                )}
                style={{
                  transitionDelay: `${i * 100}ms`
                }}
              />
            ))}
          </span>
        );

      case 'typing':
        return (
          <span className="inline-flex items-center">
            <span className="animate-pulse">
              {'.'.repeat((animationPhase % 3) + 1)}
            </span>
          </span>
        );

      default:
        return null;
    }
  }, [variant, animationPhase]);

  // Memoized language names
  const sourceLangName = sourceLanguage ? LANGUAGE_NAMES[sourceLanguage] || sourceLanguage : '';
  const targetLangName = targetLanguage ? LANGUAGE_NAMES[targetLanguage] || targetLanguage : '';

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        'translating-indicator',
        'flex items-center space-x-2 px-3 py-2 rounded-lg',
        'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
        'border border-blue-200 dark:border-blue-800',
        'transition-all duration-300 ease-in-out',
        'animate-in slide-in-from-top-2 fade-in-0',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={customText || `${participantName || 'Someone'} is speaking, translating...`}
    >
      {/* Voice activity visualization */}
      {audioLevel > 0 && (
        <div className="flex items-center space-x-1">
          <div className="flex items-end space-x-0.5 h-4">
            {[0.3, 0.6, 0.9, 0.4, 0.7].map((threshold, i) => (
              <div
                key={i}
                className={cn(
                  'w-1 bg-current rounded-full transition-all duration-150',
                  audioLevel > threshold ? 'opacity-100' : 'opacity-30'
                )}
                style={{
                  height: `${Math.max(4, audioLevel * 16)}px`
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Animation */}
      <div className="flex items-center">
        {renderAnimation()}
      </div>

      {/* Text content */}
      <div className="flex flex-col">
        {customText ? (
          <span className="text-sm font-medium">{customText}</span>
        ) : (
          <>
            <span className="text-sm font-medium">
              {participantName ? `${participantName} is speaking...` : 'Translating...'}
            </span>
            {sourceLangName && targetLangName && (
              <span className="text-xs opacity-75">
                {sourceLangName} → {targetLangName}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.isVisible === nextProps.isVisible &&
    prevProps.participantName === nextProps.participantName &&
    prevProps.sourceLanguage === nextProps.sourceLanguage &&
    prevProps.targetLanguage === nextProps.targetLanguage &&
    Math.abs((prevProps.audioLevel || 0) - (nextProps.audioLevel || 0)) < 0.1 && // Only re-render if audio level changes significantly
    prevProps.customText === nextProps.customText &&
    prevProps.variant === nextProps.variant &&
    prevProps.className === nextProps.className
  );
});

// Simplified voice activity indicator
export const VoiceActivityIndicator = memo(function VoiceActivityIndicator({
  isActive,
  audioLevel = 0,
  className
}: {
  isActive: boolean;
  audioLevel?: number;
  className?: string;
}) {
  if (!isActive) return null;

  return (
    <div
      className={cn(
        'voice-activity-indicator',
        'flex items-center space-x-1 px-2 py-1 rounded-full',
        'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
        'border border-green-200 dark:border-green-800',
        className
      )}
      role="status"
      aria-label="Voice activity detected"
    >
      <div className="flex items-end space-x-0.5 h-3">
        {[0.2, 0.5, 0.8, 0.3, 0.6].map((threshold, i) => (
          <div
            key={i}
            className={cn(
              'w-0.5 bg-current rounded-full transition-all duration-100',
              audioLevel > threshold ? 'opacity-100' : 'opacity-30'
            )}
            style={{
              height: `${Math.max(2, audioLevel * 12)}px`
            }}
          />
        ))}
      </div>
      <span className="text-xs font-medium">Speaking</span>
    </div>
  );
});

export { TranslatingIndicatorComponent as TranslatingIndicator };
export default TranslatingIndicatorComponent;