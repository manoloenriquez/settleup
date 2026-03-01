import { formatCents } from "@template/shared";
import { Receipt, Banknote } from "lucide-react";
import type { ActivityItem } from "@/app/actions/activity";

type Props = {
  activities: ActivityItem[];
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export function ActivityTimeline({ activities }: Props): React.ReactElement {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-4">No activity yet.</p>
    );
  }

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Recent Activity
      </h4>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3.5 top-2 bottom-2 w-px bg-slate-200" />

        <div className="space-y-3">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 relative">
              {/* Dot/Icon */}
              <div
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  activity.type === "expense"
                    ? "bg-indigo-100 text-indigo-600"
                    : "bg-emerald-100 text-emerald-600"
                }`}
              >
                {activity.type === "expense" ? (
                  <Receipt size={14} />
                ) : (
                  <Banknote size={14} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                {activity.type === "expense" ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{activity.item_name}</span>
                    {" — "}
                    <span className="font-semibold">{formatCents(activity.amount_cents)}</span>
                    {activity.participant_count && (
                      <span className="text-slate-500">
                        {" "}split {activity.participant_count} ways
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{activity.from_name}</span>
                    {" paid "}
                    <span className="font-medium">{activity.to_name}</span>
                    {" "}
                    <span className="font-semibold text-emerald-600">
                      {formatCents(activity.amount_cents)}
                    </span>
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  {relativeTime(activity.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
