"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CreateSchoolForm, { type CreatedSchool } from "./CreateSchoolForm";

// Platform Admin — link, change or unlink the school for one team's seasons.
// Flow: choose seasons (current season preselected; others only when ticked;
// completed seasons may be ticked too — only their school link changes) →
// choose a school or "Unlink" → Preview
// (mandatory: before/after school and Community Partner visibility) →
// Confirm. Any change to the selection discards the preview. A missing school
// can be created in step 2 ("Create new school"); it is then selected, but
// still goes through the same Preview + Confirm before anything is linked.

type Season = { campaign_slug: string; label: string; school_name: string | null; organization_id: string | null; school: string | null; completed: boolean };
type School = { id: string; slug: string; label: string };
type Visibility = { teamApp: boolean; publicPage: boolean };
type Change = {
  campaign_slug: string; label: string; changesSchool: boolean; changesPartners: boolean;
  before: { organization_id: string | null; school: string | null; visibility: Visibility };
  after: { organization_id: string | null; school: string | null; visibility: Visibility };
};
type Preview = { organizationId: string | null; changes: Change[]; confirm: { campaign_slug: string; expectedOrganizationId: string | null }[]; previewToken: string };

const card: React.CSSProperties = { background: "#fff", borderRadius: 12, padding: "1rem 1.1rem", boxShadow: "0 1px 3px rgba(0,0,0,.08)", marginBottom: "1rem" };
const h2: React.CSSProperties = { margin: "0 0 .6rem", fontSize: ".95rem", fontWeight: 700, color: "#111" };
const muted: React.CSSProperties = { fontSize: ".8rem", color: "#6b7280" };
const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  minHeight: 40, padding: ".5rem 1rem", borderRadius: 8, fontSize: ".85rem", fontWeight: 700, cursor: disabled ? "default" : "pointer",
  border: primary ? "none" : "1px solid #d1d5db", background: primary ? (disabled ? "#9ca3af" : "#0b1e3d") : "#fff", color: primary ? "#fff" : "#111",
});
const badge: React.CSSProperties = { display: "inline-block", marginLeft: ".4rem", padding: "0 .4rem", borderRadius: 999, background: "#f3f4f6", color: "#374151", fontSize: ".7rem", fontWeight: 700, verticalAlign: "middle" };
const vis = (v: Visibility) => `Team App ${v.teamApp ? "shown" : "hidden"} · Public page ${v.publicPage ? "shown" : "hidden"}`;

