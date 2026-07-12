type BrandMarkProps = { size?: "sm" | "md" | "lg"; className?: string };

const sizes = { sm: "h-6 w-6", md: "h-8 w-8", lg: "h-10 w-10" } as const;

export function BrandMark({ size = "md", className = "" }: BrandMarkProps): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex overflow-hidden rounded-full bg-brand-600 shadow-sm ${sizes[size]} ${className}`}
    >
      <span className="absolute inset-y-[18%] left-[18%] w-[29%] rounded-l-full bg-white" />
      <span className="absolute inset-y-[18%] right-[18%] w-[29%] rounded-r-full border-2 border-white bg-brand-600" />
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-brand-300" />
    </span>
  );
}
