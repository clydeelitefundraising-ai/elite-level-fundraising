// Phase 2A: minimal, from-scratch Android FCM (HTTP v1) sender -- no Firebase
// Admin SDK, no google-auth-library, no new npm dependency. Mirrors apns.ts's
// philosophy: node:crypto for signing, plain fetch for transport, lazy env
// reads, and every public function is a safe no-op when unconfigured and
// never throws -- a push failure must never fail the action that triggered
// it. Server-only: imports node:crypto and is only reachable from API routes
// (never from a "use client" file).
//
// Configuration (all server-only; leave unset to disable Android push):
//   FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY
//
// Logging rule: only opaque push_devices row ids, counts, HTTP statuses and
// allowlisted FCM error-code names are ever logged. Never the registration
// token, the service-account JWT, the OAuth access token, the private key,
// the client email or a raw provider response body.

import { createPrivateKey, createSign } from "node:crypto";
import type { PushDeviceRow, PushPreferences } from "./pushDevices.ts";
import {
  getActiveDevicesForAccounts,
  getPushPreferences,
  isCategoryEnabled,
  deactivateDeviceById,
} from "./pushDevices.ts";
import { buildApnsAlert, type ApnsAlertKind, type ApnsDispatchInput } from "./apns.ts";

// ── Configuration ─────────────────────────────────────────────────────────────

export type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

/** Pure -- returns null unless ALL THREE variables are present and non-empty.
 *  The private key commonly arrives as a single-line env value with literal
 *  "\n" sequences (and sometimes wrapping quotes); both are normalised. */
export function getFcmConfig(env: Record<string, string | undefined> = process.env): FcmConfig | null {
  const projectId = env.FCM_PROJECT_ID?.trim();
  const clientEmail = env.FCM_CLIENT_EMAIL?.trim();
  let privateKey = env.FCM_PRIVATE_KEY?.trim();
  if (!projectId || !clientEmail || !privateKey) return null;
  if (
    privateKey.length > 1 &&
    ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith("'") && privateKey.endsWith("'")))
  ) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  if (!privateKey.trim()) return null;
  return { projectId, clientEmail, privateKey };
}

// ── Service-account JWT (RS256) → OAuth access token ─────────────────────────

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const JWT_LIFETIME_SECONDS = 3600;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Pure given its inputs. Throws on a malformed key (callers catch). */
export function buildServiceAccountJwt(config: FcmConfig, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: FCM_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + JWT_LIFETIME_SECONDS,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(createPrivateKey(config.privateKey));
  return `${signingInput}.${base64url(signature)}`;
}

/** Refresh when less than this much lifetime remains. */
export const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type FcmFetch = (url: string, init: RequestInit) => Promise<Response>;

export type AccessTokenProvider = {
  get(config: FcmConfig, fetchFn: FcmFetch): Promise<string | null>;
  invalidate(): void;
};

/** Access-token cache with an expiry margin and de-duplicated concurrent
 *  refreshes. Failures are never cached and never throw: `get` resolves null
 *  and the caller skips the send (nothing is deactivated for an auth failure).
 *  The token, assertion and response body are never logged. */
export function createAccessTokenProvider(now: () => number = Date.now): AccessTokenProvider {
  let cached: { token: string; expiresAtMs: number; key: string } | null = null;
  let inflight: { key: string; promise: Promise<string | null> } | null = null;

  async function exchange(config: FcmConfig, fetchFn: FcmFetch): Promise<string | null> {
    try {
      const assertion = buildServiceAccountJwt(config, Math.floor(now() / 1000));
      const res = await fetchFn(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }).toString(),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
      if (typeof json.access_token !== "string" || !json.access_token) return null;
      const ttlSeconds = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600;
      cached = { token: json.access_token, expiresAtMs: now() + ttlSeconds * 1000, key: config.clientEmail };
      return json.access_token;
    } catch {
      return null;
    }
  }

  return {
    async get(config, fetchFn) {
      if (cached && cached.key === config.clientEmail && cached.expiresAtMs - now() > ACCESS_TOKEN_REFRESH_MARGIN_MS) {
        return cached.token;
      }
      if (inflight && inflight.key === config.clientEmail) return inflight.promise;
      const promise = exchange(config, fetchFn).finally(() => {
        inflight = null;
      });
      inflight = { key: config.clientEmail, promise };
      return promise;
    },
    invalidate() {
      cached = null;
    },
  };
}

const defaultAccessTokenProvider = createAccessTokenProvider();

// ── Message construction (pure, privacy-safe) ────────────────────────────────

