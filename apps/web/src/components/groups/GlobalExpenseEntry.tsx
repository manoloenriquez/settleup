"use client";

import { useRouter } from "next/navigation";
import { AddExpenseDialog } from "./AddExpenseDialog";
import type { ExpenseCategory, GroupMember } from "@template/supabase";

type GlobalExpenseEntryProps = {
  groupId: string;
  members: GroupMember[];
  categories: ExpenseCategory[];
  currentUserId: string;
};

export function GlobalExpenseEntry(props: GlobalExpenseEntryProps): React.ReactElement {
  const router = useRouter();
  return (
    <AddExpenseDialog
      open
      onClose={() => router.push(`/groups/${props.groupId}`)}
      {...props}
    />
  );
}
