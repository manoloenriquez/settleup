"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AddExpenseDialog } from "./AddExpenseDialog";
import { ArrowLeft, Plus, BarChart3, CreditCard } from "lucide-react";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/groups"
            className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
          >
            <ArrowLeft size={14} />
            Groups
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{groupName}</h1>
          <p className="text-sm text-slate-500">
            {memberCount} member{memberCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            leftIcon={Plus}
            onClick={() => setShowExpenseDialog(true)}
          >
            Add Expense
          </Button>
          <Link href={`/groups/${groupId}/insights`}>
            <Button variant="secondary" size="sm" leftIcon={BarChart3}>
              Insights
            </Button>
          </Link>
          <Link href="/account/payment">
            <Button variant="secondary" size="sm" leftIcon={CreditCard}>
              Payment
            </Button>
          </Link>
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
