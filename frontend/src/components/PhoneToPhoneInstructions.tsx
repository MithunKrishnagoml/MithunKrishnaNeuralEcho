import { Phone, Users, ArrowRight, MessageCircle, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function PhoneToPhoneInstructions() {
  return (
    <div className="space-y-6">
      {/* Main Instructions */}
      <Alert>
        <Phone className="h-4 w-4" />
        <AlertDescription>
          <strong>Phone-to-Phone Translation:</strong> Both people call the same number (+1 910 600-6827) and get connected with real-time AI translation between them.
        </AlertDescription>
      </Alert>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            How Phone-to-Phone Translation Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step by Step */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                <Phone className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold">Step 1: First Caller</h3>
                <p className="text-sm text-muted-foreground">
                  Person A calls <strong>+1 910 600-6827</strong><br/>
                  Says "English" when prompted<br/>
                  Waits in conference
                </p>
              </div>
            </div>

            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <Phone className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Step 2: Second Caller</h3>
                <p className="text-sm text-muted-foreground">
                  Person B calls <strong>+1 910 600-6827</strong><br/>
                  Says "Franais" when prompted<br/>
                  Gets connected to Person A
                </p>
              </div>
            </div>

            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
                <MessageCircle className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">Step 3: AI Translation</h3>
                <p className="text-sm text-muted-foreground">
                  AI translates in real-time:<br/>
                  English  French<br/>
                  French  English
                </p>
              </div>
            </div>
          </div>

          {/* Translation Flow */}
          <div className="border rounded-lg p-4 bg-muted/50">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Real-Time Translation Flow
            </h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-blue-50">Person A (English)</Badge>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <Badge variant="outline" className="bg-purple-50">AI Translator</Badge>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <Badge variant="outline" className="bg-green-50">Person B (French)</Badge>
              </div>
              <div className="text-sm text-muted-foreground pl-4">
                "Hello, how are you?"  AI  "Bonjour, comment allez-vous ?"
              </div>
              
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-green-50">Person B (French)</Badge>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <Badge variant="outline" className="bg-purple-50">AI Translator</Badge>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <Badge variant="outline" className="bg-blue-50">Person A (English)</Badge>
              </div>
              <div className="text-sm text-muted-foreground pl-4">
                "Je vais bien, merci !"  AI  "I'm doing well, thank you!"
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Important Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Important Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm"> The Phone Number</h4>
            <p className="text-sm text-muted-foreground">
              Both people call the same Twilio number: <strong>+1 910 600-6827</strong><br/>
              They don't call each other directly - they both call your translation service.
            </p>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-semibold text-sm"> Language Selection</h4>
            <p className="text-sm text-muted-foreground">
              When calling, clearly say "English" or "Franais" when prompted.<br/>
              The AI will detect your language and set up translation accordingly.
            </p>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-semibold text-sm"> Real-Time Translation</h4>
            <p className="text-sm text-muted-foreground">
              Translation happens automatically with sub-second latency.<br/>
              Just speak naturally - the AI handles everything in the background.
            </p>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-semibold text-sm"> Cost Considerations</h4>
            <p className="text-sm text-muted-foreground">
              Each call uses OpenAI Realtime API credits for translation.<br/>
              Monitor your usage in the OpenAI dashboard.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Web Interface vs Phone-to-Phone */}
      <Card>
        <CardHeader>
          <CardTitle>Web Interface vs Phone-to-Phone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm"> Web Interface (Above)</h4>
              <p className="text-sm text-muted-foreground">
                 Calls one person from the web app<br/>
                 Good for testing the system<br/>
                 One-way: web  phone
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-semibold text-sm"> Phone-to-Phone (Real Use)</h4>
              <p className="text-sm text-muted-foreground">
                 Both people call the same number<br/>
                 True bidirectional translation<br/>
                 Two-way: phone  phone with AI in middle
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}