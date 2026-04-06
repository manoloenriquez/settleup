import * as React from "react";
import { Sparkles } from "lucide-react";

type AIBadgeProps = {
  label?: string;
};

export function AIBadge({ label = "AI-assisted" }: AIBadgeProps): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-medium text-brand-700">
      <Sparkles size={10} />
      {label}
    </span>
  );
}
