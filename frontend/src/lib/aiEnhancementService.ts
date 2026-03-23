/**
 * AI Enhancement Service - Comprehensive AI improvements for seamless communication
 * Integrates audio processing, quality assessment, and performance optimization
 */

import { AudioProcessor, createAudioProcessor } from './audioProcessor';
import { TranslationQualityAssessor, createQualityAssessor, QualityMetrics } from './translationQuality';

export interface AIEnhancementConfig {
  enableNoiseSupression: boolean;
  enableEchoCancellation: boolean;
  enableQualityAssessment: boolean;
  enablePerformanceOptimization: boolean;
  enablePredictiveProcessing: boolean;
  latencyTarget: number; // milliseconds
  qualityThreshold: number; // 0-1 scale
}

export interface EnhancedTranslationResult {
  originalText: string;
  translatedText: string;
  confidence: number;
  qualityMetrics: QualityMetrics;
  processingTime: number;
  audioQuality: number;
  recommendations: string[];
}

export interface AIEnhancementStatus {
  isActive: boolean;
  currentQuality: number;
  averageLatency: number;
  errorRate: number;
  enhancementsActive: string[];
}

export class AIEnhancementService {
  private audioProcessor: AudioProcessor | null = null;
  private qualityAssessor: TranslationQualityAssessor | null = null;
  private config: AIEnhancementConfig;
  private isInitialized = false;
  private sessionStartTime = 0;
  private translationHistory: EnhancedTranslationResult[] = [];

  constructor(config: Partial<AIEnhancementConfig> = {}) {
    this.config = {
      enableNoiseSupression: true,
      enableEchoCancellation: true,
      enableQualityAssessment: true,
      enablePerformanceOptimization: true,
      enablePredictiveProcessing: true,
      latencyTarget: 1500,
      qualityThreshold: 0.7,
      ...config
    };
  }

  /**
   * Initialize all AI enhancement components
   */
  async initialize(): Promise<void> {
    try {
      console.log(' Initializing AI Enhancement Service...');

      // Initialize audio processor with enhanced settings
      if (this.config.enableNoiseSupression || this.config.enableEchoCancellation) {
        this.audioProcessor = createAudioProcessor({
          noiseSuppression: this.config.enableNoiseSupression,
          echoCancellation: this.config.enableEchoCancellation,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        });
        console.log(' Audio processor initialized with noise suppression and echo cancellation');
      }

      // Initialize quality assessor
      if (this.config.enableQualityAssessment) {
        this.qualityAssessor = createQualityAssessor();
        console.log(' Translation quality assessor initialized');
      }

      this.sessionStartTime = Date.now();
      this.isInitialized = true;
      
      console.log(' AI Enhancement Service fully initialized');
    } catch (error) {
      console.error(' Failed to initialize AI Enhancement Service:', error);
      throw error;
    }
  }

