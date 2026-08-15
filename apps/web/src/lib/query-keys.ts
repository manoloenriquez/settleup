import type { QueryClient } from "@tanstack/react-query";

/**
 * Query keys for the offline-first core views. Shapes are kept identical to
 * the mobile app's keys so the outbox invalidation logic stays portable.
 */
export const queryKeys = {
  group: (groupId: string) => ["group", groupId] as const,
  paymentProfile: ["payment-profile"] as const,
  dashboard: ["dashboard"] as const,
  recentActivity: (limit: number) => ["activity", "recent", limit] as const,
  groups: ["groups"] as const,
  archivedGroups: ["archivedGroups"] as const,
  expenses: (groupId: string) => ["expenses", groupId] as const,
  balances: (groupId: string) => ["balances", groupId] as const,
  creditorProfiles: (groupId: string) => ["creditor-profiles", groupId] as const,
  activity: (groupId: string) => ["activity", groupId] as const,
  pendingPayments: (groupId: string) => ["pending-payments", groupId] as const,
  comments: (expenseId: string) => ["comments", expenseId] as const,
  categories: (groupId: string) => ["categories", groupId] as const,
  /** Web-only: unpaginated projection for charts/insights/budget. */
  expenseSummaries: (groupId: string) => ["expense-summaries", groupId] as const,
};

/**
 * When this tab last invalidated a group's queries itself. The realtime
 * subscriber consults it to skip the redundant second invalidation caused by
 * the tab's own write echoing back over the websocket.
 */
const lastLocalInvalidateAt = new Map<string, number>();

export function stampLocalInvalidate(groupId: string): void {
  lastLocalInvalidateAt.set(groupId, Date.now());
}

export function wasRecentlyInvalidatedLocally(groupId: string, windowMs = 3_000): boolean {
  const at = lastLocalInvalidateAt.get(groupId);
  return at !== undefined && Date.now() - at < windowMs;
}

/** Keys to invalidate after outbox drains touch the given groups. */
export function invalidationKeysFor(groupIds: Set<string>): (string | undefined)[][] {
  // Comment threads key by expense id and the recent-activity feed keys by
  // limit, so both invalidate at the root — only mounted queries refetch.
  const keys: (string | undefined)[][] = [["dashboard"], ["groups"], ["comments"], ["activity"]];
  for (const groupId of groupIds) {
    keys.push(
      ["group", groupId],
      ["expenses", groupId],
      ["expense-summaries", groupId],
      ["balances", groupId],
      ["creditor-profiles", groupId],
      ["pending-payments", groupId],
      ["categories", groupId],
    );
  }
  return keys;
}

/** Invalidate everything a mutation inside one group can affect. */
export function invalidateGroupData(queryClient: QueryClient, groupId: string): void {
  stampLocalInvalidate(groupId);
  for (const key of invalidationKeysFor(new Set([groupId]))) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}
