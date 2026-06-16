import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_ROUTES = ["/dashboard", "/admin", "/groups", "/account"];
const AUTH_ROUTES = ["/login", "/register"];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do not add any code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated user hitting a protected route → login.
  // If they're carrying a Supabase auth cookie, treat it as expiry and surface a message;
  // otherwise it's a normal "not signed in" redirect.
  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  if (!user && isProtected) {
    const hasAuthCookie = request.cookies.getAll().some((c) =>
      c.name.startsWith("sb-") && c.name.includes("auth-token"),
    );
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    if (hasAuthCookie) url.searchParams.set("expired", "1");
    return NextResponse.redirect(url);
  }

  // Authenticated user hitting an auth route → groups
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/groups";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
