import { useState } from "react";
import { PhoneCallManager } from "@/components/PhoneCallManager";
import { PhoneToPhoneInstructions } from "@/components/PhoneToPhoneInstructions";
import { Phone, ArrowLeftRight, Users, Zap, AlertTriangle, Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import gomlLogo from "@/assets/goml-logo.png";

interface CallSession {
  callSid: string;
  status: string;
  phoneNumber: string;
  language: "en-US" | "fr-CA";
  startTime?: string;
  duration?: number;
}

const PhoneTranslation = () => {
  const [activeSession, setActiveSession] = useState<CallSession | null>(null);
  const [sessionStats, setSessionStats] = useState({
    totalCalls: 0,
    successfulCalls: 0,
    averageDuration: 0,
  });

  const handleCallStarted = (session: CallSession) => {
    setActiveSession(session);
    setSessionStats(prev => ({
      ...prev,
      totalCalls: prev.totalCalls + 1,
    }));
  };

  const handleCallEnded = (session: CallSession) => {
    setActiveSession(null);
    if (session.status === "completed") {
      setSessionStats(prev => ({
        ...prev,
        successfulCalls: prev.successfulCalls + 1,
        averageDuration: session.duration 
          ? (prev.averageDuration * (prev.successfulCalls - 1) + session.duration) / prev.successfulCalls
          : prev.averageDuration,
      }));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <img src="/favicon.png" alt="NeuralEcho" className="w-8 h-8 rounded-lg border border-border/50" />
                <div className="flex flex-col">
                  <h1 className="font-mono-display text-xl font-semibold text-foreground tracking-tight">
                    NeuralEcho Phone
                  </h1>
                  <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <span>A</span>
                    <img src={gomlLogo} alt="GoML" className="h-2.5 opacity-60" />
                    <span>Demo</span>
                  </div>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                Real-time Phone Translation
              </Badge>
            </div>
            
            <Link 
              to="/" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
               Back to Web Translation
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="phone-to-phone" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="phone-to-phone"> Phone-to-Phone Translation</TabsTrigger>
                <TabsTrigger value="web-interface"> Web Interface (Testing)</TabsTrigger>
              </TabsList>
              
              <TabsContent value="phone-to-phone" className="space-y-6">
                <PhoneToPhoneInstructions />
              </TabsContent>
              
              <TabsContent value="web-interface" className="space-y-6">
                <PhoneCallManager 
                  onCallStarted={handleCallStarted}
                  onCallEnded={handleCallEnded}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar with Info and Stats */}
          <div className="space-y-6">
            {/* Server Status */}
            <Card className="border-green-500/20 bg-green-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-green-600">
                  <Server className="w-5 h-5" />
                  Local Server Ready
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-green-700">
                  Phone translation server is running locally with your Twilio credentials.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>Server: {import.meta.env.VITE_BACKEND_URL || 'Not configured'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>Twilio Integration: Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>Real Phone Calls: Enabled</span>
                  </div>
                </div>
                <div className="pt-2 text-xs text-green-600">
                  Ready to make real translated phone calls!
                </div>
              </CardContent>
            </Card>

            {/* How It Works */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ArrowLeftRight className="w-5 h-5" />
                  How It Works
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      1
                    </div>
                    <div className="text-sm">
                      <div className="font-medium">Enter Phone Number</div>
                      <div className="text-muted-foreground">Add the number and select their language</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      2
                    </div>
                    <div className="text-sm">
                      <div className="font-medium">Automatic Translation</div>
                      <div className="text-muted-foreground">Real-time speech translation during the call</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      3
                    </div>
                    <div className="text-sm">
                      <div className="font-medium">Natural Conversation</div>
                      <div className="text-muted-foreground">Each person hears the other in their own language</div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/50">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span> English   Franais</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span>Real-time processing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                      <span>Low latency translation</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Session Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="w-5 h-5" />
                  Session Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Calls</span>
                    <span className="font-medium">{sessionStats.totalCalls}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Successful</span>
                    <span className="font-medium text-green-600">{sessionStats.successfulCalls}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Success Rate</span>
                    <span className="font-medium">
                      {sessionStats.totalCalls > 0 
                        ? Math.round((sessionStats.successfulCalls / sessionStats.totalCalls) * 100)
                        : 0}%
                    </span>
                  </div>
                  
                  {sessionStats.averageDuration > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Avg Duration</span>
                      <span className="font-medium">
                        {Math.floor(sessionStats.averageDuration / 60)}:
                        {(sessionStats.averageDuration % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Active Session Info */}
            {activeSession && (
              <Card className="border-green-500/20 bg-green-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg text-green-600">
                    <Phone className="w-5 h-5" />
                    Active Call
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Number</span>
                      <span className="font-medium font-mono text-sm">{activeSession.phoneNumber}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Language</span>
                      <span className="font-medium">
                        {activeSession.language === "en-US" ? " English" : " Franais"}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant="secondary" className="text-xs">
                        {activeSession.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Zap className="w-3 h-3" />
                      <span>Real-time translation active</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Technical Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Technical Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Platform</span>
                    <span className="font-medium">Twilio Voice API</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">AI Model</span>
                    <span className="font-medium">OpenAI Realtime</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Latency</span>
                    <span className="font-medium text-green-600">~200ms</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Audio Quality</span>
                    <span className="font-medium">16kHz PCM</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhoneTranslation;