"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DEMO_TEMPLATES } from "@/lib/demoTemplates";
import type { DemoCampaign } from "./page";

type Props = { demos: DemoCampaign[]; appUrl: string };

type Confirm = { slug: string; action: "reset" | "delete" };

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function relDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function templateIcon(templateId: string | null): string {
  const t = DEMO_TEMPLATES.find(x => x.id === templateId);
  return t?.icon ?? "📋";
}

export default function DemoView({ demos: initialDemos, appUrl }: Props) {
  const router = useRouter();
  const [demos, setDemos] = useState<DemoCampaign[]>(initialDemos);
  const [creating, setCreating]       = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [confirm, setConfirm]         = useState<Confirm | null>(null);
  const [actionBusy, setActionBusy]   = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMsg, setSuccessMsg]   = useState("");

  const handleCreate = useCallback(async (templateId: string) => {
    setCreating(templateId);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/demo/create", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ templateId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; slug?: string; school_name?: string; sport?: string };
      if (!res.ok || !data.ok) {
        setCreateError(data.error ?? "Failed to create demo.");
      } else {
        router.refresh();
      }
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(null);
    }
  }, [router]);

  const executeAction = useCallback(async () => {
    if (!confirm) return;
    setActionBusy(true);
    setActionError("");
    setSuccessMsg("");

    try {
      const { slug, action } = confirm;
      let res: Response;

      if (action === "reset") {
        res = await fetch("/api/admin/demo/reset", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ slug }),
        });
      } else {
        res = await fetch(`/api/admin/demo/${encodeURIComponent(slug)}`, { method: "DELETE" });
      }

      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? `Failed to ${action} demo.`);
      } else {
        if (action === "delete") {
          setDemos(prev => prev.filter(d => d.campaign_slug !== slug));
          setSuccessMsg(`Demo deleted.`);
        } else {
          setSuccessMsg(`Demo data reset successfully.`);
        }
        setConfirm(null);
      }
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }, [confirm]);

  const border     = "1px solid #e2e8f0";
  const cardRadius = "10px";
  const mono       = { fontFamily: "monospace", fontSize: ".8rem" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem 3rem" }}>

      {/* Info banner */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: ".75rem 1.25rem", marginBottom: "2rem", display: "flex", gap: ".75rem", alignItems: "center" }}>
        <span style={{ fontSize: "1.1rem" }}>ℹ️</span>
        <div style={{ fontSize: ".82rem", color: "#1e40af", lineHeight: 1.5 }}>
          <strong>Demo campaigns are fully isolated from live data.</strong> They are tagged <code style={{ background: "#dbeafe", borderRadius: 3, padding: "1px 4px" }}>is_demo = true</code> and the API refuses to reset or delete any non-demo campaign slug. Use demos freely for sales presentations and onboarding.
        </div>
      </div>

      {/* Template grid */}
      <div style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0b1e3d", marginBottom: ".25rem" }}>
          Create a Demo Campaign
        </h2>
        <p style={{ fontSize: ".82rem", color: "#64748b", marginBottom: "1.25rem" }}>
          Each template seeds realistic athletes, donations, sponsors, and fund uses in about 3 seconds.
        </p>

        {createError && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: ".6rem 1rem", marginBottom: "1rem", fontSize: ".82rem", color: "#991b1b" }}>
            {createError}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
          {DEMO_TEMPLATES.map(t => {
            const isBusy = creating === t.id;
            const anyBusy = creating !== null;
            const totalCents = t.donations.reduce((s, d) => s + d.amount_cents, 0);
            return (
              <div key={t.id} style={{ border, borderRadius: cardRadius, padding: "1.25rem", background: "#fff", display: "flex", flexDirection: "column", gap: ".75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>{t.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: ".95rem", color: "#0b1e3d" }}>{t.sport}</div>
                    <div style={{ fontSize: ".75rem", color: "#64748b" }}>{t.school_name}</div>
                  </div>
                  <div style={{ marginLeft: "auto", width: 14, height: 14, borderRadius: "50%", background: t.primary_color, flexShrink: 0 }} />
                </div>
                <div style={{ fontSize: ".78rem", color: "#475569", lineHeight: 1.5 }}>{t.description}</div>
                <div style={{ fontSize: ".75rem", color: "#94a3b8", display: "flex", gap: "1rem" }}>
                  <span>Goal {fmt(t.goal_cents)}</span>
                  <span>{t.athletes.length} athletes</span>
                  <span>{t.donations.length} donations ({fmt(totalCents)} raised)</span>
                </div>
                <button
                  onClick={() => void handleCreate(t.id)}
                  disabled={anyBusy}
                  style={{
                    marginTop: "auto",
                    padding: ".5rem 1rem",
                    background: isBusy ? "#94a3b8" : "#0b1e3d",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: ".82rem",
                    fontWeight: 600,
                    cursor: anyBusy ? "not-allowed" : "pointer",
                    opacity: anyBusy && !isBusy ? 0.5 : 1,
                  }}
                >
                  {isBusy ? "Creating…" : "Create Demo Campaign"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active demo campaigns */}
      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0b1e3d", marginBottom: ".25rem" }}>
          Active Demo Campaigns
        </h2>
        <p style={{ fontSize: ".82rem", color: "#64748b", marginBottom: "1rem" }}>
          {demos.length === 0 ? "No demo campaigns yet. Create one above." : `${demos.length} demo campaign${demos.length !== 1 ? "s" : ""} active.`}
        </p>

        {successMsg && (
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, padding: ".6rem 1rem", marginBottom: "1rem", fontSize: ".82rem", color: "#166534" }}>
            {successMsg}
          </div>
        )}
        {actionError && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: ".6rem 1rem", marginBottom: "1rem", fontSize: ".82rem", color: "#991b1b" }}>
            {actionError}
          </div>
        )}

        {demos.length > 0 && (
          <div style={{ border, borderRadius: cardRadius, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: border }}>
                  <th style={{ padding: ".625rem 1rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>Campaign</th>
                  <th style={{ padding: ".625rem 1rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>Slug</th>
                  <th style={{ padding: ".625rem 1rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>Created</th>
                  <th style={{ padding: ".625rem 1rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>Links</th>
                  <th style={{ padding: ".625rem 1rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {demos.map((demo, idx) => {
                  const isConfirming = confirm?.slug === demo.campaign_slug;
                  const rowBorder = idx > 0 ? { borderTop: border } : {};
                  return (
                    <tr key={demo.campaign_slug} style={rowBorder}>
                      <td style={{ padding: ".75rem 1rem", verticalAlign: "top" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                          <span>{templateIcon(demo.demo_template)}</span>
                          <div>
                            <div style={{ fontWeight: 600, color: "#0b1e3d" }}>{demo.school_name}</div>
                            <div style={{ color: "#64748b", fontSize: ".75rem" }}>{demo.sport_name} · {demo.mascot} · {demo.season}</div>
                          </div>
                        </div>
                        <div style={{ marginTop: ".25rem" }}>
                          <span style={{ background: "#fef9c3", color: "#713f12", border: "1px solid #fde047", borderRadius: 4, padding: "1px 6px", fontSize: ".7rem", fontWeight: 600 }}>
                            DEMO
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: ".75rem 1rem", verticalAlign: "top" }}>
                        <code style={{ ...mono, color: "#374151", background: "#f1f5f9", borderRadius: 4, padding: "2px 6px" }}>
                          {demo.campaign_slug}
                        </code>
                      </td>
                      <td style={{ padding: ".75rem 1rem", verticalAlign: "top", color: "#475569" }}>
                        {relDate(demo.created_at)}
                      </td>
                      <td style={{ padding: ".75rem 1rem", verticalAlign: "top" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: ".25rem" }}>
                          {appUrl && (
                            <>
                              <a
                                href={`${appUrl}/${demo.campaign_slug}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: "#0b1e3d", fontSize: ".75rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: ".25rem" }}
                              >
                                ↗ Public Page
                              </a>
                              <a
                                href={`${appUrl}/team/${demo.campaign_slug}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: "#0b1e3d", fontSize: ".75rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: ".25rem" }}
                              >
                                ↗ Team Hub
                              </a>
                            </>
                          )}
                          <a
                            href={`/admin/campaigns/${demo.campaign_slug}`}
                            style={{ color: "#0b1e3d", fontSize: ".75rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: ".25rem" }}
                          >
                            ⊞ Admin View
                          </a>
                        </div>
                      </td>
                      <td style={{ padding: ".75rem 1rem", verticalAlign: "top" }}>
                        {isConfirming ? (
                          <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 6, padding: ".6rem .75rem", display: "flex", flexDirection: "column", gap: ".5rem", minWidth: 220 }}>
                            <div style={{ fontSize: ".75rem", fontWeight: 600, color: "#713f12" }}>
                              {confirm.action === "delete"
                                ? "⚠ Permanently delete this demo campaign?"
                                : "Reset all demo data to the template defaults?"}
                            </div>
                            <div style={{ display: "flex", gap: ".5rem" }}>
                              <button
                                onClick={() => void executeAction()}
                                disabled={actionBusy}
                                style={{ padding: ".35rem .75rem", background: confirm.action === "delete" ? "#dc2626" : "#0b1e3d", color: "#fff", border: "none", borderRadius: 5, fontSize: ".75rem", fontWeight: 600, cursor: actionBusy ? "not-allowed" : "pointer" }}
                              >
                                {actionBusy ? "Working…" : "Confirm"}
                              </button>
                              <button
                                onClick={() => { setConfirm(null); setActionError(""); }}
                                disabled={actionBusy}
                                style={{ padding: ".35rem .75rem", background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", borderRadius: 5, fontSize: ".75rem", cursor: "pointer" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: ".4rem" }}>
                            <button
                              onClick={() => { setConfirm({ slug: demo.campaign_slug, action: "reset" }); setActionError(""); setSuccessMsg(""); }}
                              style={{ padding: ".35rem .65rem", background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", borderRadius: 5, fontSize: ".75rem", cursor: "pointer" }}
                            >
                              Reset
                            </button>
                            <button
                              onClick={() => { setConfirm({ slug: demo.campaign_slug, action: "delete" }); setActionError(""); setSuccessMsg(""); }}
                              style={{ padding: ".35rem .65rem", background: "#fff1f2", color: "#9f1239", border: "1px solid #fda4af", borderRadius: 5, fontSize: ".75rem", cursor: "pointer" }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
