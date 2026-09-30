import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { EmptyState } from "@/components/ui";
import { PersonalExpenseForm } from "@/components/personal/PersonalExpenseForm";
import { usePersonalLedger } from "@/context/PersonalLedgerContext";
import { colors } from "@/theme";

export default function EditPersonalExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { status, ledger } = usePersonalLedger();
  const expense = ledger.expenses.find((item) => item.id === id && !item.deletedAt);

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!expense) {
    return (
      <>
        <Stack.Screen options={{ title: "Expense" }} />
        <EmptyState
          icon="receipt-outline"
          title="This expense isn’t here anymore"
          description="It may have been deleted on this device or another one."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </>
    );
  }
  return <PersonalExpenseForm expense={expense} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
});
