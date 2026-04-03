import { useState, useCallback } from "react";
import { Phone, PhoneCall, Users, Globe, Clock, AlertCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CallSession {
  callSid: string;
  status: string;
  phoneNumber: string;
  language: "en-US" | "fr-CA";
  startTime?: string;
  duration?: number;
}

interface PhoneCallManagerIncomingProps {
  onCallStarted?: (session: CallSession) => void;
  onCallEnded?: (session: CallSession) => void;
}

export function PhoneCallManagerIncoming({ onCallStarted, onCallEnded }: PhoneCallManagerIncomingProps) {
  const [activeCalls, setActiveCalls] = useState<CallSession[]>([]);
  const [callHistory, setCallHistory] = useState<CallSession[]>([]);

  // This would be your actual Twilio number (from environment or config)
  const twilioNumber = "+1-555-TRANSLATE"; // Example format

  const copyNumber = useCallback(() => {
    navigator.clipboard.writeText(twilioNumber);
    // You could add a toast notification here
  }, [twilioNumber]);

  const formatPhoneNumber = (number: string) => {
    return number.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '$1 ($2) $3-$4');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ringing": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "in-progress": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "completed": return "bg-gray-500/10 text-gray-600 border-gray-500/20";
      default: return "bg-gray-500/10 text-gray-600 border-gray-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* Free Service Notice */}
      <Card className="border-green-500/20 bg-green-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-green-600 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-medium text-green-800">Free Translation Service</h3>
              <p className="text-sm text-green-700">
                Call our translation hotline to experience real-time English  French translation.
                No app installation required - just call the number below!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Translation Hotline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Translation Hotline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-4">
            <div className="p-6 border-2 border-dashed border-primary/30 rounded-lg bg-primary/5">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Call this number for instant translation:</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-mono font-bold text-primary">
                    {formatPhoneNumber(twilioNumber)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyNumber}
                    className="h-8 w-8 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Available 24/7  English  French  Real-time translation
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <h4 className="font-medium"> English Speakers</h4>
                <ul className="text-muted-foreground space-y-1">
                  <li> Call the number above</li>
                  <li> Speak in English</li>
                  <li> Hear French translation</li>
                  <li> Connect with French speakers</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium"> French Speakers</h4>
                <ul className="text-muted-foreground space-y-1">
                  <li> Appelez le numro ci-dessus</li>
                  <li> Parlez en franais</li>
                  <li> Entendez la traduction anglaise</li>
                  <li> Connectez-vous avec des anglophones</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
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
                <div className="font-medium">Call the Hotline</div>
                <div className="text-muted-foreground">Dial the translation number from any phone</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                2
              </div>
              <div className="text-sm">
                <div className="font-medium">Choose Your Language</div>
                <div className="text-muted-foreground">Press 1 for English, Press 2 for French</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                3
              </div>
              <div className="text-sm">
                <div className="font-medium">Start Speaking</div>
                <div className="text-muted-foreground">Speak naturally - hear real-time translation</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                4
              </div>
              <div className="text-sm">
                <div className="font-medium">Connect with Others</div>
                <div className="text-muted-foreground">Join conference calls with speakers of other languages</div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border/50">
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>Real-time AI translation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>No app download required</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span>Works from any phone</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Calls Monitor */}
      {activeCalls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-green-600" />
              Active Translation Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeCalls.map((call) => (
                <div key={call.callSid} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatPhoneNumber(call.phoneNumber)}</span>
                      <Badge className={getStatusColor(call.status)}>
                        {call.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {call.language === "en-US" ? "English  French" : "French  English"}
                      </div>
                      {call.startTime && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(call.startTime).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Setup Instructions */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-800">
            <AlertCircle className="w-5 h-5" />
            Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-amber-700">
            To activate this free translation hotline:
          </p>
          <div className="space-y-2 text-sm text-amber-700">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <span>Use Twilio's $15 free trial credit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <span>Configure incoming call webhooks</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <span>Deploy translation functions</span>
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-2">
            This approach uses only incoming calls, making it much more cost-effective!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}