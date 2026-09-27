import { NextResponse, type NextRequest } from "next/server";

/**
 * Report-only, and temporary: says which host this app is handed behind
 * Hostinger's CDN, so the vantriqai.com -> www redirect that replaces this
 * file can be keyed on a header that is actually trustworthy. Keyed on the
 * wrong one it could send www to itself, and browsers cache a 301.
 */
export function proxy(request: NextRequest) {
  const h = request.headers;
  const response = NextResponse.next();
  response.headers.set(
    "x-vantriq-host-check",
    [
      `host=${h.get("host") ?? "-"}`,
      `x-forwarded-host=${h.get("x-forwarded-host") ?? "-"}`,
      `forwarded=${h.get("forwarded") ?? "-"}`,
      `nexturl=${request.nextUrl.host}`,
      `names=${Array.from(h.keys()).join(",")}`,
    ].join("; "),
  );
  return response;
}

export const config = {
  // Pages and files; not the API or build assets.
  matcher: ["/((?!api/|_next/).*)"],
};
