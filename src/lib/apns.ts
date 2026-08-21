// Phase 10: minimal, from-scratch direct-APNs client — no third-party push
// vendor, no new npm dependency. Every route in this app runs on Vercel's
// standard Node.js serverless runtime (confirmed: no route anywhere
// declares `runtime: "edge"`), which has full built-in support for
// node:http2 (a real HTTP/2 client, sufficient for the short-lived
// per-invocation connection APNs needs) and node:crypto (sufficient for
// ES256 JWT signing from a .p8 key) — so this needs nothing beyond Node's
// standard library.
//
// Configuration (APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID /
// APNS_PRIVATE_KEY / APNS_ENVIRONMENT) is read lazily, not at module load —
// none of these are set anywhere yet (native/Apple Developer setup hasn't
// happened), and this module must import cleanly regardless. Every public
// function here is a safe no-op when unconfigured, never a thrown error —
// consistent with this app's existing push philosophy (push.ts's
// dispatchPush): a push failure must never fail the underlying ELF action.

import { createSign, createPrivateKey } from "node:crypto";
import http2 from "node:http2";
import type { PushDeviceRow } from "./pushDevices.ts";
import { getActiveDevicesForAccounts, getPushPreferences, isCategoryEnabled, deactivateDeviceById, type PushCategory } from "./pushDevices.ts";

function isConfigured(): boolean {
  return Boolean(
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID &&
    process.env.APNS_BUNDLE_ID &&
    process.env.APNS_PRIVATE_KEY,
  );
}

function apnsHost(): string {
  return process.env.APNS_ENVIRONMENT === "production"
    ? "api.push.apple.com"
    : "api.sandbox.push.apple.com";
}

// ── JWT (ES256, token-based auth) ────────────────────────────────────────────
//
// Apple recommends reusing a signed token for up to ~55 minutes rather than
// signing a fresh one per request. This module-level cache gives that
// benefit for free across warm serverless invocations sharing the same
// container, without needing any persistent storage — a cold start just
// signs a new one, which is correct and cheap either way.

