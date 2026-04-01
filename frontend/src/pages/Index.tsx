import { useAppState } from "@/contexts/AppContext";
import { Settings, Trash2, Plus, Volume2, Hand, Radio, MessageSquare, Download, Users, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { OPENAI_VOICES } from "@/lib/constants";
import { useState, useEffect } from "react";
import { TranslationPanel } from "@/components/TranslationPanel";
import { RecordingStatus } from "@/components/RecordingStatus";
import { DownloadPanel } from "@/components/DownloadPanel";

// NeuralEcho Translation Interface
const Index = () => {
  const t = useAppState();
  const [showModeSelect, setShowModeSelect] = useState(false);

  // ✅ DEBUG: Confirm we're in SINGLE-USER mode
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎯 [MODE] SINGLE-USER MODE ACTIVE');
  console.log('🎯 [MODE] URL: /', window.location.pathname);
  console.log('🎯 [MODE] Using: useRealtimeVoice (direct OpenAI connection)');
  console.log('🎯 [MODE] This is NOT chatroom mode');
  console.log('═══════════════════════════════════════════════════════');

  // Set showModeSelect based on messages after mount
  useEffect(() => {
    setShowModeSelect(t.messages.length === 0);
  }, [t.messages.length]);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden relative">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-primary/20">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" alt="NeuralEcho" className="w-10 h-10 rounded-lg border border-border/50" />
          <div className="flex flex-col justify-center">
            <h1 className="font-mono-display text-lg font-semibold text-foreground tracking-tight">NeuralEcho</h1>
            <a
              href="https://goml.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors duration-300"
            >
              <span>A GoML Demo App</span>
            </a>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Recording Status */}
          <RecordingStatus recordingState={t.recordingState} />
          
          {/* Manual Download Button (for testing) */}
          {(t.recordingState.hasRecording || t.messages.length > 0) && (
            <button
              onClick={() => t.setShowDownloadPanel(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Download session data"
              title="Download recording and transcript"
            >
              <Download className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          
          <button
            onClick={() => {
              t.stopListening();
              t.clearHistory();
              setShowModeSelect(true);
            }}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="New session"
            title="Start a new session"
          >
            <Plus className="w-4 h-4 text-muted-foreground" />
          </button>
          {t.messages.length > 0 && (
            <button
              onClick={t.clearHistory}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Clear conversation"
            >
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          <Link
            to="/chatroom"
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Voice chatroom"
            title="Real-time voice chatroom"
          >
            <Users className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Link
            to="/documents"
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Document translation"
            title="Professional document translation"
          >
            <FileText className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Link
            to="/admin"
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Admin settings"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
          </Link>
        </div>
      </header>

      {/* Split screen panels */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <TranslationPanel langCode="en-US" />
        </div>
        <div className="w-px bg-border/50" />
        <div className="flex-1 min-w-0">
          <TranslationPanel langCode="fr-CA" />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 py-2 px-5 flex items-center justify-between">
        <p className="text-xs text-muted-foreground/40 tracking-wide">Neuralgo, Inc.  Internal & Confidential</p>
      </footer>

      {/* Mode selection modal */}
      {showModeSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-up">
          <div className="bg-card border border-border rounded-2xl shadow-xl p-6 w-80 space-y-5">
            <div className="text-center space-y-1">
              <MessageSquare className="w-10 h-10 text-primary/30 mx-auto" />
              <h2 className="text-lg font-semibold text-foreground">New Session</h2>
              <p className="text-sm text-muted-foreground">Choose your voice mode</p>
            </div>

            {/* Voice selector */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider font-medium">
                <Volume2 className="w-3.5 h-3.5" />
                AI Voice
              </label>
              <select
                value={t.selectedVoice}
                onChange={(e) => t.setSelectedVoice(e.target.value as any)}
                className="w-full text-sm bg-secondary border border-border rounded-lg px-3 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {OPENAI_VOICES.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.label}  {v.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => { t.setVoiceModeAndInit("push-to-talk"); setShowModeSelect(false); }}
                className="flex items-center gap-3 px-5 py-4 rounded-xl border border-border bg-secondary hover:bg-muted transition-colors text-left"
              >
                <Hand className="w-6 h-6 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Press & Talk</p>
                  <p className="text-xs text-muted-foreground">Hold the mic button while speaking</p>
                </div>
              </button>
              <button
                onClick={() => { t.setVoiceModeAndInit("hands-free"); setShowModeSelect(false); }}
                className="flex items-center gap-3 px-5 py-4 rounded-xl border border-border bg-secondary hover:bg-muted transition-colors text-left"
              >
                <Radio className="w-6 h-6 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Hands Free</p>
                  <p className="text-xs text-muted-foreground">Auto-detects when you speak</p>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowModeSelect(false)}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Download Panel */}
      <DownloadPanel
        isVisible={t.showDownloadPanel}
        onClose={() => t.setShowDownloadPanel(false)}
        recordingState={t.recordingState}
        transcriptData={t.messages.length > 0 ? {
          sessionId: `session-${Date.now()}`,
          timestamp: Date.now(),
          duration: t.insights.sessionDuration,
          speakers: t.speakers,
          messages: t.messages,
          insights: t.insights,
        } : null}
        onDownloadRecording={t.downloadRecording}
        onDownloadTranscript={t.downloadTranscript}
      />
    </div>
  );
};

export default Index;
