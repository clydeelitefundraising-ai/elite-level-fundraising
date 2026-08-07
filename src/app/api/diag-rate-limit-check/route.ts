import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// TEMPORARY diagnostic route — added to trace why UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN appear correctly configured in Vercel but
// rateLimit.ts still throws "required" at runtime. Reports presence/shape
// only, never the actual secret values. Remove before the final commit.
export async function GET() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  const report: Record<string, unknown> = {
    vercelEnv:   process.env.VERCEL_ENV ?? null,
    urlDefined:   typeof url !== "undefined",
    tokenDefined: typeof token !== "undefined",
    urlEmpty:     url === "",
    tokenEmpty:   token === "",
    urlLength:    url?.length ?? null,
    tokenLength:  token?.length ?? null,
    urlLooksLikeUrl: url ? /^https:\/\/.+\.upstash\.io$/.test(url) : null,
  };

  if (url && token) {
    try {
      const redis = new Redis({ url, token });
      const testKey = "__diag_rate_limit_check__";
      await redis.set(testKey, "1", { ex: 30 });
      const readBack = await redis.get(testKey);
      report.redisConnectOk = true;
      report.redisRoundTripOk = readBack === "1";
    } catch (err) {
      report.redisConnectOk = false;
      // Sanitize: strip the literal secret values from the error message
      // before returning, in case the SDK ever echoes the URL/token back.
      let msg = err instanceof Error ? err.message : String(err);
      if (url) msg = msg.split(url).join("[URL]");
      if (token) msg = msg.split(token).join("[TOKEN]");
      report.redisError = msg;
    }
  }

  return NextResponse.json(report);
}
