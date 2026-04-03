import { ADMIN_LABELS } from "@/lib/constants";
import { Settings, Info, Minus, Plus } from "lucide-react";
import { useState } from "react";

interface AdminPanelProps {
  autoDetect: boolean;
  onAutoDetectChange: (v: boolean) => void;
  translationEnabled: boolean;
  onTranslationChange: (v: boolean) => void;
  captionsEnabled: boolean;
  onCaptionsChange: (v: boolean) => void;
  voiceFeedback: boolean;
  onVoiceFeedbackChange: (v: boolean) => void;
  speakerCount: number;
  onSpeakerCountChange: (v: number) => void;
  showInsights: boolean;
  onShowInsightsChange: (v: boolean) => void;
}

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

function SpeakerCountControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground">{ADMIN_LABELS.speakerCount}</span>
        <button className="relative" aria-label={ADMIN_LABELS.speakerCountTooltip}>
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => value > 2 && onChange(value - 1)}
          disabled={value <= 2}
          className="w-7 h-7 rounded-md bg-secondary hover:bg-muted flex items-center justify-center disabled:opacity-30 transition-colors"
        >
          <Minus className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <span className="text-sm font-mono-display font-semibold text-foreground w-5 text-center">{value}</span>
        <button
          onClick={() => value < 8 && onChange(value + 1)}
          disabled={value >= 8}
          className="w-7 h-7 rounded-md bg-secondary hover:bg-muted flex items-center justify-center disabled:opacity-30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

export function AdminPanel(props: AdminPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2.5 rounded-lg bg-secondary hover:bg-muted transition-colors"
        aria-label="Settings"
      >
        <Settings className={`w-5 h-5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl p-4 z-50 animate-fade-up">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Settings</h3>
          <div className="divide-y divide-border">
            <SpeakerCountControl value={props.speakerCount} onChange={props.onSpeakerCountChange} />
            <Toggle checked={props.autoDetect} onChange={props.onAutoDetectChange} label={ADMIN_LABELS.autoDetect} tooltip={ADMIN_LABELS.autoDetectTooltip} />
            <Toggle checked={props.translationEnabled} onChange={props.onTranslationChange} label={ADMIN_LABELS.translationToggle} tooltip={ADMIN_LABELS.translationToggleTooltip} />
            <Toggle checked={props.captionsEnabled} onChange={props.onCaptionsChange} label={ADMIN_LABELS.captionsToggle} tooltip={ADMIN_LABELS.captionsToggleTooltip} />
            <Toggle checked={props.voiceFeedback} onChange={props.onVoiceFeedbackChange} label={ADMIN_LABELS.voiceFeedback} tooltip={ADMIN_LABELS.voiceFeedbackTooltip} />
            <Toggle checked={props.showInsights} onChange={props.onShowInsightsChange} label={ADMIN_LABELS.showInsights} tooltip={ADMIN_LABELS.showInsightsTooltip} />
          </div>
        </div>
      )}
    </div>
  );
}
