import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Plus, LogIn, Globe, Mic } from 'lucide-react';
import { CreateRoomData, JoinRoomData } from '@/types/chatroom';

interface RoomJoinCreateProps {
  onCreateRoom: (data: CreateRoomData) => void;
  onJoinRoom: (data: JoinRoomData) => void;
  isLoading?: boolean;
  prefilledRoomId?: string;
}

export function RoomJoinCreate({ onCreateRoom, onJoinRoom, isLoading = false, prefilledRoomId = '' }: RoomJoinCreateProps) {
  const [createData, setCreateData] = useState<CreateRoomData>({
    name: '',
    language: 'en-US'
  });
  
  const [joinData, setJoinData] = useState<JoinRoomData>({
    name: '',
    language: 'en-US',
    roomId: prefilledRoomId
  });

  const handleCreateRoom = () => {
    if (createData.name.trim()) {
      onCreateRoom(createData);
    }
  };

  const handleJoinRoom = () => {
    if (joinData.name.trim() && joinData.roomId.trim()) {
      onJoinRoom(joinData);
    }
  };

  const generateRoomId = () => {
    const randomId = Math.random().toString(36).substring(2, 8);
    return `neuralecho-${randomId}`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative">
      {/* GoML Background */}
      <div className="goml-bg">
        <div className="goml-pattern goml-pattern-1">GoML</div>
        <div className="goml-pattern goml-pattern-2">GoML</div>
        <div className="goml-pattern goml-pattern-3">GoML</div>
      </div>

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Globe className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold">NeuralEcho Chatroom</h1>
          </div>
          <p className="text-muted-foreground">
            Real-time voice translation between English and French
          </p>
        </div>

        {/* Room Actions */}
        <Tabs defaultValue={prefilledRoomId ? "join" : "create"} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Room
            </TabsTrigger>
            <TabsTrigger value="join" className="flex items-center gap-2">
              <LogIn className="w-4 h-4" />
              Join Room
            </TabsTrigger>
          </TabsList>

          {/* Create Room Tab */}
          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Create New Room
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-name">Your Name</Label>
                  <Input
                    id="create-name"
                    placeholder="Enter your name"
                    value={createData.name}
                    onChange={(e) => setCreateData(prev => ({ ...prev, name: e.target.value }))}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-language">Your Language</Label>
                  <Select 
                    value={createData.language} 
                    onValueChange={(value: 'en-US' | 'fr-CA') => 
                      setCreateData(prev => ({ ...prev, language: value }))
                    }
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en-US"> English (US)</SelectItem>
                      <SelectItem value="fr-CA"> Franais (Canada)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-2">
                  <Button 
                    onClick={handleCreateRoom}
                    disabled={!createData.name.trim() || isLoading}
                    className="w-full"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Creating Room...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Create Room
                      </div>
                    )}
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground text-center">
                  Room ID will be generated automatically (e.g., {generateRoomId()})
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Join Room Tab */}
          <TabsContent value="join">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogIn className="w-5 h-5" />
                  Join Existing Room
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="join-name">Your Name</Label>
                  <Input
                    id="join-name"
                    placeholder="Enter your name"
                    value={joinData.name}
                    onChange={(e) => setJoinData(prev => ({ ...prev, name: e.target.value }))}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="join-language">Your Language</Label>
                  <Select 
                    value={joinData.language} 
                    onValueChange={(value: 'en-US' | 'fr-CA') => 
                      setJoinData(prev => ({ ...prev, language: value }))
                    }
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en-US"> English (US)</SelectItem>
                      <SelectItem value="fr-CA"> Franais (Canada)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="join-room-id">Room ID</Label>
                  <Input
                    id="join-room-id"
                    placeholder="neuralecho-abc123"
                    value={joinData.roomId}
                    onChange={(e) => setJoinData(prev => ({ ...prev, roomId: e.target.value }))}
                    disabled={isLoading}
                  />
                </div>

                <div className="pt-2">
                  <Button 
                    onClick={handleJoinRoom}
                    disabled={!joinData.name.trim() || !joinData.roomId.trim() || isLoading}
                    className="w-full"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Joining Room...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <LogIn className="w-4 h-4" />
                        Join Room
                      </div>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Features Info */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Mic className="w-4 h-4" />
                How it works
              </h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>Two people join the same room with different languages</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>Speak into your microphone in your native language</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>AI translates and speaks to the other person in real-time</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}