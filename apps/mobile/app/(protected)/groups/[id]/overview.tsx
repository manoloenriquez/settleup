import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useGroupOverview } from "@/hooks/useOverview";
import { useGroups } from "@/hooks/useGroups";
import { Card, Avatar, Badge, EmptyState } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { formatCents, buildSuggestedSettlements } from "@template/shared";
import type { GroupOverviewPayload, SuggestedSettlement, CreditorPaymentProfile } from "@template/shared";

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? "";

type MemberWithNet = GroupOverviewPayload["members"][number] & {
  _net: number;
  _owed: number;
};

function sortedMembers(members: GroupOverviewPayload["members"]): MemberWithNet[] {
  return members
    .map((m) => {
      const net = m.net_cents ?? 0;
      const owed = m.owed_cents ?? Math.max(0, -net);
      return { ...m, _net: net, _owed: owed };
    })
    .sort((a, b) => {
      if (a._net < 0 && b._net >= 0) return -1;
      if (b._net < 0 && a._net >= 0) return 1;
      if (a._net < 0 && b._net < 0) return a._net - b._net;
      if (a._net > 0 && b._net === 0) return -1;
      if (b._net > 0 && a._net === 0) return 1;
      if (a._net > 0 && b._net > 0) return b._net - a._net;
      return 0;
    });
}

function computeSettlements(payload: GroupOverviewPayload): SuggestedSettlement[] {
  if (payload.creditor_profiles?.length) {
    return buildSuggestedSettlements(payload.members, payload.creditor_profiles);
  }
  return [];
}

function buildSummaryText(payload: GroupOverviewPayload): string {
  const lines: string[] = [`GROUP SUMMARY — ${payload.group.name}`, "", "WHO OWES:"];

  for (const m of payload.members) {
    const net = m.net_cents ?? 0;
    const owed = m.owed_cents ?? Math.max(0, -net);
    if (net === 0) {
      lines.push(`${m.display_name} — Settled`);
    } else if (net > 0) {
      lines.push(`${m.display_name} — is owed ${formatCents(net)}`);
    } else {
      lines.push(`${m.display_name} — owes ${formatCents(owed)}`);
    }
  }

  const totalOwed = payload.members.reduce((sum, m) => sum + (m.owed_cents ?? Math.max(0, -(m.net_cents ?? 0))), 0);
  lines.push("", `Total outstanding: ${formatCents(totalOwed)}`);

  const settlements = computeSettlements(payload);
  if (settlements.length > 0) {
    lines.push("", "SUGGESTED SETTLEMENTS:");
    for (const s of settlements) {
      lines.push(`${s.from_display_name} pays ${formatCents(s.amount_cents)} to ${s.to_display_name}`);
      const pp = s.creditor_profile;
      if (pp?.gcash_number) lines.push(`  GCash: ${pp.gcash_number}`);
      if (pp?.bank_name && pp?.bank_account_number) lines.push(`  Bank: ${pp.bank_name} ${pp.bank_account_number}`);
    }
  } else {
    const pp = payload.payment_profile;
    if (pp) {
      if (pp.payer_display_name) lines.push("", `Pay to: ${pp.payer_display_name}`);
      if (pp.gcash_number) lines.push(`GCash: ${pp.gcash_number}`);
      if (pp.bank_name && pp.bank_account_number) lines.push(`Bank: ${pp.bank_name} ${pp.bank_account_number}`);
      if (pp.notes) lines.push(pp.notes);
    }
  }

  return lines.join("\n");
}

