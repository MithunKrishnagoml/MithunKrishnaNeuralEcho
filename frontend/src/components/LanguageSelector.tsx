import { LANGUAGES, LanguageCode } from "@/lib/constants";
import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { CountryFlag } from "@/components/CountryFlag";

interface LanguageSelectorProps {
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
  label: string;
}

export function LanguageSelector({ value, onChange, label }: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = LANGUAGES.find((l) => l.code === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
        {label}
      </span>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary hover:bg-muted transition-colors w-full text-left"
      >
        <CountryFlag countryCode={selected?.countryCode || "US"} size={20} />
        <span className="text-sm font-medium text-foreground flex-1">
          {selected?.label}
          <span className="text-muted-foreground ml-1 text-xs">({selected?.region})</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto animate-fade-up">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => { onChange(lang.code); setOpen(false); }}
              className={`flex items-center gap-2 px-4 py-2.5 w-full text-left hover:bg-muted transition-colors
                ${lang.code === value ? "bg-muted text-primary" : "text-foreground"}
              `}
            >
              <CountryFlag countryCode={lang.countryCode || "US"} size={20} />
              <span className="text-sm">{lang.label}</span>
              <span className="text-xs text-muted-foreground">({lang.region})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
