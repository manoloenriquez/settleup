"use client";

import { keepPreviousData, useInfiniteQuery, useQuery, type UseQueryResult, type UseInfiniteQueryResult, type InfiniteData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getGroupRow, listGroupsWithStats, listArchivedGroups, type GroupRow } from "@/lib/queries/groups";
import { getDashboardSummaries } from "@/lib/queries/dashboard";
import { getGroupCurrencies } from "@/lib/queries/currency";
import { getMembersWithBalances, getCreditorProfiles } from "@/lib/queries/balances";
import { listExpenses, listExpenseSummaries } from "@/lib/queries/expenses";
import { getGroupActivity, getRecentActivity } from "@/lib/queries/activity";
import { listExpenseCategories } from "@/lib/queries/categories";
import { listPendingPayments } from "@/lib/queries/payments";
import { listExpenseComments } from "@/lib/queries/comments";
import { getPaymentProfile } from "@/lib/queries/payment-profiles";
import type { ActivityItem, RecentActivityItem } from "@/app/actions/activity";
import type { ExpenseSummary, ExpenseWithParticipants } from "@/app/actions/expenses";
import type { PendingPayment } from "@/app/actions/friend-payments";
import type { ExpenseComment } from "@/app/actions/comments";
import type { ApiResponse, CurrencyCode, PaginatedResponse, DashboardSummary, GroupWithStats, MemberBalance, CreditorPaymentProfile } from "@template/shared";
import type { ExpenseCategory, Group, UserPaymentProfile } from "@template/supabase";

/**
 * Read hooks for the offline-first core views. Fetchers hit Supabase directly
 * from the browser (same RLS-guarded reads the mobile app uses), so refetches
 * run in parallel with a single round trip each. The persisted cache covers
 * offline and makes warm navigations instant — a failed background fetch just
 * keeps showing cached data.
 */

async function unwrap<T>(promise: Promise<ApiResponse<T>>): Promise<T> {
  const result = await promise;
  if (result.error !== null) throw new Error(result.error);
  return result.data as T;
}

export function useGroupRow(groupId: string): UseQueryResult<GroupRow | null> {
  return useQuery({
    queryKey: queryKeys.group(groupId),
    queryFn: () => unwrap(getGroupRow(groupId)),
  });
}

/** One summary per currency in use (never combined across currencies). */
export function useDashboardSummaries(): UseQueryResult<DashboardSummary[]> {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => unwrap(getDashboardSummaries()),
  });
}

/**
 * Currencies the group holds, default first. Disabled until the group row
 * (and so its default currency) is known.
 */
export function useGroupCurrencies(
  groupId: string,
  defaultCurrency: CurrencyCode | undefined,
): UseQueryResult<CurrencyCode[]> {
  return useQuery({
    queryKey: queryKeys.groupCurrencies(groupId),
    queryFn: () => unwrap(getGroupCurrencies(groupId, defaultCurrency ?? "PHP")),
    enabled: defaultCurrency !== undefined,
  });
}

export function useRecentActivity(limit: number): UseQueryResult<RecentActivityItem[]> {
  return useQuery({
    queryKey: queryKeys.recentActivity(limit),
    queryFn: () => unwrap(getRecentActivity(limit)),
  });
}

export function useGroupsWithStats(): UseQueryResult<GroupWithStats[]> {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => unwrap(listGroupsWithStats()),
  });
}

export function useArchivedGroups(): UseQueryResult<Group[]> {
  return useQuery({
    queryKey: queryKeys.archivedGroups,
    queryFn: () => unwrap(listArchivedGroups()),
  });
}

/** Balances in one currency; disabled until the currency is known. */
export function useMembersWithBalances(
  groupId: string,
  currency: CurrencyCode | undefined,
): UseQueryResult<MemberBalance[]> {
  return useQuery({
    queryKey: queryKeys.balances(groupId, currency ?? "PHP"),
    queryFn: () => unwrap(getMembersWithBalances(groupId, currency ?? "PHP")),
    enabled: currency !== undefined,
    // Keeps the member list on screen while another currency loads; rows are
    // tagged with currency_code so callers never show them as the new one.
    placeholderData: keepPreviousData,
  });
}

export function useCreditorProfiles(
  groupId: string,
  currency: CurrencyCode | undefined,
): UseQueryResult<CreditorPaymentProfile[]> {
  return useQuery({
    queryKey: queryKeys.creditorProfiles(groupId, currency ?? "PHP"),
    queryFn: () => unwrap(getCreditorProfiles(groupId, currency ?? "PHP")),
    enabled: currency !== undefined,
  });
}

export function useExpenseSummaries(groupId: string): UseQueryResult<ExpenseSummary[]> {
  return useQuery({
    queryKey: queryKeys.expenseSummaries(groupId),
    queryFn: () => unwrap(listExpenseSummaries(groupId)),
  });
}

export function useGroupActivity(groupId: string): UseQueryResult<ActivityItem[]> {
  return useQuery({
    queryKey: queryKeys.activity(groupId),
    queryFn: () => unwrap(getGroupActivity(groupId)),
  });
}

export function usePendingPaymentsQuery(groupId: string): UseQueryResult<PendingPayment[]> {
  return useQuery({
    queryKey: queryKeys.pendingPayments(groupId),
    queryFn: () => unwrap(listPendingPayments(groupId)),
  });
}

export function useCategoriesQuery(groupId: string): UseQueryResult<ExpenseCategory[]> {
  return useQuery({
    queryKey: queryKeys.categories(groupId),
    queryFn: () => unwrap(listExpenseCategories(groupId)),
  });
}

export function useCommentsQuery(expenseId: string): UseQueryResult<ExpenseComment[]> {
  return useQuery({
    queryKey: queryKeys.comments(expenseId),
    queryFn: () => unwrap(listExpenseComments(expenseId)),
  });
}

export function usePaymentProfile(): UseQueryResult<UserPaymentProfile | null> {
  return useQuery({
    queryKey: queryKeys.paymentProfile,
    queryFn: () => unwrap(getPaymentProfile()),
  });
}

export type ExpensesPage = PaginatedResponse<ExpenseWithParticipants>;

export function useExpensesInfinite(
  groupId: string,
  pageSize: number,
): UseInfiniteQueryResult<InfiniteData<ExpensesPage>> {
  return useInfiniteQuery({
    queryKey: queryKeys.expenses(groupId),
    queryFn: ({ pageParam }) => unwrap(listExpenses(groupId, pageParam, pageSize)),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}
