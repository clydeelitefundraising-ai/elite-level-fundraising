// Complete Season Phase 3 — the read-only season-completion preview.
//
// Server only. Calls public.team_season_preview() (phase_s1; made callable by
// the server key in phase_s3) — the same function the transition itself
// uses to decide who carries over, so the preview can't disagree with it.
// Nothing here starts, or can start, a season transition: there is no
// call to team_season_complete() anywhere in the app.
//
// Who may preview: the team's Head Coach or a platform admin. The database
// re-checks it (an account-linked Head Coach of THIS team, or a platform
// admin) — the actor sent to it is built only from the verified session.
import type { TeamActor } from "./permissions.ts";
import { isMissingSchemaError } from "./teamTasksStore.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Feature flag: the preview (entry card, page and API) exists only when
 *  COMPLETE_SEASON_PREVIEW is exactly "true". Off by default. Server-side
 *  only (not a NEXT_PUBLIC_ variable). */
export function isSeasonPreviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COMPLETE_SEASON_PREVIEW === "true";
}

/** Head Coach of this team (team login or ELF account) or a platform admin.
 *  Assistant coaches, boosters, athletes and parents never see the preview
 *  (it lists names). */
export function canPreviewSeason(actor: TeamActor): boolean {
  if (actor.kind === "platform_admin") return true;
  return actor.kind === "coach" && actor.session.role === "head_coach";
}

export type SeasonPreviewDbActor = { coach_id: string } | { platform_admin_id: string };

/** The database actor, from the verified session only. */
export function seasonPreviewDbActor(actor: TeamActor): SeasonPreviewDbActor | null {
  if (actor.kind === "platform_admin") {
    const id = actor.session.platformAdminId;
    return typeof id === "string" && id ? { platform_admin_id: id } : null;
  }
  if (actor.kind === "coach" && actor.session.role === "head_coach") {
    const id = actor.session.id;
    return typeof id === "string" && id ? { coach_id: id } : null;
  }
  return null;
}

// ── Optional overrides (needed when the slug has no year or the label is
//    in an unrecognized format). Not identity — validated, then the database
//    validates again. ─────────────────────────────────────────────────────
export const NEXT_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export type PreviewOverrides = { toSlug: string | null; toSeasonLabel: string | null };

export function parsePreviewOverrides(params: URLSearchParams):
  | { ok: true; overrides: PreviewOverrides }
  | { ok: false; error: string } {
  const slug = (params.get("next_slug") ?? "").trim();
  const label = (params.get("next_label") ?? "").trim();
  if (slug && (slug.length < 3 || slug.length > 80 || !NEXT_SLUG_RE.test(slug))) {
    return { ok: false, error: "The new team address can only use lowercase letters, numbers and hyphens (3–80 characters)." };
  }
  if (label.length > 40) return { ok: false, error: "The season name can be at most 40 characters." };
  return { ok: true, overrides: { toSlug: slug || null, toSeasonLabel: label || null } };
}

// ── The preview, as team_season_preview() returns it ─────────────────────
export type SeasonPreview = {
  from: {
    slug: string; season_label: string; school_name: string; sport_name: string; program_id: string;
    has_organization: boolean; archived: boolean; completed: boolean; successor_slug: string | null;
    fundraising_enabled: boolean;
  };
  proposed: {
    slug: string | null; slug_source: "derived" | "provided" | "required"; slug_available: boolean;
    season_label: string | null; label_source: "derived" | "provided" | "required"; confirmation_phrase: string;
  };
  actor: { kind: "head_coach" | "platform_admin" };
  roster: {
    total: number; graduating: number; returning: number;
    freshman_to_sophomore: number; sophomore_to_junior: number; junior_to_senior: number; unchanged_middle_school: number;
    flagged: { athlete_id: string; name: string; class_year: string | null; reason: "blank" | "other" | "nonstandard" }[];
  };
  members: {
    athletes_carried: number; parents_carried: number; boosters_carried: number;
    athletes_graduated: number; parents_graduates_only: number; unlinked_not_carried: number; parent_links_carried: number;
    must_rejoin: { member_id: string; name: string; role: string }[];
  };
  coaches: {
    head_carried: number; assistant_carried: number; booster_carried: number; actor_carried: boolean;
    must_rejoin: { coach_id: string; name: string; role: string }[];
  };
  calendar: { cutoff_local_date: string; future_events_to_copy: number; subscription_moves: boolean };
  copied: {
    fund_uses: number; store_products: number; team_contact_goal: boolean;
    team_goal_cents: number; default_athlete_goal_cents: number | null;
  };
  left_in_history: {
    announcements: number; message_threads: number; attendance_sessions: number; donations: number;
    team_sponsors: number; todo_tasks: number; clearance_resources: number;
  };
  open_items: {
    pending_athlete_requests: number; pending_parent_requests: number; pending_staff_invitations: number;
    pending_fundraising_inquiries: number; donations_last_24h: number; recent_attendance_drafts: number;
  };
  blockers: string[];
  warnings: string[];
  fingerprint: string;
};

