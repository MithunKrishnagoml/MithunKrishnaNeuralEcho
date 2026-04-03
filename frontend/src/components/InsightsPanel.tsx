import { SessionInsights } from "@/lib/constants";
import { Activity, Wifi, AlertTriangle, Brain, Timer, MessageSquare } from "lucide-react";

interface InsightsPanelProps {
  insights: SessionInsights;
  isLive: boolean;
}

function MetricCard({ icon: Icon, label, value, unit, color }: {
  icon: React.ElementType; label: string; value: string; unit: string; color: string;
}) {
  return (
    <div className="bg-secondary/60 rounded-lg p-3 border border-border/50">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-mono-display font-semibold text-foreground">{value}</span>
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

export function InsightsPanel({ insights, isLive }: InsightsPanelProps) {
  const formatMs = (v: number) => v > 0 ? Math.round(v).toString() : "";
  const formatPct = (v: number) => v > 0 ? Math.round(v * 100).toString() : "";
  const formatDuration = (s: number) => {
    if (s <= 0) return "0s";
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="px-4 py-3 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-3.5 h-3.5 text-primary" />
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Session Insights
        </h3>
        {isLive && (
          <span className="flex items-center gap-1 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-success">Live</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MetricCard
          icon={Timer}
          label="Translation"
          value={formatMs(insights.avgTranslationLatency)}
          unit="ms avg"
          color="hsl(24, 95%, 53%)"
        />
        <MetricCard
          icon={Activity}
          label="Synthesis"
          value={formatMs(insights.avgSynthesisLatency)}
          unit="ms avg"
          color="hsl(200, 80%, 55%)"
        />
        <MetricCard
          icon={Wifi}
          label="Network"
          value={formatMs(insights.avgNetworkDelay)}
          unit="ms avg"
          color="hsl(142, 72%, 45%)"
        />
        <MetricCard
          icon={Brain}
          label="Confidence"
          value={formatPct(insights.avgConfidence)}
          unit="%"
          color="hsl(280, 70%, 55%)"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Error rate"
          value={formatPct(insights.errorRate)}
          unit="%"
          color="hsl(0, 72%, 51%)"
        />
        <MetricCard
          icon={MessageSquare}
          label="Messages"
          value={insights.totalMessages.toString()}
          unit={formatDuration(insights.sessionDuration)}
          color="hsl(45, 90%, 50%)"
        />
      </div>
    </div>
  );
}
