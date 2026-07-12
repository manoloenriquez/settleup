import * as React from "react";

const variants = {
  success: "bg-positive-soft text-positive border border-positive/20",
  positive: "bg-positive-soft text-positive border border-positive/20",
  warning: "bg-outgoing-soft text-outgoing border border-outgoing/20",
  outgoing: "bg-outgoing-soft text-outgoing border border-outgoing/20",
  danger: "bg-danger-soft text-danger border border-danger/20",
  neutral: "bg-surface-muted text-muted border border-border-subtle",
  info: "bg-brand-100 text-brand-700 border border-brand-200",
  ai: "bg-ai-soft text-ai border border-ai/20",
} as const;

type BadgeProps = {
  variant?: keyof typeof variants;
  children: React.ReactNode;
  className?: string;
};

export function Badge({ variant = "neutral", children, className = "" }: BadgeProps): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
