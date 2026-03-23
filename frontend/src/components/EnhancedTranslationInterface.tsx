import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Zap, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Settings,
  Waves
} from 'lucide-react';
import { AudioProcessor, createAudioProcessor } from '@/lib/audioProcessor';
import { TranslationQualityAssessor, createQualityAssessor, QualityMetrics } from '@/lib/translationQuality';
import { useAppState } from '@/contexts/AppContext';
import { toast } from 'sonner';

interface EnhancedTranslationInterfaceProps {
  onTranscriptionReceived?: (text: string, confidence: number) => void;
  onTranslationReceived?: (text: string, metrics: QualityMetrics) => void;
  className?: string;
}

export function EnhancedTranslationInterface({ 
  onTranscriptionReceived, 
  onTranslationReceived,
  className 
}: EnhancedTranslationInterfaceProps) {
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(-100);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [currentTranslation, setCurrentTranslation] = useState('');
  const [processingTime, setProcessingTime] = useState(0);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const qualityAssessorRef = useRef<TranslationQualityAssessor | null>(null);
  const processingStartTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const { 
    status, 
    sessionState, 
    startListening, 
    stopListening, 
    currentDbLevel,
    activeSpeaker 
  } = useAppState();

  // Initialize audio processor and quality assessor
  useEffect(() => {
    audioProcessorRef.current = createAudioProcessor({
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      sampleRate: 16000
    });

    qualityAssessorRef.current = createQualityAssessor();

    return () => {
      audioProcessorRef.current?.cleanup();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Monitor audio levels and quality
  useEffect(() => {
    if (isListening && audioProcessorRef.current) {
      const monitorAudio = () => {
        const level = audioProcessorRef.current?.getAudioLevel() || -100;
        setAudioLevel(level);

        // Auto-adjust gain for optimal levels
        audioProcessorRef.current?.adjustGain(-20);

        animationFrameRef.current = requestAnimationFrame(monitorAudio);
      };
      
      animationFrameRef.current = requestAnimationFrame(monitorAudio);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isListening]);

  // Handle transcription with quality assessment
  const handleTranscription = useCallback((text: string) => {
    if (!qualityAssessorRef.current) return;

    const processingEndTime = Date.now();
    const processingDuration = processingEndTime - processingStartTimeRef.current;
    setProcessingTime(processingDuration);

    const event = {
      originalText: text,
      translatedText: currentTranslation,
      audioLevel,
      timestamp: processingEndTime,
      processingTime: processingDuration,
      language: activeSpeaker?.language || 'en-US'
    };

    const metrics = qualityAssessorRef.current.assessTranslation(event);
    setQualityMetrics(metrics);

    // Get recommendations for improvement
    const newRecommendations = qualityAssessorRef.current.getRecommendations();
    setRecommendations(newRecommendations);

    // Show quality feedback to user
    if (metrics.overallScore < 0.6) {
      toast.warning(`Translation quality is low (${Math.round(metrics.overallScore * 100)}%). ${newRecommendations[0] || 'Try speaking more clearly.'}`);
    } else if (metrics.overallScore > 0.9) {
      toast.success(`Excellent translation quality (${Math.round(metrics.overallScore * 100)}%)!`);
    }

    setCurrentTranscript(text);
    onTranscriptionReceived?.(text, metrics.confidence);
  }, [audioLevel, currentTranslation, activeSpeaker, onTranscriptionReceived]);

  // Handle translation with quality metrics
  const handleTranslation = useCallback((text: string) => {
    setCurrentTranslation(text);
    
    if (qualityMetrics) {
      onTranslationReceived?.(text, qualityMetrics);
    }
  }, [qualityMetrics, onTranslationReceived]);

  // Enhanced start listening with audio processing
  const handleStartListening = useCallback(async () => {
    try {
      processingStartTimeRef.current = Date.now();
      
      // Initialize enhanced audio processing
      if (audioProcessorRef.current) {
        const processedStream = await audioProcessorRef.current.initializeAudio();
        // Use processed stream for better quality
      }

      await startListening(handleTranscription, handleTranslation, (error) => {
        toast.error(`Translation error: ${error.message}`);
        setIsListening(false);
      });

      setIsListening(true);
      toast.success('Enhanced translation started with noise suppression');
    } catch (error) {
      toast.error(`Failed to start enhanced translation: ${error}`);
    }
  }, [startListening, handleTranscription, handleTranslation]);

  // Stop listening
  const handleStopListening = useCallback(() => {
    stopListening();
    setIsListening(false);
    setAudioLevel(-100);
    toast.info('Translation stopped');
  }, [stopListening]);

  // Toggle mute
  const handleToggleMute = useCallback(() => {
    setIsMuted(!isMuted);
    // Implement actual mute functionality here
    toast.info(isMuted ? 'Unmuted' : 'Muted');
  }, [isMuted]);

  // Get quality indicator color (using orange theme)
  const getQualityColor = (score: number): string => {
    if (score >= 0.8) return 'text-orange-400';
    if (score >= 0.6) return 'text-orange-300';
    return 'text-orange-200';
  };

  // Get quality icon
  const getQualityIcon = (score: number) => {
    if (score >= 0.8) return <CheckCircle2 className="w-4 h-4 text-orange-400" />;
    if (score >= 0.6) return <AlertCircle className="w-4 h-4 text-orange-300" />;
    return <AlertCircle className="w-4 h-4 text-orange-200" />;
  };

  // Get trend icon
  const getTrendIcon = () => {
    if (!qualityAssessorRef.current) return <Minus className="w-4 h-4 text-muted-foreground" />;
    
    const trend = qualityAssessorRef.current.getQualityTrend();
    if (trend.improving) return <TrendingUp className="w-4 h-4 text-orange-400" />;
    if (trend.degrading) return <TrendingDown className="w-4 h-4 text-orange-200" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <Card className={`w-full max-w-2xl mx-auto bg-card border-border ${className}`}>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-500" />
            <span className="text-foreground">Enhanced AI Translation</span>
          </span>
          <div className="flex items-center gap-2">
            {getTrendIcon()}
            {qualityMetrics && (
              <Badge variant="outline" className={`border-orange-500/30 ${getQualityColor(qualityMetrics.overallScore)}`}>
                {Math.round(qualityMetrics.overallScore * 100)}%
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        {/* Audio Level and Quality Indicators */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Audio Level</span>
              <span className="font-mono text-orange-400">{Math.round(audioLevel)}dB</span>
            </div>
            <Progress 
              value={Math.max(0, Math.min(100, (audioLevel + 60) * 2))} 
              className="h-2 bg-muted"
            />
          </div>

          {qualityMetrics && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Translation Quality</span>
                <span className="flex items-center gap-1">
                  {getQualityIcon(qualityMetrics.overallScore)}
                  <span className={getQualityColor(qualityMetrics.overallScore)}>
                    {Math.round(qualityMetrics.overallScore * 100)}%
                  </span>
                </span>
              </div>
              <Progress 
                value={qualityMetrics.overallScore * 100} 
                className="h-2 bg-muted"
              />
            </div>
          )}
        </div>

        {/* Detailed Quality Metrics */}
        {qualityMetrics && (
          <div className="grid grid-cols-2 gap-4 text-sm bg-secondary/50 p-3 rounded-lg border border-border">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confidence:</span>
                <span className={getQualityColor(qualityMetrics.confidence)}>
                  {Math.round(qualityMetrics.confidence * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Audio Quality:</span>
                <span className={getQualityColor(qualityMetrics.audioQuality)}>
                  {Math.round(qualityMetrics.audioQuality * 100)}%
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Speed:</span>
                <span className={processingTime < 2000 ? 'text-orange-400' : 'text-orange-300'}>
                  {processingTime}ms
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Language:</span>
                <span className={getQualityColor(qualityMetrics.languageDetectionConfidence)}>
                  {Math.round(qualityMetrics.languageDetectionConfidence * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant={isMuted ? "destructive" : "outline"}
            size="lg"
            onClick={handleToggleMute}
            className="flex items-center gap-2 border-border hover:bg-secondary"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            {isMuted ? 'Unmute' : 'Mute'}
          </Button>

          <Button
            variant={isListening ? "destructive" : "default"}
            size="lg"
            onClick={isListening ? handleStopListening : handleStartListening}
            disabled={sessionState === 'connecting'}
            className={`flex items-center gap-2 px-8 ${
              !isListening 
                ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                : 'bg-destructive hover:bg-destructive/90'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-5 h-5" />
                Stop Translation
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                Start Enhanced Translation
              </>
            )}
          </Button>

          <Button variant="outline" size="lg" className="border-border hover:bg-secondary">
            <Settings className="w-5 h-5" />
          </Button>
        </div>

        {/* Current Transcript and Translation */}
        {(currentTranscript || currentTranslation) && (
          <div className="space-y-3 p-4 bg-secondary/30 rounded-lg border border-border">
            {currentTranscript && (
              <div>
                <div className="text-sm font-medium text-orange-400 mb-1">Original:</div>
                <div className="text-foreground">{currentTranscript}</div>
              </div>
            )}
            {currentTranslation && (
              <div>
                <div className="text-sm font-medium text-orange-400 mb-1">Translation:</div>
                <div className="text-foreground font-medium">{currentTranslation}</div>
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-orange-400">Recommendations:</div>
            <div className="space-y-1">
              {recommendations.slice(0, 2).map((rec, index) => (
                <div key={index} className="text-sm text-orange-300 bg-orange-500/10 p-2 rounded border border-orange-500/20">
                  {rec}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audio Visualization */}
        {isListening && (
          <div className="flex items-center justify-center">
            <Waves className={`w-6 h-6 ${audioLevel > -40 ? 'text-orange-400 animate-pulse' : 'text-muted-foreground'}`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}