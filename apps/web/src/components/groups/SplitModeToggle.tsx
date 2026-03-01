"use client";

import { Sparkles, Equal, SlidersHorizontal } from "lucide-react";

type SplitMode = "equal" | "smart" | "custom";

type Props = {
  value: SplitMode;
  onChange: (mode: SplitMode) => void;
  showSmart?: boolean;
};

const modes: { id: SplitMode; label: string; icon: typeof Equal }[] = [
  { id: "equal", label: "Equal", icon: Equal },
  { id: "smart", label: "Smart", icon: Sparkles },
  { id: "custom", label: "Manual", icon: SlidersHorizontal },
];

export function SplitModeToggle({ value, onChange, showSmart = true }: Props): React.ReactElement {
  const visibleModes = showSmart ? modes : modes.filter((m) => m.id !== "smart");

  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {visibleModes.map((mode) => {
        const Icon = mode.icon;
        const active = value === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            <Icon size={13} />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
