import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      return new Response(JSON.stringify({ error: "Twilio credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "incoming") {
      // Handle incoming call - generate TwiML response
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">Welcome to Neural Echo Translation Service. You will be connected to a live translator. Please wait while we connect you.</Say>
    <Dial>
        <Conference 
            statusCallback="${url.origin}/functions/v1/phone-call-handler?action=conference-status"
            statusCallbackEvent="start,end,join,leave"
            statusCallbackMethod="POST"
            record="true"
            startConferenceOnEnter="true"
            endConferenceOnExit="false"
            waitUrl=""
            maxParticipants="2">
            neural-echo-translation-room
        </Conference>
    </Dial>
</Response>`;

      return new Response(twimlResponse, {
        headers: { ...corsHeaders, "Content-Type": "application/xml" },
      });
    }

    if (action === "conference-status") {
      // Handle conference status updates
      const formData = await req.formData();
      const event = formData.get("StatusCallbackEvent");
      const conferenceId = formData.get("ConferenceSid");
      const callSid = formData.get("CallSid");
      
      console.log(`Conference event: ${event}, Conference: ${conferenceId}, Call: ${callSid}`);
      
      if (event === "participant-join") {
        // Start media streaming for this participant
        await startMediaStreaming(callSid as string, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      }

      return new Response("OK", {
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    if (action === "media-stream") {
      // Handle media stream webhook
      return handleMediaStream(req);
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Phone call handler error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function startMediaStreaming(callSid: string, accountSid: string, authToken: string) {
  const streamUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/phone-translation-stream`;
  
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}/Streams.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      Url: streamUrl,
      Track: "both_tracks", // inbound and outbound audio
    }),
  });

  if (!response.ok) {
    console.error("Failed to start media streaming:", await response.text());
  } else {
    console.log("Media streaming started for call:", callSid);
  }
}

async function handleMediaStream(req: Request) {
  // This will be handled by the WebSocket endpoint
  return new Response("Media stream endpoint", {
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
}