export type PreviewFailure =
  | "not_installed"     // the Complete Season migrations aren't in this database
  | "not_permitted"     // phase_s1 is there, but phase_s3's grant isn't
  | "account_required"  // a legacy (team-login) Head Coach: completion needs an ELF account
  | "forbidden"         // the database refused the actor
  | "not_found"
  | "error";

/** Maps a failed rpc response body to a failure. Never echoes it. */
export function classifyPreviewError(body: string): PreviewFailure {
  if (isMissingSchemaError(body)) return "not_installed";
  let code = "", message = "";
  try { const j = JSON.parse(body); code = String(j?.code ?? ""); message = String(j?.message ?? ""); } catch { /* not JSON */ }
  if (code === "42501" || /permission denied/i.test(message)) return "not_permitted";
  if (/\bseason_actor_account_required\b/.test(message)) return "account_required";
  if (/\bseason_actor_(invalid|not_authorized)\b/.test(message)) return "forbidden";
  if (/\bseason_team_not_found\b/.test(message)) return "not_found";
  return "error";
}

function isPreviewShape(v: unknown): v is SeasonPreview {
  const p = v as SeasonPreview;
  return !!p && typeof p === "object" && !!p.from && !!p.proposed && !!p.roster && !!p.members && !!p.coaches
    && Array.isArray(p.blockers) && Array.isArray(p.warnings) && typeof p.fingerprint === "string";
}

export async function fetchSeasonPreview(slug: string, actor: TeamActor, overrides: PreviewOverrides):
  Promise<{ ok: true; preview: SeasonPreview } | { ok: false; failure: PreviewFailure }> {
  const dbActor = seasonPreviewDbActor(actor);
  if (!dbActor) return { ok: false, failure: "forbidden" };
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const res = await fetch(`${BASE}/rest/v1/rpc/team_season_preview`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_from_slug: slug,
        p_actor: dbActor,
        p_to_slug: overrides.toSlug,
        p_to_season_label: overrides.toSeasonLabel,
      }),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      const failure = classifyPreviewError(text);
      if (failure === "error") console.error(`[season-preview] failed: HTTP ${res.status}`);
      return { ok: false, failure };
    }
    const value = JSON.parse(text);
    if (!isPreviewShape(value)) {
      console.error("[season-preview] unexpected result shape");
      return { ok: false, failure: "error" };
    }
    return { ok: true, preview: value };
  } catch {
    console.error("[season-preview] request failed");
    return { ok: false, failure: "error" };
  }
}

// ── Open Stripe checkouts for this team (read-only) ──────────────────────
// A checkout started before completion still records its donation against
// the completing season when it finishes (the webhook uses the session's
// campaign_slug). This counts open Checkout Sessions from the last 24 hours
// (Stripe's default expiry) whose metadata names this team, so the coach
// can wait for them. "unknown" when Stripe can't be asked — never guessed.
export type OpenCheckouts =
  | { state: "checked"; count: number; more: boolean }
  | { state: "unknown" };

export async function countOpenCheckouts(slug: string, now: Date = new Date()): Promise<OpenCheckouts> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return { state: "unknown" };
  try {
    const since = Math.floor(now.getTime() / 1000) - 24 * 60 * 60;
    const url = `https://api.stripe.com/v1/checkout/sessions?status=open&limit=100&created[gte]=${since}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
    if (!res.ok) return { state: "unknown" };
    const body = await res.json() as { data?: { metadata?: Record<string, string> | null }[]; has_more?: boolean };
    if (!Array.isArray(body.data)) return { state: "unknown" };
    const count = body.data.filter(s => s?.metadata?.campaign_slug === slug).length;
    return { state: "checked", count, more: body.has_more === true };
  } catch {
    return { state: "unknown" };
  }
}
