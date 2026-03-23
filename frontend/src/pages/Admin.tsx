import { ADMIN_LABELS, SPEAKER_COLORS, SPEAKER_NAMES, LanguageCode, LANGUAGES, getFlagEmoji } from "@/lib/constants";
import { InsightsPanel } from "@/components/InsightsPanel";
import { useAppState } from "@/contexts/AppContext";
import { Settings, Info, ArrowLeft, Users, Sliders, Activity, RotateCcw, Globe, Volume2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

function Toggle({ checked, onChange, label, tooltip }: { checked: boolean; onChange: (v: boolean) => void; label: string; tooltip: string }) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground">{label}</span>
        <button
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
          className="relative"
          aria-label={tooltip}
        >
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
          {showTip && (
            <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground w-52 shadow-lg animate-fade-up">
              {tooltip}
            </div>
          )}
        </button>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors relative ${checked ? "bg-primary" : "bg-muted"}`}
        role="switch"
        aria-checked={checked}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-foreground transition-transform ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

const TEMPLATE_VARIANTS = [
  { id: 2, label: "1-on-1", desc: "Two speakers  ideal for direct conversations", icon: "" },
  { id: 3, label: "Small group", desc: "Three-way multilingual discussion", icon: "" },
  { id: 4, label: "Panel", desc: "Four speakers  great for panels or interviews", icon: "" },
  { id: 6, label: "Meeting", desc: "Six participants  for larger meetings", icon: "" },
  { id: 8, label: "Large meeting", desc: "Up to eight  full room translation", icon: "" },
];

export default function AdminPage() {
  const app = useAppState();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <Link
          to="/"
          className="p-2 rounded-lg bg-secondary hover:bg-muted transition-colors"
          aria-label="Back to conversation"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="font-mono-display text-lg font-semibold text-foreground tracking-tight">Admin Panel</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6 space-y-8">

          {/* Template Variants */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Template Variant</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Choose how many speakers are in this session. Each speaker gets their own mic slot and language.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEMPLATE_VARIANTS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => app.updateSpeakerCount(v.id)}
                  className={`
                    p-4 rounded-xl border transition-all text-left
                    ${app.speakerCount === v.id
                      ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                      : "border-border bg-card hover:bg-muted"
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {Array.from({ length: Math.min(v.id, 4) }).map((_, i) => (
                      <span
                        key={i}
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: SPEAKER_COLORS[i] }}
                      />
                    ))}
                    {v.id > 4 && (
                      <span className="text-[10px] text-muted-foreground">+{v.id - 4}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">{v.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{v.desc}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Speaker language assignments */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Speaker Languages</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Assign a language to each speaker. Speakers can also change their language from the main screen.
            </p>
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {app.speakers.map((speaker) => {
                const lang = LANGUAGES.find(l => l.code === speaker.language);
                return (
                  <div key={speaker.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: speaker.color }}
                    />
                    <span className="text-sm font-medium text-foreground flex-1">{speaker.name}</span>
                    <select
                      value={speaker.language}
                      onChange={(e) => app.updateSpeakerLanguage(speaker.id, e.target.value as LanguageCode)}
                      className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {LANGUAGES.map(l => (
                        <option key={l.code} value={l.code}>
                          {getFlagEmoji(l.countryCode)} {l.label} ({l.region})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Settings Toggles */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <Sliders className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Preferences</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Control how NeuralEcho behaves during conversations.
            </p>
            <div className="bg-card border border-border rounded-xl p-4 divide-y divide-border">
              <Toggle checked={app.autoDetect} onChange={app.setAutoDetect} label={ADMIN_LABELS.autoDetect} tooltip={ADMIN_LABELS.autoDetectTooltip} />
              <Toggle checked={app.translationEnabled} onChange={app.setTranslationEnabled} label={ADMIN_LABELS.translationToggle} tooltip={ADMIN_LABELS.translationToggleTooltip} />
              <Toggle checked={app.captionsEnabled} onChange={app.setCaptionsEnabled} label={ADMIN_LABELS.captionsToggle} tooltip={ADMIN_LABELS.captionsToggleTooltip} />
              <Toggle checked={app.voiceFeedback} onChange={app.setVoiceFeedback} label={ADMIN_LABELS.voiceFeedback} tooltip={ADMIN_LABELS.voiceFeedbackTooltip} />
              
              {/* dB Threshold Control */}
              <div className="py-3">
                <div className="flex items-center gap-2 mb-3">
                  <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm text-foreground">{ADMIN_LABELS.dbThreshold}</span>
                  <button
                    onMouseEnter={(e) => {
                      const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                      if (tooltip) tooltip.style.display = "block";
                    }}
                    onMouseLeave={(e) => {
                      const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                      if (tooltip) tooltip.style.display = "none";
                    }}
                    className="relative"
                    aria-label={ADMIN_LABELS.dbThresholdTooltip}
                  >
                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground w-52 shadow-lg animate-fade-up hidden">
                      {ADMIN_LABELS.dbThresholdTooltip}
                    </div>
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <input
                      type="range"
                      min="-80"
                      max="-20"
                      step="1"
                      value={app.dbThreshold}
                      onChange={(e) => app.setDbThreshold(Number(e.target.value))}
                      className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <span className="ml-3 text-sm font-mono-display text-foreground min-w-[3rem] text-right">
                      {Math.round(app.dbThreshold)} dB
                    </span>
                  </div>
                  {app.currentDbLevel !== null && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Current level:</span>
                      <span className={`font-mono-display ${app.currentDbLevel > app.dbThreshold ? "text-primary" : "text-muted-foreground"}`}>
                        {Math.round(app.currentDbLevel)} dB
                        {app.currentDbLevel > app.dbThreshold && (
                          <span className="ml-1 text-[10px]"></span>
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
                    <span>More sensitive</span>
                    <span>Less sensitive</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Insights */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Session Insights</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Real-time performance metrics for the current session.
            </p>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <InsightsPanel insights={app.insights} isLive={app.messages.length > 0} />
            </div>
            <div className="flex justify-end mt-3">
              <button
                onClick={app.resetInsights}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset session metrics
              </button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
