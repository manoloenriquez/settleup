import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  computeBudget,
  groupSharesToSources,
  monthOf,
  monthStart,
  personalToSource,
  type BudgetDocument,
  type BudgetState,
  type SpendSource,
  weekLeftCopy,
} from "@template/shared";
import { useAuth } from "@/context/AuthContext";
import { useBudgetStore } from "@/context/BudgetContext";
import { useOutbox } from "@/context/OutboxContext";
import { usePersonalLedger } from "@/context/PersonalLedgerContext";
import { localTodayISO } from "@/lib/dates";
import { fetchGroupShares, type GroupShares } from "@/services/budget";

// ---------------------------------------------------------------------------
// The budget as the screens see it: the stored document, the person's own
// spending (personal expenses on this phone + their shares of group expenses
// for signed-in users) and today's date, run through the shared engine. All
// numbers are recomputed on every change; nothing is cached but the inputs.
// ---------------------------------------------------------------------------

/** Weeks of history kept for suggestions (setup, "spend like I do"). */
const HISTORY_DAYS = 63;

/** Local date that follows midnight and the app returning to the foreground. */
export function useToday(): string {
  const [today, setToday] = useState(localTodayISO);
  useEffect(() => {
    const refresh = (): void => setToday(localTodayISO());
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    const timer = setInterval(refresh, 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  return today;
}

/** First day the budget needs transactions from (month-aligned so the query key is stable). */
export function sourcesFrom(doc: BudgetDocument | null, today: string): string {
  const history = monthOf(addDays(today, -HISTORY_DAYS));
  const start = doc && !doc.deletedAt ? monthOf(doc.startDate) : history;
  return monthStart(start < history ? start : history);
}

export function useGroupShares(from: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  return useQuery<GroupShares>({
    queryKey: ["budgetShares", userId, from],
    enabled: !!userId,
    queryFn: async () => {
      const result = await fetchGroupShares(userId!, from);
      if (result.error !== null) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60_000,
  });
}

export type BudgetView = {
  state: BudgetState;
  doc: BudgetDocument | null;
  today: string;
  /** Everything the engine counted from (personal + own group shares), for previews and suggestions. */
  sources: SpendSource[];
  /** Group shares are still loading for the first time. */
  sharesLoading: boolean;
  /** Group shares failed to load and nothing is cached. */
  sharesError: string | null;
  /** Group expense changes still in the offline queue (not counted yet). */
  pendingGroupChanges: number;
  storeStatus: ReturnType<typeof useBudgetStore>["status"];
  /**
   * Inputs still loading (the budget, personal expenses, or a first load of
   * group shares): figures would be low, so screens and the Assistant wait.
   */
  loading: boolean;
};

export function useBudget(): BudgetView {
  const store = useBudgetStore();
  const { session } = useAuth();
  const ledger = usePersonalLedger();
  const { entries } = useOutbox();
  const today = useToday();
  const from = sourcesFrom(store.doc, today);
  const shares = useGroupShares(from);

  const sources = useMemo<SpendSource[]>(() => {
    const personal = ledger.expenses.flatMap((e) => {
      const source = personalToSource(e);
      return source ? [source] : [];
    });
    const group = shares.data ? groupSharesToSources(shares.data.rows, new Set(shares.data.myMemberIds)) : [];
    return [...personal, ...group];
  }, [ledger.expenses, shares.data]);

  const signedIn = !!session;
  // Waiting on a first load that is actually running. Offline with nothing cached the query is
  // paused, not loading: the budget shows with a "group expenses couldn't load" warning instead.
  const sharesFetching = signedIn && !shares.data && shares.fetchStatus === "fetching";
  const sharesComplete = !signedIn ? undefined : shares.data ? shares.data.complete : sharesFetching ? undefined : false;
  const state = useMemo(
    () => computeBudget({ doc: store.doc, today, sources, sharesComplete }),
    [store.doc, today, sources, sharesComplete],
  );

  const pendingGroupChanges = entries.filter((e) => e.kind.startsWith("expense.")).length;

  return {
    state,
    doc: store.doc,
    today,
    sources,
    sharesLoading: sharesFetching,
    sharesError: signedIn && !shares.data && shares.error ? shares.error.message : null,
    pendingGroupChanges,
    storeStatus: store.status,
    loading: store.status === "loading" || ledger.status === "loading" || sharesFetching,
  };
}

/**
 * The budget line shown after saving an expense ("₱3,800 left this week"),
 * computed with the saved expense included even before the stores catch up.
 * Null when there is no budget or the expense doesn't count this week.
 */
export function useBudgetFeedback(): (change: { ref: string; source: SpendSource | null }) => string | null {
  const view = useBudget();
  return useCallback(
    (change) => {
      if (view.loading || view.state.status !== "active" || !change.source) return null;
      const sources = [...view.sources.filter((s) => s.ref !== change.ref), change.source];
      const next = computeBudget({ doc: view.doc, today: view.today, sources });
      if (next.status !== "active") return null;
      const item = next.items.find((i) => i.ref === change.ref);
      const seg = next.live.segment;
      if (!item || item.status !== "counted" || item.bucket.kind !== "weekly" || item.date < seg.start || item.date > seg.end) return null;
      return weekLeftCopy(next.live.availableWeekMinor, next.live.overWeekMinor, next.currency);
    },
    [view],
  );
}
