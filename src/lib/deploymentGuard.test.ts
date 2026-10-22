// QA deployment guard — fail-closed configuration rules.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertDeploymentSafe, checkDeployment, isProductionHost, isQaVercelHost,
  PRODUCTION_SUPABASE_REF, PRODUCTION_VERCEL_PROJECT_ID, QA_SUPABASE_REF, QA_VERCEL_PROJECT_ID,
} from "./deploymentGuard.ts";
import { teamAppLoginUrl } from "./teamAppLogin.ts";

const ROOT = join(import.meta.dirname, "..", "..");

// Synthetic, unsigned Supabase-style JWTs (claims only — never real keys).
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (ref: string, role: string) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ iss: "supabase", ref, role })}.c2lnbmF0dXJl`;
// Synthetic Vercel OIDC token (claims shape only).
const oidc = (project: string, project_id: string) =>
  `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ iss: "https://oidc.vercel.com/team", owner: "team", project, project_id, environment: "production" })}.c2lnbmF0dXJl`;
const SHORTENED_HOST = "elf-team-71cj9c4kl-clydeelitefundraising-5717s-projects.vercel.app";
const PROTECTED_QA_HOST = "elf-team-qa-clydeelitefundraising-5717s-projects.vercel.app";

const QA_ENV: Record<string, string> = {
  ELF_DEPLOYMENT: "qa",
  ELF_QA_SUPABASE_REF: QA_SUPABASE_REF,
  NEXT_PUBLIC_SUPABASE_URL: `https://${QA_SUPABASE_REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: jwt(QA_SUPABASE_REF, "service_role"),
  NEXT_PUBLIC_APP_URL: "https://elf-team-qa.vercel.app",
  ELF_ACCOUNT_PEPPER: "synthetic-1",
  TEAM_COACH_PEPPER: "synthetic-2",
  TEAM_MEMBER_PEPPER: "synthetic-3",
  ADMIN_PEPPER: "synthetic-4",
  ADMIN_PASSWORD: "synthetic-5",
  CALENDAR_SYNC_PEPPER: "synthetic-6",
  CRON_SECRET: "synthetic-7",
  COMPLETE_SEASON_PREVIEW: "true",
};
const qa = (over: Record<string, string | undefined> = {}) => ({ ...QA_ENV, ...over });
const errorsOf = (env: Record<string, string | undefined>) => checkDeployment(env).errors;
const refused = (env: Record<string, string | undefined>, pattern: RegExp) => {
  const errors = errorsOf(env);
  assert.ok(errors.some(e => pattern.test(e)), `expected an error matching ${pattern}, got: ${JSON.stringify(errors)}`);
};

// ── Production and other deployments are unaffected ──────────────────────

test("standard mode: no QA signal means no checks (production configuration passes untouched)", () => {
  const production = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: jwt(PRODUCTION_SUPABASE_REF, "service_role"),
    NEXT_PUBLIC_APP_URL: "https://app.elitelevelfundraising.com",
    STRIPE_SECRET_KEY: "sk_live_synthetic",
    RESEND_API_KEY: "re_synthetic",
    APNS_ENVIRONMENT: "production",
    APNS_KEY_ID: "synthetic",
    UPSTASH_REDIS_REST_URL: "https://synthetic.upstash.io",
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_URL: "elf-team-app-abc123-team.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "app.elitelevelfundraising.com",
  };
  assert.deepEqual(checkDeployment(production), { mode: "standard", triggers: [], errors: [] });
  assert.equal(assertDeploymentSafe(production, "build").mode, "standard");
  assert.deepEqual(checkDeployment({}), { mode: "standard", triggers: [], errors: [] });
});

test("standard mode: a misspelt ELF_DEPLOYMENT is refused rather than silently ignored", () => {
  refused({ ELF_DEPLOYMENT: "QA" }, /ELF_DEPLOYMENT must be "qa" or unset/);
  refused({ ELF_DEPLOYMENT: "staging" }, /ELF_DEPLOYMENT must be "qa" or unset/);
});

test("marketing Log in: production destination unchanged; QA stays on its own /login", () => {
  assert.equal(teamAppLoginUrl(undefined), "https://app.elitelevelfundraising.com/login");
  assert.equal(teamAppLoginUrl("standard"), "https://app.elitelevelfundraising.com/login");
  assert.equal(teamAppLoginUrl("qa"), "/login");
});

