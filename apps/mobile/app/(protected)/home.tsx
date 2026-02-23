import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { AppButton } from "@/components/ui/Button";
import { APP_NAME } from "@template/shared";

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "admin";
  return (
    <View style={[styles.badge, isAdmin ? styles.adminBadge : styles.userBadge]}>
      <Text style={[styles.badgeText, isAdmin ? styles.adminBadgeText : styles.userBadgeText]}>
        {role}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const { profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    // onAuthStateChange fires with SIGNED_OUT → RouteGuard redirects to login.
  }

  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <>
      {/* Dynamic header title */}
      <Stack.Screen options={{ title: APP_NAME }} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome banner */}
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>
            Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}!
          </Text>
          <Text style={styles.bannerSub}>Here's your account overview.</Text>
        </View>

        {/* Profile card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Profile</Text>

          <ProfileField label="Email" value={profile?.email ?? "—"} />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Role</Text>
            <RoleBadge role={profile?.role ?? "user"} />
          </View>

          {profile?.full_name && (
            <ProfileField label="Display name" value={profile.full_name} />
          )}

          <ProfileField label="Member since" value={joinDate} />
        </View>

        {/* Sign out */}
        <AppButton
          title={signingOut ? "Signing out…" : "Sign out"}
          variant="secondary"
          onPress={handleSignOut}
          isLoading={signingOut}
          style={styles.signOutBtn}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  banner: {
    backgroundColor: "#6366f1",
    borderRadius: 20,
    padding: 24,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  bannerSub: {
    fontSize: 13,
    color: "#c7d2fe",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#9ca3af",
    marginBottom: 4,
  },
  field: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    color: "#9ca3af",
  },
  fieldValue: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 99,
  },
  adminBadge: {
    backgroundColor: "#ede9fe",
  },
  userBadge: {
    backgroundColor: "#f1f5f9",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  adminBadgeText: {
    color: "#7c3aed",
  },
  userBadgeText: {
    color: "#475569",
  },
  signOutBtn: {
    marginTop: 8,
  },
});
