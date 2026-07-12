import Link, { type LinkProps } from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type ButtonLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
};

const variants = {
  primary: "border-transparent bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-card",
  secondary: "border-border-subtle bg-surface text-ink hover:bg-surface-muted",
  ghost: "border-transparent bg-transparent text-muted hover:bg-surface-muted hover:text-ink",
} as const;

const sizes = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "min-h-11 px-4 py-2 text-sm",
  lg: "min-h-12 px-6 py-3 text-base",
} as const;

export function ButtonLink({ children, className = "", size = "md", variant = "primary", leftIcon: LeftIcon, rightIcon: RightIcon, ...props }: ButtonLinkProps): React.ReactElement {
  const iconSize = size === "sm" ? 14 : size === "lg" ? 18 : 16;
  return (
    <Link
      className={`inline-flex items-center justify-center gap-1.5 rounded-control border font-semibold transition-[color,background-color,border-color,box-shadow,transform] active:translate-y-px focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {LeftIcon && <LeftIcon size={iconSize} aria-hidden="true" />}
      {children}
      {RightIcon && <RightIcon size={iconSize} aria-hidden="true" />}
    </Link>
  );
}
