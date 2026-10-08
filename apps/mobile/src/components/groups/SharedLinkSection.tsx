import { useEffect, useState } from "react";
import { Alert, Share, StyleSheet, Switch, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { AppButton, Card, useToast } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { regenerateGroupLink, setGroupLinkEnabled, setHideMyPaymentDetails } from "@/services/sharing";
import { track } from "@/lib/analytics";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? "";

type Props = { groupId: string; isAdmin: boolean; myMemberId: string | null; myHidden: boolean };

/**
 * The group's read-only shared page: who can see it, share/copy, regenerate
 * or turn it off, and whether my own payment details appear on it.
 */
export function SharedLinkSection({ groupId, isAdmin, myMemberId, myHidden }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(myHidden);
  useEffect(() => setHidden(myHidden), [myHidden]);

  const linkQ = useQuery({
    queryKey: ["share-link", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema("settleup")
        .from("groups")
        .select("share_token, share_enabled")
        .eq("id", groupId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const enabled = linkQ.data?.share_enabled ?? false;
  const url = linkQ.data && WEB_ORIGIN ? `${WEB_ORIGIN}/g/${linkQ.data.share_token}` : null;

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["share-link", groupId] });
    void qc.invalidateQueries({ queryKey: ["groups"] });
    void qc.invalidateQueries({ queryKey: ["group-overview"] });
  }

  async function share() {
    if (!url) return;
    try {
      const result = await Share.share({ message: url, url });
      if (result.action !== Share.dismissedAction) track({ name: "public_link_copied", properties: { link_type: "group" } });
    } catch {
      // cancelled
    }
  }

  function confirmRegenerate() {
    Alert.alert(
      "Make a new link?",
      "The current link stops working right away. Send the new one to anyone who should still see the group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make New Link",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const result = await regenerateGroupLink(groupId);
            setBusy(false);
            if (result.error) return toast.error(result.error);
            refresh();
            toast.success("New link ready. The old one no longer works.");
          },
        },
      ],
    );
  }

  function confirmToggle() {
    const turningOff = enabled;
    Alert.alert(
      turningOff ? "Turn off the shared link?" : "Turn on a shared link?",
      turningOff
        ? "Nobody will be able to open the group summary from the link. You can turn on a new link later."
        : "This creates a new link. Anyone with it can see the group’s expenses, balances and any payment details people chose to show.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: turningOff ? "Turn Off" : "Turn On",
          style: turningOff ? "destructive" : "default",
          onPress: async () => {
            setBusy(true);
            const result = await setGroupLinkEnabled(groupId, !turningOff);
            setBusy(false);
            if (result.error) return toast.error(result.error);
            refresh();
            toast.success(turningOff ? "Shared link turned off" : "Shared link turned on");
          },
        },
      ],
    );
  }

  async function toggleHidden(next: boolean) {
    setHidden(next);
    const result = await setHideMyPaymentDetails(groupId, next);
    if (result.error) {
      setHidden(!next);
      toast.error(result.error);
      return;
    }
    refresh();
  }

  return (
    <Card padding={spacing.base}>
      <Text style={styles.status} accessibilityRole="header">
        {linkQ.isLoading ? "Checking…" : enabled ? "Shared link is on" : "Shared link is off"}
      </Text>
      <Text style={styles.explain}>
        {enabled
          ? "Anyone with the link can view this group’s expenses and balances — no account needed. They can’t change anything."
          : "No one can open this group from a link."}
      </Text>
      {enabled && url && (
        <View style={styles.actions}>
          <AppButton title="Share Group Summary" onPress={() => void share()} />
          <AppButton
            title="Copy Link"
            variant="secondary"
            onPress={() => {
              void Clipboard.setStringAsync(url).then(() => toast.success("Link copied"));
            }}
          />
        </View>
      )}
      {isAdmin && (
        <View style={styles.actions}>
          {enabled && <AppButton title="Make a New Link" variant="secondary" onPress={confirmRegenerate} disabled={busy} />}
          <AppButton
            title={enabled ? "Turn Off Link" : "Turn On Link"}
            variant={enabled ? "destructive" : "secondary"}
            onPress={confirmToggle}
            isLoading={busy}
          />
        </View>
      )}
      {myMemberId && (
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Hide my payment details here</Text>
            <Text style={styles.toggleBody}>
              Your GCash and bank details never appear on this group’s shared pages, even if you
              show them elsewhere.
            </Text>
          </View>
          <Switch
            value={hidden}
            onValueChange={(next) => void toggleHidden(next)}
            trackColor={{ true: colors.primary }}
            accessibilityLabel="Hide my payment details in this group"
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  explain: { fontSize: fontSize.sm, lineHeight: 19, color: colors.gray600, marginTop: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderRadius: borderRadius.sm,
  },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray900 },
  toggleBody: { fontSize: fontSize.sm, lineHeight: 18, color: colors.gray500 },
});
