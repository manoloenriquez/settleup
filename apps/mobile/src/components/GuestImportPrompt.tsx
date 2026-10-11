import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { usePersonalLedger } from "@/context/PersonalLedgerContext";
import { useToast } from "@/components/ui/Toast";

/**
 * After signing in on a phone that was used without an account, ask once per
 * session whether those expenses should join the account. Nothing moves
 * without a yes; "Not Now" leaves them on the device (Account tab offers the
 * import again, and they come back if the person signs out).
 */
export function GuestImportPrompt(): null {
  const { session } = useAuth();
  const { status, guestExpenseCount, importGuestExpenses } = usePersonalLedger();
  const toast = useToast();
  const askedFor = useRef<string | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId || status !== "ready" || guestExpenseCount === 0) return;
    if (askedFor.current === userId) return;
    askedFor.current = userId;
    const noun = guestExpenseCount === 1 ? "1 expense" : `${guestExpenseCount} expenses`;
    Alert.alert(
      `Add ${noun} to your account?`,
      `You added ${noun} on this iPhone before signing in. Add them to your account to back them up and see them on your other devices.`,
      [
        { text: "Not Now", style: "cancel" },
        {
          text: "Add to My Account",
          onPress: () => {
            importGuestExpenses().then(
              () => toast.success(`${noun} added to your account`),
              () => toast.error("They’re still on this iPhone. Try again from the Account tab."),
            );
          },
        },
      ],
    );
  }, [userId, status, guestExpenseCount, importGuestExpenses, toast]);

  return null;
}
