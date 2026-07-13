import { NextRequest, NextResponse } from "next/server";

// Hostname-based detection — no env vars required. Works reliably in
// Vercel's Edge Runtime regardless of build-time variable availability.
// Update this set if a custom domain is added to the ELF Team App project.
const ELF_APP_HOSTS = new Set([
  "elf-team-app.vercel.app",
  "app.elitelevelfundraising.com",
]);

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0]; // strip port for local dev
  if (!ELF_APP_HOSTS.has(host)) return; // not the team app — let marketing site serve normally

  const hasSession = req.cookies.has("elf_session");
  return NextResponse.redirect(
    new URL(hasSession ? "/teams" : "/login", req.url),
  );
}

export const config = {
  matcher: ["/"],
};
