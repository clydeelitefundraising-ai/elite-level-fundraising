import Link from "next/link";
import { listAllOrganizations, listAllSeasons } from "@/lib/platform/schoolLinks";
import { buildDryRunReport, isCompletedSeason, orderChain, seasonLabel, type SeasonRow } from "@/lib/platform/schoolLinksLogic";

export const dynamic = "force-dynamic";

// /platform-admin/school-links — teams without a school, and a READ-ONLY
// dry-run report of what an exact-name backfill would do. Nothing on this
// page writes; links are only ever changed one team at a time from
// /platform-admin/school-links/[slug], with a preview and confirmation.

const card: React.CSSProperties = { background: "#fff", borderRadius: 12, padding: "1rem 1.1rem", boxShadow: "0 1px 3px rgba(0,0,0,.08)", marginBottom: "1rem" };
const h2: React.CSSProperties = { margin: "0 0 .6rem", fontSize: ".95rem", fontWeight: 700 };
const muted: React.CSSProperties = { fontSize: ".8rem", color: "#6b7280" };
const li: React.CSSProperties = { padding: ".45rem 0", borderTop: "1px solid #f0f0f0", fontSize: ".85rem", overflowWrap: "anywhere" };

/** Unlinked seasons grouped by team (season chain), newest season first. */
function groupUnlinked(all: SeasonRow[]) {
  const bySlug = new Map(all.map(s => [s.campaign_slug, s]));
  const predecessorOf = new Map(all.filter(s => s.successor_campaign_slug).map(s => [s.successor_campaign_slug!, s.campaign_slug]));
  const seen = new Set<string>();
  const teams: SeasonRow[][] = [];
  for (const s of all) {
    if (seen.has(s.campaign_slug)) continue;
    let head = s.campaign_slug;
    const guard = new Set<string>();
    while (predecessorOf.has(head) && !guard.has(head)) { guard.add(head); head = predecessorOf.get(head)!; }
    const chain: SeasonRow[] = [];
    let cur = bySlug.get(head);
    while (cur && !seen.has(cur.campaign_slug)) { seen.add(cur.campaign_slug); chain.push(cur); cur = cur.successor_campaign_slug ? bySlug.get(cur.successor_campaign_slug) : undefined; }
    const ordered = orderChain(chain);
    if (ordered.some(x => !x.organization_id)) teams.push(ordered);
  }
  return teams.sort((a, b) => a[a.length - 1].campaign_slug.localeCompare(b[b.length - 1].campaign_slug));
}

export default async function SchoolLinksPage() {
  let seasons, orgs;
  try {
    [seasons, orgs] = await Promise.all([listAllSeasons(), listAllOrganizations()]);
  } catch {
    return <div style={card} role="alert">Team and school records couldn&apos;t be loaded. Reload to try again.</div>;
  }
  const teams = groupUnlinked(seasons);
  const report = buildDryRunReport(seasons, orgs);

  return (
    <div>
      <h1 style={{ margin: "0 0 .25rem", fontSize: "1.2rem" }}>School links</h1>
      <p style={{ ...muted, margin: "0 0 1rem" }}>
        {report.totals.seasons} team-seasons · {report.totals.linked} linked · {report.totals.unlinked} without a school · {report.totals.organizations} school records.
        Linking records which school a team belongs to; it grants no access to other teams.
      </p>

      <section style={{ ...card, padding: card.padding }} aria-labelledby="unlinked-h">
        <h2 id="unlinked-h" style={h2}>Teams without a school ({teams.length})</h2>
        {teams.length === 0 ? <p style={muted}>Every team-season is linked to a school.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {teams.map(chain => {
              const newest = chain[chain.length - 1];
              const unlinked = chain.filter(s => !s.organization_id);
              return (
                <li key={newest.campaign_slug} style={li}>
                  <Link href={`/platform-admin/school-links/${newest.campaign_slug}`} style={{ fontWeight: 600 }}>
                    {newest.school_name || "(no school name)"} — {seasonLabel(newest)}
                  </Link>
                  <div style={muted}>
                    {unlinked.length} of {chain.length} season{chain.length === 1 ? "" : "s"} without a school
                    {unlinked.some(isCompletedSeason) ? " · includes completed seasons" : ""}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ ...card, padding: card.padding }} aria-labelledby="dryrun-h">
        <h2 id="dryrun-h" style={h2}>Dry-run backfill report (read-only — nothing is applied)</h2>
        <p style={{ ...muted, marginTop: 0 }}>
          Exact school-name matches only (the same rule as the 2026-08-24 backfill). No fuzzy matching; review each team before linking it.
        </p>

        <h3 style={{ fontSize: ".85rem", margin: ".75rem 0 .25rem" }}>Exact matches ({report.exactMatches.length})</h3>
        {report.exactMatches.length === 0 ? <p style={muted}>None.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {report.exactMatches.map(m => (
              <li key={m.campaign_slug} style={li}>
                <Link href={`/platform-admin/school-links/${m.campaign_slug}`}>{m.campaign_slug}</Link> → {m.organization}
                {m.completed && <span style={muted}> · completed season</span>}
              </li>
            ))}
          </ul>
        )}

        <h3 style={{ fontSize: ".85rem", margin: ".75rem 0 .25rem" }}>Name matches more than one school ({report.ambiguous.length})</h3>
        {report.ambiguous.length === 0 ? <p style={muted}>None.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {report.ambiguous.map(a => <li key={a.school_name} style={li}>&ldquo;{a.school_name}&rdquo; → {a.organizations.join(" | ")} <span style={muted}>({a.campaign_slugs.join(", ")})</span></li>)}
          </ul>
        )}

        <h3 style={{ fontSize: ".85rem", margin: ".75rem 0 .25rem" }}>Unmatched school names ({report.unmatched.length})</h3>
        {report.unmatched.length === 0 ? <p style={muted}>None.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {report.unmatched.map(u => <li key={u.school_name} style={li}>&ldquo;{u.school_name}&rdquo; <span style={muted}>— {u.campaign_slugs.length} season{u.campaign_slugs.length === 1 ? "" : "s"}: {u.campaign_slugs.join(", ")}</span></li>)}
          </ul>
        )}

        <h3 style={{ fontSize: ".85rem", margin: ".75rem 0 .25rem" }}>Possible duplicate schools ({report.possibleDuplicates.length})</h3>
        {report.possibleDuplicates.length === 0 ? <p style={muted}>None found (same name ignoring case and punctuation).</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {report.possibleDuplicates.map(d => <li key={d.normalized} style={li}>{d.organizations.join(" | ")} <span style={muted}>— reported only, never merged</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
