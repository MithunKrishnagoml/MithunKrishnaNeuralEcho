import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let model = "gpt-realtime-mini-2025-12-15";
    let instructions = "Translate the following speech from the source language to the target language. Output only the translation.";
    let turnDetection: Record<string, unknown> | null = { type: "server_vad" };
    let voice = "alloy";

    try {
      const body = await req.json();
      if (body?.model) model = body.model;
      if (body?.instructions) instructions = body.instructions;
      if ("turn_detection" in body) turnDetection = body.turn_detection;
      if (body?.voice) voice = body.voice;
    } catch {
      // no body is fine
    }

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions,
        turn_detection: turnDetection,
        voice,
        input_audio_transcription: { model: "gpt-audio-mini-2025-12-15" },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("OpenAI session error:", response.status, text);
      return new Response(JSON.stringify({ error: "Failed to create realtime session", details: text }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("realtime-session error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
