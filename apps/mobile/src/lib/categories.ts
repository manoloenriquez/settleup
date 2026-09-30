import type { Ionicons } from "@expo/vector-icons";
import { CATEGORY_SLUGS, DEFAULT_EXPENSE_CATEGORIES, type CategorySlug } from "@template/shared";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const ICONS: Record<CategorySlug, IconName> = {
  "food-drinks": "restaurant-outline",
  groceries: "cart-outline",
  transport: "car-outline",
  lodging: "bed-outline",
  activities: "ticket-outline",
  shopping: "bag-handle-outline",
  supplies: "cube-outline",
  fees: "receipt-outline",
  other: "ellipsis-horizontal-circle-outline",
};

export type CategoryMeta = { slug: CategorySlug; label: string; icon: IconName; color: string };

export const CATEGORY_META: CategoryMeta[] = CATEGORY_SLUGS.map((slug) => {
  const base = DEFAULT_EXPENSE_CATEGORIES.find((category) => category.slug === slug);
  return { slug, label: base?.name ?? "Other", icon: ICONS[slug], color: base?.color ?? "#6b7280" };
});

export function categoryMeta(slug: CategorySlug): CategoryMeta {
  return CATEGORY_META.find((meta) => meta.slug === slug) ?? (CATEGORY_META[CATEGORY_META.length - 1] as CategoryMeta);
}
