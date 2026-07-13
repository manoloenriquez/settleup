import {
  Bed,
  Car,
  CircleEllipsis,
  Package,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Ticket,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/** Maps `expense_categories.icon` names (lucide kebab-case) to components. */
const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  "shopping-basket": ShoppingBasket,
  car: Car,
  bed: Bed,
  ticket: Ticket,
  "shopping-bag": ShoppingBag,
  package: Package,
  receipt: Receipt,
  "circle-ellipsis": CircleEllipsis,
};

export function categoryIconFor(icon: string | null | undefined): LucideIcon {
  return (icon && ICONS[icon]) || Receipt;
}

type CategoryIconTileProps = {
  icon: string | null | undefined;
  color: string;
  size?: "sm" | "md";
};

/** Rounded tile tinted with the category color, per the mockup's expense rows. */
export function CategoryIconTile({ icon, color, size = "md" }: CategoryIconTileProps): React.ReactElement {
  const Icon = categoryIconFor(icon);
  const box = size === "sm" ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-2xl";

  return (
    <span
      className={`flex shrink-0 items-center justify-center ${box}`}
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <Icon size={size === "sm" ? 16 : 20} />
    </span>
  );
}
