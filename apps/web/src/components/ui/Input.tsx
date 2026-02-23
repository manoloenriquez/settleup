import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = "", ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            "w-full rounded-lg border px-3 py-2 text-sm text-slate-900",
            "placeholder:text-slate-400 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-red-400 focus:border-red-500 focus:ring-red-500"
              : "border-slate-300",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
