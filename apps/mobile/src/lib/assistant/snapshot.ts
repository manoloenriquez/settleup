import type { QueryClient, InfiniteData } from "@tanstack/react-query";
import type {
  AssistantSnapshot,
  CurrencyCode,
  GroupWithStats,
  MemberBalance,
  PaginatedResponse,
  PersonalExpense,
  SnapshotExpense,
  SnapshotGroup,
} from "@template/shared";
import type { GroupMember } from "@template/supabase";
import { listGroupsWithStats } from "@/services/groups";
import { listMembers } from "@/services/members";
import { listFriends, type Friend } from "@/services/friends";
import { getMembersWithBalances } from "@/services/balances";
import { getGroupCurrencies } from "@/services/currency";
import { listExpenses, type ExpenseWithDetails } from "@/services/expenses";

// ---------------------------------------------------------------------------
// The assistant's view of the user's data, built from the SAME React Query
// keys the screens use: cached data first, refreshed when online. Offline it
// never waits on the network (fetchQuery would pause until reconnect).
// ---------------------------------------------------------------------------

const STALE_MS = 30_000;
/** Upper bound when a question needs a group's full history. */
const MAX_EXPENSES = 1000;

type Deps = {
  qc: QueryClient;
  online: boolean;
  userId: string | null;
  myName: string | null;
  defaultCurrency: CurrencyCode;
  personal: PersonalExpense[];
  today: string;
  /** Full expense lists already loaded for "load" requests, by group. */
  fullExpenses: Map<string, ExpenseWithDetails[]>;
  /** Outbox entries not yet synced. */
  pendingWrites: number;
};

async function cached<T>(qc: QueryClient, online: boolean, queryKey: readonly unknown[], fetcher: () => Promise<T>): Promise<T | null> {
  if (!online) return (qc.getQueryData<T>(queryKey) ?? null) as T | null;
  try {
    return await qc.fetchQuery({ queryKey, queryFn: fetcher, staleTime: STALE_MS });
  } catch {
    return (qc.getQueryData<T>(queryKey) ?? null) as T | null;
  }
}

function unwrap<T>(res: { data: T | null; error: string | null }): T {
  if (res.error || res.data === null) throw new Error(res.error ?? "Failed to load");
  return res.data;
}

function toSnapshotExpense(e: ExpenseWithDetails, userId: string | null): SnapshotExpense {
  return {
    id: e.id,
    groupId: e.group_id,
    description: e.item_name,
    amountMinor: e.amount_cents,
    currency: e.currency_code,
    date: e.expense_date,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
    createdByMe: !!userId && e.created_by_user_id === userId,
    itemized: (e.items?.length ?? 0) > 0,
    categoryId: e.category_id,
    notes: e.notes,
    payers: e.payers.map((p) => ({ memberId: p.member_id, amountMinor: p.paid_cents })),
    shares: e.participants.map((p) => ({ memberId: p.member_id, shareCents: p.share_cents })),
  };
}

