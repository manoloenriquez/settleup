// ---------------------------------------------------------------------------
// Deterministic expense categorisation
//
// A keyword lookup over the merchant or item text. It runs everywhere (web,
// Android, iOS without Apple Intelligence) and costs nothing; the on-device
// language model only chooses a category for free-form chat messages, where
// guided generation constrains it to the same slugs.
// ---------------------------------------------------------------------------

export const CATEGORY_SLUGS = [
  "food-drinks",
  "groceries",
  "transport",
  "lodging",
  "activities",
  "shopping",
  "supplies",
  "fees",
  "other",
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

const KEYWORDS: Record<Exclude<CategorySlug, "other">, RegExp> = {
  groceries: /\b(grocer|supermarket|market|sm hypermarket|puregold|robinsons supermarket|landers|s&r|waltermart|savemore|7.?eleven|ministop|convenience|wet market|palengke|rustan'?s supermarket|metro supermarket|shopwise|alfamart|uncle john)\b/,
  transport: /\b(grab|uber|angkas|joyride|move it|taxi|jeep|jeepney|tricycle|bus|mrt|lrt|pnr|train|ferry|toll|gas|gasoline|fuel|petron|shell|caltex|seaoil|phoenix|parking|airport|flight|airline|cebu pacific|philippine airlines|pal\b|airasia|car rental|rent a car|beep)\b/,
  lodging: /\b(hotel|hostel|airbnb|resort|inn\b|lodge|villa|condo|bnb|homestay|pension|dorm|agoda|booking\.com|accommodation|room)\b/,
  activities: /\b(ticket|museum|cinema|movie|concert|tour|island hopping|dive|diving|surf|hike|trek|zipline|park|zoo|aquarium|karaoke|ktv|spa|massage|bowling|arcade|golf|gym|class|workshop|entrance|admission)\b/,
  shopping: /\b(mall|uniqlo|h&m|zara|nike|adidas|penshoppe|bench|shopee|lazada|department store|boutique|clothes|clothing|shoes|apparel|watch|jewel|gift|souvenir|pasalubong|electronics|apple store|power mac|gadget)\b/,
  supplies: /\b(national book ?store|office ?warehouse|supplies|stationery|hardware|ace hardware|handyman|wilcon|mercury drug|watsons|pharmacy|drugstore|medicine|toiletries|detergent|laundry|cleaning|batteries|printer|ink)\b/,
  fees: /\b(fee|fees|charge|penalty|fine|service fee|convenience fee|bank|atm|remittance|transfer fee|visa fee|permit|registration|subscription|membership|insurance|tax|dues|tuition)\b/,
  "food-drinks": /\b(restaurant|resto|cafe|café|coffee|starbucks|tim hortons|bo'?s coffee|jollibee|mcdo|mcdonald|kfc|chowking|mang inasal|greenwich|shakey|pizza|burger|ramen|sushi|katsu|bar\b|pub|brewery|beer|wine|cocktail|drinks?|hoegaarden|hoegarden|stella|artois|san mig|red horse|heineken|whisk(?:e)?y|jim beam|vodka|gin\b|rum\b|tequila|soju|sake|dinner|lunch|breakfast|brunch|merienda|snack|food|kitchen|grill|bbq|samgyup|unli|buffet|milk tea|boba|tea|bakery|cake|dessert|ice cream|halo.?halo|kiwami|yabu|mendokoro|ippudo|ramen nagi|bill|dine)\b/,
};

/** Order matters: more specific categories win over the broad food/drinks bucket. */
const ORDER: Exclude<CategorySlug, "other">[] = [
  "groceries",
  "transport",
  "lodging",
  "activities",
  "supplies",
  "shopping",
  "fees",
  "food-drinks",
];

/**
 * Infers a category slug from free text such as a merchant name or item
 * description. Returns null when nothing matches so callers keep their own
 * default (usually "other").
 */
export function inferCategorySlug(text: string | null | undefined): CategorySlug | null {
  if (!text) return null;
  const haystack = text.toLowerCase().replace(/[_/,.-]+/g, " ");
  for (const slug of ORDER) {
    if (KEYWORDS[slug].test(haystack)) return slug;
  }
  return null;
}

/** Best category for a receipt: merchant first, then the item names as a whole. */
export function inferReceiptCategory(merchant: string | null, itemNames: string[]): CategorySlug {
  return inferCategorySlug(merchant) ?? inferCategorySlug(itemNames.join(" ")) ?? "other";
}

export function isCategorySlug(value: string | null | undefined): value is CategorySlug {
  return typeof value === "string" && (CATEGORY_SLUGS as readonly string[]).includes(value);
}
