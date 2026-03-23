/**
 * Translation Quality Assessment and Confidence Scoring
 * Provides real-time feedback on translation accuracy and audio quality
 */

export interface QualityMetrics {
  confidence: number; // 0-1 scale
  audioQuality: number; // 0-1 scale
  translationSpeed: number; // milliseconds
  languageDetectionConfidence: number; // 0-1 scale
  overallScore: number; // 0-1 scale
}

export interface TranslationEvent {
  originalText: string;
  translatedText: string;
  audioLevel: number;
  timestamp: number;
  processingTime: number;
  language: string;
}

export class TranslationQualityAssessor {
  private recentEvents: TranslationEvent[] = [];
  private maxHistorySize = 10;
  private languagePatterns: Map<string, RegExp> = new Map();

  constructor() {
    this.initializeLanguagePatterns();
  }

  /**
   * Initialize language detection patterns
   */
  private initializeLanguagePatterns(): void {
    // English patterns
    this.languagePatterns.set('en-US', /\b(the|and|or|but|in|on|at|to|for|of|with|by)\b/gi);
    
    // French patterns
    this.languagePatterns.set('fr-CA', /\b(le|la|les|et|ou|mais|dans|sur||pour|de|avec|par|que|qui|ce|cette|ces)\b/gi);
  }

  /**
   * Assess translation quality and provide confidence score
   */
  assessTranslation(event: TranslationEvent): QualityMetrics {
    // Store event for trend analysis
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxHistorySize) {
      this.recentEvents.shift();
    }

    const confidence = this.calculateConfidence(event);
    const audioQuality = this.assessAudioQuality(event.audioLevel);
    const translationSpeed = event.processingTime;
    const languageDetectionConfidence = this.assessLanguageDetection(event);
    const overallScore = this.calculateOverallScore(confidence, audioQuality, translationSpeed, languageDetectionConfidence);

