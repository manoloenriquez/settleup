import { type NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@template/supabase";
import { generateInsightsSummary } from "@/lib/ai/insights";
import { insightsSummarySchema } from "@template/shared/schemas";
import { z } from "zod";

const inputSchema = z.object({
  group_id: z.string().uuid(),
  group_name: z.string(),
  insights: insightsSummarySchema.omit({ llm_summary: true }),
});

export async function POST(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAnonClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ data: null, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data: member } = await supabase
    .schema("settleup")
    .from("group_members")
    .select("id")
    .eq("group_id", parsed.data.group_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ data: null, error: "You are not a member of this group." }, { status: 403 });
  }

  const summary = await generateInsightsSummary(parsed.data.insights, parsed.data.group_name, user.id);
  return NextResponse.json({ data: { summary }, error: null });
}
