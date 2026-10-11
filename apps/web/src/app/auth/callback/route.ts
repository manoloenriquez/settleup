import { safeReturnPath } from "@template/shared";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeReturnPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL(
      next === "/update-password"
        ? "/forgot-password?error=expired"
        : `/login?error=auth&redirectTo=${encodeURIComponent(next)}`,
      request.url,
    ),
  );
}
