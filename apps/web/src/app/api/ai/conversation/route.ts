import { type NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@template/supabase";
import { parseConversation } from "@/lib/ai/conversation";
import { conversationMessageSchema } from "@template/shared/schemas";
import { AI_LIMITS } from "@template/shared/constants";
import { z } from "zod";

const inputSchema = z.object({
  group_id: z.string().uuid(),
  messages: z.array(conversationMessageSchema).min(1).max(AI_LIMITS.MAX_CONVERSATION_MESSAGES),
  member_names: z.array(z.string()),
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

  // Verify group membership
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

  const result = await parseConversation({
    messages: parsed.data.messages,
    member_names: parsed.data.member_names,
    userId: user.id,
  });

  return NextResponse.json(result);
}