export default function SchoolLinkPanel({ slug }: { slug: string }) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<School[]>([]);
  const [target, setTarget] = useState<School | "unlink" | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [schoolNotice, setSchoolNotice] = useState("");
  const [auditWarning, setAuditWarning] = useState("");
  const [searchFailed, setSearchFailed] = useState(false);

  async function loadSeasons() {
    setLoadError("");
    const res = await fetch(`/api/platform-admin/school-links/teams/${encodeURIComponent(slug)}`, { cache: "no-store" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setLoadError(d.error ?? "Couldn't load this team."); return; }
    setSeasons(d.seasons);
    setSelected(new Set(d.currentSeason ? [d.currentSeason] : []));
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
  useEffect(() => { void loadSeasons(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/platform-admin/school-links/schools?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      setResults(res.ok ? d.schools : []);
      setSearchFailed(!res.ok);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Any change to what would be saved discards the preview.
  const discard = () => { setPreview(null); setMessage(null); };
  const toggle = (s: string) => { discard(); setSelected(prev => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; }); };
  const choose = (t: School | "unlink") => { discard(); setSchoolNotice(""); setAuditWarning(""); setTarget(t); };
  // A new (or existing duplicate) school from the create form: show it in
  // the list and select it. Nothing is linked yet.
  const selectSchool = (school: CreatedSchool, created: boolean, auditRecorded = true) => {
    setResults(prev => [school, ...prev.filter(o => o.id !== school.id)]);
    choose(school);
    setCreating(false);
    if (!auditRecorded) setAuditWarning(`The school was created, but its audit-log entry couldn't be recorded. Please tell the ELF team (school id ${school.id}).`);
    setSchoolNotice(created
      ? `Created ${school.label} and selected it. Nothing is linked yet — preview and confirm to link.`
      : `Selected ${school.label}. Nothing is linked yet — preview and confirm to link.`);
  };

  const selectedList = useMemo(() => (seasons ?? []).filter(s => selected.has(s.campaign_slug)).map(s => s.campaign_slug), [seasons, selected]);
  const targetId = target === "unlink" ? null : target?.id ?? undefined;

  async function runPreview() {
    if (targetId === undefined || selectedList.length === 0) return;
    setBusy(true); setMessage(null);
    const res = await fetch(`/api/platform-admin/school-links/teams/${encodeURIComponent(slug)}/preview`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: targetId, seasons: selectedList }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMessage({ kind: "error", text: d.error ?? "Preview failed." }); return; }
    setPreview(d);
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true); setMessage(null);
    const res = await fetch(`/api/platform-admin/school-links/teams/${encodeURIComponent(slug)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: preview.organizationId, seasons: preview.confirm, previewToken: preview.previewToken }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setPreview(null);
    if (!res.ok) {
      setMessage({ kind: "error", text: d.error ?? "Nothing was changed." });
      if (d.code === "stale") await loadSeasons();
      return;
    }
    setMessage({ kind: "ok", text: `Saved. ${d.updated.length} season${d.updated.length === 1 ? "" : "s"} updated.` });
    await loadSeasons();
  }

  if (loadError) return <div style={card} role="alert">{loadError}</div>;
  if (!seasons) return <div style={card}>Loading…</div>;

  const partnerChanges = preview?.changes.filter(c => c.changesPartners) ?? [];
  const completedSlugs = new Set(seasons.filter(s => s.completed).map(s => s.campaign_slug));

  return (
    <div>
      <p style={{ margin: "0 0 .75rem" }}><Link href="/platform-admin/school-links" style={{ fontSize: ".85rem" }}>← Teams without a school</Link></p>
      <h1 style={{ margin: "0 0 .25rem", fontSize: "1.2rem" }}>School link · {slug}</h1>
      <p style={{ ...muted, margin: "0 0 1rem" }}>
        Linking only records which school this team belongs to. It doesn&apos;t give anyone access to other teams or to student information.
      </p>

      <section style={{ ...card, padding: card.padding }} aria-labelledby="seasons-h">
        <h2 id="seasons-h" style={h2}>1. Seasons</h2>
        <p style={{ ...muted, marginTop: 0 }}>The current season is selected. Tick other seasons only if they should change too. For a completed season only the school link changes; its roster, attendance, messages, fundraising and completion stay as they are.</p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: ".4rem" }}>
          {seasons.map(s => (
            <li key={s.campaign_slug}>
              <label style={{ display: "flex", gap: ".6rem", alignItems: "flex-start", minHeight: 40, cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(s.campaign_slug)} onChange={() => toggle(s.campaign_slug)} style={{ marginTop: ".2rem" }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: ".88rem", overflowWrap: "anywhere" }}>{s.label}{s.completed && <span style={badge}>Completed</span>}</span>
                  <span style={{ display: "block", ...muted }}>School: {s.school ?? "Not linked"} · Team&apos;s own name: {s.school_name || "—"}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ ...card, padding: card.padding }} aria-labelledby="school-h">
        <h2 id="school-h" style={h2}>2. School</h2>
        <input
          type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search by school, city or state" aria-label="Search schools by name, city or state"
          style={{ width: "100%", boxSizing: "border-box", minHeight: 40, padding: ".5rem .7rem", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "1rem", marginBottom: ".6rem" }}
        />
        <div role="radiogroup" aria-label="School" style={{ display: "flex", flexDirection: "column", gap: ".35rem", maxHeight: 280, overflowY: "auto" }}>
          {results.map(o => (
            <label key={o.id} style={{ display: "flex", gap: ".6rem", alignItems: "center", minHeight: 36, cursor: "pointer" }}>
              <input type="radio" name="school" checked={target !== "unlink" && target?.id === o.id} onChange={() => choose(o)} />
              <span style={{ fontSize: ".88rem", overflowWrap: "anywhere" }}>{o.label} <span style={muted}>[{o.slug}]</span></span>
            </label>
          ))}
          {results.length === 0 && (
            <span style={muted}>{searchFailed ? "Schools couldn't be loaded. Try searching again." : query.trim() ? `No schools match “${query.trim()}”.` : "No schools yet."}</span>
          )}
          <label style={{ display: "flex", gap: ".6rem", alignItems: "center", minHeight: 36, cursor: "pointer", borderTop: "1px solid #eee", paddingTop: ".35rem" }}>
            <input type="radio" name="school" checked={target === "unlink"} onChange={() => choose("unlink")} />
            <span style={{ fontSize: ".88rem" }}>Unlink (no school)</span>
          </label>
        </div>
        {schoolNotice && <p role="status" style={{ margin: ".6rem 0 0", fontSize: ".84rem", color: "#166534" }}>{schoolNotice}</p>}
        {auditWarning && <p role="alert" style={{ margin: ".4rem 0 0", fontSize: ".84rem", color: "#92400e" }}>{auditWarning}</p>}
        {creating ? (
          <CreateSchoolForm
            initialName={query}
            onCreated={(school, auditRecorded) => selectSchool(school, true, auditRecorded)}
            onUseExisting={school => selectSchool(school, false)}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <div style={{ marginTop: ".6rem", display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
            <button
              type="button" onClick={() => { setCreating(true); setSchoolNotice(""); }}
              style={{ ...btn(results.length === 0 && !!query.trim()), minHeight: 44 }}
            >
              + Create new school
            </button>
            {results.length > 0 && <span style={muted}>Not in the list? Create it.</span>}
          </div>
        )}
      </section>

      <section style={{ ...card, padding: card.padding }} aria-labelledby="preview-h">
        <h2 id="preview-h" style={h2}>3. Preview and confirm</h2>
        {!preview ? (
          <button type="button" style={btn(true, busy || targetId === undefined || selectedList.length === 0)} disabled={busy || targetId === undefined || selectedList.length === 0} onClick={runPreview}>
            Preview changes
          </button>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#6b7280" }}>
                    <th style={{ padding: ".4rem" }}>Season</th><th style={{ padding: ".4rem" }}>School before → after</th><th style={{ padding: ".4rem" }}>Community Partners before → after</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.map(c => (
                    <tr key={c.campaign_slug} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
                      <td style={{ padding: ".4rem", overflowWrap: "anywhere" }}>{c.label}{completedSlugs.has(c.campaign_slug) && <span style={badge}>Completed</span>}{!c.changesSchool && <div style={muted}>No change</div>}</td>
                      <td style={{ padding: ".4rem" }}>{c.before.school ?? "Not linked"} → <strong>{c.after.school ?? "Not linked"}</strong></td>
                      <td style={{ padding: ".4rem", color: c.changesPartners ? "#92400e" : undefined }}>{vis(c.before.visibility)} → <strong>{vis(c.after.visibility)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {partnerChanges.length > 0 ? (
              <p role="alert" style={{ margin: ".75rem 0", padding: ".6rem .75rem", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: ".82rem" }}>
                Community Partner visibility changes for {partnerChanges.length} season{partnerChanges.length === 1 ? "" : "s"}: ELF Community Partners will start or stop appearing in the Team App and/or on the public campaign page, following this school&apos;s advertising settings.
              </p>
            ) : (
              <p style={{ ...muted, margin: ".75rem 0" }}>Community Partner visibility doesn&apos;t change.</p>
            )}
            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
              <button type="button" style={btn(true, busy)} disabled={busy} onClick={confirm}>Confirm change</button>
              <button type="button" style={btn(false)} disabled={busy} onClick={discard}>Cancel</button>
            </div>
          </>
        )}
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} style={{ margin: ".75rem 0 0", fontSize: ".85rem", color: message.kind === "error" ? "#b91c1c" : "#166534" }}>{message.text}</p>
        )}
      </section>
    </div>
  );
}
