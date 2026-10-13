import type { AssistantSnapshot, Proposal, SnapshotGroup } from "./types";
import { pairwiseBalance } from "./queries";
import { formatAmount } from "../utils/amount";
import { revalidateBudget } from "./budget";

// ---------------------------------------------------------------------------
// Confirm-time check. A preview can sit on screen while data changes (another
// device edits the expense, someone leaves the group, the user switches
// account). Before executing, the app rebuilds the snapshot and this decides
// whether the proposal still means what the preview said. Returns null when it
// does, otherwise the reason shown instead of executing.
// ---------------------------------------------------------------------------

function group(snapshot: AssistantSnapshot, id: string): SnapshotGroup | undefined {
  return snapshot.groups.find((g) => g.id === id && !g.archived && g.myMemberId);
}

function hasMembers(g: SnapshotGroup, ids: string[]): boolean {
  return ids.every((id) => g.members.some((m) => m.id === id));
}

function isAdmin(g: SnapshotGroup): boolean {
  return g.myRole === "owner" || g.myRole === "admin";
}

export function revalidateProposal(proposal: Proposal, snapshot: AssistantSnapshot): string | null {
  const a = proposal.action;
  if (a.type === "add_personal_expense") return null;
  // Budgets live on this phone (guest or account): the preview must match the budget as it is now.
  if (a.type === "budget_setup" || a.type === "budget_change" || a.type === "budget_plan") return revalidateBudget(a.revision, snapshot);
  if (a.type === "edit_personal_expense" || a.type === "delete_personal_expense") {
    // Personal expenses live on this phone: check the current copy, guest or not.
    const current = snapshot.personal.find((e) => e.id === a.expenseId);
    if (!current) return "That expense was deleted.";
    if (current.updatedAt !== a.expectedUpdatedAt) return "That expense was changed since I showed you this. Ask again to see the latest.";
    return null;
  }
  if (snapshot.isGuest) return "You're signed out now. Sign in to do this.";
  if (proposal.requiresConnection && !snapshot.online) return "This needs a connection. Try again when you're online.";
  switch (a.type) {
    case "add_group_expense": {
      const g = group(snapshot, a.groupId);
      if (!g) return "That group isn't available anymore.";
      if (!hasMembers(g, [a.payerMemberId, ...a.shares.map((s) => s.memberId)])) return "Someone in this expense has left the group. Ask again.";
      return null;
    }
    case "edit_group_expense":
    case "delete_group_expense": {
      const g = group(snapshot, a.groupId);
      if (!g) return "That group isn't available anymore.";
      const current = g.expenses?.find((e) => e.id === a.expenseId);
      if (g.expenses && g.expensesComplete && !current) return "That expense was deleted.";
      if (current && current.updatedAt !== a.expectedUpdatedAt) return "That expense was changed since I showed you this. Ask again to see the latest.";
      if (a.type === "edit_group_expense" && !hasMembers(g, [...a.shares.map((s) => s.memberId), ...a.payers.map((p) => p.memberId)])) {
        return "Someone in this expense has left the group. Ask again.";
      }
      return null;
    }
    case "record_payment": {
      const g = group(snapshot, a.groupId);
      if (!g) return "That group isn't available anymore.";
      if (!hasMembers(g, [a.fromMemberId, a.toMemberId])) return "That person isn't in the group anymore.";
      if (a.settlesFullBalance) {
        // "Settle up" took the amount from the balance: it must still be the balance.
        if (!g.balances) return "I couldn't check the balance just now. Ask again in a moment.";
        const me = g.myMemberId;
        const other = a.fromMemberId === me ? a.toMemberId : a.fromMemberId;
        const owed = pairwiseBalance(g, other).get(a.currency) ?? 0; // + = they owe me
        const now = a.fromMemberId === me ? -owed : owed;
        if (now <= 0) return "That balance is already settled. Nothing was recorded.";
        if (now !== a.amountMinor) {
          return `The balance changed since I showed you this — it's ${formatAmount(now, a.currency)} now. Ask again to settle the new amount.`;
        }
      }
      return null;
    }
    case "create_group":
      return a.name.trim() ? null : "The group needs a name.";
    case "add_members": {
      const g = group(snapshot, a.groupId);
      if (!g) return "That group isn't available anymore.";
      return null;
    }
    case "remove_member":
    case "rename_group": {
      const g = group(snapshot, a.groupId);
      if (!g) return "That group isn't available anymore.";
      if (!isAdmin(g)) return "You're no longer an owner or admin of this group.";
      if (a.type === "remove_member" && !g.members.some((m) => m.id === a.memberId)) return "They already left the group.";
      return null;
    }
  }
}
