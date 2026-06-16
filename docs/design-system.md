# SettleUp Design System

Applies to both **web** (Next.js + Tailwind v4) and **mobile** (Expo + React Native StyleSheet).

---

## 1. Colors

### Web — CSS Custom Properties + Tailwind `@theme`

Defined in `apps/web/src/app/globals.css`:

```css
@theme {
  --color-brand-50:  #eef2ff;
  --color-brand-100: #e0e7ff;
  --color-brand-200: #c7d2fe;
  --color-brand-300: #a5b4fc;
  --color-brand-400: #818cf8;
  --color-brand-500: #6366f1;   /* focus rings */
  --color-brand-600: #4f46e5;   /* primary actions */
  --color-brand-700: #4338ca;   /* hover states */
  --color-brand-800: #3730a3;
  --color-brand-900: #312e81;
}
```

**Usage in Tailwind classes:**
- `bg-brand-600` — primary button background
- `hover:bg-brand-700` — primary button hover
- `focus:ring-brand-500` — input/select focus ring
- `text-brand-600` — active tab, links
- `bg-brand-100 text-brand-700` — info badge, avatar (first color)
- `bg-brand-50 border-brand-200 text-brand-700` — AI badge

**Neutral palette (unchanged Tailwind defaults):**

| Token | Value | Usage |
|-------|-------|-------|
| `slate-50` | `#f8fafc` | Page background |
| `white` | `#ffffff` | Card/surface background |
| `slate-200` | `#e2e8f0` | Card borders |
| `slate-300` | `#cbd5e1` | Input borders |
| `slate-400` | `#94a3b8` | Muted text, placeholders |
| `slate-500` | `#64748b` | Secondary text |
| `slate-700` | `#334155` | Body text |
| `slate-900` | `#0f172a` | Headings |

**Semantic colors:**

| Purpose | Tailwind classes | Hex |
|---------|-----------------|-----|
| Success | `emerald-500`, `green-100/700` | `#10b981` |
| Warning | `amber-500`, `amber-100/700` | `#f59e0b` |
| Danger | `red-600`, `red-100/700` | `#dc2626` |

### Mobile — Theme Tokens

Defined in `apps/mobile/src/theme/index.ts`. **Always import from `@/theme` — never use raw hex strings.**

```ts
import { colors, spacing, fontSize, fontWeight, borderRadius } from "@/theme";
```

| Token | Hex | Usage |
|-------|-----|-------|
| `colors.primary` | `#6366f1` | Primary buttons, links, active icons |
| `colors.primaryLight` | `#e0e7ff` | Confirm email icon bg |
| `colors.primaryDark` | `#4f46e5` | — |
| `colors.success` | `#10b981` | Positive balances |
| `colors.successLight` | `#d1fae5` | — |
| `colors.warning` | `#f59e0b` | Pending badges |
| `colors.danger` | `#ef4444` | Error text, danger buttons |
| `colors.dangerLight` | `#fee2e2` | Error box background |
| `colors.background` | `#f8fafc` | Screen background |
| `colors.surface` | `#ffffff` | Card background |
| `colors.border` | `#e5e7eb` | Card borders, dividers |
| `colors.gray400` | `#9ca3af` | Muted text, placeholders |
| `colors.gray500` | `#6b7280` | Secondary text |
| `colors.gray700` | `#374151` | Labels |
| `colors.gray900` | `#111827` | Headings |

---

## 2. Typography

### Web
- **Font family:** Inter (Google Fonts, `display: "swap"`, `system-ui` fallback)
- **Scale:** Tailwind default — `text-xs` (12px) → `text-3xl` (30px)
- **Weights:** `font-medium` (500), `font-semibold` (600), `font-bold` (700), `font-extrabold` (800)
- **Heading pattern:** `text-2xl font-bold text-slate-900` (page titles)

### Mobile
- **Font family:** System default (no custom font loaded)
- **Scale** (`apps/mobile/src/theme/index.ts`):

| Token | Size |
|-------|------|
| `fontSize.xs` | 11 |
| `fontSize.sm` | 12 |
| `fontSize.base` | 14 |
| `fontSize.md` | 15 |
| `fontSize.lg` | 17 |
| `fontSize.xl` | 20 |
| `fontSize["2xl"]` | 24 |
| `fontSize["3xl"]` | 28 |

- **Weights:** `fontWeight.normal` (400), `.medium` (500), `.semibold` (600), `.bold` (700)

---

## 3. Spacing

Both platforms use an **8pt grid**.

### Web — Tailwind defaults
`p-2` (8px) → `p-4` (16px) → `p-6` (24px) → `p-8` (32px)