let cachedJwt: { token: string; signedAt: number } | null = null;
const JWT_TTL_MS = 50 * 60 * 1000; // under Apple's ~1hr guidance, refreshed early

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signApnsJwt(): string | null {
  if (cachedJwt && Date.now() - cachedJwt.signedAt < JWT_TTL_MS) return cachedJwt.token;

  const keyId = process.env.APNS_KEY_ID!;
  const teamId = process.env.APNS_TEAM_ID!;
  // .p8 contents stored as a single-line env var commonly need literal
  // "\n" sequences restored to real newlines to parse as PEM.
  const rawKey = process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, "\n");

  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${payload}`;

  let signature: Buffer;
  try {
    const privateKey = createPrivateKey(rawKey);
    signature = createSign("sha256")
      .update(signingInput)
      .sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  } catch {
    return null; // malformed/misconfigured key — treat as unconfigured, never throw
  }

  const token = `${signingInput}.${base64url(signature)}`;
  cachedJwt = { token, signedAt: Date.now() };
  return token;
}

// ── Payload construction (pure, privacy-safe) ────────────────────────────────

export type ApnsAlertKind = "announcement" | "file_upload" | "calendar_event" | "message" | "request";

export type ApnsAlertContext = {
  actorName?: string;   // e.g. the coach/sender's display name
  eventTitle?: string;  // calendar event title
};

/** Pure — builds the lock-screen-safe title/body for each category. No full
 *  message bodies, no private athlete/donor/contact details ever appear
 *  here; tapping opens ELF for the real content. Mirrors the approved
 *  examples exactly. */
export function buildApnsAlert(kind: ApnsAlertKind, ctx: ApnsAlertContext): { title: string; body: string } {
  switch (kind) {
    case "announcement":
      return { title: "Team Update", body: ctx.actorName ? `New team update from ${ctx.actorName}` : "New team update" };
    case "file_upload":
      return { title: "Team Update", body: ctx.actorName ? `New team update from ${ctx.actorName}` : "New team update" };
    case "message":
      return { title: "New Message", body: ctx.actorName ? `${ctx.actorName} sent you a message` : "You have a new message" };
    case "calendar_event":
      return { title: "Calendar", body: ctx.eventTitle ? `Practice schedule updated: ${ctx.eventTitle}` : "Practice schedule updated" };
    case "request":
      return { title: "Team Request", body: "A new team request needs review" };
  }
}

export type ApnsPayload = {
  aps: { alert: { title: string; body: string }; sound: "default" };
  url: string; // custom field — deep-link route, consumed by the native tap handler (later phase)
};

/** Pure — no badge field at all in V1 (explicit product decision: ship
 *  without a badge number rather than an inaccurate one). */
export function buildApnsPayload(alert: { title: string; body: string }, url: string): ApnsPayload {
  return { aps: { alert, sound: "default" }, url };
}

// ── Failure classification (pure, testable) ──────────────────────────────────

export type ApnsFailureAction = "deactivate" | "ignore";

/** Pure — mirrors push.ts's dispatchPush() stale-subscription handling
 *  exactly: only Apple's "this token is really gone" signals deactivate the
 *  device; every other error (including Apple being unreachable, a
 *  misconfigured topic, or a transient 5xx) is ignored — no retry, no
 *  deletion of a possibly-still-valid token. */
export function classifyApnsFailure(status: number, reason: string | null): ApnsFailureAction {
  if (status === 410) return "deactivate"; // Unregistered
  if (status === 400 && reason === "BadDeviceToken") return "deactivate";
  return "ignore";
}

// ── HTTP/2 send (single device) ──────────────────────────────────────────────

function sendOne(deviceToken: string, jwt: string, payload: ApnsPayload): Promise<{ status: number; reason: string | null }> {
  return new Promise(resolve => {
    const client = http2.connect(`https://${apnsHost()}`);
    client.on("error", () => resolve({ status: 0, reason: null }));

    const body = JSON.stringify(payload);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${encodeURIComponent(deviceToken)}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": process.env.APNS_BUNDLE_ID!,
      "apns-push-type": "alert",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });

    let status = 0;
    const chunks: Buffer[] = [];
    req.on("response", headers => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      let reason: string | null = null;
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        reason = text ? (JSON.parse(text).reason ?? null) : null;
      } catch { /* non-JSON/empty body — reason stays null */ }
      client.close();
      resolve({ status, reason });
    });
    req.on("error", () => {
      client.close();
      resolve({ status: 0, reason: null });
    });

    req.write(body);
    req.end();
  });
}

// ── Dispatch orchestration ────────────────────────────────────────────────────

export type ApnsDispatchInput = {
  accountIds: string[];
  category: PushCategory;
  kind: ApnsAlertKind;
  ctx: ApnsAlertContext;
  url: string;
};

/** Fan out one alert to every active iOS device for the given accounts,
 *  skipping any account that has opted the category off. Never throws —
 *  every failure mode (unconfigured APNs, network error, invalid token,
 *  bad account) is swallowed here so a push attempt can never fail the
 *  action that triggered it. */
export async function dispatchApnsPush(input: ApnsDispatchInput): Promise<void> {
  try {
    if (!isConfigured()) return; // no-op until Apple Developer/native setup is complete
    if (!input.accountIds.length) return;

    const jwt = signApnsJwt();
    if (!jwt) return;

    const devices: PushDeviceRow[] = await getActiveDevicesForAccounts(input.accountIds);
    const iosDevices = devices.filter(d => d.platform === "ios");
    if (!iosDevices.length) return;

    const alert = buildApnsAlert(input.kind, input.ctx);
    const payload = buildApnsPayload(alert, input.url);

    await Promise.allSettled(
      iosDevices.map(async device => {
        try {
          const prefs = await getPushPreferences(device.account_id);
          if (!isCategoryEnabled(prefs, input.category)) return;

          const { status, reason } = await sendOne(device.device_token, jwt, payload);
          if (status >= 200 && status < 300) return;
          if (classifyApnsFailure(status, reason) === "deactivate") {
            await deactivateDeviceById(device.id);
          }
        } catch {
          // Per-device failure — never let one bad device affect the rest,
          // and never propagate to the caller of dispatchApnsPush.
        }
      }),
    );
  } catch {
    // Whole-dispatch safety net — see module header.
  }
}
