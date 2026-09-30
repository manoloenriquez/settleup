import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, borderRadius } from "@/theme";

type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = "100%", height = 16, borderRadius: br = borderRadius.sm, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    // Reduce Motion: a steady placeholder instead of a pulsing one.
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) {
        opacity.setValue(0.6);
        return;
      }
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ]),
      );
      anim.start();
    });
    return () => {
      cancelled = true;
      anim?.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.base, { width: width as number, height, borderRadius: br, opacity }, style]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card} accessible accessibilityLabel="Loading">
      <Skeleton width={120} height={14} />
      <Skeleton width="80%" height={12} style={{ marginTop: 8 }} />
      <Skeleton width="60%" height={12} style={{ marginTop: 6 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.gray200 },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 0 },
});
