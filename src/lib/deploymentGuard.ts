// QA deployment guard — fail-closed configuration check for the isolated QA
// deployment (Vercel project "elf-team-qa", Supabase project
// mzsvbxosoidwhntpjdkf).
//
// Runs at `next build` (next.config.ts) and at server start-up
// (src/instrumentation.ts). Inert for every other deployment: unless the
// QA mode is switched on, it returns { mode: "standard" } and changes nothing.
//
// QA mode is switched on by EITHER of two independent signals, so leaving
// one out can't silently skip the checks:
//   1. ELF_DEPLOYMENT=qa
//   2. Vercel reports this deployment as part of the elf-team-qa project
//      (VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL / VERCEL_BRANCH_URL host
//      starts with "elf-team-qa"). When only this signal is present the
//      configuration is refused until ELF_DEPLOYMENT=qa is set as well.
//
// In QA mode the configuration must point at the QA Supabase project only,
// with no live Stripe key, no production URLs and no outbound email, push or
// Redis credentials unless ELF_QA_ALLOW_OUTBOUND names them. Messages name
// variables, never their values.
//
// No Node-only APIs: start-up validation also runs in the Edge runtime.

export const PRODUCTION_SUPABASE_REF = "nggabucgcoaffpppchsp";
export const QA_SUPABASE_REF = "mzsvbxosoidwhntpjdkf";
export const QA_VERCEL_PROJECT = "elf-team-qa";

type Env = Record<string, string | undefined>;

export interface DeploymentCheck {
  mode: "qa" | "standard";
  /** Which signals switched QA mode on (empty in standard mode). */
  triggers: string[];
  /** Problems found; empty means the configuration is accepted. */
  errors: string[];
}

const REQUIRED_IN_QA = [
  "ELF_QA_SUPABASE_REF",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "ELF_ACCOUNT_PEPPER",
  "TEAM_COACH_PEPPER",
  "TEAM_MEMBER_PEPPER",
  "ADMIN_PEPPER",
  "ADMIN_PASSWORD",
  "CALENDAR_SYNC_PEPPER",
  "CRON_SECRET",
];

// Outbound integrations that stay off in QA unless ELF_QA_ALLOW_OUTBOUND
// names their group (comma-separated, e.g. "email,push").
const OUTBOUND_GROUPS: Record<string, { label: string; names: string[]; prefixes: string[] }> = {
  email: {
    label: "email (Resend)",
    names: ["RESEND_API_KEY", "FROM_EMAIL", "ELF_ADMIN_NOTIFICATION_EMAIL", "DEMO_NOTIFICATION_EMAIL"],
    prefixes: [],
  },
  push: {
    label: "push notifications",
    names: [
      "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_BUNDLE_ID", "APNS_PRIVATE_KEY",
    ],
    // FCM by prefix: only src/lib/fcm.ts names the FCM credential variables.
    prefixes: ["FCM_"],
  },
  redis: {
    label: "Redis",
    names: [],
    prefixes: ["UPSTASH_", "KV_", "REDIS_"],
  },
};

// Direct database credentials: the app only talks to Supabase over its REST
// API, so in QA these can only come from a linked integration — never allowed.
const DIRECT_DB_PREFIXES = ["POSTGRES_", "DATABASE_URL", "SUPABASE_DB_", "SUPABASE_JWT_SECRET"];

function value(env: Env, name: string): string {
  return (env[name] ?? "").trim();
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A production ELF host: the public domains and the elf-team-app project. */
export function isProductionHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "elitelevelfundraising.com"
    || h.endsWith(".elitelevelfundraising.com")
    || h === "elf-team-app.vercel.app"
    || (h.startsWith("elf-team-app-") && h.endsWith(".vercel.app"));
}

/** A host that belongs to the elf-team-qa Vercel project. */
export function isQaVercelHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return h.endsWith(".vercel.app") && (h.startsWith(`${QA_VERCEL_PROJECT}.`) || h.startsWith(`${QA_VERCEL_PROJECT}-`));
}

/** Decodes a JWT payload without verifying it (claims only). */
function jwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function qaTriggers(env: Env): string[] {
  const triggers: string[] = [];
  if (value(env, "ELF_DEPLOYMENT") === "qa") triggers.push("ELF_DEPLOYMENT=qa");
  for (const name of ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_BRANCH_URL"]) {
    const v = value(env, name);
    if (v && isQaVercelHost(v)) triggers.push(`${name} is an ${QA_VERCEL_PROJECT} host`);
  }
  return triggers;
}

