import { formatCents } from "@template/shared";

type Props = {
  members: { id: string; display_name: string }[];
  expenses: {
    payers: { member_id: string; paid_cents: number }[];
    participants: { member_id: string; share_cents: number }[];
  }[];
};

// Two-series categorical pair, validated (CVD + contrast) against the light surface.
const PAID_COLOR = "#059669";
const SHARE_COLOR = "#6366f1";

/**
 * Per-member "paid vs share" — who fronted money versus who consumed it.
 * Paired horizontal bars per member with amounts as ink-colored text.
 */
export function MemberPaidVsShare({ members, expenses }: Props): React.ReactElement | null {
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  for (const e of expenses) {
    for (const p of e.payers) paid.set(p.member_id, (paid.get(p.member_id) ?? 0) + p.paid_cents);
    for (const s of e.participants) share.set(s.member_id, (share.get(s.member_id) ?? 0) + s.share_cents);
  }

  const rows = members
    .map((m) => ({
      id: m.id,
      name: m.display_name,
      paid: paid.get(m.id) ?? 0,
      share: share.get(m.id) ?? 0,
    }))
    .filter((r) => r.paid !== 0 || r.share !== 0)
    .sort((a, b) => b.paid - a.paid);

  if (rows.length === 0) return null;

  const max = Math.max(...rows.flatMap((r) => [r.paid, r.share]), 1);
  const width = (cents: number): string => `${Math.max(cents > 0 ? 1 : 0, (cents / max) * 100)}%`;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Who paid vs. who consumed</h3>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PAID_COLOR }} />
            Paid
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SHARE_COLOR }} />
            Share
          </span>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.id}>
            <p className="mb-1.5 truncate text-sm font-medium text-slate-700">{r.name}</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: width(r.paid), backgroundColor: PAID_COLOR }} />
                </div>
                <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-900">
                  {formatCents(r.paid)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: width(r.share), backgroundColor: SHARE_COLOR }} />
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {formatCents(r.share)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
