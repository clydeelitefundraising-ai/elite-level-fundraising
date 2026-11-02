import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { loadOrganizations, loadTeamSeasons, signPreview, PREVIEW_TTL_MS } from "@/lib/platform/schoolLinks";
import { PLAN_ERROR_TEXT, isCampaignSlug, isOrganizationId, planSchoolLink } from "@/lib/platform/schoolLinksLogic";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

// POST /api/platform-admin/school-links/teams/[slug]/preview
//   { organizationId: "<uuid>" | null, seasons: ["<campaign_slug>", …] }
// Read-only. Describes, per selected season, the school before and after
// and Community Partner visibility (Team App and public campaign page)
// before and after — plus each season's current school, which the confirm
// must send back unchanged (stale protection). Writes nothing.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  if (!isCampaignSlug(slug)) return NextResponse.json({ error: "Invalid team." }, { status: 400 });

  const body = await req.json().catch(() => null) as { organizationId?: unknown; seasons?: unknown } | null;
  const targetRaw = body?.organizationId;
  if (targetRaw !== null && !isOrganizationId(targetRaw)) return NextResponse.json({ error: "Choose a school or unlink." }, { status: 400 });
  const targetId = targetRaw as string | null;
  const seasons = Array.isArray(body?.seasons) ? body.seasons : null;
  if (!seasons || seasons.length === 0 || seasons.length > 40 || !seasons.every(isCampaignSlug)) {
    return NextResponse.json({ error: PLAN_ERROR_TEXT.no_seasons }, { status: 400 });
  }

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

  const plan = planSchoolLink({ chain, selected: seasons as string[], target, orgsById: orgs });
  if (!plan.ok) {
    return NextResponse.json({ error: PLAN_ERROR_TEXT[plan.error], code: plan.error, seasons: plan.seasons ?? [] }, { status: plan.error === "season_read_only" ? 409 : 400 });
  }
  const confirm = plan.changes.map(c => ({ campaign_slug: c.campaign_slug, expectedOrganizationId: c.before.organization_id }));
  return NextResponse.json({
    organizationId: targetId,
    changes: plan.changes,
    confirm,
    // Required by the confirm (PUT): binds this admin, team, school and
    // the previewed seasons. Expires after PREVIEW_TTL_MS.
    previewToken: signPreview({ adminId: admin.platformAdminId, slug, organizationId: targetId, seasons: confirm }),
    expiresInMs: PREVIEW_TTL_MS,
  }, { headers: { "Cache-Control": "no-store" } });
}
