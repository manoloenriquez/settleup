import Link from "next/link";
import { formatCents, DEFAULT_CATEGORY_COLOR } from "@template/shared";
import { Banknote, Clock } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CategoryIconTile } from "@/components/groups/CategoryIcon";
import { relativeTime } from "@/lib/relative-time";
import type { RecentActivityItem } from "@/app/actions/activity";

type Props = {
  items: RecentActivityItem[];
};

const amountClasses = {
  in: "text-emerald-600",
  out: "text-rose-600",
  neutral: "text-slate-700",
} as const;

function signedAmount(item: RecentActivityItem): string {
  const amount = formatCents(item.amount_cents);
  if (item.direction === "in") return `+${amount}`;
  if (item.direction === "out") return `-${amount}`;
  return amount;
}

export function RecentActivityFeed({ items }: Props): React.ReactElement {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No activity yet"
        description="Expenses and payments across your groups will show up here."
      />
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li key={`${item.type}-${item.id}`}>
          <Link
            href={`/groups/${item.group_id}`}
            className="flex items-center gap-3 rounded-2xl px-2 -mx-2 py-3 transition-colors hover:bg-slate-50"
          >
            {item.type === "payment" ? (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Banknote size={20} />
              </span>
            ) : (
              <CategoryIconTile
                icon={item.category?.icon}
                color={item.category?.color ?? DEFAULT_CATEGORY_COLOR}
              />
            )}

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">
                {item.title}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {item.subtitle}
                {item.type === "expense" && item.group_name !== item.title
                  ? ` · ${item.group_name}`
                  : ""}
              </span>
            </span>

            <span className="shrink-0 text-right">
              <span className={`block text-sm font-bold tabular-nums ${amountClasses[item.direction]}`}>
                {signedAmount(item)}
              </span>
              <span className="block text-xs text-slate-400">{relativeTime(item.created_at)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
