import Link from "next/link";
import { CheckCircle2, Circle, CreditCard, Receipt, Share2, UserPlus, UserRoundCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CopyButton } from "./CopyButton";

type ChecklistItem = {
  label: string;
  complete: boolean;
  href?: string;
  copyText?: string;
  copyLabel?: string;
  icon: LucideIcon;
};

type Props = {
  groupId: string;
  items: ChecklistItem[];
};

export function GroupSetupChecklist({ groupId, items }: Props): React.ReactElement | null {
  const remaining = items.filter((item) => !item.complete);
  if (remaining.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-900">Finish group setup</p>
          <p className="mt-0.5 text-xs text-amber-700">
            {remaining.length} step{remaining.length !== 1 ? "s" : ""} left before this group is trip-ready.
          </p>
        </div>
        <Link href={`/groups/${groupId}/settings`} className="text-xs font-semibold text-amber-800 hover:text-amber-950">
          Settings
        </Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const StatusIcon = item.complete ? CheckCircle2 : Circle;
          const content = (
            <span className="flex min-h-11 items-center gap-2 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs font-medium text-slate-700">
              <StatusIcon size={14} className={item.complete ? "text-emerald-600" : "text-amber-500"} />
              <Icon size={14} className="text-slate-400" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </span>
          );

          if (item.complete) return <div key={item.label}>{content}</div>;
          if (item.copyText) {
            return (
              <div key={item.label} className="flex flex-col gap-1">
                {content}
                <CopyButton text={item.copyText} label={item.copyLabel ?? "Copy"} />
              </div>
            );
          }
          if (item.href) {
            return (
              <Link key={item.label} href={item.href}>
                {content}
              </Link>
            );
          }
          return <div key={item.label}>{content}</div>;
        })}
      </div>
    </section>
  );
}

export const setupChecklistIcons: Record<"members" | "claim" | "payment" | "share" | "expense", LucideIcon> = {
  members: UserPlus,
  claim: UserRoundCheck,
  payment: CreditCard,
  share: Share2,
  expense: Receipt,
} as const;
