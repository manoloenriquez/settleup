import { ActivityIndicator, StyleSheet, View } from "react-native";

/**
 * Initial route — only visible for a brief moment while RouteGuard
 * in the root layout determines where to navigate.
 */
export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
