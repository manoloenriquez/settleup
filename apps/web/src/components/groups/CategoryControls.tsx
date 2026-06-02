"use client";

import type { ExpenseCategory } from "@template/supabase";

type CategorySelectProps = {
  categories: ExpenseCategory[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  label?: string;
};

function categoryLabel(category: Pick<ExpenseCategory, "name" | "is_default">): string {
  return category.is_default ? category.name : `${category.name} (custom)`;
}

export function CategorySelect({ categories, value, onChange, label = "Category" }: CategorySelectProps): React.ReactElement {
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const shouldShowFallbackOther = value === null || !sorted.some((category) => category.slug === "other");

  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      >
        {shouldShowFallbackOther ? <option value="">Other</option> : null}
        {sorted.map((category) => (
          <option key={category.id} value={category.id}>
            {categoryLabel(category)}
          </option>
        ))}
      </select>
    </label>
  );
}

type CategoryBadgeProps = {
  category: Pick<ExpenseCategory, "name" | "color"> | null | undefined;
  compact?: boolean;
};

export function CategoryBadge({ category, compact = false }: CategoryBadgeProps): React.ReactElement {
  const name = category?.name ?? "Other";
  const color = category?.color ?? "#6b7280";

  return (
    <span
      className={[
        "inline-flex min-w-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white font-medium text-slate-600",
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
      ].join(" ")}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}
