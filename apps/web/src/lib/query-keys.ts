import type { QueryClient } from "@tanstack/react-query";

/**
 * Query keys for the offline-first core views. Shapes are kept identical to
 * the mobile app's keys so the outbox invalidation logic stays portable.
 */
export const queryKeys = {
  dashboard: ["dashboard"] as const,
  recentActivity: (limit: number) => ["activity", "recent", limit] as const,
  groups: ["groups"] as const,
  archivedGroups: ["archivedGroups"] as const,
  expenses: (groupId: string) => ["expenses", groupId] as const,
  expenseTotals: (groupId: string) => ["expense-totals", groupId] as const,
  balances: (groupId: string) => ["balances", groupId] as const,
  creditorProfiles: (groupId: string) => ["creditor-profiles", groupId] as const,
  activity: (groupId: string) => ["activity", groupId] as const,
  pendingPayments: (groupId: string) => ["pending-payments", groupId] as const,
  comments: (expenseId: string) => ["comments", expenseId] as const,
  categories: (groupId: string) => ["categories", groupId] as const,
  members: (groupId: string) => ["members", groupId] as const,
  /** Web-only: unpaginated projection for charts/insights/budget. */
  expenseSummaries: (groupId: string) => ["expense-summaries", groupId] as const,
};

/** Keys to invalidate after outbox drains touch the given groups. */
export function invalidationKeysFor(groupIds: Set<string>): (string | undefined)[][] {
  // Comment threads key by expense id, so invalidate the whole root — only
  // mounted threads actually refetch.
  const keys: (string | undefined)[][] = [["dashboard"], ["groups"], ["comments"]];
  for (const groupId of groupIds) {
    keys.push(
      ["expenses", groupId],
      ["expense-summaries", groupId],
      ["expense-totals", groupId],
      ["balances", groupId],
      ["activity", groupId],
      ["pending-payments", groupId],
      ["categories", groupId],
    );
  }
  return keys;
}

/** Invalidate everything a mutation inside one group can affect. */
export function invalidateGroupData(queryClient: QueryClient, groupId: string): void {
  for (const key of invalidationKeysFor(new Set([groupId]))) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}