function PaymentDetails({ profile }: { profile: CreditorPaymentProfile }): React.ReactElement | null {
  const hasGcash = profile.gcash_name || profile.gcash_number;
  const hasBank = profile.bank_name || profile.bank_account_number;
  if (!hasGcash && !hasBank) return null;

  return (
    <View style={styles.paymentDetails}>
      {hasGcash ? (
        <View style={styles.paymentMethod}>
          <View style={styles.paymentMethodHeader}>
            <Ionicons name="phone-portrait-outline" size={14} color="#3b82f6" />
            <Text style={styles.paymentMethodLabel}>GCash</Text>
          </View>
          {profile.gcash_number ? (
            <Text style={styles.paymentMethodValue}>
              {profile.gcash_number}
              {profile.gcash_name ? ` (${profile.gcash_name})` : ""}
            </Text>
          ) : null}
          {profile.gcash_qr_url ? (
            <View style={styles.qrWrapper}>
              <Image source={{ uri: profile.gcash_qr_url }} style={styles.qrImage} />
            </View>
          ) : null}
        </View>
      ) : null}
      {hasBank ? (
        <View style={styles.paymentMethod}>
          <View style={styles.paymentMethodHeader}>
            <Ionicons name="business-outline" size={14} color={colors.primary} />
            <Text style={styles.paymentMethodLabel}>{profile.bank_name ?? "Bank Transfer"}</Text>
          </View>
          {profile.bank_account_number ? (
            <Text style={styles.paymentMethodValue}>
              {profile.bank_account_number}
              {profile.bank_account_name ? ` (${profile.bank_account_name})` : ""}
            </Text>
          ) : null}
          {profile.bank_qr_url ? (
            <View style={styles.qrWrapper}>
              <Image source={{ uri: profile.bank_qr_url }} style={styles.qrImage} />
            </View>
          ) : null}
        </View>
      ) : null}
      {profile.notes ? <Text style={styles.paymentNotes}>{profile.notes}</Text> : null}
    </View>
  );
}

