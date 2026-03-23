/**
 * Application configuration from environment variables
 */

// Backend API URL
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'https://neural-ix2j.onrender.com';

// WebSocket URL
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'wss://neural-ix2j.onrender.com';

// Startup validation
if (!import.meta.env.VITE_WS_URL && import.meta.env.PROD) {
  console.error('❌ [CONFIG] VITE_WS_URL environment variable is required in production');
  throw new Error('Missing required environment variable: VITE_WS_URL. Please set it in your deployment configuration.');
}

console.log(' [CONFIG] Backend API URL:', BACKEND_URL);
console.log(' [CONFIG] WebSocket URL:', WS_URL);

if (!import.meta.env.VITE_WS_URL) {
  console.warn('⚠️ [CONFIG] VITE_WS_URL not set, using fallback:', WS_URL);
}