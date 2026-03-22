import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useRecordPayment } from "@/hooks/usePayments";
import { useMembers } from "@/hooks/useMembers";
import { AmountInput, AppButton } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export default function SettleUpScreen() {
  const { id: groupId, fromId, toId, amount: initialAmount } = useLocalSearchParams<{
    id: string;
    fromId?: string;
    toId?: string;
    amount?: string;
  }>();
  const router = useRouter();
  const membersQ = useMembers(groupId);
  const members = membersQ.data ?? [];
  const recordPayment = useRecordPayment(groupId);

  const initCents = parseInt(initialAmount ?? "0");
  const [amount, setAmount] = useState(initCents > 0 ? String(initCents / 100) : "");

  const fromMember = members.find((m) => m.id === fromId);
  const toMember = members.find((m) => m.id === toId);

  async function handleConfirm() {
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!fromId || !toId || amountCents <= 0) {
      Alert.alert("Error", "Invalid payment details");
      return;
    }

    const result = await recordPayment.mutateAsync({
      groupId,
      fromMemberId: fromId,
      toMemberId: toId,
      amountCents,
    });

    if (result.error) { Alert.alert("Error", result.error); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: "Settle Up", headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.label}>From</Text>
            <Text style={styles.name}>{fromMember?.display_name ?? fromId ?? "\u2014"}</Text>
          </View>
          <View style={styles.arrow}>
            <Text style={styles.arrowText}>{"\u2193"}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>To</Text>
            <Text style={styles.name}>{toMember?.display_name ?? toId ?? "\u2014"}</Text>
          </View>

          <AmountInput
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            style={{ marginTop: spacing.xl }}
          />

          <AppButton
            title={recordPayment.isPending ? "Saving…" : "Confirm Payment"}
            onPress={handleConfirm}
            isLoading={recordPayment.isPending}
            disabled={!amount || recordPayment.isPending}
            style={{ marginTop: spacing.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingTop: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, textTransform: "uppercase", letterSpacing: 0.5 },
  name: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.gray900, marginTop: spacing.xs },
  arrow: { alignItems: "center", paddingVertical: spacing.sm },
  arrowText: { fontSize: 24, color: colors.gray300 },
});
