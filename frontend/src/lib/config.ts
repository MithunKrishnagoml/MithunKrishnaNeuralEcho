/**
 * Application configuration from environment variables
 */

// Backend API URL
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';

// WebSocket URL
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001';

if (!import.meta.env.VITE_WS_URL) {
  console.warn('⚠️ [CONFIG] VITE_WS_URL not set, using fallback:', WS_URL);
}

console.log('✅ [CONFIG] Backend URL:', BACKEND_URL);
console.log('✅ [CONFIG] WebSocket URL:', WS_URL);