// ── Valid QA configuration ───────────────────────────────────────────────

test("valid QA configuration is accepted", () => {
  assert.deepEqual(checkDeployment(QA_ENV), {
    mode: "qa",
    triggers: ["ELF_DEPLOYMENT=qa", "NEXT_PUBLIC_SUPABASE_URL is the QA Supabase project", "ELF_QA_SUPABASE_REF is set"],
    errors: [],
  });
  // As the deployed elf-team-qa build sees it: protected project hostname,
  // shortened deployment hostname, platform OIDC token for elf-team-qa.
  assert.deepEqual(errorsOf(qa({
    NEXT_PUBLIC_APP_URL: `https://${PROTECTED_QA_HOST}`, VERCEL: "1", VERCEL_ENV: "production",
    VERCEL_URL: SHORTENED_HOST, VERCEL_PROJECT_PRODUCTION_URL: PROTECTED_QA_HOST,
    VERCEL_OIDC_TOKEN: oidc("elf-team-qa", QA_VERCEL_PROJECT_ID), VERCEL_PROJECT_ID: QA_VERCEL_PROJECT_ID,
  })), []);
  assert.deepEqual(errorsOf(qa({ VERCEL: "1", VERCEL_URL: "elf-team-qa-abc123-team.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "elf-team-qa.vercel.app" })), []);
  assert.deepEqual(errorsOf(qa({ STRIPE_SECRET_KEY: "sk_test_synthetic", STRIPE_WEBHOOK_SECRET: "whsec_synthetic" })), []);
  assert.deepEqual(errorsOf(qa({ STRIPE_SECRET_KEY: "rk_test_synthetic" })), []);
  assert.deepEqual(errorsOf(qa({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })), [], "local build");
  assert.deepEqual(errorsOf(qa({ APNS_ENVIRONMENT: "sandbox" })), []);
  assert.deepEqual(errorsOf(qa({ NEXT_PUBLIC_SUPABASE_URL: `https://${QA_SUPABASE_REF}.supabase.co/` })), []);
});

test("explicitly authorized outbound groups are accepted", () => {
  assert.deepEqual(errorsOf(qa({ ELF_QA_ALLOW_OUTBOUND: "email", RESEND_API_KEY: "re_synthetic", FROM_EMAIL: "QA <qa@example.test>" })), []);
  assert.deepEqual(errorsOf(qa({ ELF_QA_ALLOW_OUTBOUND: "push, redis", VAPID_PRIVATE_KEY: "x", APNS_KEY_ID: "x", FCM_PROJECT_ID: "x", UPSTASH_REDIS_REST_URL: "https://qa.upstash.io", UPSTASH_REDIS_REST_TOKEN: "x" })), []);
});

// ── QA mode can't be skipped ─────────────────────────────────────────────

test("the elf-team-qa Vercel project is detected without ELF_DEPLOYMENT, and refused until it is set", () => {
  for (const [name, host] of [
    ["VERCEL_PROJECT_PRODUCTION_URL", "elf-team-qa.vercel.app"],
    ["VERCEL_URL", "elf-team-qa-abc123-team.vercel.app"],
    ["VERCEL_BRANCH_URL", "elf-team-qa-git-main-team.vercel.app"],
  ]) {
    const env = qa({ ELF_DEPLOYMENT: undefined, [name]: host });
    const r = checkDeployment(env);
    assert.equal(r.mode, "qa", name);
    assert.ok(r.errors.some(e => /ELF_DEPLOYMENT is not "qa"/.test(e)), name);
  }
  // A QA project deployment with an otherwise production-shaped config.
  refused({ VERCEL_URL: "elf-team-qa-abc123-team.vercel.app", NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` }, /NEXT_PUBLIC_SUPABASE_URL/);
});

test("QA mode can't be bypassed through Vercel's shortened deployment hostname", () => {
  // Every host-free signal on its own switches QA mode on — and with
  // ELF_DEPLOYMENT missing, the configuration is refused.
  const noMode = qa({ ELF_DEPLOYMENT: undefined, VERCEL: "1", VERCEL_URL: SHORTENED_HOST });
  assert.equal(checkDeployment(noMode).mode, "qa");
  refused(noMode, /ELF_DEPLOYMENT is not "qa"/);
  for (const [label, env] of [
    ["QA Supabase URL", { NEXT_PUBLIC_SUPABASE_URL: `https://${QA_SUPABASE_REF}.supabase.co`, VERCEL_URL: SHORTENED_HOST }],
    ["ELF_QA_SUPABASE_REF", { ELF_QA_SUPABASE_REF: QA_SUPABASE_REF, VERCEL_URL: SHORTENED_HOST }],
    ["OIDC project name", { VERCEL_OIDC_TOKEN: oidc("elf-team-qa", "prj_other"), VERCEL_URL: SHORTENED_HOST }],
    ["OIDC project id", { VERCEL_OIDC_TOKEN: oidc("renamed", QA_VERCEL_PROJECT_ID), VERCEL_URL: SHORTENED_HOST }],
    ["VERCEL_PROJECT_ID", { VERCEL_PROJECT_ID: QA_VERCEL_PROJECT_ID, VERCEL_URL: SHORTENED_HOST }],
    ["protected project host", { VERCEL_PROJECT_PRODUCTION_URL: PROTECTED_QA_HOST }],
  ] as const) {
    const r = checkDeployment(env);
    assert.equal(r.mode, "qa", label);
    assert.ok(r.errors.some(e => /ELF_DEPLOYMENT is not "qa"/.test(e)), label);
    assert.ok(r.errors.some(e => /is required in QA/.test(e)), `${label}: full QA config enforced`);
  }
});

test("a QA configuration inside the production Vercel project is refused", () => {
  refused(qa({ VERCEL_OIDC_TOKEN: oidc("elf-team-app", PRODUCTION_VERCEL_PROJECT_ID) }), /production elf-team-app project/);
  refused(qa({ VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID }), /production elf-team-app project/);
  // …while production's own configuration (no QA signal) stays untouched.
  assert.deepEqual(checkDeployment({
    NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
    VERCEL_OIDC_TOKEN: oidc("elf-team-app", PRODUCTION_VERCEL_PROJECT_ID), VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
    VERCEL_URL: "elf-team-71cj9c4kl-team.vercel.app",
  }), { mode: "standard", triggers: [], errors: [] });
});

test("host matching", () => {
  assert.ok(isQaVercelHost("elf-team-qa.vercel.app"));
  assert.ok(isQaVercelHost("https://elf-team-qa-abc123-team.vercel.app"));
  assert.ok(!isQaVercelHost("elf-team-app.vercel.app"));
  assert.ok(!isQaVercelHost("elf-team-qa.example.com"));
  assert.ok(isProductionHost("app.elitelevelfundraising.com"));
  assert.ok(isProductionHost("elitelevelfundraising.com"));
  assert.ok(isProductionHost("elf-team-app-abc123-team.vercel.app"));
  assert.ok(!isProductionHost("elf-team-qa.vercel.app"));
});

// ── Missing configuration ────────────────────────────────────────────────

test("every required QA variable is enforced", () => {
  for (const name of ["ELF_QA_SUPABASE_REF", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_APP_URL",
    "ELF_ACCOUNT_PEPPER", "TEAM_COACH_PEPPER", "TEAM_MEMBER_PEPPER", "ADMIN_PEPPER", "ADMIN_PASSWORD", "CALENDAR_SYNC_PEPPER", "CRON_SECRET"]) {
    refused(qa({ [name]: undefined }), new RegExp(`^${name} is required in QA$`));
    refused(qa({ [name]: "  " }), new RegExp(`^${name} is required in QA$`));
  }
});

// ── Wrong project ────────────────────────────────────────────────────────

test("wrong Supabase project: ref, URL and service key", () => {
  refused(qa({ ELF_QA_SUPABASE_REF: PRODUCTION_SUPABASE_REF }), /ELF_QA_SUPABASE_REF is not the QA project/);
  refused(qa({ ELF_QA_SUPABASE_REF: "abcdefghijklmnopqrst" }), /ELF_QA_SUPABASE_REF is not the QA project/);
  refused(qa({ NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` }), /NEXT_PUBLIC_SUPABASE_URL is not/);
  refused(qa({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }), /NEXT_PUBLIC_SUPABASE_URL is not/);
  refused(qa({ NEXT_PUBLIC_SUPABASE_URL: `http://${QA_SUPABASE_REF}.supabase.co` }), /NEXT_PUBLIC_SUPABASE_URL is not/);
  refused(qa({ NEXT_PUBLIC_SUPABASE_URL: `https://${QA_SUPABASE_REF}.supabase.co.evil.example` }), /NEXT_PUBLIC_SUPABASE_URL is not/);
  refused(qa({ SUPABASE_SERVICE_ROLE_KEY: jwt(PRODUCTION_SUPABASE_REF, "service_role") }), /belongs to a different Supabase project/);
  refused(qa({ SUPABASE_SERVICE_ROLE_KEY: jwt("abcdefghijklmnopqrst", "service_role") }), /belongs to a different Supabase project/);
  refused(qa({ SUPABASE_SERVICE_ROLE_KEY: jwt(QA_SUPABASE_REF, "anon") }), /not a service_role key/);
  refused(qa({ SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic" }), /must be the QA project's JWT service_role key/);
  refused(qa({ SUPABASE_SERVICE_ROLE_KEY: "not-a-key" }), /must be the QA project's JWT service_role key/);
});

// ── Production secrets and URLs ──────────────────────────────────────────

test("live Stripe keys are refused wherever they appear", () => {
  refused(qa({ STRIPE_SECRET_KEY: "sk_live_synthetic" }), /STRIPE_SECRET_KEY must be a Stripe test-mode key/);
  refused(qa({ STRIPE_SECRET_KEY: "rk_live_synthetic" }), /STRIPE_SECRET_KEY must be a Stripe test-mode key/);
  refused(qa({ STRIPE_SECRET_KEY: "whatever" }), /STRIPE_SECRET_KEY must be a Stripe test-mode key/);
  refused(qa({ SOME_OTHER_KEY: "pk_live_synthetic" }), /SOME_OTHER_KEY contains a live Stripe key/);
});

test("production APNs is refused even when push is authorized", () => {
  refused(qa({ APNS_ENVIRONMENT: "production" }), /APNS_ENVIRONMENT=production is not allowed/);
  refused(qa({ ELF_QA_ALLOW_OUTBOUND: "push", APNS_ENVIRONMENT: "production" }), /APNS_ENVIRONMENT=production is not allowed/);
});

test("production app URLs are refused", () => {
  refused(qa({ NEXT_PUBLIC_APP_URL: "https://app.elitelevelfundraising.com" }), /NEXT_PUBLIC_APP_URL is a production URL/);
  refused(qa({ NEXT_PUBLIC_APP_URL: "https://elf-team-app.vercel.app" }), /NEXT_PUBLIC_APP_URL is a production URL/);
  refused(qa({ NEXT_PUBLIC_APP_URL: "https://elf-team-app-abc123-team.vercel.app" }), /NEXT_PUBLIC_APP_URL is a production URL/);
  refused(qa({ NEXT_PUBLIC_APP_URL: "https://somewhere.example.com" }), /NEXT_PUBLIC_APP_URL must be the https:\/\/elf-team-qa/);
  refused(qa({ NEXT_PUBLIC_APP_URL: "http://elf-team-qa.vercel.app" }), /NEXT_PUBLIC_APP_URL must be the https:\/\/elf-team-qa/);
  refused(qa({ NEXT_PUBLIC_APP_URL: "not a url" }), /NEXT_PUBLIC_APP_URL is not a valid URL/);
  refused(qa({ VERCEL: "1", NEXT_PUBLIC_APP_URL: "http://localhost:3000" }), /NEXT_PUBLIC_APP_URL must be/);
  refused(qa({ NEXT_PUBLIC_MARKETING_URL: "https://www.elitelevelfundraising.com" }), /NEXT_PUBLIC_MARKETING_URL is a production URL/);
  refused(qa({ VERCEL_PROJECT_PRODUCTION_URL: "app.elitelevelfundraising.com" }), /this is not the QA project/);
});

test("unauthorized outbound integrations are refused", () => {
  refused(qa({ RESEND_API_KEY: "re_synthetic" }), /RESEND_API_KEY is set but email \(Resend\) is not authorized/);
  refused(qa({ ELF_ADMIN_NOTIFICATION_EMAIL: "someone@example.test" }), /ELF_ADMIN_NOTIFICATION_EMAIL is set but email/);
  for (const name of ["VAPID_PRIVATE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "APNS_PRIVATE_KEY", "FCM_PROJECT_ID"]) {
    refused(qa({ [name]: "x" }), new RegExp(`${name} is set but push notifications is not authorized`));
  }
  for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "REDIS_URL"]) {
    refused(qa({ [name]: "x" }), new RegExp(`${name} is set but Redis is not authorized`));
  }
  refused(qa({ ELF_QA_ALLOW_OUTBOUND: "email", UPSTASH_REDIS_REST_URL: "x" }), /UPSTASH_REDIS_REST_URL is set but Redis/);
  refused(qa({ ELF_QA_ALLOW_OUTBOUND: "sms" }), /ELF_QA_ALLOW_OUTBOUND contains an unknown group/);
  for (const name of ["POSTGRES_URL", "DATABASE_URL", "SUPABASE_JWT_SECRET"]) {
    refused(qa({ [name]: "x" }), new RegExp(`${name} is set — direct database credentials`));
  }
});

test("catch-all: any variable naming production or carrying another project's key", () => {
  refused(qa({ SOME_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co/storage/v1` }), /SOME_URL refers to the production Supabase project/);
  refused(qa({ SOME_LINK: "https://app.elitelevelfundraising.com/teams" }), /SOME_LINK refers to the production app/);
  refused(qa({ OLD_ANON_KEY: jwt(PRODUCTION_SUPABASE_REF, "anon") }), /OLD_ANON_KEY is a Supabase key for a different project/);
});

// ── Failure surfaces ─────────────────────────────────────────────────────

test("assertDeploymentSafe throws, listing variable names but never values", () => {
  const secret = "sk_live_DO_NOT_PRINT_ME";
  const key = jwt(PRODUCTION_SUPABASE_REF, "service_role");
  assert.throws(() => assertDeploymentSafe(qa({ STRIPE_SECRET_KEY: secret, SUPABASE_SERVICE_ROLE_KEY: key, RESEND_API_KEY: "re_DO_NOT_PRINT" }), "build"), (err: Error) => {
    assert.match(err.message, /refused this configuration at build/);
    assert.match(err.message, /STRIPE_SECRET_KEY/);
    assert.ok(!err.message.includes(secret) && !err.message.includes(key) && !err.message.includes("re_DO_NOT_PRINT"));
    return true;
  });
});

test("next.config.ts refuses a bad QA configuration and keeps production's config unchanged", async () => {
  const { default: config } = await import("../../next.config.ts");
  const saved = { ...process.env };
  const setEnv = (env: Record<string, string | undefined>) => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, env);
  };
  try {
    setEnv({ PATH: saved.PATH });
    assert.deepEqual(config("phase-production-build"), { reactCompiler: true, env: { NEXT_PUBLIC_ELF_DEPLOYMENT_MODE: "standard" } });
    setEnv({ PATH: saved.PATH, ...QA_ENV });
    assert.equal(config("phase-production-build").env?.NEXT_PUBLIC_ELF_DEPLOYMENT_MODE, "qa");
    setEnv({ PATH: saved.PATH, ...QA_ENV, STRIPE_SECRET_KEY: "sk_live_synthetic" });
    assert.throws(() => config("phase-production-build"), /refused this configuration at build/);
    assert.throws(() => config("phase-production-server"), /refused this configuration at server start/);
    setEnv({ PATH: saved.PATH, VERCEL_URL: "elf-team-qa-abc123-team.vercel.app" });
    assert.throws(() => config("phase-production-build"), /ELF_DEPLOYMENT is not "qa"/);
  } finally {
    setEnv(saved);
  }
});

test("wired into the build (next.config.ts) and start-up (src/instrumentation.ts)", () => {
  const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
  assert.match(config, /assertDeploymentSafe\(process\.env, phase === "phase-production-build" \? "build"/);
  assert.match(config, /NEXT_PUBLIC_ELF_DEPLOYMENT_MODE: deployment\.mode/);
  const instrumentation = readFileSync(join(ROOT, "src", "instrumentation.ts"), "utf8");
  assert.match(instrumentation, /export async function register\(\)/);
  assert.match(instrumentation, /assertDeploymentSafe\(process\.env, "startup"\)/);
  const nav = readFileSync(join(ROOT, "src", "components", "marketing", "MarketingNav.tsx"), "utf8");
  assert.match(nav, /teamAppLoginUrl\(process\.env\.NEXT_PUBLIC_ELF_DEPLOYMENT_MODE\)/);
  assert.ok(!nav.includes('"https://app.elitelevelfundraising.com/login"'), "the production URL lives in one place");
});