    return {
      confidence,
      audioQuality,
      translationSpeed,
      languageDetectionConfidence,
      overallScore
    };
  }

  /**
   * Calculate translation confidence based on various factors
   */
  private calculateConfidence(event: TranslationEvent): number {
    let confidence = 0.8; // Base confidence

    // Factor 1: Text length and completeness
    const textLengthFactor = this.assessTextLength(event.originalText);
    confidence *= textLengthFactor;

    // Factor 2: Processing time (faster usually means more confident)
    const speedFactor = this.assessProcessingSpeed(event.processingTime);
    confidence *= speedFactor;

    // Factor 3: Audio quality
    const audioFactor = this.assessAudioQuality(event.audioLevel);
    confidence *= audioFactor;

    // Factor 4: Consistency with recent translations
    const consistencyFactor = this.assessConsistency(event);
    confidence *= consistencyFactor;

    // Factor 5: Language-specific indicators
    const languageFactor = this.assessLanguageSpecificFactors(event);
    confidence *= languageFactor;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Assess text length and completeness
   */
  private assessTextLength(text: string): number {
    if (!text || text.trim().length === 0) return 0;
    
    const wordCount = text.trim().split(/\s+/).length;
    
    // Very short texts might be incomplete
    if (wordCount < 2) return 0.6;
    if (wordCount < 4) return 0.8;
    
    // Optimal length range
    if (wordCount >= 4 && wordCount <= 20) return 1.0;
    
    // Very long texts might have errors
    if (wordCount > 30) return 0.9;
    
    return 0.95;
  }

  /**
   * Assess processing speed impact on confidence
   */
  private assessProcessingSpeed(processingTime: number): number {
    // Optimal range: 500-2000ms
    if (processingTime < 200) return 0.7; // Too fast, might be cached/error
    if (processingTime <= 2000) return 1.0; // Optimal range
    if (processingTime <= 4000) return 0.9; // Acceptable
    if (processingTime <= 6000) return 0.8; // Slow but okay
    return 0.6; // Very slow, likely issues
  }

  /**
   * Assess audio quality impact
   */
  private assessAudioQuality(audioLevel: number): number {
    // Convert dB to quality score
    if (audioLevel < -60) return 0.3; // Very quiet
    if (audioLevel < -40) return 0.6; // Quiet
    if (audioLevel < -20) return 0.9; // Good
    if (audioLevel < -10) return 1.0; // Excellent
    if (audioLevel < -3) return 0.9; // Loud but okay
    return 0.7; // Too loud, might be clipping
  }

  /**
   * Assess consistency with recent translations
   */
  private assessConsistency(currentEvent: TranslationEvent): number {
    if (this.recentEvents.length < 2) return 1.0;

    const recentSpeeds = this.recentEvents.slice(-3).map(e => e.processingTime);
    const avgSpeed = recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length;
    const speedVariation = Math.abs(currentEvent.processingTime - avgSpeed) / avgSpeed;

    // Lower variation means more consistent performance
    if (speedVariation < 0.2) return 1.0;
    if (speedVariation < 0.5) return 0.9;
    if (speedVariation < 1.0) return 0.8;
    return 0.7;
  }

  /**
   * Assess language-specific factors
   */
  private assessLanguageSpecificFactors(event: TranslationEvent): number {
    const pattern = this.languagePatterns.get(event.language);
    if (!pattern) return 0.8; // Unknown language

    const matches = event.originalText.match(pattern);
    const matchRatio = matches ? matches.length / event.originalText.split(/\s+/).length : 0;

    // Higher match ratio indicates better language detection
    if (matchRatio > 0.3) return 1.0;
    if (matchRatio > 0.2) return 0.9;
    if (matchRatio > 0.1) return 0.8;
    return 0.7;
  }

  /**
   * Assess language detection confidence
   */
  private assessLanguageDetection(event: TranslationEvent): number {
    return this.assessLanguageSpecificFactors(event);
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallScore(
    confidence: number,
    audioQuality: number,
    translationSpeed: number,
    languageDetectionConfidence: number
  ): number {
    // Weighted average of all factors
    const speedScore = Math.max(0, Math.min(1, 1 - (translationSpeed - 1000) / 5000));
    
    return (
      confidence * 0.4 +
      audioQuality * 0.25 +
      speedScore * 0.2 +
      languageDetectionConfidence * 0.15
    );
  }

  /**
   * Get quality trend over recent translations
   */
  getQualityTrend(): {
    improving: boolean;
    stable: boolean;
    degrading: boolean;
    averageScore: number;
  } {
    if (this.recentEvents.length < 3) {
      return { improving: false, stable: true, degrading: false, averageScore: 0.8 };
    }

    const recentScores = this.recentEvents.slice(-5).map(event => 
      this.assessTranslation(event).overallScore
    );

    const averageScore = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    
    // Calculate trend
    const firstHalf = recentScores.slice(0, Math.floor(recentScores.length / 2));
    const secondHalf = recentScores.slice(Math.floor(recentScores.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const improvement = secondAvg - firstAvg;
    
    return {
      improving: improvement > 0.05,
      stable: Math.abs(improvement) <= 0.05,
      degrading: improvement < -0.05,
      averageScore
    };
  }

  /**
   * Get recommendations for improving translation quality
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.recentEvents.length === 0) return recommendations;

    const latestEvent = this.recentEvents[this.recentEvents.length - 1];
    const metrics = this.assessTranslation(latestEvent);

    if (metrics.audioQuality < 0.7) {
      recommendations.push("Improve audio quality: Move closer to microphone or reduce background noise");
    }

    if (metrics.translationSpeed > 3000) {
      recommendations.push("Network or processing delay detected: Check internet connection");
    }

    if (metrics.languageDetectionConfidence < 0.7) {
      recommendations.push("Speak more clearly or use more common words for better recognition");
    }

    if (metrics.confidence < 0.6) {
      recommendations.push("Try speaking in shorter, clearer sentences");
    }

    const trend = this.getQualityTrend();
    if (trend.degrading) {
      recommendations.push("Translation quality is declining: Consider taking a break or checking your setup");
    }

    return recommendations;
  }

  /**
   * Reset quality history
   */
  reset(): void {
    this.recentEvents = [];
  }
}

/**
 * Utility function to create a quality assessor
 */
export function createQualityAssessor(): TranslationQualityAssessor {
  return new TranslationQualityAssessor();
}