export function checkDeployment(env: Env = process.env): DeploymentCheck {
  const deployment = value(env, "ELF_DEPLOYMENT");
  const triggers = qaTriggers(env);

  if (triggers.length === 0) {
    // Standard (production, preview, marketing, local) deployments are left
    // alone — except a misspelt ELF_DEPLOYMENT, which must not silently
    // turn the QA checks off.
    return deployment
      ? { mode: "standard", triggers, errors: [`ELF_DEPLOYMENT must be "qa" or unset (it is set to something else)`] }
      : { mode: "standard", triggers, errors: [] };
  }

  const errors: string[] = [];
  if (deployment !== "qa") {
    errors.push(`this is the ${QA_VERCEL_PROJECT} Vercel project but ELF_DEPLOYMENT is not "qa"`);
  }

  for (const name of REQUIRED_IN_QA) {
    if (!value(env, name)) errors.push(`${name} is required in QA`);
  }

  // Supabase: the QA project and nothing else.
  const ref = value(env, "ELF_QA_SUPABASE_REF");
  if (ref && ref !== QA_SUPABASE_REF) errors.push(`ELF_QA_SUPABASE_REF is not the QA project (${QA_SUPABASE_REF})`);

  const supabaseUrl = value(env, "NEXT_PUBLIC_SUPABASE_URL");
  if (supabaseUrl) {
    const host = hostOf(supabaseUrl);
    if (!supabaseUrl.startsWith("https://") || host !== `${QA_SUPABASE_REF}.supabase.co`) {
      errors.push(`NEXT_PUBLIC_SUPABASE_URL is not https://${QA_SUPABASE_REF}.supabase.co`);
    }
  }

  const serviceKey = value(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey) {
    const claims = jwtPayload(serviceKey);
    if (!claims) {
      errors.push("SUPABASE_SERVICE_ROLE_KEY must be the QA project's JWT service_role key (other key formats can't be verified as belonging to QA)");
    } else {
      if (claims.ref !== QA_SUPABASE_REF) errors.push("SUPABASE_SERVICE_ROLE_KEY belongs to a different Supabase project");
      if (claims.role !== "service_role") errors.push("SUPABASE_SERVICE_ROLE_KEY is not a service_role key");
    }
  }

  // App URLs: the QA deployment itself, or localhost for a local build.
  const appUrl = value(env, "NEXT_PUBLIC_APP_URL");
  if (appUrl) {
    const host = hostOf(appUrl);
    const local = host === "localhost" || host === "127.0.0.1";
    if (!host) errors.push("NEXT_PUBLIC_APP_URL is not a valid URL");
    else if (isProductionHost(host)) errors.push("NEXT_PUBLIC_APP_URL is a production URL");
    else if (local ? value(env, "VERCEL") === "1" : !(appUrl.startsWith("https://") && isQaVercelHost(host))) {
      errors.push(`NEXT_PUBLIC_APP_URL must be the https://${QA_VERCEL_PROJECT}… deployment URL`);
    }
  }
  const marketingUrl = value(env, "NEXT_PUBLIC_MARKETING_URL");
  if (marketingUrl && isProductionHost(hostOf(marketingUrl) ?? "")) {
    errors.push("NEXT_PUBLIC_MARKETING_URL is a production URL");
  }
  const productionUrl = value(env, "VERCEL_PROJECT_PRODUCTION_URL");
  if (productionUrl && isProductionHost(productionUrl.replace(/^https?:\/\//, "").split("/")[0])) {
    errors.push("VERCEL_PROJECT_PRODUCTION_URL is a production domain — this is not the QA project");
  }

  // Stripe: test mode only.
  const stripeKey = value(env, "STRIPE_SECRET_KEY");
  if (stripeKey && !/^(sk|rk)_test_/.test(stripeKey)) {
    errors.push("STRIPE_SECRET_KEY must be a Stripe test-mode key (sk_test_/rk_test_)");
  }

  // APNs: never the production push gateway.
  if (value(env, "APNS_ENVIRONMENT") === "production") errors.push("APNS_ENVIRONMENT=production is not allowed in QA");

  // Outbound integrations: off unless explicitly authorized.
  const allowed = new Set(value(env, "ELF_QA_ALLOW_OUTBOUND").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
  for (const g of allowed) {
    if (!(g in OUTBOUND_GROUPS)) errors.push(`ELF_QA_ALLOW_OUTBOUND contains an unknown group (allowed: ${Object.keys(OUTBOUND_GROUPS).join(", ")})`);
  }
  const names = Object.keys(env).filter(n => value(env, n)).sort();
  for (const [group, spec] of Object.entries(OUTBOUND_GROUPS)) {
    if (allowed.has(group)) continue;
    for (const n of names) {
      if (spec.names.includes(n) || spec.prefixes.some(p => n.startsWith(p))) {
        errors.push(`${n} is set but ${spec.label} is not authorized in QA (ELF_QA_ALLOW_OUTBOUND)`);
      }
    }
  }
  for (const n of names) {
    if (DIRECT_DB_PREFIXES.some(p => n.startsWith(p))) errors.push(`${n} is set — direct database credentials are not allowed in QA`);
  }

  // Catch-all over every variable: production project, production app
  // hosts, live Stripe keys, or a Supabase JWT for another project.
  for (const n of names) {
    const v = value(env, n);
    const lower = v.toLowerCase();
    if (lower.includes(PRODUCTION_SUPABASE_REF)) errors.push(`${n} refers to the production Supabase project`);
    if (lower.includes("app.elitelevelfundraising.com") || lower.includes("elf-team-app.vercel.app")) {
      errors.push(`${n} refers to the production app`);
    }
    if (/(^|[^a-z])(sk|rk|pk)_live_/.test(lower)) errors.push(`${n} contains a live Stripe key`);
    const claims = jwtPayload(v);
    if (claims && typeof claims.ref === "string" && claims.ref !== QA_SUPABASE_REF && n !== "SUPABASE_SERVICE_ROLE_KEY") {
      errors.push(`${n} is a Supabase key for a different project`);
    }
  }

  return { mode: "qa", triggers, errors: [...new Set(errors)] };
}

/** Throws (naming variables, never values) unless the configuration is
 *  acceptable. `stage` labels the message ("build", "startup"). */
export function assertDeploymentSafe(env: Env = process.env, stage = "startup"): DeploymentCheck {
  const result = checkDeployment(env);
  if (result.errors.length > 0) {
    throw new Error(
      `ELF deployment guard refused this configuration at ${stage} (QA mode: ${result.triggers.join("; ") || "off"}):\n`
      + result.errors.map(e => `  - ${e}`).join("\n"),
    );
  }
  return result;
}
