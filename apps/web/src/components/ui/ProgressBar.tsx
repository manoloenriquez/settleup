import * as React from "react";

type ProgressBarProps = {
  value: number; // 0–100
  label?: string;
  variant?: "default" | "ai";
};

export function ProgressBar({
  value,
  label,
  variant = "default",
}: ProgressBarProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor = variant === "ai" ? "bg-indigo-500 animate-pulse-ai" : "bg-indigo-600";

  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-600">{label}</span>
          <span className="text-xs text-slate-500">{Math.round(clamped)}%</span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
