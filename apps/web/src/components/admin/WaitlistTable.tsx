"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminApproveWaitlist } from "@/app/actions/waitlist";
import type { Waitlist } from "@template/supabase";

function ApproveButton({ id, approved }: { id: string; approved: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (approved) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        Approved
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await adminApproveWaitlist(id);
            if (result.error) {
              setError(result.error);
            } else {
              router.refresh(); // Re-run server component to reflect new state
            }
          })
        }
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {pending ? "Approving…" : "Approve"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function WaitlistTable({ entries }: { entries: Waitlist[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
        <p className="text-sm text-slate-500">No waitlist entries yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-100">
        <thead>
          <tr className="bg-slate-50">
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Joined
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 text-sm text-slate-900">{entry.email}</td>
              <td className="px-6 py-4 text-sm text-slate-500">
                {new Date(entry.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
              <td className="px-6 py-4">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    entry.approved
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {entry.approved ? "Approved" : "Pending"}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <ApproveButton id={entry.id} approved={entry.approved} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
