/**
 * Transcript Display Component
 * Shows conversation history in user's preferred language
 */

import { useEffect, useRef } from 'react';
import { TranscriptMessage, ChatroomParticipant } from '@/types/chatroom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, User, Languages, Mic } from 'lucide-react';

interface TranscriptDisplayProps {
  transcriptHistory: TranscriptMessage[];
  currentParticipant: ChatroomParticipant;
  otherParticipant?: ChatroomParticipant | null;
  className?: string;
}

export function TranscriptDisplay({ 
  transcriptHistory, 
  currentParticipant, 
  otherParticipant,
  className = "" 
}: TranscriptDisplayProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [transcriptHistory.length]);

  const getLanguageDisplay = (lang: 'en-US' | 'fr-CA') => {
    return lang === 'en-US' ? ' English' : ' Franais';
  };

  const getParticipantName = (speakerId: string) => {
    if (speakerId === currentParticipant.id) return currentParticipant.name;
    if (otherParticipant && speakerId === otherParticipant.id) return otherParticipant.name;
    return 'Unknown';
  };

  const getDisplayText = (message: TranscriptMessage) => {
    // ENHANCED BILINGUAL DISPLAY RULES:
    // For own messages: show both original AND translation
    // For other's messages: show translation in your language
    const isOwnMessage = message.speakerId === currentParticipant.id;
    const shouldShowOriginal = currentParticipant.language === message.sourceLanguage;
    
    if (isOwnMessage) {
      // For own messages, return both texts
      return {
        primary: message.originalTranscript,
        secondary: message.translatedTranscript,
        showBoth: true
      };
    } else {
      // For other's messages, show translation in your language
      const text = shouldShowOriginal ? message.originalTranscript : message.translatedTranscript;
      return {
        primary: text,
        secondary: null,
        showBoth: false
      };
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (transcriptHistory.length === 0) {
    return (
      <Card className={`h-full ${className}`}>
        <CardContent className="flex items-center justify-center h-full p-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
              <Languages className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No conversation yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Start speaking to see the transcript appear here
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`h-full ${className}`}>
      <CardContent className="p-0 h-full">
        <ScrollArea className="h-full" ref={scrollAreaRef}>
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Conversation Transcript</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {transcriptHistory.length} messages
              </Badge>
            </div>

            {/* Messages */}
            <div className="space-y-3">
              {transcriptHistory.map((message, index) => {
                const isOwnMessage = message.speakerId === currentParticipant.id;
                const displayText = getDisplayText(message);
                const speakerName = getParticipantName(message.speakerId);
                
                return (
                  <div
                    key={message.messageId}
                    className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] space-y-1`}>
                      {/* Message header */}
                      <div className={`flex items-center gap-2 text-xs text-muted-foreground ${
                        isOwnMessage ? 'justify-end' : 'justify-start'
                      }`}>
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span className="font-medium">{speakerName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatTime(message.timestamp)}</span>
                        </div>
                        {currentParticipant.language !== message.sourceLanguage && (
                          <div className="flex items-center gap-1">
                            <Languages className="w-3 h-3" />
                            <span>Translated</span>
                          </div>
                        )}
                      </div>

                      {/* Message bubble */}
                      <div className={`rounded-lg p-3 ${
                        isOwnMessage 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-secondary text-foreground border border-border'
                      }`}>
                        {displayText.showBoth ? (
                          // Show both original and translation for own messages
                          <div className="text-sm leading-relaxed">
                            <p className="mb-2">{displayText.primary}</p>
                            <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'} italic border-l-2 pl-2 ${isOwnMessage ? 'border-primary-foreground/30' : 'border-muted-foreground/30'}`}>
                               {displayText.secondary}
                            </p>
                          </div>
                        ) : (
                          // Show only one text for other's messages
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {displayText.primary}
                          </p>
                        )}
                        
                        {/* Message metadata */}
                        <div className={`flex items-center gap-3 mt-2 text-xs ${
                          isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        }`}>
                          <div className="flex items-center gap-1">
                            <Mic className="w-3 h-3" />
                            <span>{getLanguageDisplay(message.sourceLanguage)}</span>
                          </div>
                          {displayText.showBoth && (
                            <div className="flex items-center gap-1">
                              <Languages className="w-3 h-3" />
                              <span> {getLanguageDisplay(message.targetLanguage)}</span>
                            </div>
                          )}
                          {message.confidence && (
                            <div>
                              Confidence: {Math.round(message.confidence * 100)}%
                            </div>
                          )}
                          {message.processingTime && (
                            <div>
                              {Math.round(message.processingTime)}ms
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Show original text for translated messages (only for other's messages) */}
                      {!displayText.showBoth && currentParticipant.language !== message.sourceLanguage && (
                        <div className="text-xs text-muted-foreground italic pl-3 border-l-2 border-muted">
                          <span className="font-medium">Original ({getLanguageDisplay(message.sourceLanguage)}):</span> {message.originalTranscript}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
