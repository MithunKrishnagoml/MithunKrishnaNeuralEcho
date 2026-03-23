// @ts-ignore - Deno import, not available in Node.js environment
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Type declaration for Deno's serve function
declare const serve: (handler: (request: Request) => Response | Promise<Response>) => void;

// Deno type declarations for IDE support
declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
    upgradeWebSocket(request: Request): {
      socket: WebSocket;
      response: Response;
    };
  };
  
  // Extend WebSocket constructor to support Deno's headers option
  interface WebSocketConstructor {
    new(url: string, options?: {
      headers?: Record<string, string>;
      protocols?: string[];
    }): WebSocket;
  }
}

interface CallSession {
  sessionId: string;
  callerA?: {
    callSid: string;
    language: "en-US" | "fr-CA";
    socket?: WebSocket;
    realtimeConnection?: WebSocket;
  };
  callerB?: {
    callSid: string;
    language: "en-US" | "fr-CA";
    socket?: WebSocket;
    realtimeConnection?: WebSocket;
  };
  createdAt: number;
}

// Store active call sessions
const activeSessions = new Map<string, CallSession>();

serve(async (req) => {
  const upgrade = req.headers.get("upgrade") || "";
  
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 426 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  socket.onopen = () => {
    console.log("WebSocket connection opened for phone translation");
  };

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      await handleTwilioMediaMessage(message, socket);
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
    }
  };

  socket.onclose = () => {
    console.log("WebSocket connection closed");
    // Clean up any associated sessions
    cleanupSocketSessions(socket);
  };

  socket.onerror = (error: Event) => {
    console.error("WebSocket error:", error);
  };

  return response;
});

async function handleTwilioMediaMessage(message: any, socket: WebSocket) {
  const { event, streamSid, callSid } = message;

  if (event === "start") {
    console.log(`Media stream started for call ${callSid}`);
    await initializeCallSession(callSid, streamSid, socket);
    return;
  }

  if (event === "media") {
    const { payload } = message.media;
    const audioData = base64ToArrayBuffer(payload);
    
    // Find the session for this call
    const session = findSessionByCallSid(callSid);
    if (!session) {
      console.error(`No session found for call ${callSid}`);
      return;
    }

    // Determine which caller this is and process the audio
    const caller = session.callerA?.callSid === callSid ? session.callerA : session.callerB;
    const otherCaller = session.callerA?.callSid === callSid ? session.callerB : session.callerA;

    if (caller && otherCaller) {
      await processAudioForTranslation(audioData, caller, otherCaller, session);
    }
    return;
  }

  if (event === "stop") {
    console.log(`Media stream stopped for call ${callSid}`);
    cleanupCallSession(callSid);
    return;
  }
}

async function initializeCallSession(callSid: string, streamSid: string, socket: WebSocket) {
  // Check if this call is already part of an existing session
  let session = findSessionByCallSid(callSid);
  
  if (!session) {
    // Create new session or find existing session waiting for second caller
    const waitingSessions = Array.from(activeSessions.values()).filter(s => 
      !s.callerA || !s.callerB
    );

    if (waitingSessions.length > 0) {
      // Join existing session
      session = waitingSessions[0];
      if (!session.callerA) {
        session.callerA = {
          callSid,
          language: "en-US", // Default, will be detected
          socket,
        };
      } else {
        session.callerB = {
          callSid,
          language: "fr-CA", // Default, will be detected
          socket,
        };
      }
    } else {
      // Create new session
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      session = {
        sessionId,
        callerA: {
          callSid,
          language: "en-US",
          socket,
        },
        createdAt: Date.now(),
      };
      activeSessions.set(sessionId, session);
    }
  }

  // Initialize OpenAI Realtime connections for both callers when both are present
  if (session.callerA && session.callerB) {
    await initializeRealtimeConnections(session);
  }
}

async function initializeRealtimeConnections(session: CallSession) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    console.error("OpenAI API key not configured");
    return;
  }

  // Initialize connection for Caller A (English speaker)
  if (session.callerA && !session.callerA.realtimeConnection) {
    session.callerA.realtimeConnection = await createRealtimeConnection(
      "en-US", // Input language
      "fr-CA", // Output language
      session.callerA,
      session.callerB!
    );
  }

  // Initialize connection for Caller B (French speaker)
  if (session.callerB && !session.callerB.realtimeConnection) {
    session.callerB.realtimeConnection = await createRealtimeConnection(
      "fr-CA", // Input language
      "en-US", // Output language
      session.callerB,
      session.callerA!
    );
  }

  console.log(`Realtime connections initialized for session ${session.sessionId}`);
}

