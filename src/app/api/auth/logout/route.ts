import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const res  = NextResponse.redirect(new URL("/", req.url));
  const opts = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path:     "/",
    maxAge:   0,
  };
  res.cookies.set("elf_session", "",  opts);
  res.cookies.set("team_coach",  "",  opts);
  res.cookies.set("team_member", "",  opts);
  return res;
}
