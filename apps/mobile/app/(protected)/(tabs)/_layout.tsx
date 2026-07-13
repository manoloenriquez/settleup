import { Tabs, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import { useGroups } from "@/hooks/useGroups";

type TabIconProps = {
  focused: boolean;
  name: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
};

function TabIcon({ focused, name, label }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <Ionicons
        name={name}
        size={22}
        color={focused ? colors.primary : colors.gray400}
      />
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

function AddFab() {
  return (
    <View style={styles.fabWrap}>
      <View style={styles.fab}>
        <Ionicons name="add" size={28} color={colors.white} />
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const { data: groups } = useGroups();

  function handleAddPress() {
    const list = groups ?? [];
    if (list.length === 1 && list[0]) {
      router.push(`/(protected)/groups/${list[0].id}/add-expense`);
    } else if (list.length === 0) {
      router.push("/(protected)/groups/new");
    } else {
      router.push("/groups");
    }
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? "home" : "home-outline"} label="Home" />
          ),
        }}
      />
      <Tabs.Screen
        name="groups/index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? "people" : "people-outline"} label="Groups" />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          tabBarIcon: () => <AddFab />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            handleAddPress();
          },
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? "pulse" : "pulse-outline"} label="Activity" />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? "person" : "person-outline"} label="Profile" />
          ),
        }}
      />
      {/* Receipt scanning lives inside Add Expense (Receipt mode); keep the
          route but hide it from the tab bar. */}
      <Tabs.Screen name="scan" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 80,
    paddingBottom: 20,
    paddingTop: 8,
  },
  tabItem: { alignItems: "center", gap: 2 },
  tabLabel: { fontSize: 10, color: colors.gray400, fontWeight: "500" },
  tabLabelActive: { color: colors.primary, fontWeight: "700" },
  fabWrap: { alignItems: "center", justifyContent: "center" },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -26,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});
