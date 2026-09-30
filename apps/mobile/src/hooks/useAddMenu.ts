import { useCallback } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useGroups } from "@/hooks/useGroups";
import { SHARE_REASON, useAccountPrompt } from "@/hooks/useAccountPrompt";
import { ROUTES } from "@/lib/routes";

export type Choice = { label: string; run: () => void };

/** Native action sheet on iOS; a plain alert list elsewhere. */
export function presentChoices(title: string, choices: Choice[]) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...choices.map((choice) => choice.label), "Cancel"], cancelButtonIndex: choices.length },
      (index) => choices[index]?.run(),
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...choices.map((choice) => ({ text: choice.label, onPress: choice.run })),
    { text: "Cancel", style: "cancel" as const },
  ]);
}

/**
 * The one "add" entry point, shared by the + buttons: a personal expense, a
 * receipt, or an expense split with a group. Each choice says exactly what
 * happens next.
 */
export function useAddMenu(): { openAddMenu: () => void; addExpense: () => void; scanReceipt: () => void } {
  const router = useRouter();
  const { session } = useAuth();
  const { data: groups } = useGroups();
  const promptAccount = useAccountPrompt();

  const addExpense = useCallback(() => router.push(ROUTES.newExpense), [router]);
  const scanReceipt = useCallback(
    () => router.push({ pathname: ROUTES.newExpense, params: { assist: "scan" } }),
    [router],
  );

  const splitWithGroup = useCallback(() => {
    if (!session) {
      promptAccount(SHARE_REASON);
      return;
    }
    const active = groups ?? [];
    if (active.length === 0) {
      router.push(ROUTES.newGroup);
      return;
    }
    presentChoices("Split with which group?", [
      ...active.slice(0, 8).map((group) => ({
        label: group.name,
        run: () => router.push({ pathname: "/(protected)/groups/[id]/add-expense", params: { id: group.id } }),
      })),
      { label: "Create a New Group", run: () => router.push(ROUTES.newGroup) },
    ]);
  }, [session, groups, router, promptAccount]);

  const openAddMenu = useCallback(() => {
    presentChoices("Add", [
      { label: "Add Expense", run: addExpense },
      { label: "Scan Receipt", run: scanReceipt },
      { label: "Split with a Group", run: splitWithGroup },
    ]);
  }, [addExpense, scanReceipt, splitWithGroup]);

  return { openAddMenu, addExpense, scanReceipt };
}
