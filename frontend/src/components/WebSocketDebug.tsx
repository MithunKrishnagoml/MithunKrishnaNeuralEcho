import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WS_URL } from '@/lib/config';

export function WebSocketDebug() {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const addMessage = (msg: string) => {
    setMessages(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      addMessage('Already connected');
      return;
    }

    addMessage('Connecting to WebSocket...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      addMessage(' Connected to server');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      addMessage(` Received: ${data.type} - ${JSON.stringify(data)}`);
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      addMessage(` Disconnected (Code: ${event.code}, Reason: ${event.reason})`);
    };

    ws.onerror = (error) => {
      addMessage(` Error: ${error}`);
    };
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
  };

  const sendTestMessage = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const testMessage = {
        type: 'JOIN_ROOM',
        participant: {
          id: 'test-' + Date.now(),
          name: 'Test User',
          language: 'en-US',
          joinedAt: new Date(),
          isConnected: true
        },
        roomId: 'test-room-' + Date.now()
      };
      
      wsRef.current.send(JSON.stringify(testMessage));
      addMessage(` Sent: JOIN_ROOM message`);
    } else {
      addMessage(' Not connected');
    }
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>WebSocket Debug Tool</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={connect} disabled={isConnected}>
            Connect
          </Button>
          <Button onClick={disconnect} disabled={!isConnected} variant="outline">
            Disconnect
          </Button>
          <Button onClick={sendTestMessage} disabled={!isConnected} variant="secondary">
            Send Test Message
          </Button>
          <Button onClick={clearMessages} variant="ghost">
            Clear
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm">
            Status: {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="bg-muted p-3 rounded-lg h-64 overflow-y-auto">
          <div className="text-xs font-mono space-y-1">
            {messages.length === 0 ? (
              <div className="text-muted-foreground">No messages yet...</div>
            ) : (
              messages.map((msg, index) => (
                <div key={index}>{msg}</div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}