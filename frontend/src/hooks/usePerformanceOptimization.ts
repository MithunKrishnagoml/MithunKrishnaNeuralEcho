import React, { useCallback, useEffect, useRef, useMemo } from 'react';

/**
 * Performance optimization hook for streaming components
 * Provides memoization, debouncing, and efficient update patterns
 */

interface PerformanceOptimizationOptions {
  /** Debounce delay for rapid updates (ms) */
  debounceDelay?: number;
  /** Maximum update frequency (updates per second) */
  maxUpdateRate?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export function usePerformanceOptimization(options: PerformanceOptimizationOptions = {}) {
  const {
    debounceDelay = 50,
    maxUpdateRate = 30, // 30 FPS max
    debug = false
  } = options;

  const lastUpdateTime = useRef<number>(0);
  const pendingUpdate = useRef<NodeJS.Timeout | null>(null);
  const updateQueue = useRef<Array<() => void>>([]);

  // Throttled update function
  const throttledUpdate = useCallback((updateFn: () => void) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime.current;
    const minInterval = 1000 / maxUpdateRate;

    if (timeSinceLastUpdate >= minInterval) {
      // Execute immediately
      updateFn();
      lastUpdateTime.current = now;
      
      if (debug) {
        console.log('[Performance] Immediate update executed');
      }
    } else {
      // Queue for later execution
      updateQueue.current.push(updateFn);
      
      if (!pendingUpdate.current) {
        const delay = minInterval - timeSinceLastUpdate;
        pendingUpdate.current = setTimeout(() => {
          // Execute all queued updates
          const updates = updateQueue.current.splice(0);
          updates.forEach(fn => fn());
          
          lastUpdateTime.current = Date.now();
          pendingUpdate.current = null;
          
          if (debug) {
            console.log(`[Performance] Executed ${updates.length} queued updates`);
          }
        }, delay);
      }
    }
  }, [maxUpdateRate, debug]);

  // Debounced update function
  const debouncedUpdate = useCallback((updateFn: () => void) => {
    if (pendingUpdate.current) {
      clearTimeout(pendingUpdate.current);
    }

    pendingUpdate.current = setTimeout(() => {
      updateFn();
      pendingUpdate.current = null;
      
      if (debug) {
        console.log('[Performance] Debounced update executed');
      }
    }, debounceDelay);
  }, [debounceDelay, debug]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pendingUpdate.current) {
        clearTimeout(pendingUpdate.current);
      }
      updateQueue.current = [];
    };
  }, []);

  // Memoized callback creator
  const createMemoizedCallback = useCallback(<T extends any[]>(
    callback: (...args: T) => void,
    deps: React.DependencyList
  ) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useCallback(callback, deps);
  }, []);

  // Efficient array comparison
  const arrayEquals = useCallback(<T>(a: T[], b: T[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }, []);

  // Shallow object comparison
  const shallowEquals = useCallback((a: Record<string, any>, b: Record<string, any>): boolean => {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (a[key] !== b[key]) return false;
    }
    
    return true;
  }, []);

  // Memory usage tracker
  const memoryTracker = useMemo(() => {
    const trackedObjects = new WeakMap<object, string>();
    
    return {
      track: (obj: object, label: string) => {
        trackedObjects.set(obj, label);
        if (debug) {
          console.log(`[Performance] Tracking object: ${label}`);
        }
      },
      
      getMemoryUsage: () => {
        if ('memory' in performance) {
          return (performance as any).memory;
        }
        return null;
      }
    };
  }, [debug]);

  // Batch updates helper
  const batchUpdates = useCallback((updates: Array<() => void>) => {
    // Use React's unstable_batchedUpdates if available
    if ('unstable_batchedUpdates' in React) {
      (React as any).unstable_batchedUpdates(() => {
        updates.forEach(update => update());
      });
    } else {
      // Fallback: execute all updates in a single frame
      requestAnimationFrame(() => {
        updates.forEach(update => update());
      });
    }
    
    if (debug) {
      console.log(`[Performance] Batched ${updates.length} updates`);
    }
  }, [debug]);

  return {
    throttledUpdate,
    debouncedUpdate,
    createMemoizedCallback,
    arrayEquals,
    shallowEquals,
    memoryTracker,
    batchUpdates
  };
}

// React.memo wrapper with custom comparison
export function createMemoComponent<P extends object>(
  Component: React.ComponentType<P>,
  propsAreEqual?: (prevProps: P, nextProps: P) => boolean
) {
  return React.memo(Component, propsAreEqual);
}

// Custom hook for efficient re-renders
export function useShallowMemo<T extends object>(value: T): T {
  const ref = useRef<T>(value);
  
  return useMemo(() => {
    // Shallow comparison
    const keys = Object.keys(value) as Array<keyof T>;
    const prevKeys = Object.keys(ref.current) as Array<keyof T>;
    
    if (keys.length !== prevKeys.length) {
      ref.current = value;
      return value;
    }
    
    for (const key of keys) {
      if (value[key] !== ref.current[key]) {
        ref.current = value;
        return value;
      }
    }
    
    return ref.current;
  }, [value]);
}

export default usePerformanceOptimization;