import * as React from "react";
import type { LucideIcon } from "lucide-react";

const variants = {
  primary: "bg-brand-600 text-white border-transparent shadow-sm hover:bg-brand-700 hover:shadow-card",
  secondary: "bg-surface text-ink border-border-subtle hover:bg-surface-muted",
  ghost: "bg-transparent text-muted border-transparent hover:bg-surface-muted hover:text-ink",
  danger: "bg-danger text-white border-transparent hover:brightness-90",
} as const;

const sizes = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "min-h-11 px-4 py-2 text-sm",
  lg: "min-h-12 px-6 py-3 text-base",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  isLoading?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  className = "",
  children,
  disabled,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  ...props
}: ButtonProps): React.ReactElement {
  const iconSize = size === "sm" ? 14 : size === "lg" ? 18 : 16;

  return (
    <button
      disabled={disabled ?? isLoading}
      className={[
        "inline-flex items-center justify-center rounded-control border font-semibold",
        "transition-[color,background-color,border-color,box-shadow,transform] active:translate-y-px focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading…
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          {LeftIcon && <LeftIcon size={iconSize} />}
          {children}
          {RightIcon && <RightIcon size={iconSize} />}
        </span>
      )}
    </button>
  );
}
