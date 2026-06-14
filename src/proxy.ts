import { NextRequest, NextResponse } from "next/server";

// Only runs on the ELF Team App deployment — NEXT_PUBLIC_APP_URL is set there
// but NOT on the marketing site project. This redirects the root URL to the
// appropriate destination so visitors never land on the marketing homepage.
export function proxy(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_APP_URL) return;

  const hasSession = req.cookies.has("elf_session");
  return NextResponse.redirect(
    new URL(hasSession ? "/teams" : "/login", req.url),
  );
}

export const config = {
  matcher: ["/"],
};
