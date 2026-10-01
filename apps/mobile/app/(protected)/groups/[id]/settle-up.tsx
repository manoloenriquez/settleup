import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useRecordPayment } from "@/hooks/usePayments";
import { useMembers } from "@/hooks/useMembers";
import { useMembersWithBalances } from "@/hooks/useBalances";
import { AmountInput, AppButton, useToast } from "@/components/ui";
import {
  amountToInput,
  formatAmount,
  isCurrencyCode,
  isUnusuallyLarge,
  parseAmountInput,
  type CurrencyCode,
} from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export default function SettleUpScreen() {
  const toast = useToast();
  const { id: groupId, fromId, toId, amount: initialAmount, currency: currencyParam } = useLocalSearchParams<{
    id: string;
    fromId?: string;
    toId?: string;
    amount?: string;
    currency?: string;
  }>();
  // A payment settles a balance in one currency, the one the debt is in.
  const currency: CurrencyCode = isCurrencyCode(currencyParam) ? currencyParam : "PHP";
  const formatCents = (minor: number): string => formatAmount(minor, currency);
  const router = useRouter();
  const membersQ = useMembers(groupId);
  const members = membersQ.data ?? [];
  const recordPayment = useRecordPayment(groupId);
  const balancesQ = useMembersWithBalances(groupId, currency);

  const initCents = parseInt(initialAmount ?? "0", 10);
  const [amount, setAmount] = useState(initCents > 0 ? amountToInput(initCents, currency) : "");

  const fromMember = members.find((m) => m.id === fromId);
  const toMember = members.find((m) => m.id === toId);
  const fromName = fromMember?.display_name ?? "…";
  const toName = toMember?.display_name ?? "…";
  // What the payer owes the group right now (balances refresh while this is open).
  const fromNet = balancesQ.data?.find((b) => b.member_id === fromId)?.net_cents;
  const fromOwes = fromNet !== undefined ? Math.max(0, -fromNet) : null;
  const typedCents = parseAmountInput(amount, currency);
  const remaining = fromOwes !== null && typedCents !== null && typedCents > 0 ? fromOwes - typedCents : null;

  async function handleConfirm() {
    if (recordPayment.isPending) return; // guard against double-submit
    const amountCents = parseAmountInput(amount, currency);
    if (!fromId || !toId || amountCents === null || amountCents <= 0) {
      toast.error(`Enter the amount that was paid in ${currency}.`);
      return;
    }
    // Someone else may have recorded a payment since this screen opened.
    const fresh = await balancesQ.refetch();
    const freshNet = fresh.data?.find((b) => b.member_id === fromId)?.net_cents;
    const fromOwes = freshNet !== undefined ? Math.max(0, -freshNet) : null;
    // Re-check against the live balance: it may have changed since the list was opened.
    if (fromOwes !== null && amountCents > fromOwes) {
      Alert.alert(
        fromOwes === 0 ? `${fromName} doesn’t owe anything now` : `That’s more than ${fromName} owes`,
        fromOwes === 0
          ? `Record ${formatCents(amountCents)} anyway? ${toName} would then owe ${fromName} that amount.`
          : `${fromName} owes ${formatCents(fromOwes)} right now. Record ${formatCents(amountCents)} anyway? ${toName} would then owe ${fromName} ${formatCents(amountCents - fromOwes)}.`,
        [
          { text: "Edit Amount", style: "cancel" },
          { text: "Record Anyway", onPress: () => void record(amountCents) },
        ],
      );
      return;
    }
    if (isUnusuallyLarge(amountCents, currency)) {
      Alert.alert(`Record ${formatCents(amountCents)}?`, "That’s a large amount. Check the decimal point.", [
        { text: "Edit Amount", style: "cancel" },
        { text: "Record", onPress: () => void record(amountCents) },
      ]);
      return;
    }
    void record(amountCents);
  }

  async function record(amountCents: number) {
    if (!fromId || !toId || recordPayment.isPending) return;
    const result = await recordPayment.mutateAsync({
      groupId,
      fromMemberId: fromId,
      toMemberId: toId,
      amountCents,
      currencyCode: currency,
    });

    if (result.error) { toast.error(result.error); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success(`Recorded ${formatCents(amountCents)} from ${fromName} to ${toName}`);
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: "Record a Payment", headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.label}>Paid by</Text>
            <Text style={styles.name}>{fromName}</Text>
          </View>
          <View style={styles.arrow}>
            <Ionicons name="arrow-down" size={24} color={colors.gray300} />
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Paid to</Text>
            <Text style={styles.name}>{toName}</Text>
          </View>

          <AmountInput
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            currency={currency}
            style={{ marginTop: spacing.xl }}
          />
          {remaining !== null ? (
            <Text style={styles.suggested} accessibilityLiveRegion="polite">
              {remaining > 0
                ? `After this, ${fromName} still owes ${formatCents(remaining)}.`
                : remaining === 0
                  ? `This settles ${fromName}’s balance.`
                  : `This is ${formatCents(-remaining)} more than ${fromName} owes.`}
            </Text>
          ) : (
            initCents > 0 && (
              <Text style={styles.suggested}>Suggested: {formatCents(initCents)}, the full amount owed.</Text>
            )
          )}
          <Text style={styles.note}>
            Record a payment after the money has moved — Talli doesn’t send money.
          </Text>

          <AppButton
            title={
              recordPayment.isPending
                ? "Saving…"
                : typedCents
                  ? `Record ${formatCents(typedCents)} Payment`
                  : "Record Payment"
            }
            onPress={() => void handleConfirm()}
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
  suggested: { fontSize: fontSize.sm, color: colors.gray700, marginTop: spacing.sm },
  note: { fontSize: fontSize.xs, color: colors.gray500, marginTop: spacing.xs },
});
