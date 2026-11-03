import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { applySchoolLink, loadOrganizations, loadTeamSeasons, verifyPreview } from "@/lib/platform/schoolLinks";
import {
  PLAN_ERROR_TEXT,
  currentSeasonSlug,
  isCampaignSlug,
  isCompletedSeason,
  isOrganizationId,
  planSchoolLink,
  schoolLabel,
  seasonLabel,
} from "@/lib/platform/schoolLinksLogic";
import { ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };
const NO_STORE = { "Cache-Control": "no-store" };

// /api/platform-admin/school-links/teams/[slug]
// One team (the season chain `slug` belongs to). Platform Admin accounts
// only — the shared /admin password session is not accepted. Linking
// changes campaign_settings.organization_id and nothing else: no school is
// ever created, no permission or school-level access is granted.

// GET — every season of the team with its current school.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  if (!isCampaignSlug(slug)) return NextResponse.json({ error: "Invalid team." }, { status: 400 });
  try {
    const chain = await loadTeamSeasons(slug);
    if (!chain) return NextResponse.json({ error: "Team not found." }, { status: 404 });
    const orgs = await loadOrganizations(chain.map(s => s.organization_id).filter((x): x is string => Boolean(x)));
    return NextResponse.json({
      currentSeason: currentSeasonSlug(chain),
      seasons: chain.map(s => ({
        campaign_slug: s.campaign_slug,
        label: seasonLabel(s),
        school_name: s.school_name,
        organization_id: s.organization_id,
        school: s.organization_id ? schoolLabel(orgs.get(s.organization_id) ?? null) ?? "Unknown school record" : null,
        completed: isCompletedSeason(s),
      })),
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Team seasons couldn't be loaded." }, { status: 503 });
  }
}

type ConfirmBody = {
  organizationId?: unknown;
  seasons?: unknown;
  previewToken?: unknown;
};

// PUT — confirm a previewed change.
//   { organizationId: "<uuid>" | null, seasons: [{ campaign_slug, expectedOrganizationId }], previewToken }
// expectedOrganizationId is each season's school as shown in the preview;
// if any differs now the whole change is refused (409 stale). All selected
// seasons change together or none do — enforced by one database
// transaction, which also writes the audit rows. Completed seasons may be
// selected: only their organization_id changes (phase_o3).
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  if (!isCampaignSlug(slug)) return NextResponse.json({ error: "Invalid team." }, { status: 400 });

  const body = await req.json().catch(() => null) as ConfirmBody | null;
  const targetRaw = body?.organizationId;
  if (targetRaw !== null && !isOrganizationId(targetRaw)) return NextResponse.json({ error: "Choose a school or unlink." }, { status: 400 });
  const targetId = targetRaw as string | null;
  if (!Array.isArray(body?.seasons) || body.seasons.length === 0 || body.seasons.length > 40) {
    return NextResponse.json({ error: PLAN_ERROR_TEXT.no_seasons }, { status: 400 });
  }
  const expected = new Map<string, string | null>();
  for (const raw of body.seasons as unknown[]) {
    const e = raw as { campaign_slug?: unknown; expectedOrganizationId?: unknown };
    if (!isCampaignSlug(e?.campaign_slug)) return NextResponse.json({ error: "Invalid season." }, { status: 400 });
    if (e.expectedOrganizationId !== null && !isOrganizationId(e.expectedOrganizationId)) {
      return NextResponse.json({ error: "Preview again before confirming." }, { status: 400 });
    }
    if (expected.has(e.campaign_slug)) return NextResponse.json({ error: PLAN_ERROR_TEXT.duplicate_season }, { status: 400 });
    expected.set(e.campaign_slug, e.expectedOrganizationId as string | null);
  }

  // The preview is mandatory: this exact admin, team, school and seasons
  // (with the schools they had) must have been previewed, recently.
  const previewed = verifyPreview(body?.previewToken, {
    adminId: admin.platformAdminId, slug, organizationId: targetId,
    seasons: [...expected].map(([campaign_slug, expectedOrganizationId]) => ({ campaign_slug, expectedOrganizationId })),
  });
  if (!previewed) return NextResponse.json({ error: "Preview the change (again) before confirming.", code: "preview_required" }, { status: 409 });

  let chain, orgs;
  try {
    chain = await loadTeamSeasons(slug);
    if (!chain) return NextResponse.json({ error: "Team not found." }, { status: 404 });
    orgs = await loadOrganizations([
      ...chain.map(s => s.organization_id).filter((x): x is string => Boolean(x)),
      ...(targetId ? [targetId] : []),
    ]);
  } catch {
    return NextResponse.json({ error: "Team seasons couldn't be loaded." }, { status: 503 });
  }
  const target = targetId ? orgs.get(targetId) ?? null : null;
  if (targetId && !target) return NextResponse.json({ error: "School not found." }, { status: 404 });

  const plan = planSchoolLink({ chain, selected: [...expected.keys()], target, orgsById: orgs, expected });
  if (!plan.ok) {
    const status = plan.error === "stale" ? 409 : 400;
    return NextResponse.json({ error: PLAN_ERROR_TEXT[plan.error], code: plan.error, seasons: plan.seasons ?? [] }, { status });
  }

  // One database transaction (school_link_apply): re-checks the Platform
  // Admin, the team's season chain and every season's previewed school
  // under row locks, then writes the links and their audit rows together.
  // All selected seasons are sent with their previewed school, so a season
  // that changed meanwhile refuses the whole request; seasons already on
  // the target are left alone (no write, no audit row).
  const result = await applySchoolLink({
    actor: { platformAdminId: admin.platformAdminId, accountId: admin.accountId },
    teamSlug: slug,
    targetId,
    seasons: [...expected].map(([campaign_slug, expectedOrganizationId]) => ({ campaign_slug, expectedOrganizationId })),
    request: { ipAddress: ipOf(req), userAgent: req.headers.get("user-agent") },
  });
  if (!result.ok) {
    const map: Record<string, { status: number; error: string }> = {
      stale: { status: 409, error: PLAN_ERROR_TEXT.stale },
      nothing_to_change: { status: 400, error: PLAN_ERROR_TEXT.nothing_to_change },
      season_not_in_team: { status: 400, error: PLAN_ERROR_TEXT.season_not_in_team },
      team_not_found: { status: 404, error: "Team not found." },
      organization_not_found: { status: 404, error: "School not found." },
      not_authorized: { status: 403, error: "Only Platform Admin accounts can change school links." },
      invalid: { status: 400, error: "Preview again before confirming." },
    };
    const m = map[result.reason] ?? { status: 500, error: "The change couldn't be saved. Nothing was changed." };
    return NextResponse.json({ error: m.error, code: result.reason }, { status: m.status });
  }

  return NextResponse.json({ ok: true, updated: result.updated, unchanged: result.unchanged }, { headers: NO_STORE });
}
