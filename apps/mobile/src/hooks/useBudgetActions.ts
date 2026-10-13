import { useCallback, useMemo } from "react";
import * as Crypto from "expo-crypto";
import {
  createBudgetDocument,
  turnedOff,
  turnedOn,
  withAnnotation,
  withConfigChange,
  withoutAnnotation,
  type BudgetAnnotation,
  type BudgetConfig,
  type BudgetDocument,
  type BudgetPlanVersion,
} from "@template/shared";
import { useBudgetStore } from "@/context/BudgetContext";
import { localTodayISO } from "@/lib/dates";

type Source = BudgetPlanVersion["source"];
/** An annotation as the caller describes it; id and timestamps are filled in here. */
export type NewAnnotation = BudgetAnnotation extends infer A
  ? A extends BudgetAnnotation
    ? Omit<A, "id" | "createdAt" | "deletedAt">
    : never
  : never;

export type BudgetActions = {
  /** Set up a budget (or turn a switched-off one back on, keeping its history). */
  setUp: (config: BudgetConfig, options?: { startDate?: string; source?: Source; summary?: string }) => Promise<BudgetDocument>;
  /** New settings from the start of this week. */
  changeSettings: (config: BudgetConfig, summary: string, source?: Source, effectiveFrom?: string) => Promise<BudgetDocument>;
  addNote: (note: NewAnnotation) => Promise<{ doc: BudgetDocument; id: string }>;
  removeNote: (id: string) => Promise<BudgetDocument>;
  turnOff: () => Promise<BudgetDocument>;
};

function requireDoc(doc: BudgetDocument | null): BudgetDocument {
  if (!doc || doc.deletedAt) throw new Error("There's no budget to change. Set one up first.");
  return doc;
}

export function useBudgetActions(): BudgetActions {
  const { change } = useBudgetStore();

  const setUp = useCallback<BudgetActions["setUp"]>(
    (config, options) =>
      change((doc, now) => {
        const today = localTodayISO();
        const meta = { planId: Crypto.randomUUID(), now, source: options?.source ?? "setup", summary: options?.summary ?? "Set up" };
        if (doc && doc.deletedAt) return turnedOn(doc, config, options?.startDate ?? today, meta);
        if (doc) return withConfigChange(doc, config, today, meta);
        return createBudgetDocument({ id: Crypto.randomUUID(), config, startDate: options?.startDate ?? today, meta });
      }),
    [change],
  );

  const changeSettings = useCallback<BudgetActions["changeSettings"]>(
    (config, summary, source = "manual", effectiveFrom) =>
      change((doc, now) =>
        withConfigChange(requireDoc(doc), config, localTodayISO(), {
          planId: Crypto.randomUUID(),
          now,
          source,
          summary,
          ...(effectiveFrom ? { effectiveFrom } : {}),
        }),
      ),
    [change],
  );

  const addNote = useCallback<BudgetActions["addNote"]>(
    async (note) => {
      const id = Crypto.randomUUID();
      const doc = await change((current, now) =>
        withAnnotation(requireDoc(current), { ...note, id, createdAt: now, deletedAt: null } as BudgetAnnotation),
      );
      return { doc, id };
    },
    [change],
  );

  const removeNote = useCallback<BudgetActions["removeNote"]>(
    (id) => change((doc, now) => withoutAnnotation(requireDoc(doc), id, now)),
    [change],
  );

  const turnOff = useCallback<BudgetActions["turnOff"]>(
    () => change((doc, now) => turnedOff(requireDoc(doc), now)),
    [change],
  );

  return useMemo(() => ({ setUp, changeSettings, addNote, removeNote, turnOff }), [setUp, changeSettings, addNote, removeNote, turnOff]);
}