export async function buildSnapshot(deps: Deps): Promise<AssistantSnapshot> {
  const { qc, online, userId } = deps;
  const base: AssistantSnapshot = {
    today: deps.today,
    isGuest: !userId,
    online,
    myName: deps.myName,
    defaultCurrency: deps.defaultCurrency,
    groups: [],
    pendingWrites: deps.pendingWrites,
    personal: deps.personal
      .filter((e) => !e.deletedAt)
      .map((e) => ({ id: e.id, description: e.description, amountMinor: e.amountMinor, currency: e.currency, date: e.date, category: e.category })),
  };
  if (!userId) return base;

  const [groups, friends] = await Promise.all([
    cached<GroupWithStats[]>(qc, online, ["groups"], async () => unwrap(await listGroupsWithStats())),
    cached<Friend[]>(qc, online, ["friends"], async () => unwrap(await listFriends())),
  ]);
  const friendByGroup = new Map((friends ?? []).map((f) => [f.direct_group_id, f]));

  const snapshotGroups = await Promise.all(
    (groups ?? []).map(async (group): Promise<SnapshotGroup | null> => {
      const members = await cached<GroupMember[]>(qc, online, ["members", group.id], async () => unwrap(await listMembers(group.id)));
      if (!members) return null;
      const live = members.filter((m) => !(m as GroupMember & { departed_at?: string | null }).departed_at);
      const me = live.find((m) => m.user_id === userId) ?? null;
      const currency = group.default_currency_code ?? "PHP";
      const friend = friendByGroup.get(group.id) ?? null;
      const full = deps.fullExpenses.get(group.id);
      const pages = qc.getQueryData<InfiniteData<PaginatedResponse<ExpenseWithDetails>>>(["expenses", group.id]);
      const loaded = full ?? pages?.pages.flatMap((p) => p.data) ?? null;
      const lastPage = pages?.pages[pages.pages.length - 1];
      return {
        id: group.id,
        name: group.name,
        currency,
        isDirect: friend !== null,
        friendName: friend?.display_name ?? null,
        myMemberId: me?.id ?? null,
        myRole: (me?.role as SnapshotGroup["myRole"]) ?? null,
        archived: group.is_archived,
        members: live.map((m) => ({ id: m.id, name: m.display_name, isMe: m.id === me?.id, hasAccount: m.user_id !== null, userId: m.user_id })),
        expenses: loaded ? loaded.map((e) => toSnapshotExpense(e, userId)) : null,
        expensesComplete: full !== undefined || (!!lastPage && lastPage.page >= lastPage.totalPages),
        balances: cachedBalances(qc, group.id, currency),
      };
    }),
  );
  return { ...base, groups: snapshotGroups.filter((g): g is SnapshotGroup => g !== null) };
}

/** Balances already in the cache (every currency the group has). */
function cachedBalances(qc: QueryClient, groupId: string, defaultCurrency: CurrencyCode): SnapshotGroup["balances"] {
  const currencies = qc.getQueryData<CurrencyCode[]>(["balances", groupId, "currencies", defaultCurrency]);
  if (!currencies) return null;
  const out: NonNullable<SnapshotGroup["balances"]> = [];
  for (const currency of currencies) {
    const rows = qc.getQueryData<MemberBalance[]>(["balances", groupId, currency]);
    if (!rows) return null;
    out.push({ currency, net: rows.map((r) => ({ memberId: r.member_id, amountMinor: r.net_cents })) });
  }
  return out;
}

/**
 * Loads what a question needs (balances in every currency and the complete
 * expense history) into the same cache keys / the session's full-history map.
 */
export async function loadGroupData(
  qc: QueryClient,
  groupIds: string[],
  defaultCurrencyOf: (groupId: string) => CurrencyCode,
  fullExpenses: Map<string, ExpenseWithDetails[]>,
): Promise<void> {
  await Promise.all(
    groupIds.map(async (groupId) => {
      const def = defaultCurrencyOf(groupId);
      const currencies = await qc.fetchQuery({
        queryKey: ["balances", groupId, "currencies", def],
        queryFn: async () => unwrap(await getGroupCurrencies(groupId, def)),
        staleTime: STALE_MS,
      });
      await Promise.all(
        currencies.map((currency) =>
          qc.fetchQuery({
            queryKey: ["balances", groupId, currency],
            queryFn: async () => unwrap(await getMembersWithBalances(groupId, currency)),
            staleTime: STALE_MS,
          }),
        ),
      );
      const all: ExpenseWithDetails[] = [];
      for (let page = 1; all.length < MAX_EXPENSES; page++) {
        const res = unwrap(await listExpenses(groupId, page, 100));
        all.push(...res.data);
        if (page >= res.totalPages) break;
      }
      fullExpenses.set(groupId, all);
    }),
  );
}
