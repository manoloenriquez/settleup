import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={["btn", `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(" ")}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading ? <span aria-hidden>...</span> : children}
    </button>
  );
}
