import * as React from "react";
import type { LucideIcon } from "lucide-react";

const variants = {
  primary: "bg-indigo-600 text-white border-transparent hover:bg-indigo-700",
  secondary: "bg-white text-slate-700 border-slate-300 hover:bg-slate-50",
  ghost: "bg-transparent text-slate-700 border-transparent hover:bg-slate-100",
  danger: "bg-red-600 text-white border-transparent hover:bg-red-700",
} as const;

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
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
        "inline-flex items-center justify-center rounded-lg border font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
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
