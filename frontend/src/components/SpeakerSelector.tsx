import { Speaker, LanguageCode, LANGUAGES } from "@/lib/constants";
import { Mic } from "lucide-react";
import { CountryFlag } from "@/components/CountryFlag";

interface SpeakerSelectorProps {
  speakers: Speaker[];
  activeSpeakerId: number;
  onSelectSpeaker: (id: number) => void;
  onLanguageChange: (speakerId: number, lang: LanguageCode) => void;
  disabled?: boolean;
}

export function SpeakerSelector({
  speakers, activeSpeakerId, onSelectSpeaker, onLanguageChange, disabled,
}: SpeakerSelectorProps) {
  return (
    <div className={`flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      {speakers.map((speaker) => {
        const isActive = speaker.id === activeSpeakerId;
        const lang = LANGUAGES.find(l => l.code === speaker.language);

        return (
          <button
            key={speaker.id}
            onClick={() => onSelectSpeaker(speaker.id)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg border transition-all flex-shrink-0
              ${isActive
                ? "border-primary/50 bg-primary/10"
                : "border-border bg-secondary hover:bg-muted"
              }
            `}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: speaker.color }}
            />
            <span className="text-xs font-medium text-foreground">{speaker.name}</span>
            <CountryFlag countryCode={lang?.countryCode || "US"} size={16} />
            {isActive && <Mic className="w-3 h-3 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}
