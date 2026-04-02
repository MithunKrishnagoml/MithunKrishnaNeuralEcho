import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import Index from "./pages/Index";
import AdminPage from "./pages/Admin";
import NotFound from "./pages/NotFound";
import PhoneTranslation from "./pages/PhoneTranslation";
import Chatroom from "./pages/Chatroom";
import JoinRoom from "./pages/JoinRoom";
import DocumentTranslationPage from "./pages/DocumentTranslation";
import { RoomInterface } from "./components/RoomInterface";

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <Routes>
      {/* Single-user routes with AppProvider (WebRTC/OpenAI) */}
      <Route path="/" element={<AppProvider><Index /></AppProvider>} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/admin" element={<AppProvider><AdminPage /></AppProvider>} />
      <Route path="/phone" element={<AppProvider><PhoneTranslation /></AppProvider>} />
      <Route path="/documents" element={<AppProvider><DocumentTranslationPage /></AppProvider>} />
      
      {/* Chatroom routes WITHOUT AppProvider (WebSocket-only, no WebRTC) */}
      <Route path="/chatroom" element={<Chatroom />} />
      <Route path="/join/:roomId" element={<JoinRoom />} />
      <Route path="/room/:roomId" element={<RoomInterface />} />
      
      {/* Debug and fallback routes */}
      <Route path="/debug" element={<div className="p-6"><WebSocketDebug /></div>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
