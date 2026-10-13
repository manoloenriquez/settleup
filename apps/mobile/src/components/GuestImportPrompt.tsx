import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useBudgetStore } from "@/context/BudgetContext";
import { usePersonalLedger } from "@/context/PersonalLedgerContext";
import { useToast } from "@/components/ui/Toast";

/**
 * After signing in on a phone that was used without an account, ask once per
 * session whether that data should join the account: expenses, and the
 * budget when the account doesn't have one yet. Nothing moves without a yes;
 * "Not Now" leaves it on the device (Account tab offers the expense import
 * again, and everything comes back if the person signs out).
 */
export function GuestImportPrompt(): null {
  const { session } = useAuth();
  const { status, guestExpenseCount, importGuestExpenses } = usePersonalLedger();
  const { status: budgetStatus, guestBudget, importGuestBudget } = useBudgetStore();
  const toast = useToast();
  const askedFor = useRef<string | null>(null);
  const userId = session?.user.id ?? null;
  const hasBudget = guestBudget !== null;

  useEffect(() => {
    if (!userId || status !== "ready" || budgetStatus !== "ready") return;
    if (guestExpenseCount === 0 && !hasBudget) return;
    if (askedFor.current === userId) return;
    askedFor.current = userId;
    const noun = guestExpenseCount === 1 ? "1 expense" : `${guestExpenseCount} expenses`;
    const what = guestExpenseCount > 0 && hasBudget ? `${noun} and your budget` : hasBudget ? "your budget" : noun;
    const them = guestExpenseCount + (hasBudget ? 1 : 0) === 1 ? "it" : "them";
    Alert.alert(
      `Add ${what} to your account?`,
      `You added ${what} on this iPhone before signing in. Add ${them} to your account to back ${them} up and see ${them} on your other devices.`,
      [
        { text: "Not Now", style: "cancel" },
        {
          text: "Add to My Account",
          onPress: () => {
            const expenses = guestExpenseCount > 0 ? importGuestExpenses() : Promise.resolve();
            const budget = hasBudget ? importGuestBudget() : Promise.resolve("imported" as const);
            Promise.all([expenses, budget]).then(
              ([, outcome]) =>
                toast.success(
                  outcome === "kept_account"
                    ? "Added. Your account already had a budget, so that one was kept."
                    : `${what.charAt(0).toUpperCase()}${what.slice(1)} added to your account`,
                ),
              () => toast.error("It’s still on this iPhone. Try again in a moment."),
            );
          },
        },
      ],
    );
  }, [userId, status, budgetStatus, guestExpenseCount, hasBudget, importGuestExpenses, importGuestBudget, toast]);

  return null;
}
