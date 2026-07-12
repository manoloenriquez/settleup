import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

type TabIconProps = {
  focused: boolean;
  name: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  elevated?: boolean;
};

function TabIcon({ focused, name, label, elevated = false }: TabIconProps): React.ReactElement {
  return (
    <View style={[styles.tabItem, elevated && styles.tabItemElevated]}>
      <View style={elevated && styles.elevatedIcon}>
        <Ionicons
          name={name}
          size={elevated ? 25 : 22}
          color={elevated ? colors.white : focused ? colors.primary : colors.gray400}
        />
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
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
        name="scan"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? "scan" : "scan-outline"} label="Scan" elevated />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? "person" : "person-outline"} label="Account" />
          ),
        }}
      />
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
  tabItem: { alignItems: "center", gap: 2, minWidth: 62 },
  tabItemElevated: { transform: [{ translateY: -12 }] },
  elevatedIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, borderWidth: 4, borderColor: colors.background, alignItems: "center", justifyContent: "center", shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 7 },
  tabLabel: { fontSize: 10, color: colors.gray400, fontWeight: "500" },
  tabLabelActive: { color: colors.primary, fontWeight: "700" },
});
