import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  icon: LucideIcon;
  isLoading?: boolean;
  variant?: "ghost" | "secondary" | "danger";
};

const variants = {
  ghost: "border-transparent bg-transparent text-muted hover:bg-surface-muted hover:text-ink",
  secondary: "border-border-subtle bg-surface text-muted hover:bg-surface-muted hover:text-ink",
  danger: "border-danger/20 bg-danger-soft text-danger hover:brightness-95",
} as const;

export function IconButton({ label, icon: Icon, isLoading = false, variant = "ghost", className = "", disabled, ...props }: IconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled ?? isLoading}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon size={18} aria-hidden="true" />}
    </button>
  );
}
