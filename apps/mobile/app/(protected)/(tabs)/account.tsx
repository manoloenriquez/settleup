import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { Avatar, Badge, Card, ListItem, SkeletonCard } from "@/components/ui";
import { deleteAccount } from "@/services/account";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export default function AccountScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const [deleting, setDeleting] = useState(false);

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account, profile, and payment settings. Groups you own will be removed. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            const res = await deleteAccount();
            setDeleting(false);
            if (res.error) {
              Alert.alert("Couldn't delete account", res.error);
              return;
            }
            await signOut();
          },
        },
      ],
    );
  }

  const displayName = profile?.full_name ?? session?.user.email ?? "User";
  const email = session?.user.email ?? "";
  const role = profile?.role ?? "user";
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long" })
    : "";

  return (
    <>
      <Stack.Screen options={{ title: "Account", headerShown: true }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {isLoading ? (
          <SkeletonCard />
        ) : (
          <Card style={styles.profileCard}>
            <View style={styles.profileTop}>
              <Avatar name={displayName} size={56} />
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{displayName}</Text>
                <Text style={styles.profileEmail}>{email}</Text>
                <View style={styles.badgeRow}>
                  <Badge label={role} variant={role === "admin" ? "primary" : "neutral"} />
                  {memberSince && <Text style={styles.memberSince}>Since {memberSince}</Text>}
                </View>
              </View>
            </View>
          </Card>
        )}

        <Text style={styles.sectionLabel}>SETTINGS</Text>
        <Card padding={0}>
          <ListItem
            title="Payment Settings"
            subtitle="GCash, bank details, QR code"
            left={<Ionicons name="card-outline" size={20} color={colors.primary} />}
            showChevron
            onPress={() => router.push("/(protected)/account/payment")}
          />
          <View style={styles.divider} />
          <ListItem
            title="Edit Profile"
            subtitle="Update your name"
            left={<Ionicons name="pencil-outline" size={20} color={colors.gray600 ?? colors.gray400} />}
            showChevron
            onPress={() => router.push("/(protected)/account/edit-profile")}
          />
        </Card>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.dangerLabel}>DANGER ZONE</Text>
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.deleteText}>Delete Account</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.dangerHint}>
          Permanently deletes your account and all data you own. This cannot be undone.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["2xl"] },

  profileCard: { marginBottom: spacing.base },
  profileTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  profileInfo: { flex: 1 },
  profileName: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  profileEmail: { fontSize: fontSize.sm, color: colors.gray500, marginTop: 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  memberSince: { fontSize: fontSize.xs, color: colors.gray400 },

  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8, marginBottom: spacing.sm, marginTop: spacing.base },

  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.base },

  signOutBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: "center",
  },
  signOutText: { color: colors.gray700, fontWeight: fontWeight.semibold, fontSize: fontSize.md },

  dangerLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.danger,
    letterSpacing: 0.8,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  deleteBtn: {
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteText: { color: colors.danger, fontWeight: fontWeight.semibold, fontSize: fontSize.md },
  dangerHint: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});
