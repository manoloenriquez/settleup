"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AddExpenseDialog } from "./AddExpenseDialog";
import { ChevronRight, Plus, BarChart3, CreditCard, Settings, Users } from "lucide-react";
import type { GroupMember } from "@template/supabase";

type Props = {
  groupId: string;
  groupName: string;
  memberCount: number;
  members: GroupMember[];
};

export function GroupHeader({
  groupId,
  groupName,
  memberCount,
  members,
}: Props): React.ReactElement {
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);

  return (
    <>
      <div>
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-slate-400 mb-3">
          <Link href="/groups" className="hover:text-slate-600 transition-colors font-medium">
            Groups
          </Link>
          <ChevronRight size={12} />
          <span className="text-slate-600 font-medium truncate max-w-[200px]">{groupName}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
              {groupName}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <Users size={13} />
              {memberCount} member{memberCount !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Icon-only secondary actions */}
            <Link href={`/groups/${groupId}/insights`} title="Insights">
              <button
                type="button"
                className="h-9 w-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <BarChart3 size={16} />
              </button>
            </Link>
            <Link href="/account/payment" title="Payment settings">
              <button
                type="button"
                className="h-9 w-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <CreditCard size={16} />
              </button>
            </Link>
            <Link href={`/groups/${groupId}/settings`} title="Settings">
              <button
                type="button"
                className="h-9 w-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <Settings size={16} />
              </button>
            </Link>

            {/* Primary CTA */}
            <Button size="sm" leftIcon={Plus} onClick={() => setShowExpenseDialog(true)}>
              Add Expense
            </Button>
          </div>
        </div>
      </div>

      <AddExpenseDialog
        open={showExpenseDialog}
        onClose={() => setShowExpenseDialog(false)}
        groupId={groupId}
        members={members}
      />
    </>
  );
}
