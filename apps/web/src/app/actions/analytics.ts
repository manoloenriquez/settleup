"use server";

import { z } from "zod";
import { PUBLIC_PRODUCT_EVENTS, isValidProductEvent, type ApiResponse } from "@template/shared";
import { trackPublic, type PublicProductEvent } from "@/lib/analytics/server";
import { assertAdmin, AuthError } from "@/lib/supabase/guards";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  share_token: z.string().min(8).max(128),
  name: z.enum(PUBLIC_PRODUCT_EVENTS),
  properties: z.record(z.string(), z.string()).default({}),
});

/**
 * Lets an account-less public-link page record one of the public events.
 * The database resolves and rate-limits on the share token; nothing else
 * from the client is trusted.
 */
export async function trackPublicEvent(input: {
  share_token: string;
  name: (typeof PUBLIC_PRODUCT_EVENTS)[number];
  properties?: Record<string, string>;
}): Promise<ApiResponse<void>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: "Invalid event." };
  if (!isValidProductEvent(parsed.data.name, parsed.data.properties)) {
    return { data: null, error: "Invalid event." };
  }
  trackPublic(parsed.data.share_token, {
    name: parsed.data.name,
    properties: parsed.data.properties,
  } as PublicProductEvent);
  return { data: undefined, error: null };
}

export type ProductEventRow = {
  id: string;
  event_name: string;
  occurred_at: string;
  platform: string;
  properties: Record<string, string>;
  has_user: boolean;
};

/** Recent product events for the admin dashboard (RLS admits admins only). */
export async function adminListProductEvents(limit = 100): Promise<ApiResponse<ProductEventRow[]>> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema("settleup")
      .from("product_events")
      .select("id, event_name, occurred_at, platform, properties, user_id")
      .order("occurred_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));
    if (error) return { data: null, error: "Failed to load product events." };
    return {
      data: (data ?? []).map((row) => ({
        id: row.id,
        event_name: row.event_name,
        occurred_at: row.occurred_at,
        platform: row.platform,
        properties:
          row.properties && typeof row.properties === "object" && !Array.isArray(row.properties)
            ? Object.fromEntries(
                Object.entries(row.properties).map(([key, value]) => [key, String(value)]),
              )
            : {},
        has_user: row.user_id !== null,
      })),
      error: null,
    };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
