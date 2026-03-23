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
import { WebSocketDebug } from "./components/WebSocketDebug";

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/phone" element={<PhoneTranslation />} />
        <Route path="/chatroom" element={<Chatroom />} />
        <Route path="/documents" element={<DocumentTranslationPage />} />
        <Route path="/join/:roomId" element={<JoinRoom />} />
        <Route path="/debug" element={<div className="p-6"><WebSocketDebug /></div>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppProvider>
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
