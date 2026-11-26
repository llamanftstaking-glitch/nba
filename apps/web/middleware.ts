import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "gizer_session";

/**
 * UX-only gate: send visitors without a session cookie to /login.
 * The API enforces authentication on every request; this never grants access to data.
 *
 * It also proxies /api/v1/* using the runtime value of API_INTERNAL_URL. The rewrite in
 * next.config.mjs is frozen at build time, so this is what lets one standalone image be pointed
 * at a different API host through the environment.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/api/v1/")) {
    const base = process.env.API_INTERNAL_URL;
    if (!base) return NextResponse.next();
    return NextResponse.rewrite(new URL(`${pathname}${search}`, base));
  }

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === "/login") {
    return NextResponse.next();
  }
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = `${pathname}${search}`;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|webmanifest)$).*)"],
};
