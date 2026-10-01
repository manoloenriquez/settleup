import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppButton, AppTextInput, Card, SectionHeader, useToast } from "@/components/ui";
import { useMembers } from "@/hooks/useMembers";
import {
  deleteMemberPaymentDetails,
  getMemberPaymentDetails,
  saveMemberPaymentDetails,
} from "@/services/sharing";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

/**
 * Payment details an organizer enters for someone without a Talli account,
 * so people who owe them know how to pay. Shared pages label these as added
 * by the organizer — they are not verified by the person.
 */
export default function MemberPaymentScreen() {
  const { id: groupId, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const membersQ = useMembers(groupId);
  const member = (membersQ.data ?? []).find((m) => m.id === memberId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [gcashName, setGcashName] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [showOnLinks, setShowOnLinks] = useState(true);
  const [fullNumbers, setFullNumbers] = useState(false);

  useEffect(() => {
    let active = true;
    void getMemberPaymentDetails(memberId).then((res) => {
      if (!active) return;
      if (res.data) {
        setExists(true);
        setGcashName(res.data.gcash_name ?? "");
        setGcashNumber(res.data.gcash_number ?? "");
        setBankName(res.data.bank_name ?? "");
        setBankAccountName(res.data.bank_account_name ?? "");
        setBankAccountNumber(res.data.bank_account_number ?? "");
        setNotes(res.data.notes ?? "");
        setShowOnLinks(res.data.show_on_shared_links);
        setFullNumbers(res.data.share_full_numbers);
      } else if (res.error) {
        toast.error(res.error);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [memberId, toast]);

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["creditor-profiles", groupId] });
    void qc.invalidateQueries({ queryKey: ["group-overview"] });
  }

  async function save() {
    setSaving(true);
    const res = await saveMemberPaymentDetails(memberId, {
      payer_display_name: member?.display_name ?? null,
      gcash_name: gcashName.trim() || null,
      gcash_number: gcashNumber.trim() || null,
      bank_name: bankName.trim() || null,
      bank_account_name: bankAccountName.trim() || null,
      bank_account_number: bankAccountNumber.trim() || null,
      notes: notes.trim() || null,
      show_on_shared_links: showOnLinks,
      share_full_numbers: showOnLinks && fullNumbers,
    });
    setSaving(false);
    if (res.error) return toast.error(res.error);
    invalidate();
    toast.success("Payment details saved");
    router.back();
  }

  function remove() {
    Alert.alert("Remove these payment details?", "People who owe them will no longer see how to pay.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const res = await deleteMemberPaymentDetails(memberId);
          if (res.error) return toast.error(res.error);
          invalidate();
          router.back();
        },
      },
    ]);
  }

  const name = member?.display_name ?? "this person";
  return (
    <>
      <Stack.Screen options={{ title: `How to Pay ${name}` }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>
            {name} doesn’t have a Talli account. Add how they’d like to be paid so people who owe them
            can pay without asking. Shared pages show these as “Added by the organizer”.
          </Text>
          <SectionHeader title="GCash" />
          <Card>
            <View style={styles.fields}>
              <AppTextInput label="Name on GCash" value={gcashName} onChangeText={setGcashName} editable={!loading} />
              <AppTextInput label="GCash number" value={gcashNumber} onChangeText={setGcashNumber} keyboardType="phone-pad" editable={!loading} />
            </View>
          </Card>
          <SectionHeader title="Bank" style={{ marginTop: spacing.base }} />
          <Card>
            <View style={styles.fields}>
              <AppTextInput label="Bank" value={bankName} onChangeText={setBankName} placeholder="e.g. BDO, BPI" editable={!loading} />
              <AppTextInput label="Account name" value={bankAccountName} onChangeText={setBankAccountName} editable={!loading} />
              <AppTextInput label="Account number" value={bankAccountNumber} onChangeText={setBankAccountNumber} keyboardType="number-pad" editable={!loading} />
              <AppTextInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline editable={!loading} />
            </View>
          </Card>
          <SectionHeader title="Shared links" style={{ marginTop: spacing.base }} />
          <Card>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleTitle}>Show on shared links</Text>
              <Switch value={showOnLinks} onValueChange={setShowOnLinks} trackColor={{ true: colors.primary }} accessibilityLabel="Show on shared links" />
            </View>
            {showOnLinks && (
              <View style={[styles.toggleRow, { marginTop: spacing.md }]}>
                <Text style={styles.toggleTitle}>Show full account numbers</Text>
                <Switch value={fullNumbers} onValueChange={setFullNumbers} trackColor={{ true: colors.primary }} accessibilityLabel="Show full account numbers" />
              </View>
            )}
          </Card>
          <AppButton title="Save Payment Details" onPress={() => void save()} isLoading={saving} disabled={loading} style={{ marginTop: spacing.xl }} />
          {exists && <AppButton title="Remove Payment Details" variant="destructive" onPress={remove} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, gap: spacing.sm, paddingBottom: spacing["3xl"] },
  lead: { fontSize: fontSize.base, lineHeight: 21, color: colors.gray600, marginBottom: spacing.sm },
  fields: { gap: spacing.md },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  toggleTitle: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray900 },
});
