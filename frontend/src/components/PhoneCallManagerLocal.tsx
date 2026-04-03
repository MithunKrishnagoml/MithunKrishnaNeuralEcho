import { useState, useCallback } from "react";
import { Phone, PhoneCall, PhoneOff, Users, Globe, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface CallSession {
  callSid: string;
  status: string;
  phoneNumber: string;
  language: "en-US" | "fr-CA";
  startTime?: string;
  duration?: number;
}

interface PhoneCallManagerLocalProps {
  onCallStarted?: (session: CallSession) => void;
  onCallEnded?: (session: CallSession) => void;
}

// Country options with flags and calling codes
const COUNTRIES = [
  { code: "US", name: "United States", flag: "", callingCode: "+1" },
  { code: "CA", name: "Canada", flag: "", callingCode: "+1" },
  { code: "GB", name: "United Kingdom", flag: "", callingCode: "+44" },
  { code: "FR", name: "France", flag: "", callingCode: "+33" },
  { code: "DE", name: "Germany", flag: "", callingCode: "+49" },
  { code: "AU", name: "Australia", flag: "", callingCode: "+61" },
  { code: "JP", name: "Japan", flag: "", callingCode: "+81" },
  { code: "IN", name: "India", flag: "", callingCode: "+91" },
  { code: "BR", name: "Brazil", flag: "", callingCode: "+55" },
  { code: "MX", name: "Mexico", flag: "", callingCode: "+52" },
  { code: "ES", name: "Spain", flag: "", callingCode: "+34" },
  { code: "IT", name: "Italy", flag: "", callingCode: "+39" },
  { code: "NL", name: "Netherlands", flag: "", callingCode: "+31" },
  { code: "SE", name: "Sweden", flag: "", callingCode: "+46" },
  { code: "NO", name: "Norway", flag: "", callingCode: "+47" },
  { code: "DK", name: "Denmark", flag: "", callingCode: "+45" },
  { code: "FI", name: "Finland", flag: "", callingCode: "+358" },
  { code: "CH", name: "Switzerland", flag: "", callingCode: "+41" },
  { code: "AT", name: "Austria", flag: "", callingCode: "+43" },
  { code: "BE", name: "Belgium", flag: "", callingCode: "+32" },
];

export function PhoneCallManagerLocal({ onCallStarted, onCallEnded }: PhoneCallManagerLocalProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [language, setLanguage] = useState<"en-US" | "fr-CA">("en-US");
  const [callerName, setCallerName] = useState("");
  const [isInitiating, setIsInitiating] = useState(false);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [callHistory, setCallHistory] = useState<CallSession[]>([]);

  const selectedCountry = COUNTRIES.find(c => c.code === countryCode);

  // Simulate call initiation for demo purposes
  const initiateCall = useCallback(async () => {
    if (!phoneNumber.trim()) {
      alert("Please enter a phone number");
      return;
    }

    setIsInitiating(true);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create mock call session
      const mockCallSid = `CA${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      const formattedNumber = `${selectedCountry?.callingCode}${phoneNumber.trim()}`;
      
      const newSession: CallSession = {
        callSid: mockCallSid,
        status: "in-progress",
        phoneNumber: formattedNumber,
        language,
        startTime: new Date().toISOString(),
      };

      setActiveCall(newSession);
      setCallHistory(prev => [newSession, ...prev]);
      onCallStarted?.(newSession);

      // Simulate call status updates
      setTimeout(() => {
        setActiveCall(prev => prev ? { ...prev, status: "answered" } : null);
      }, 3000);

    } catch (error) {
      console.error("Error initiating call:", error);
      alert(`Failed to initiate call: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsInitiating(false);
    }
  }, [phoneNumber, countryCode, language, callerName, onCallStarted, selectedCountry]);

  const endCall = useCallback(async () => {
    if (!activeCall) return;

    try {
      const endedSession = { ...activeCall, status: "completed" };
      setActiveCall(null);
      setCallHistory(prev => 
        prev.map(call => 
          call.callSid === activeCall.callSid 
            ? endedSession
            : call
        )
      );
      onCallEnded?.(endedSession);
    } catch (error) {
      console.error("Error ending call:", error);
      alert(`Failed to end call: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [activeCall, onCallEnded]);

  const formatPhoneNumber = (number: string, country?: string) => {
    const cleaned = number.replace(/\D/g, '');
    const countryInfo = COUNTRIES.find(c => c.code === country);
    const callingCode = countryInfo?.callingCode || '';
    
    if (country === 'US' || country === 'CA') {
      if (cleaned.length === 10) {
        return `${callingCode} (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
      }
    }
    
    if (cleaned.length > 6) {
      return `${callingCode} ${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    }
    
    return `${callingCode} ${number}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "queued": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "ringing": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "in-progress": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "answered": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "completed": return "bg-gray-500/10 text-gray-600 border-gray-500/20";
      case "failed": return "bg-red-500/10 text-red-600 border-red-500/20";
      default: return "bg-gray-500/10 text-gray-600 border-gray-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* Demo Notice */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-medium text-amber-800">Demo Mode</h3>
              <p className="text-sm text-amber-700">
                This is a demonstration interface. To enable actual phone calls, you need to:
              </p>
              <ul className="text-sm text-amber-700 space-y-1 ml-4">
                <li> Install Supabase CLI</li>
                <li> Configure Twilio credentials</li>
                <li> Deploy the phone translation functions</li>
              </ul>
              <p className="text-xs text-amber-600 mt-2">
                See the setup guide for complete instructions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Call Initiation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Start Translation Call (Demo)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select value={countryCode} onValueChange={setCountryCode} disabled={isInitiating || !!activeCall}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      <div className="flex items-center gap-2">
                        <span>{country.flag}</span>
                        <span className="text-xs text-muted-foreground">{country.callingCode}</span>
                        <span>{country.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <div className="flex">
                <div className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted text-sm text-muted-foreground">
                  {selectedCountry?.flag} {selectedCountry?.callingCode}
                </div>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="123 456 7890"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isInitiating || !!activeCall}
                  className="rounded-l-none"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Caller's Language</Label>
              <Select value={language} onValueChange={(value: "en-US" | "fr-CA") => setLanguage(value)} disabled={isInitiating || !!activeCall}>
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
          
          <div className="space-y-2">
            <Label htmlFor="callerName">Caller Name (Optional)</Label>
            <Input
              id="callerName"
              placeholder="John Doe"
              value={callerName}
              onChange={(e) => setCallerName(e.target.value)}
              disabled={isInitiating || !!activeCall}
            />
          </div>

          <div className="flex gap-2">
            {!activeCall ? (
              <Button 
                onClick={initiateCall} 
                disabled={isInitiating || !phoneNumber.trim()}
                className="flex items-center gap-2"
              >
                {isInitiating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Simulating Call...
                  </>
                ) : (
                  <>
                    <PhoneCall className="w-4 h-4" />
                    Start Demo Call
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={endCall} 
                variant="destructive"
                className="flex items-center gap-2"
              >
                <PhoneOff className="w-4 h-4" />
                End Demo Call
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active Call Status */}
      {activeCall && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-green-600" />
              Demo Call Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatPhoneNumber(activeCall.phoneNumber, countryCode)}</span>
                  <Badge className={getStatusColor(activeCall.status)}>
                    {activeCall.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {activeCall.language === "en-US" ? "English  French" : "French  English"}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Demo Mode
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Call History */}
      {callHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Demo Call History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {callHistory.slice(0, 5).map((call) => (
                <div key={call.callSid} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatPhoneNumber(call.phoneNumber, countryCode)}</span>
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
    </div>
  );
}