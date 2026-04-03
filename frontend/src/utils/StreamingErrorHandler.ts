/**
 * Comprehensive error handling and recovery system for streaming features
 */

export interface StreamingError {
  type: 'network' | 'audio' | 'websocket' | 'streaming' | 'performance';
  code: string;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  recoverable: boolean;
}

export interface RecoveryStrategy {
  name: string;
  execute: () => Promise<boolean>;
  maxRetries: number;
  backoffMs: number;
}

export class StreamingErrorHandler {
  private errors: StreamingError[] = [];
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private onError?: (error: StreamingError) => void;
  private onRecovery?: (strategy: string, success: boolean) => void;

  constructor(options: {
    onError?: (error: StreamingError) => void;
    onRecovery?: (strategy: string, success: boolean) => void;
  } = {}) {
    this.onError = options.onError;
    this.onRecovery = options.onRecovery;
    this.setupDefaultStrategies();
  }

  private setupDefaultStrategies(): void {
    // Network reconnection strategy
    this.addRecoveryStrategy('network-reconnect', {
      name: 'Network Reconnection',
      execute: async () => {
        console.log('[StreamingErrorHandler] Attempting network reconnection...');
        // Wait for network to stabilize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if online
        if (!navigator.onLine) {
          return false;
        }
        
        // Test connectivity with a simple fetch
        try {
          const response = await fetch('/api/health', { 
            method: 'HEAD',
            cache: 'no-cache'
          });
          return response.ok;
        } catch {
          return false;
        }
      },
      maxRetries: 3,
      backoffMs: 2000
    });

    // WebSocket reconnection strategy
    this.addRecoveryStrategy('websocket-reconnect', {
      name: 'WebSocket Reconnection',
      execute: async () => {
        console.log('[StreamingErrorHandler] Attempting WebSocket reconnection...');
        // This would be implemented by the calling code
        // Return true if reconnection successful
        return true;
      },
      maxRetries: 5,
      backoffMs: 1000
    });

    // Audio context recovery strategy
    this.addRecoveryStrategy('audio-context-recovery', {
      name: 'Audio Context Recovery',
      execute: async () => {
        console.log('[StreamingErrorHandler] Attempting audio context recovery...');
        try {
          // Try to create a new AudioContext
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
          audioContext.close();
          return true;
        } catch {
          return false;
        }
      },
      maxRetries: 2,
      backoffMs: 500
    });

    // Streaming buffer recovery strategy
    this.addRecoveryStrategy('streaming-buffer-recovery', {
      name: 'Streaming Buffer Recovery',
      execute: async () => {
        console.log('[StreamingErrorHandler] Attempting streaming buffer recovery...');
        // Clear buffers and reset streaming state
        // This would be implemented by the calling code
        return true;
      },
      maxRetries: 1,
      backoffMs: 0
    });

    // Performance optimization strategy
    this.addRecoveryStrategy('performance-optimization', {
      name: 'Performance Optimization',
      execute: async () => {
        console.log('[StreamingErrorHandler] Applying performance optimizations...');
        
        // Force garbage collection if available
        if ('gc' in window && typeof (window as any).gc === 'function') {
          (window as any).gc();
        }
        
        // Clear any large objects from memory
        // This would be implemented by the calling code
        
        return true;
      },
      maxRetries: 1,
      backoffMs: 0
    });
  }

  public addRecoveryStrategy(key: string, strategy: RecoveryStrategy): void {
    this.recoveryStrategies.set(key, strategy);
  }

  public reportError(error: Omit<StreamingError, 'timestamp'>): void {
    const fullError: StreamingError = {
      ...error,
      timestamp: Date.now()
    };

    this.errors.push(fullError);
    
    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }

    console.error('[StreamingErrorHandler] Error reported:', fullError);
    this.onError?.(fullError);

