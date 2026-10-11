import { after } from "next/server";
import { createAnonClient } from "@template/supabase";
import {
  isValidProductEvent,
  PUBLIC_PRODUCT_EVENTS,
  type ProductEvent,
  type ProductEventName,
  type Tracker,
} from "@template/shared";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/guards";

// Server-only: pulls in next/headers through the cookie client, which Next
// refuses to bundle into client components.

/**
 * Server-side tracker for Server Actions and Route Handlers running with the
 * caller's cookie session. Same allowlist and RLS path as the browser sink.
 */
async function recordServer(event: ProductEvent): Promise<void> {
  try {
    const properties = (event.properties ?? {}) as Record<string, string>;
    if (!isValidProductEvent(event.name, properties)) return;
    const user = await getSessionUser();
    if (!user) return;
    const supabase = await createClient();
    await supabase
      .schema("settleup")
      .from("product_events")
      .insert({ event_name: event.name, user_id: user.id, platform: "web", properties });
  } catch {
    // Telemetry never affects the action.
  }
}

/**
 * Schedules the write after the response so it never delays the action. The
 * promise is returned to `after()` so serverless hosts keep the invocation
 * alive until the row is written.
 */
export const trackServer: Tracker = (event) => {
  try {
    after(() => recordServer(event));
  } catch {
    void recordServer(event); // outside a request scope (tests): record directly
  }
};

type PublicEventName = (typeof PUBLIC_PRODUCT_EVENTS)[number];
export type PublicProductEvent = Extract<ProductEvent, { name: PublicEventName }>;

/**
 * Records an anonymous public-link event through `settleup.track_public_event`.
 * The database resolves the share token to a member or group and rate-limits
 * on it; pass `null` only for an invalid-link open. Never throws.
 */
export function trackPublic(shareToken: string | null, event: PublicProductEvent): void {
  if (!(PUBLIC_PRODUCT_EVENTS as readonly ProductEventName[]).includes(event.name)) return;
  const record = async (): Promise<void> => {
    try {
      const supabase = createAnonClient();
      await supabase.schema("settleup").rpc("track_public_event", {
        p_share_token: shareToken,
        p_event_name: event.name,
        p_properties: event.properties ?? {},
      });
    } catch {
      // Telemetry never affects the page.
    }
  };
  try {
    after(record);
  } catch {
    void record();
  }
}
