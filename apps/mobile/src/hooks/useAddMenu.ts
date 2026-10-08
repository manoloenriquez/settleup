import { useCallback } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useGroups } from "@/hooks/useGroups";
import { SHARE_REASON, useAccountPrompt } from "@/hooks/useAccountPrompt";
import { ROUTES } from "@/lib/routes";
import { readLastGroup } from "@/lib/last-group";

export type Choice = { label: string; run: () => void; destructive?: boolean };

/** Native action sheet on iOS; a plain alert list elsewhere. */
export function presentChoices(title: string, choices: Choice[]) {
  if (Platform.OS === "ios") {
    const destructive = choices
      .map((choice, index) => (choice.destructive ? index : -1))
      .filter((index) => index >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...choices.map((choice) => choice.label), "Cancel"],
        cancelButtonIndex: choices.length,
        destructiveButtonIndex: destructive.length > 0 ? destructive : undefined,
      },
      (index) => choices[index]?.run(),
    );
    return;
  }
  // Android alerts show at most three buttons: page longer menus with "More…".
  // Dismissing (back button or tapping outside) cancels.
  const page = choices.length > 3 ? choices.slice(0, 2) : choices;
  const rest = choices.length > 3 ? choices.slice(2) : [];
  Alert.alert(
    title,
    undefined,
    [
      ...page.map((choice) => ({
        text: choice.label,
        onPress: choice.run,
        style: choice.destructive ? ("destructive" as const) : ("default" as const),
      })),
      ...(rest.length > 0 ? [{ text: "More…", onPress: () => presentChoices(title, rest) }] : []),
    ],
    { cancelable: true },
  );
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
    const active = groups ?? [];
    const show = (recentId: string | null) => {
      // Repeat expenses usually go to the same group: offer it by name.
      const recent = active.find((group) => group.id === recentId) ?? (active.length === 1 ? active[0] : undefined);
      presentChoices("Add", [
        { label: session ? "Personal Expense" : "Add Expense", run: addExpense },
        ...(session && recent
          ? [
              {
                label: `Split with ${recent.name}`,
                run: () => router.push({ pathname: "/(protected)/groups/[id]/add-expense", params: { id: recent.id } }),
              },
            ]
          : []),
        { label: "Scan Receipt", run: scanReceipt },
        // Always reachable: other groups and "Create a New Group" live here.
        { label: recent ? "Split with Another Group" : "Split with a Group", run: splitWithGroup },
      ]);
    };
    if (!session) {
      show(null);
      return;
    }
    void readLastGroup(session.user.id).then(show);
  }, [groups, session, addExpense, scanReceipt, splitWithGroup, router]);

  return { openAddMenu, addExpense, scanReceipt };
}
