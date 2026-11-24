import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { LOCAL_ANON_KEY, LOCAL_COOKIE_NAME, LOCAL_INTERNAL_URL } from "@/lib/local-supabase/config";
import { localFetch } from "@/lib/local-supabase/fetch";

const LOCAL_DEMO = process.env.NEXT_PUBLIC_LOCAL_DEMO === "1" && !process.env.NEXT_PUBLIC_SUPABASE_URL;

const PROTECTED = ["/dashboard", "/admin", "/onboarding"];

/** Refreshes the Supabase session cookie and guards authenticated areas. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = LOCAL_DEMO ? LOCAL_INTERNAL_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = LOCAL_DEMO ? LOCAL_ANON_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    ...(LOCAL_DEMO ? { cookieOptions: { name: LOCAL_COOKIE_NAME }, global: { fetch: localFetch() } } : {}),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Local demo: drop auth cookies that no longer match a user (e.g. after a data reset).
  if (LOCAL_DEMO && !user) {
    const stale = request.cookies.getAll().filter((c) => c.name.startsWith(LOCAL_COOKIE_NAME));
    stale.forEach((c) => response.cookies.delete(c.name));
  }

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }
  if (user && (path === "/login" || path === "/register")) {
    const dash = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    dash.pathname = next && next.startsWith("/") && !next.startsWith("//") ? next.split("?")[0]! : "/dashboard";
    dash.search = "";
    return NextResponse.redirect(dash);
  }
  // Tell the service worker not to cache pages rendered for a signed-in user.
  if (user) response.headers.set("x-pb-public", "0");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|images/|sw.js|manifest.webmanifest|offline|api/webhooks|api/cron|local-sb).*)",
  ],
};