/** Stable Android notification channel id. The client phase (not yet built)
 *  will create a channel with this id. Until then FCM falls back to the
 *  manifest/default fallback channel rather than dropping the message: per the
 *  FCM v1 docs, a channel_id the app has not created yet is not an error and
 *  the notification is still displayed via the fallback channel. */
export const FCM_ANDROID_CHANNEL_ID = "elf_default";

export function buildFcmEndpoint(projectId: string): string {
  return `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
}

export type FcmMessage = {
  message: {
    token: string;
    notification: { title: string; body: string };
    data: { url: string; kind: string };
    android: { priority: "HIGH"; notification: { channel_id: string } };
  };
};

/** Title/body come from the same buildApnsAlert output APNs uses (no
 *  duplicated copy, no message bodies). data values are strings, as FCM
 *  requires. */
export function buildFcmMessage(
  token: string,
  alert: { title: string; body: string },
  url: string,
  kind: string,
): FcmMessage {
  return {
    message: {
      token,
      notification: { title: alert.title, body: alert.body },
      data: { url: String(url), kind: String(kind) },
      android: { priority: "HIGH", notification: { channel_id: FCM_ANDROID_CHANNEL_ID } },
    },
  };
}

// ── Error classification (pure) ──────────────────────────────────────────────

export type FcmFailureKind = "permanent_token" | "transient" | "auth_config";

type FcmErrorDetail = {
  errorCode?: unknown;
  fieldViolations?: Array<{ field?: unknown; description?: unknown }>;
};
type FcmErrorBody = { error?: { code?: unknown; message?: unknown; status?: unknown; details?: FcmErrorDetail[] } };

function errorParts(body: unknown): { status: string; message: string; codes: string[]; fields: string[] } {
  const err = (body as FcmErrorBody | null | undefined)?.error;
  const details = Array.isArray(err?.details) ? err!.details! : [];
  return {
    status: typeof err?.status === "string" ? err.status : "",
    message: typeof err?.message === "string" ? err.message : "",
    codes: details.map(d => d?.errorCode).filter((c): c is string => typeof c === "string"),
    fields: details
      .flatMap(d => (Array.isArray(d?.fieldViolations) ? d.fieldViolations! : []))
      .map(v => v?.field)
      .filter((f): f is string => typeof f === "string"),
  };
}

/** Allowlisted, log-safe FCM error name -- never any free-form response text. */
export function fcmErrorCode(body: unknown): string {
  const { status, codes } = errorParts(body);
  const known = [
    "UNREGISTERED", "SENDER_ID_MISMATCH", "INVALID_ARGUMENT", "QUOTA_EXCEEDED", "UNAVAILABLE",
    "INTERNAL", "THIRD_PARTY_AUTH_ERROR", "PERMISSION_DENIED", "UNAUTHENTICATED", "NOT_FOUND",
  ];
  for (const c of codes) if (known.includes(c)) return c;
  return known.includes(status) ? status : "UNKNOWN";
}

/** Only unambiguous "this registration token is dead/wrong" signals are
 *  permanent. A generic INVALID_ARGUMENT (payload problem), auth/config
 *  problems, quota, 5xx and network errors never deactivate a device. */
export function classifyFcmError(httpStatus: number, body: unknown): FcmFailureKind {
  const { status, message, codes, fields } = errorParts(body);
  const lower = message.toLowerCase();

  if (codes.includes("UNREGISTERED") || (status === "NOT_FOUND" && lower.includes("unregistered"))) {
    return "permanent_token";
  }
  if (codes.includes("SENDER_ID_MISMATCH") || (httpStatus === 403 && lower.includes("senderid mismatch"))) {
    return "permanent_token";
  }
  if (httpStatus === 400 && (status === "INVALID_ARGUMENT" || codes.includes("INVALID_ARGUMENT"))) {
    const tokenSpecific =
      fields.some(f => f === "message.token" || f.startsWith("message.token.")) ||
      lower.includes("registration token");
    return tokenSpecific ? "permanent_token" : "transient";
  }
  if (httpStatus === 401 || httpStatus === 403) return "auth_config";
  return "transient";
}

// ── Send + dispatch ──────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CONCURRENCY = 8;

export type FcmSendOutcome =
  | { result: "sent"; httpStatus: number }
  | { result: "failed"; kind: FcmFailureKind; httpStatus: number; code: string };

export type FcmDeps = {
  env: Record<string, string | undefined>;
  fetchFn: FcmFetch;
  now: () => number;
  getDevices: (accountIds: string[]) => Promise<PushDeviceRow[]>;
  getPrefs: (accountId: string) => Promise<PushPreferences | null>;
  deactivate: (deviceId: string) => Promise<void>;
  tokenProvider: AccessTokenProvider;
  log: (event: string, detail?: Record<string, unknown>) => void;
  timeoutMs: number;
  concurrency: number;
};

function defaultDeps(): FcmDeps {
  return {
    env: process.env,
    fetchFn: (url, init) => fetch(url, init),
    now: Date.now,
    getDevices: getActiveDevicesForAccounts,
    getPrefs: getPushPreferences,
    deactivate: deactivateDeviceById,
    tokenProvider: defaultAccessTokenProvider,
    log: (event, detail) => console.log(`[fcm] ${event}`, detail ?? {}),
    timeoutMs: REQUEST_TIMEOUT_MS,
    concurrency: MAX_CONCURRENCY,
  };
}

/** One FCM v1 send. Never throws; network errors and timeouts are "transient". */
export async function sendFcm(
  deps: Pick<FcmDeps, "fetchFn" | "timeoutMs" | "tokenProvider">,
  config: FcmConfig,
  accessToken: string,
  message: FcmMessage,
): Promise<FcmSendOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    const res = await deps.fetchFn(buildFcmEndpoint(config.projectId), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
    if (res.ok) return { result: "sent", httpStatus: res.status };
    let body: unknown = null;
    try { body = await res.json(); } catch { /* non-JSON body */ }
    if (res.status === 401 || errorParts(body).status === "UNAUTHENTICATED") deps.tokenProvider.invalidate();
    return { result: "failed", kind: classifyFcmError(res.status, body), httpStatus: res.status, code: fcmErrorCode(body) };
  } catch {
    return { result: "failed", kind: "transient", httpStatus: 0, code: "NETWORK" };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/** Fan one alert out to every active ANDROID device for the given accounts,
 *  skipping accounts that opted the category off (same gating as APNs). Same
 *  input contract as dispatchApnsPush. Never throws; unconfigured FCM is a
 *  silent no-op with no network access. */
export async function dispatchFcmPush(input: ApnsDispatchInput, overrides: Partial<FcmDeps> = {}): Promise<void> {
  let deps: FcmDeps | null = null;
  try {
    deps = { ...defaultDeps(), ...overrides };
    const d = deps;
    const config = getFcmConfig(d.env);
    if (!config) return;
    if (!input.accountIds.length) return;

    const devices = await d.getDevices(input.accountIds);
    const androidDevices = devices.filter(x => x.platform === "android" && x.active !== false);
    if (!androidDevices.length) return;

    const accessToken = await d.tokenProvider.get(config, d.fetchFn);
    if (!accessToken) {
      d.log("dispatch_skipped", { reason: "access_token_unavailable" });
      return;
    }

    const alert = buildApnsAlert(input.kind as ApnsAlertKind, input.ctx);
    const prefCache = new Map<string, Promise<PushPreferences | null>>();
    const counts = { sent: 0, deactivated: 0, failed: 0, skipped: 0 };

    await mapWithConcurrency(androidDevices, d.concurrency, async device => {
      try {
        let prefsPromise = prefCache.get(device.account_id);
        if (!prefsPromise) {
          prefsPromise = d.getPrefs(device.account_id);
          prefCache.set(device.account_id, prefsPromise);
        }
        if (!isCategoryEnabled(await prefsPromise, input.category)) {
          counts.skipped++;
          return;
        }

        const outcome = await sendFcm(d, config, accessToken, buildFcmMessage(device.device_token, alert, input.url, input.kind));
        if (outcome.result === "sent") {
          counts.sent++;
          return;
        }
        counts.failed++;
        d.log("device_rejected", { deviceId: device.id, status: outcome.httpStatus, code: outcome.code, kind: outcome.kind });
        if (outcome.kind === "permanent_token") {
          await d.deactivate(device.id);
          counts.deactivated++;
          d.log("device_deactivated", { deviceId: device.id, code: outcome.code });
        }
      } catch (err) {
        counts.failed++;
        d.log("device_error", { deviceId: device.id, error: err instanceof Error ? err.name : "Error" });
      }
    });

    d.log("dispatch_finished", { category: input.category, kind: input.kind, androidDeviceCount: androidDevices.length, ...counts });
  } catch (err) {
    try {
      (deps ?? defaultDeps()).log("dispatch_error", { error: err instanceof Error ? err.name : "Error" });
    } catch { /* logging must never throw */ }
  }
}
