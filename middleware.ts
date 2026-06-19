import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow auth callback to pass through
  if (pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("sb-access-token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*"],
};
