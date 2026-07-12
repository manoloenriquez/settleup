import * as React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

const variants = {
  default: "border-border-subtle bg-surface shadow-card",
  interactive: "border-border-subtle bg-surface shadow-card transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-floating",
  metric: "border-brand-100 bg-brand-50 shadow-card",
  status: "border-border-subtle bg-surface shadow-card",
  flat: "border-border-subtle bg-surface shadow-none",
} as const;

type CardVariantProps = CardProps & { variant?: keyof typeof variants };

export function Card({ variant = "default", className = "", children, ...props }: CardVariantProps): React.ReactElement {
  return (
    <div
      className={`rounded-card border ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children, ...props }: CardProps): React.ReactElement {
  return (
    <div className={`border-b border-border-subtle px-6 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ className = "", children, ...props }: CardProps): React.ReactElement {
  return (
    <div className={`px-6 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
}
