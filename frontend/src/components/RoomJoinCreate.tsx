import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Plus, LogIn, Globe, Mic, Copy, Check, QrCode } from 'lucide-react';
import { CreateRoomData, JoinRoomData } from '@/types/chatroom';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

interface RoomJoinCreateProps {
  onCreateRoom: (data: CreateRoomData) => Promise<{ roomId: string; joinUrl: string }>;
  onJoinRoom: (data: JoinRoomData) => void;
  isLoading?: boolean;
  prefilledRoomId?: string;
  onLanguageSelected?: (language: 'en-US' | 'fr-CA', roomId: string) => void;
}

export function RoomJoinCreate({ onCreateRoom, onJoinRoom, isLoading = false, prefilledRoomId = '', onLanguageSelected }: RoomJoinCreateProps) {
  const [createData, setCreateData] = useState<CreateRoomData>({
    name: '',
    language: 'en-US'
  });
  
  const [joinData, setJoinData] = useState<JoinRoomData>({
    name: '',
    language: 'en-US',
    roomId: prefilledRoomId
  });

  const [createdRoom, setCreatedRoom] = useState<{ roomId: string; joinUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateRoom = async () => {
    if (createData.name.trim()) {
      try {
        const result = await onCreateRoom(createData);
        setCreatedRoom(result);
        // Notify about language selection
        if (onLanguageSelected) {
          onLanguageSelected(createData.language, result.roomId);
        }
      } catch (error) {
        console.error('Failed to create room:', error);
        toast.error('Failed to create room');
      }
    }
  };

  const handleCopyLink = async () => {
    if (createdRoom) {
      try {
        await navigator.clipboard.writeText(createdRoom.joinUrl);
        setCopied(true);
        toast.success('Invite link copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        toast.error('Failed to copy link');
      }
    }
  };

  const handleEnterRoom = () => {
    if (createdRoom) {
      window.location.href = `/room/${createdRoom.roomId}?name=${encodeURIComponent(createData.name)}&language=${encodeURIComponent(createData.language)}`;
    }
  };

  const handleBackToCreate = () => {
    setCreatedRoom(null);
  };

  const handleJoinRoom = async () => {
    if (joinData.name.trim() && joinData.roomId.trim()) {
      try {
        await onJoinRoom(joinData);
      } catch (error) {
        console.error('Failed to join room:', error);
        toast.error('Failed to join room. Please try again.');
      }
    } else {
      toast.error('Please enter your name and room ID');
    }
  };

  const generateRoomId = () => {
    const randomId = Math.random().toString(36).substring(2, 8);
    return `neuralecho-${randomId}`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative">
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
        {createdRoom ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Room Created Successfully!
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">
                  Share this invite link or QR code with someone to start your conversation.
                </p>
                
                {/* QR Code */}
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-white rounded-lg">
                    <QRCodeSVG value={createdRoom.joinUrl} size={200} />
                  </div>
                </div>

                {/* Room Info */}
                <div className="space-y-2 text-sm">
                  <div className="font-medium">Room ID: {createdRoom.roomId}</div>
                  <div className="text-muted-foreground">
                    Created by: {createData.name} ({createData.language === 'en-US' ? 'English' : 'Français'})
                  </div>
                </div>

                {/* Invite Link */}
                <div className="space-y-2">
                  <Label>Invite Link</Label>
                  <div className="flex gap-2">
                    <Input
                      value={createdRoom.joinUrl}
                      readOnly
                      className="flex-1"
                    />
                    <Button
                      onClick={handleCopyLink}
                      variant="outline"
                      size="sm"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleBackToCreate}
                    variant="outline"
                    className="flex-1"
                  >
                    Create Another Room
                  </Button>
                  <Button
                    onClick={handleEnterRoom}
                    className="flex-1"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Enter Room
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
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
                      <SelectItem value="fr-CA"> Canadien français (Canada)</SelectItem>
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
                      <SelectItem value="fr-CA"> Canadien français (Canada)</SelectItem>
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
        )}

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