async function createRealtimeConnection(
  inputLang: string,
  outputLang: string,
  speaker: any,
  listener: any
): Promise<WebSocket> {
  
  // First get ephemeral token
  const sessionResponse = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-realtime-mini-2025-12-15",
      instructions: buildTranslationInstructions(inputLang, outputLang),
      turn_detection: { type: "server_vad" },
      voice: outputLang === "fr-CA" ? "alloy" : "echo",
      input_audio_transcription: { model: "gpt-audio-mini-2025-12-15" },
    }),
  });

  if (!sessionResponse.ok) {
    throw new Error(`Failed to create OpenAI session: ${sessionResponse.status}`);
  }

  const sessionData = await sessionResponse.json();
  const ephemeralKey = sessionData.client_secret?.value;

  if (!ephemeralKey) {
    throw new Error("No ephemeral key returned from OpenAI session");
  }

  // Create WebSocket connection to OpenAI Realtime API
  const realtimeWs = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=gpt-realtime-mini-2025-12-15`,
    {
      headers: {
        "Authorization": `Bearer ${ephemeralKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    } as any // Type assertion for Deno WebSocket options
  );

  realtimeWs.onopen = () => {
    console.log(`OpenAI Realtime connection opened for ${inputLang} → ${outputLang}`);
  };

  realtimeWs.onmessage = (event) => {
    handleRealtimeMessage(JSON.parse(event.data), speaker, listener);
  };

  realtimeWs.onerror = (error) => {
    console.error("OpenAI Realtime WebSocket error:", error);
  };

  realtimeWs.onclose = () => {
    console.log("OpenAI Realtime connection closed");
  };

  return realtimeWs;
}

function buildTranslationInstructions(inputLang: string, outputLang: string): string {
  const inputLangName = inputLang === "en-US" ? "English" : "French";
  const outputLangName = outputLang === "en-US" ? "English" : "French";

  return `Translate the following speech from ${inputLangName} to ${outputLangName}. Output only the translation.`;
}

async function processAudioForTranslation(
  audioData: ArrayBuffer,
  speaker: any,
  listener: any,
  session: CallSession
) {
  if (!speaker.realtimeConnection || speaker.realtimeConnection.readyState !== WebSocket.OPEN) {
    console.error("Realtime connection not ready for speaker");
    return;
  }

  // Convert audio data to base64 and send to OpenAI Realtime API
  const base64Audio = arrayBufferToBase64(audioData);
  
  const audioMessage = {
    type: "input_audio_buffer.append",
    audio: base64Audio,
  };

  speaker.realtimeConnection.send(JSON.stringify(audioMessage));
}

function handleRealtimeMessage(message: any, speaker: any, listener: any) {
  if (message.type === "response.audio.delta") {
    // Send translated audio back to the listener via Twilio
    const audioData = message.delta;
    sendAudioToTwilio(audioData, listener);
  }

  if (message.type === "conversation.item.input_audio_transcription.completed") {
    console.log(`Transcription: ${message.transcript}`);
  }

  if (message.type === "response.done") {
    console.log("Translation response completed");
  }

  if (message.type === "error") {
    console.error("OpenAI Realtime error:", message.error);
  }
}

function sendAudioToTwilio(audioData: string, listener: any) {
  if (!listener.socket || listener.socket.readyState !== WebSocket.OPEN) {
    console.error("Listener socket not ready");
    return;
  }

  const mediaMessage = {
    event: "media",
    streamSid: listener.streamSid,
    media: {
      payload: audioData,
    },
  };

  listener.socket.send(JSON.stringify(mediaMessage));
}

function findSessionByCallSid(callSid: string): CallSession | undefined {
  for (const session of activeSessions.values()) {
    if (session.callerA?.callSid === callSid || session.callerB?.callSid === callSid) {
      return session;
    }
  }
  return undefined;
}

function cleanupSocketSessions(socket: WebSocket) {
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.callerA?.socket === socket || session.callerB?.socket === socket) {
      // Close realtime connections
      session.callerA?.realtimeConnection?.close();
      session.callerB?.realtimeConnection?.close();
      
      // Remove session
      activeSessions.delete(sessionId);
      console.log(`Cleaned up session ${sessionId}`);
      break;
    }
  }
}

function cleanupCallSession(callSid: string) {
  const session = findSessionByCallSid(callSid);
  if (session) {
    // Remove the caller from the session
    if (session.callerA?.callSid === callSid) {
      session.callerA.realtimeConnection?.close();
      session.callerA = undefined;
    }
    if (session.callerB?.callSid === callSid) {
      session.callerB.realtimeConnection?.close();
      session.callerB = undefined;
    }

    // If no callers left, remove the session
    if (!session.callerA && !session.callerB) {
      activeSessions.delete(session.sessionId);
      console.log(`Removed empty session ${session.sessionId}`);
    }
  }
}

// Utility functions
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}