  /**
   * Process audio with AI enhancements
   */
  async processAudio(inputStream: MediaStream): Promise<MediaStream> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.audioProcessor) {
      try {
        // Apply audio enhancements
        const enhancedStream = await this.audioProcessor.initializeAudio();
        console.log(' Audio enhanced with noise suppression and echo cancellation');
        return enhancedStream;
      } catch (error) {
        console.warn(' Audio enhancement failed, using original stream:', error);
        return inputStream;
      }
    }

    return inputStream;
  }

  /**
   * Enhance translation with quality assessment and optimization
   */
  async enhanceTranslation(
    originalText: string,
    translatedText: string,
    audioLevel: number,
    language: string,
    processingStartTime: number
  ): Promise<EnhancedTranslationResult> {
    const processingTime = Date.now() - processingStartTime;

    let qualityMetrics: QualityMetrics = {
      confidence: 0.8,
      audioQuality: 0.8,
      translationSpeed: processingTime,
      languageDetectionConfidence: 0.8,
      overallScore: 0.8
    };

    let recommendations: string[] = [];

    // Assess translation quality if enabled
    if (this.qualityAssessor && this.config.enableQualityAssessment) {
      const translationEvent = {
        originalText,
        translatedText,
        audioLevel,
        timestamp: Date.now(),
        processingTime,
        language
      };

      qualityMetrics = this.qualityAssessor.assessTranslation(translationEvent);
      recommendations = this.qualityAssessor.getRecommendations();
    }

    // Apply performance optimizations
    if (this.config.enablePerformanceOptimization) {
      // Optimize based on current performance
      if (processingTime > this.config.latencyTarget) {
        recommendations.push('High latency detected. Consider optimizing network connection.');
      }

      if (qualityMetrics.overallScore < this.config.qualityThreshold) {
        recommendations.push('Translation quality below threshold. Try speaking more clearly.');
      }
    }

    // Apply predictive processing hints
    if (this.config.enablePredictiveProcessing) {
      this.predictNextAction(originalText, translatedText);
    }

    const result: EnhancedTranslationResult = {
      originalText,
      translatedText,
      confidence: qualityMetrics.confidence,
      qualityMetrics,
      processingTime,
      audioQuality: qualityMetrics.audioQuality,
      recommendations
    };

    // Store in history for trend analysis
    this.translationHistory.push(result);
    if (this.translationHistory.length > 50) {
      this.translationHistory.shift(); // Keep last 50 translations
    }

    return result;
  }

  /**
   * Predict next action for optimization
   */
  private predictNextAction(originalText: string, translatedText: string): void {
    // Simple prediction based on conversation patterns
    const isQuestion = originalText.includes('?') || originalText.toLowerCase().includes('what') || 
                      originalText.toLowerCase().includes('how') || originalText.toLowerCase().includes('when');
    
    const isGreeting = originalText.toLowerCase().includes('hello') || 
                      originalText.toLowerCase().includes('hi') || 
                      originalText.toLowerCase().includes('bonjour');

    if (isQuestion) {
      // Predict response coming, pre-warm synthesis
      console.log(' Predicting response, pre-warming synthesis');
    } else if (isGreeting) {
      // Predict greeting response
      console.log(' Predicting greeting response');
    }
  }

  /**
   * Get current AI enhancement status
   */
  getStatus(): AIEnhancementStatus {
    const recentTranslations = this.translationHistory.slice(-10);
    const averageLatency = recentTranslations.length > 0 
      ? recentTranslations.reduce((sum, t) => sum + t.processingTime, 0) / recentTranslations.length
      : 0;

    const averageQuality = recentTranslations.length > 0
      ? recentTranslations.reduce((sum, t) => sum + t.qualityMetrics.overallScore, 0) / recentTranslations.length
      : 0;

    const errorRate = recentTranslations.length > 0
      ? recentTranslations.filter(t => t.qualityMetrics.overallScore < this.config.qualityThreshold).length / recentTranslations.length
      : 0;

    const enhancementsActive: string[] = [];
    if (this.config.enableNoiseSupression) enhancementsActive.push('Noise Suppression');
    if (this.config.enableEchoCancellation) enhancementsActive.push('Echo Cancellation');
    if (this.config.enableQualityAssessment) enhancementsActive.push('Quality Assessment');
    if (this.config.enablePerformanceOptimization) enhancementsActive.push('Performance Optimization');
    if (this.config.enablePredictiveProcessing) enhancementsActive.push('Predictive Processing');

    return {
      isActive: this.isInitialized,
      currentQuality: averageQuality,
      averageLatency,
      errorRate,
      enhancementsActive
    };
  }

  /**
   * Get performance insights and recommendations
   */
  getInsights(): {
    sessionDuration: number;
    totalTranslations: number;
    averageQuality: number;
    averageLatency: number;
    topRecommendations: string[];
    qualityTrend: 'improving' | 'stable' | 'declining';
  } {
    const sessionDuration = Date.now() - this.sessionStartTime;
    const totalTranslations = this.translationHistory.length;

    const averageQuality = totalTranslations > 0
      ? this.translationHistory.reduce((sum, t) => sum + t.qualityMetrics.overallScore, 0) / totalTranslations
      : 0;

    const averageLatency = totalTranslations > 0
      ? this.translationHistory.reduce((sum, t) => sum + t.processingTime, 0) / totalTranslations
      : 0;

    // Analyze quality trend
    let qualityTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (totalTranslations >= 6) {
      const firstHalf = this.translationHistory.slice(0, Math.floor(totalTranslations / 2));
      const secondHalf = this.translationHistory.slice(Math.floor(totalTranslations / 2));
      
      const firstHalfAvg = firstHalf.reduce((sum, t) => sum + t.qualityMetrics.overallScore, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, t) => sum + t.qualityMetrics.overallScore, 0) / secondHalf.length;
      
      const improvement = secondHalfAvg - firstHalfAvg;
      if (improvement > 0.05) qualityTrend = 'improving';
      else if (improvement < -0.05) qualityTrend = 'declining';
    }

    // Collect top recommendations
    const allRecommendations = this.translationHistory.flatMap(t => t.recommendations);
    const recommendationCounts = new Map<string, number>();
    
    allRecommendations.forEach(rec => {
      recommendationCounts.set(rec, (recommendationCounts.get(rec) || 0) + 1);
    });

    const topRecommendations = Array.from(recommendationCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([rec]) => rec);

    return {
      sessionDuration,
      totalTranslations,
      averageQuality,
      averageLatency,
      topRecommendations,
      qualityTrend
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AIEnhancementConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(' AI Enhancement configuration updated:', newConfig);
  }

  /**
   * Reset session data
   */
  reset(): void {
    this.translationHistory = [];
    this.sessionStartTime = Date.now();
    this.qualityAssessor?.reset();
    console.log(' AI Enhancement Service reset');
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.audioProcessor?.cleanup();
    this.audioProcessor = null;
    this.qualityAssessor = null;
    this.isInitialized = false;
    console.log(' AI Enhancement Service cleaned up');
  }
}

/**
 * Create a singleton instance of the AI Enhancement Service
 */
let aiEnhancementServiceInstance: AIEnhancementService | null = null;

export function getAIEnhancementService(config?: Partial<AIEnhancementConfig>): AIEnhancementService {
  if (!aiEnhancementServiceInstance) {
    aiEnhancementServiceInstance = new AIEnhancementService(config);
  }
  return aiEnhancementServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetAIEnhancementService(): void {
  if (aiEnhancementServiceInstance) {
    aiEnhancementServiceInstance.cleanup();
    aiEnhancementServiceInstance = null;
  }
}