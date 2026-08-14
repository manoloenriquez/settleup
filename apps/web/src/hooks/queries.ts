"use client";

import { useInfiniteQuery, useQuery, type UseQueryResult, type UseInfiniteQueryResult, type InfiniteData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getDashboardSummary } from "@/app/actions/dashboard";
import { getGroupActivity, getRecentActivity } from "@/app/actions/activity";
import { listGroupsWithStats, listArchivedGroups } from "@/app/actions/groups";
import { getMembersWithBalances, getCreditorProfiles } from "@/app/actions/balances";
import { listExpenses, listExpenseSummaries } from "@/app/actions/expenses";
import { listExpenseCategories } from "@/app/actions/categories";
import { listPendingPayments } from "@/app/actions/friend-payments";
import { listExpenseComments } from "@/app/actions/comments";
import type { ExpenseComment } from "@/app/actions/comments";
import type { ActivityItem, RecentActivityItem } from "@/app/actions/activity";
import type { ExpenseSummary, ExpenseWithParticipants } from "@/app/actions/expenses";
import type { PendingPayment } from "@/app/actions/friend-payments";
import type { ApiResponse, PaginatedResponse, DashboardSummary, GroupWithStats, MemberBalance, CreditorPaymentProfile } from "@template/shared";
import type { ExpenseCategory, Group } from "@template/supabase";

/**
 * Read hooks for the offline-first core views. Fetchers call the existing
 * server actions (auth + Zod + RLS preserved); the persisted query cache
 * covers offline renders, so a fetch failure while offline just keeps
 * showing cached data.
 */

async function unwrap<T>(promise: Promise<ApiResponse<T>>): Promise<T> {
  const result = await promise;
  if (result.error !== null) throw new Error(result.error);
  return result.data as T;
}

/** Initial data captured during the RSC render, with its timestamp. */
export type Seed<T> = { data: T; updatedAt: number };

export function useDashboardSummary(seed?: Seed<DashboardSummary>): UseQueryResult<DashboardSummary> {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => unwrap(getDashboardSummary()),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}

export function useRecentActivity(limit: number, seed?: Seed<RecentActivityItem[]>): UseQueryResult<RecentActivityItem[]> {
  return useQuery({
    queryKey: queryKeys.recentActivity(limit),
    queryFn: () => unwrap(getRecentActivity(limit)),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}

export function useGroupsWithStats(seed?: Seed<GroupWithStats[]>): UseQueryResult<GroupWithStats[]> {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => unwrap(listGroupsWithStats()),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}

export function useArchivedGroups(seed?: Seed<Group[]>): UseQueryResult<Group[]> {
  return useQuery({
    queryKey: queryKeys.archivedGroups,
    queryFn: () => unwrap(listArchivedGroups()),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}

export function useMembersWithBalances(groupId: string, seed?: Seed<MemberBalance[]>): UseQueryResult<MemberBalance[]> {
  return useQuery({
    queryKey: queryKeys.balances(groupId),
    queryFn: () => unwrap(getMembersWithBalances(groupId)),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}

export function useCreditorProfiles(groupId: string, seed?: Seed<CreditorPaymentProfile[]>): UseQueryResult<CreditorPaymentProfile[]> {
  return useQuery({
    queryKey: queryKeys.creditorProfiles(groupId),
    queryFn: () => unwrap(getCreditorProfiles(groupId)),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}

export function useExpenseSummaries(groupId: string, seed?: Seed<ExpenseSummary[]>): UseQueryResult<ExpenseSummary[]> {
  return useQuery({
    queryKey: queryKeys.expenseSummaries(groupId),
    queryFn: () => unwrap(listExpenseSummaries(groupId)),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}

export function useGroupActivity(groupId: string, seed?: Seed<ActivityItem[]>): UseQueryResult<ActivityItem[]> {
  return useQuery({
    queryKey: queryKeys.activity(groupId),
    queryFn: () => unwrap(getGroupActivity(groupId)),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}

export function usePendingPaymentsQuery(groupId: string, seed?: Seed<PendingPayment[]>): UseQueryResult<PendingPayment[]> {
  return useQuery({
    queryKey: queryKeys.pendingPayments(groupId),
    queryFn: () => unwrap(listPendingPayments(groupId)),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}

export function useCategoriesQuery(groupId: string, seed?: Seed<ExpenseCategory[]>): UseQueryResult<ExpenseCategory[]> {
  return useQuery({
    queryKey: queryKeys.categories(groupId),
    queryFn: () => unwrap(listExpenseCategories(groupId)),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}

export function useCommentsQuery(expenseId: string): UseQueryResult<ExpenseComment[]> {
  return useQuery({
    queryKey: queryKeys.comments(expenseId),
    queryFn: () => unwrap(listExpenseComments(expenseId)),
  });
}

export type ExpensesPage = PaginatedResponse<ExpenseWithParticipants>;

export function useExpensesInfinite(
  groupId: string,
  pageSize: number,
  seed?: Seed<ExpensesPage>,
): UseInfiniteQueryResult<InfiniteData<ExpensesPage>> {
  return useInfiniteQuery({
    queryKey: queryKeys.expenses(groupId),
    queryFn: ({ pageParam }) => unwrap(listExpenses(groupId, pageParam, pageSize)),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    initialData: seed ? { pages: [seed.data], pageParams: [1] } : undefined,
    initialDataUpdatedAt: seed?.updatedAt,
  });
}
