import { useWindowDimensions } from "react-native";

/**
 * True at accessibility text sizes (Dynamic Type AX1 and up), where controls
 * laid out side by side no longer fit and should stack vertically.
 */
export function useStackedLayout(): boolean {
  const { fontScale } = useWindowDimensions();
  return fontScale >= 1.6;
}
