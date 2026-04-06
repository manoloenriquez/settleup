import * as React from "react";

const variants = {
  success: "bg-green-100 text-green-700 border border-green-200",
  warning: "bg-amber-100 text-amber-700 border border-amber-200",
  danger: "bg-red-100 text-red-700 border border-red-200",
  neutral: "bg-slate-100 text-slate-600 border border-slate-200",
  info: "bg-brand-100 text-brand-700 border border-brand-200",
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