    // Attempt recovery if error is recoverable
    if (fullError.recoverable) {
      this.attemptRecovery(fullError);
    }
  }

  private async attemptRecovery(error: StreamingError): Promise<void> {
    const strategyKey = this.getRecoveryStrategyForError(error);
    if (!strategyKey) {
      console.warn('[StreamingErrorHandler] No recovery strategy for error:', error.code);
      return;
    }

    const strategy = this.recoveryStrategies.get(strategyKey);
    if (!strategy) {
      console.warn('[StreamingErrorHandler] Recovery strategy not found:', strategyKey);
      return;
    }

    const currentAttempts = this.retryAttempts.get(strategyKey) || 0;
    if (currentAttempts >= strategy.maxRetries) {
      console.warn('[StreamingErrorHandler] Max retry attempts reached for:', strategyKey);
      return;
    }

    // Wait for backoff period
    if (strategy.backoffMs > 0) {
      await new Promise(resolve => setTimeout(resolve, strategy.backoffMs * (currentAttempts + 1)));
    }

    try {
      console.log(`[StreamingErrorHandler] Executing recovery strategy: ${strategy.name} (attempt ${currentAttempts + 1})`);
      const success = await strategy.execute();
      
      if (success) {
        console.log(`[StreamingErrorHandler] Recovery successful: ${strategy.name}`);
        this.retryAttempts.delete(strategyKey);
        this.onRecovery?.(strategyKey, true);
      } else {
        console.warn(`[StreamingErrorHandler] Recovery failed: ${strategy.name}`);
        this.retryAttempts.set(strategyKey, currentAttempts + 1);
        this.onRecovery?.(strategyKey, false);
        
        // Retry if attempts remaining
        if (currentAttempts + 1 < strategy.maxRetries) {
          setTimeout(() => this.attemptRecovery(error), strategy.backoffMs);
        }
      }
    } catch (recoveryError) {
      console.error(`[StreamingErrorHandler] Recovery strategy threw error: ${strategy.name}`, recoveryError);
      this.retryAttempts.set(strategyKey, currentAttempts + 1);
      this.onRecovery?.(strategyKey, false);
    }
  }

  private getRecoveryStrategyForError(error: StreamingError): string | null {
    switch (error.type) {
      case 'network':
        return 'network-reconnect';
      case 'websocket':
        return 'websocket-reconnect';
      case 'audio':
        return 'audio-context-recovery';
      case 'streaming':
        return 'streaming-buffer-recovery';
      case 'performance':
        return 'performance-optimization';
      default:
        return null;
    }
  }

  public getErrorHistory(): StreamingError[] {
    return [...this.errors];
  }

  public getErrorStats(): {
    total: number;
    byType: Record<string, number>;
    recoverable: number;
    recent: number; // Last 5 minutes
  } {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const byType: Record<string, number> = {};
    let recoverable = 0;
    let recent = 0;

    for (const error of this.errors) {
      byType[error.type] = (byType[error.type] || 0) + 1;
      if (error.recoverable) recoverable++;
      if (error.timestamp > fiveMinutesAgo) recent++;
    }

    return {
      total: this.errors.length,
      byType,
      recoverable,
      recent
    };
  }

  public clearErrors(): void {
    this.errors = [];
    this.retryAttempts.clear();
  }

  public isHealthy(): boolean {
    const stats = this.getErrorStats();
    
    // Consider unhealthy if more than 5 errors in last 5 minutes
    if (stats.recent > 5) {
      return false;
    }
    
    // Consider unhealthy if error rate is too high
    const errorRate = stats.total / Math.max(1, (Date.now() - (this.errors[0]?.timestamp || Date.now())) / 60000);
    if (errorRate > 2) { // More than 2 errors per minute average
      return false;
    }
    
    return true;
  }
}

// Singleton instance for global error handling
export const globalStreamingErrorHandler = new StreamingErrorHandler({
  onError: (error) => {
    // Could integrate with external error reporting service
    console.error('[Global Streaming Error]', error);
  },
  onRecovery: (strategy, success) => {
    console.log(`[Global Recovery] ${strategy}: ${success ? 'SUCCESS' : 'FAILED'}`);
  }
});

// Error reporting utilities
export function reportStreamingError(
  type: StreamingError['type'],
  code: string,
  message: string,
  context?: Record<string, any>,
  recoverable: boolean = true
): void {
  globalStreamingErrorHandler.reportError({
    type,
    code,
    message,
    context,
    recoverable
  });
}

export function reportNetworkError(message: string, context?: Record<string, any>): void {
  reportStreamingError('network', 'NETWORK_ERROR', message, context, true);
}

export function reportAudioError(message: string, context?: Record<string, any>): void {
  reportStreamingError('audio', 'AUDIO_ERROR', message, context, true);
}

export function reportWebSocketError(message: string, context?: Record<string, any>): void {
  reportStreamingError('websocket', 'WEBSOCKET_ERROR', message, context, true);
}

export function reportStreamingBufferError(message: string, context?: Record<string, any>): void {
  reportStreamingError('streaming', 'STREAMING_ERROR', message, context, true);
}

export function reportPerformanceError(message: string, context?: Record<string, any>): void {
  reportStreamingError('performance', 'PERFORMANCE_ERROR', message, context, true);
}

export default StreamingErrorHandler;