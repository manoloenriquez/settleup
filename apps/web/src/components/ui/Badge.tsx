import * as React from "react";

const variants = {
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-indigo-100 text-indigo-700",
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
