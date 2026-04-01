import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, MicOff, Users, Globe, Clock, AlertCircle, Copy, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface WebRTCTranslationProps {
  onCallStarted?: () => void;
  onCallEnded?: () => void;
}

export function WebRTCTranslation({ onCallStarted, onCallEnded }: WebRTCTranslationProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [language, setLanguage] = useState<"en-US" | "fr-CA">("en-US");
  const [roomId, setRoomId] = useState("");
  const [generatedRoomId, setGeneratedRoomId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");

  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Generate a random room ID
  const generateRoomId = useCallback(() => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setGeneratedRoomId(id);
    setRoomId(id);
  }, []);

  // Initialize with a room ID
  useEffect(() => {
    generateRoomId();
  }, [generateRoomId]);

  const startConnection = useCallback(async () => {
    if (!roomId.trim()) {
      alert("Please enter a room ID");
      return;
    }

    setConnectionStatus("connecting");
    
    try {
      // Simulate WebRTC connection setup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setIsConnected(true);
      setConnectionStatus("connected");
      onCallStarted?.();
      
      // Auto-unmute when connected
      setIsMuted(false);
    } catch (error) {
      console.error("Connection failed:", error);
      setConnectionStatus("disconnected");
    }
  }, [roomId, onCallStarted]);

  const endConnection = useCallback(() => {
    setIsConnected(false);
    setConnectionStatus("disconnected");
    setIsMuted(true);
    onCallEnded?.();
  }, [onCallEnded]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId);
  }, [roomId]);

  const copyShareLink = useCallback(() => {
    const baseUrl = import.meta.env.VITE_APP_BASE_URL || window.location.origin;
    const shareLink = `${baseUrl}/phone?room=${roomId}`;
    navigator.clipboard.writeText(shareLink);
  }, [roomId]);

  return (
    <div className="space-y-6">
      {/* Free WebRTC Notice */}
      <Card className="border-green-500/20 bg-green-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Globe className="w-5 h-5 text-green-600 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-medium text-green-800">100% Free Browser Translation</h3>
              <p className="text-sm text-green-700">
                Connect directly with other users through your web browser. No phone numbers, 
                no costs - just real-time translation between English and French speakers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {isConnected ? "Connected to Translation Room" : "Join Translation Room"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="roomId">Room ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="roomId"
                      placeholder="Enter room ID"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                      disabled={connectionStatus === "connecting"}
                    />
                    <Button
                      variant="outline"
                      onClick={copyRoomId}
                      disabled={!roomId}
                      className="px-3"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Your Language</Label>
                  <Select value={language} onValueChange={(value: "en-US" | "fr-CA") => setLanguage(value)} disabled={connectionStatus === "connecting"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en-US"> English (US)</SelectItem>
                      <SelectItem value="fr-CA"> Franais (Canada)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={startConnection} 
                  disabled={connectionStatus === "connecting" || !roomId.trim()}
                  className="flex items-center gap-2"
                >
                  {connectionStatus === "connecting" ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Phone className="w-4 h-4" />
                      Join Room
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline"
                  onClick={generateRoomId}
                  disabled={connectionStatus === "connecting"}
                >
                  New Room
                </Button>
              </div>

              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Share this room:</strong>
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-background px-2 py-1 rounded border">
                    {`${import.meta.env.VITE_APP_BASE_URL || window.location.origin}/phone?room=${roomId}`}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyShareLink}
                    disabled={!roomId}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      Connected
                    </Badge>
                    <span className="font-medium">Room: {roomId}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {language === "en-US" ? "English  French" : "French  English"}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Real-time translation active
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={toggleMute}
                  variant={isMuted ? "outline" : "default"}
                  className="flex items-center gap-2"
                >
                  {isMuted ? (
                    <>
                      <MicOff className="w-4 h-4" />
                      Unmute
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      Mute
                    </>
                  )}
                </Button>
                <Button 
                  onClick={endConnection} 
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  Leave Room
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            How Browser Translation Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                1
              </div>
              <div className="text-sm">
                <div className="font-medium">Create or Join Room</div>
                <div className="text-muted-foreground">Generate a room ID or enter an existing one</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                2
              </div>
              <div className="text-sm">
                <div className="font-medium">Share Room Link</div>
                <div className="text-muted-foreground">Send the room link to someone who speaks the other language</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                3
              </div>
              <div className="text-sm">
                <div className="font-medium">Start Talking</div>
                <div className="text-muted-foreground">Speak naturally - hear real-time translation through your browser</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                4
              </div>
              <div className="text-sm">
                <div className="font-medium">No Installation Required</div>
                <div className="text-muted-foreground">Works in any modern web browser - Chrome, Firefox, Safari, Edge</div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border/50">
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>100% free - no costs ever</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>Direct browser-to-browser connection</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span>No phone numbers required</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <span>Works worldwide</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Demo Notice */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-medium text-amber-800">Demo Mode</h3>
              <p className="text-sm text-amber-700">
                This is a demonstration of the WebRTC interface. To enable real browser-to-browser 
                translation, you need to integrate WebRTC signaling and the OpenAI Realtime API.
              </p>
              <p className="text-xs text-amber-600 mt-2">
                This approach is completely free and doesn't require any external services!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}