### Mobile — Theme spacing
```ts
spacing.xs   = 4
spacing.sm   = 8
spacing.md   = 12
spacing.base = 16
spacing.lg   = 20
spacing.xl   = 24
spacing["2xl"] = 32
spacing["3xl"] = 48
```

---

## 4. Border Radius

### Web
- Cards: `rounded-xl` (12px)
- Buttons, inputs: `rounded-lg` (8px)
- Avatars, badges: `rounded-full`

### Mobile
```ts
borderRadius.sm  = 8   // inputs
borderRadius.md  = 12  // cards
borderRadius.lg  = 16  // modals
borderRadius.xl  = 20  // auth card
borderRadius.full = 9999 // avatars
```

---

## 5. Components

### Web (`apps/web/src/components/ui/`)

| Component | Variants / Props | Notes |
|-----------|-----------------|-------|
| `Button` | `primary` `secondary` `ghost` `danger`; sizes `sm` `md` `lg`; `isLoading` `leftIcon` `rightIcon` | Focus ring uses `brand-500` |
| `Input` | `label` `error` `leftAddon` | Focus ring uses `brand-500` |
| `Select` | `label` `error` | Focus ring uses `brand-500` |
| `Card` + `CardHeader` + `CardContent` | — | `rounded-xl border-slate-200 shadow-sm` |
| `Badge` | `success` `warning` `danger` `neutral` `info` | Pill shape |
| `Avatar` | `sm` `md` `lg`; hash-based color from 8 options | Initials-based |
| `Dialog` | `confirmVariant: "primary" \| "danger"` | Uses native `<dialog>` + `showModal()` |
| `ContentDialog` | `sm` `md` `lg`; scrollable body | For complex content |
| `DropdownMenu` | `items[]` with `default \| danger` variant | Click-outside close |
| `EmptyState` | `icon` `title` `description` `action` | Centered layout |
| `Skeleton` | `className` | `animate-pulse bg-slate-200` |
| `Tabs` | `tabs[]` `activeTab` `onChange` | Bottom-border active indicator |
| `ProgressBar` | `value` `label` `variant: "default" \| "ai"` | AI variant pulses |
| `AIBadge` | `label` | `brand-50` background, Sparkles icon |

### Mobile (`apps/mobile/src/components/ui/`)

| Component | Notes |
|-----------|-------|
| `AppButton` | `primary` `secondary` `ghost` `danger`; `isLoading`; height 50pt |
| `AppTextInput` | `label` `error` `containerStyle`; uses theme tokens |
| `Card` | `padding` prop; `borderRadius.md` |
| `Badge` | `success` `warning` `danger` `neutral` `primary` |
| `Avatar` | Hash-based color; 3 sizes; initials |
| `EmptyState` | `icon` `title` `description` `action` |
| `Skeleton` + `SkeletonCard` | `animate-pulse` equivalent |
| `SegmentedControl` | Generic tab selector |
| `ChipGroup` | Horizontal scrollable selection |
| `AmountInput` | PHP peso prefix; `error` prop |
| `SectionHeader` | Uppercase label + optional action |
| `ListItem` | `left` `title` `subtitle` `right` `chevron` |

---

## 6. Interaction States

### Loading
- **Web:** Skeleton screens (`loading.tsx`) + `Button` spinner (`isLoading`)
- **Mobile:** `SkeletonCard` + `AppButton` spinner (`isLoading`) + `ActivityIndicator` for full-page

### Error
- **Web:** Red alert box with `role="alert"`; `Input`/`Select` show per-field error text
- **Mobile:** `Alert.alert()` for API errors; `AppTextInput` `error` prop for field errors; red error box in auth screens

### Success
- **Web:** `sonner` toast (`toast.success()`)
- **Mobile:** `expo-haptics` + `Alert.alert` or silent refresh

### Disabled
- Both platforms: 50% opacity, pointer-events none

### Empty
- Both platforms: `EmptyState` component with icon, title, description, optional CTA

---

## 7. Navigation

### Web
- Sticky `AppNav` header with brand link + nav links + user menu
- Breadcrumb-style back links on detail pages
- Tab navigation within group detail (Balances / Expenses)

### Mobile
- Tab bar (3 tabs): Home / Groups / Account — Ionicons vector icons
- Deep screens pushed via Stack navigator
- FAB ("Add Expense") anchored at bottom of group detail

---

## 8. Changing the Brand Color

### Web
Edit `apps/web/src/app/globals.css` — update the hex values in the `@theme` block. All `brand-*` utilities update automatically.

### Mobile
Edit `apps/mobile/src/theme/index.ts` — update `colors.primary`, `colors.primaryLight`, `colors.primaryDark`. All components that import from `@/theme` update automatically.
