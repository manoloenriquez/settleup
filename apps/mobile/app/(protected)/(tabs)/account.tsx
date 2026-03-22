import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { Avatar, Badge, Card, ListItem, SkeletonCard } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export default function AccountScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();

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
            left={<Text style={styles.rowEmoji}>💳</Text>}
            showChevron
            onPress={() => router.push("/(protected)/account/payment")}
          />
          <View style={styles.divider} />
          <ListItem
            title="Edit Profile"
            subtitle="Update your name"
            left={<Text style={styles.rowEmoji}>✏️</Text>}
            showChevron
            onPress={() => {}}
          />
        </Card>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
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
  rowEmoji: { fontSize: 20 },

  signOutBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: "center",
  },
  signOutText: { color: colors.danger, fontWeight: fontWeight.semibold, fontSize: fontSize.md },
});
