import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, fontWeight } from "@/theme";
import { getAvatarColor } from "@/theme";

type AvatarProps = {
  name: string;
  size?: number;
};

export function Avatar({ name, size = 36 }: AvatarProps) {
  const bg = getAvatarColor(name);
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  initials: { color: colors.white, fontWeight: fontWeight.bold },
});
