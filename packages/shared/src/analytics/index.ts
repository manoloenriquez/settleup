/**
 * Product events (PRD 12.4).
 *
 * The allowlist below mirrors `settleup.product_event_spec` in the
 * `20260909130000_product_events.sql` migration; the shared test asserts the
 * two stay identical. Only enumerated string properties exist by design, so
 * names, notes, amounts, account numbers, receipt content and share tokens
 * cannot be attached to an event.
 */

export const PRODUCT_EVENT_SPEC = {
  account_created: {},
  group_created: {},
  member_added: {},
  expense_draft_started: {
    entry_mode: ["quick", "detailed", "itemized", "chat", "receipt"],
  },
  expense_saved: {
    entry_mode: ["quick", "detailed", "itemized", "chat", "receipt"],
    participant_bucket: ["1", "2", "3-5", "6-10", "11+"],
  },
  expense_save_failed: {
    error_class: ["validation", "conflict", "network", "permission", "unknown"],
  },
  public_link_copied: { link_type: ["group", "member"] },
  public_link_opened: { link_type: ["group", "member"], status: ["valid", "invalid"] },
  payment_details_actioned: { action: ["copy", "qr"] },
  payment_claim_submitted: {},
  payment_claim_resolved: { status: ["confirmed", "rejected"] },
  offline_action_queued: {},
  offline_action_resolved: { status: ["synced", "conflict", "failed"] },
  ai_draft_generated: { source: ["chat", "receipt"] },
  ai_draft_resolved: { status: ["accepted", "edited", "discarded"] },
  group_settled: {},
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type ProductEventName = keyof typeof PRODUCT_EVENT_SPEC;

export const PRODUCT_EVENT_NAMES = Object.keys(PRODUCT_EVENT_SPEC) as ProductEventName[];

/** Events an anonymous public-link page may record through `track_public_event`. */
export const PUBLIC_PRODUCT_EVENTS = [
  "public_link_opened",
  "payment_details_actioned",
  "payment_claim_submitted",
] as const satisfies readonly ProductEventName[];

export type ProductEventProperties<N extends ProductEventName> = {
  [K in keyof (typeof PRODUCT_EVENT_SPEC)[N]]: (typeof PRODUCT_EVENT_SPEC)[N][K] extends readonly (infer V)[]
    ? V
    : never;
};

/** A fully typed event: `{ name: "expense_saved", properties: { entry_mode: "quick", participant_bucket: "2" } }`. */
export type ProductEvent = {
  [N in ProductEventName]: keyof ProductEventProperties<N> extends never
    ? { name: N; properties?: Record<string, never> }
    : { name: N; properties: ProductEventProperties<N> };
}[ProductEventName];

export type ProductEventPlatform = "web" | "ios" | "android";

/** What a sink receives: the event plus the platform it came from. */
export type ProductEventRecord = {
  name: ProductEventName;
  properties: Record<string, string>;
  platform: ProductEventPlatform;
};

export type ProductEventSink = {
  record: (event: ProductEventRecord) => Promise<void> | void;
};

export type Tracker = (event: ProductEvent) => void;

/** Runtime allowlist check, the same rule the database constraint enforces. */
export function isValidProductEvent(
  name: string,
  properties: Record<string, unknown>,
): name is ProductEventName {
  const spec = (PRODUCT_EVENT_SPEC as Record<string, Record<string, readonly string[]>>)[name];
  if (!spec) return false;
  const keys = Object.keys(properties);
  if (keys.length !== Object.keys(spec).length) return false;
  return keys.every((key) => {
    const allowed = spec[key];
    const value = properties[key];
    return allowed !== undefined && typeof value === "string" && allowed.includes(value);
  });
}

/**
 * Builds a fire-and-forget tracker. Recording never throws and never blocks
 * the caller; failures are dropped (telemetry must not affect the product).
 */
export function createTracker(sink: ProductEventSink, platform: ProductEventPlatform): Tracker {
  return (event) => {
    const properties = (event.properties ?? {}) as Record<string, string>;
    if (!isValidProductEvent(event.name, properties)) return;
    try {
      void Promise.resolve(sink.record({ name: event.name, properties, platform })).catch(
        () => undefined,
      );
    } catch {
      // ignore
    }
  };
}

/** Outcome class for an outbox entry that failed terminally. */
export function offlineFailureStatus(entry: {
  lastError?: { class?: string } | null;
}): ProductEventProperties<"offline_action_resolved">["status"] {
  return entry.lastError?.class === "conflict" ? "conflict" : "failed";
}

/** Bucket a participant count the way PRD 12.4 asks for. */
export function participantBucket(count: number): ProductEventProperties<"expense_saved">["participant_bucket"] {
  if (count <= 1) return "1";
  if (count === 2) return "2";
  if (count <= 5) return "3-5";
  if (count <= 10) return "6-10";
  return "11+";
}

/** Map a save failure to a coarse class without carrying the message. */
export function errorClassFor(
  error: unknown,
): ProductEventProperties<"expense_save_failed">["error_class"] {
  const text = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "PT409" || /conflict|changed since|stale/.test(text)) return "conflict";
  if (code === "42501" || code === "PT403" || /permission|not a member|not authorized|forbidden/.test(text))
    return "permission";
  if (/network|fetch|offline|timeout|connection/.test(text)) return "network";
  if (code.startsWith("22") || code === "PT400" || /invalid|must be|required|does not match|sum/.test(text))
    return "validation";
  return "unknown";
}