export default function GroupOverviewScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupsQ = useGroups();
  const group = (groupsQ.data ?? []).find((g) => g.id === id);
  const overviewQ = useGroupOverview(group?.share_token);
  const payload = overviewQ.data;

  async function handleCopySummary(): Promise<void> {
    if (!payload) return;
    const text = buildSummaryText(payload);
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Group summary copied to clipboard");
  }

  async function handleShareLink(): Promise<void> {
    if (!group?.share_token || !WEB_ORIGIN) {
      Alert.alert("Share not available", "Share link could not be generated.");
      return;
    }
    const url = `${WEB_ORIGIN}/g/${group.share_token}`;
    try {
      await Share.share({ message: url, url });
    } catch {
      // User cancelled
    }
  }

  if (overviewQ.isLoading || groupsQ.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Group Overview" }} />
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </>
    );
  }

  if (!payload) {
    return (
      <>
        <Stack.Screen options={{ title: "Group Overview" }} />
        <EmptyState icon="alert-circle-outline" title="Could not load overview" description="Please try again later." />
      </>
    );
  }

  const settlements = computeSettlements(payload);
  const pp = payload.payment_profile;
  const totalOwed = payload.members.reduce((sum, m) => sum + (m.owed_cents ?? Math.max(0, -(m.net_cents ?? 0))), 0);
  const sorted = sortedMembers(payload.members);
  const isSettled = totalOwed === 0;

  return (
    <>
      <Stack.Screen options={{ title: "Group Overview" }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={overviewQ.isFetching && !overviewQ.isLoading}
            onRefresh={() => void overviewQ.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>Group Summary</Text>
            {isSettled && (
              <View style={styles.heroBadge}>
                <Ionicons name="checkmark-circle" size={13} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroBadgeText}>All settled</Text>
              </View>
            )}
          </View>
          <Text style={styles.heroGroupName}>{payload.group.name}</Text>
          {!isSettled && (
            <Text style={styles.heroSubtext}>{formatCents(totalOwed)} outstanding</Text>
          )}
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.heroBtn} onPress={handleCopySummary} activeOpacity={0.7}>
              <Ionicons name="copy-outline" size={14} color={colors.primary} />
              <Text style={styles.heroBtnText}>Copy Summary</Text>
            </TouchableOpacity>
            {WEB_ORIGIN ? (
              <TouchableOpacity style={styles.heroBtn} onPress={handleShareLink} activeOpacity={0.7}>
                <Ionicons name="share-outline" size={14} color={colors.primary} />
                <Text style={styles.heroBtnText}>Share Link</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Member Balances */}
        <Text style={styles.sectionTitle}>WHO OWES</Text>
        <Card padding={spacing.sm}>
          {sorted.map((m) => (
            <View
              key={m.member_id}
              style={[
                styles.memberRow,
                m._net < 0 ? styles.memberRowOwes : m._net > 0 ? styles.memberRowOwed : styles.memberRowSettled,
              ]}
            >
              <View style={styles.memberInfo}>
                <Avatar name={m.display_name} size={28} />
                <Text style={styles.memberName}>{m.display_name}</Text>
              </View>
              {m._net === 0 ? (
                <Badge label="Settled" variant="success" />
              ) : m._net > 0 ? (
                <Badge label={`owed ${formatCents(m._net)}`} variant="success" />
              ) : (
                <Badge label={`owes ${formatCents(m._owed)}`} variant="warning" />
              )}
            </View>
          ))}
          {totalOwed > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total outstanding</Text>
              <Text style={styles.totalValue}>{formatCents(totalOwed)}</Text>
            </View>
          )}
        </Card>

        {/* Suggested Settlements */}
        {settlements.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>SETTLE UP</Text>
            <Card padding={spacing.sm}>
              {settlements.map((s, idx) => (
                <View key={idx} style={styles.settlementRow}>
                  <View style={styles.settlementHeader}>
                    <Avatar name={s.from_display_name} size={24} />
                    <Text style={styles.settlementName}>{s.from_display_name}</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.gray400} />
                    <Avatar name={s.to_display_name} size={24} />
                    <Text style={styles.settlementName}>{s.to_display_name}</Text>
                    <Text style={styles.settlementAmount}>{formatCents(s.amount_cents)}</Text>
                  </View>
                  {!s.creditor_profile && (
                    <Text style={styles.noPaymentText}>
                      No payment details set
                    </Text>
                  )}
                  {s.creditor_profile ? <PaymentDetails profile={s.creditor_profile} /> : null}
                </View>
              ))}
            </Card>
          </>
        )}

        {/* Fallback: owner payment info */}
        {settlements.length === 0 && pp && (pp.gcash_number ?? pp.bank_account_number) && (
          <>
            <Text style={styles.sectionTitle}>HOW TO PAY</Text>
            <Card padding={spacing.base}>
              {pp.payer_display_name ? (
                <View style={styles.payToRow}>
                  <Avatar name={pp.payer_display_name} size={28} />
                  <Text style={styles.payToName}>{pp.payer_display_name}</Text>
                </View>
              ) : null}
              <PaymentDetails
                profile={{
                  member_id: "",
                  display_name: pp.payer_display_name ?? "Group Owner",
                  gcash_name: pp.gcash_name,
                  gcash_number: pp.gcash_number,
                  gcash_qr_url: pp.gcash_qr_url,
                  bank_name: pp.bank_name,
                  bank_account_name: pp.bank_account_name,
                  bank_account_number: pp.bank_account_number,
                  bank_qr_url: pp.bank_qr_url,
                  notes: pp.notes,
                }}
              />
            </Card>
          </>
        )}

        {/* Expenses */}
        <Text style={styles.sectionTitle}>EXPENSES</Text>
        <Card padding={spacing.sm}>
          {payload.expenses.length > 0 ? (
            payload.expenses.map((exp, i) => (
              <View key={i} style={[styles.expenseRow, i < payload.expenses.length - 1 && styles.expenseRowBorder]}>
                <View style={styles.expenseHeader}>
                  <Text style={styles.expenseName}>{exp.item_name}</Text>
                  <Text style={[styles.expenseAmount, exp.amount_cents < 0 && { color: colors.success }]}>
                    {formatCents(exp.amount_cents)}
                  </Text>
                </View>
                {exp.participants.length > 0 && (
                  <Text style={styles.expenseParticipants}>
                    {exp.participants.map((p) => `${p.display_name} (${formatCents(p.share_cents)})`).join(", ")}
                  </Text>
                )}
                {exp.items && exp.items.length > 0 && (
                  <View style={styles.expenseItems}>
                    {exp.items.map((item, j) => (
                      <View key={j} style={styles.expenseItemRow}>
                        <Text style={styles.expenseItemName}>{item.name}</Text>
                        <Text style={styles.expenseItemAmount}>{formatCents(item.amount_cents)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))
          ) : (
            <EmptyState icon="receipt-outline" title="No expenses yet" description="Expenses will appear here once added." />
          )}
        </Card>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLogo}>
            <Text style={styles.footerLogoText}>S</Text>
          </View>
          <Text style={styles.footerText}>Powered by SettleUp</Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: 40 },

  // Hero
  hero: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.base,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  heroLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: "rgba(255,255,255,0.7)" },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  heroBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.white },
  heroGroupName: { fontSize: fontSize["2xl"], fontWeight: fontWeight.bold, color: colors.white, marginBottom: 2 },
  heroSubtext: { fontSize: fontSize.sm, color: "rgba(255,255,255,0.7)", marginBottom: spacing.md },
  heroActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  heroBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  heroBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },

  // Sections
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.gray400,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.base,
  },

  // Member rows
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: 4,
    borderLeftWidth: 4,
  },
  memberRowOwes: { borderLeftColor: colors.warning, backgroundColor: colors.warningLight + "60" },
  memberRowOwed: { borderLeftColor: colors.success, backgroundColor: colors.successLight + "60" },
  memberRowSettled: { borderLeftColor: colors.gray200, backgroundColor: colors.gray50 + "80" },
  memberInfo: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  memberName: { fontSize: fontSize.sm, color: colors.gray700 },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  totalLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray600 },
  totalValue: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.gray900 },

  // Settlements
  settlementRow: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  settlementHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  settlementName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray700 },
  settlementAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.gray900, marginLeft: "auto" },
  noPaymentText: { fontSize: fontSize.xs, color: colors.gray400, fontStyle: "italic", marginTop: spacing.sm },

  // Payment details
  paymentDetails: { marginTop: spacing.sm, gap: spacing.sm },
  paymentMethod: {
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  paymentMethodHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.xs },
  paymentMethodLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  paymentMethodValue: { fontSize: fontSize.sm, fontFamily: "monospace", color: colors.gray900 },
  qrWrapper: {
    alignItems: "center",
    marginTop: spacing.sm,
  },
  qrImage: {
    width: "80%" as unknown as number,
    aspectRatio: 1,
    borderRadius: borderRadius.md,
    backgroundColor: colors.white,
  },
  paymentNotes: { fontSize: fontSize.xs, color: colors.gray400, fontStyle: "italic" },

  // Pay-to row (fallback)
  payToRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  payToName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray700 },

  // Expenses
  expenseRow: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  expenseRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  expenseHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  expenseName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray800, flex: 1 },
  expenseAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  expenseParticipants: { fontSize: fontSize.xs, color: colors.gray400, marginTop: 4 },
  expenseItems: {
    marginTop: spacing.xs,
    marginLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.primaryLight,
    paddingLeft: spacing.sm,
  },
  expenseItemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  expenseItemName: { fontSize: fontSize.xs, color: colors.gray500 },
  expenseItemAmount: { fontSize: fontSize.xs, color: colors.gray500 },

  // Footer
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.lg },
  footerLogo: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  footerLogoText: { color: colors.white, fontSize: 10, fontWeight: fontWeight.bold },
  footerText: { fontSize: fontSize.xs, color: colors.gray400 },
});
