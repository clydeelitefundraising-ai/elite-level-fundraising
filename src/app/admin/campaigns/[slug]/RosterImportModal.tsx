"use client";

import { useRef, useState } from "react";
import type { CandidateStatus, ImportCandidate } from "@/lib/platform/import/rosterCandidates";

// Same four class labels CampaignControlCenter.tsx's ATHLETE_CLASS_OPTIONS
// uses — duplicated locally for the same reason that file duplicates it
// rather than importing a shared constant from a server-oriented module.
const CLASS_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;

type ImportedAthlete = { id: string; name: string; class_year: string | null; event: string | null };

type LocalRow = ImportCandidate & {
  included:   boolean;
  resolution: "skip" | "import_anyway" | null;
};

type Step = "choose" | "analyzing" | "review" | "importing" | "results";

type BulkRowResult =
  | { status: "created"; rowNumber: number; athleteId: string; name: string; class_year: string | null; event: string | null }
  | { status: "skipped"; rowNumber: number; reason: string }
  | { status: "failed";  rowNumber: number; reason: string };

type ImportResponse = { created: number; skipped: number; failed: number; results: BulkRowResult[] };

function defaultIncluded(status: CandidateStatus): boolean {
  return status === "ready" || status === "needs_review";
}

function statusLabel(status: CandidateStatus): string {
  switch (status) {
    case "ready":              return "Ready";
    case "possible_duplicate": return "Possible Duplicate";
    case "needs_review":       return "Needs Review";
    case "invalid":            return "Invalid";
  }
}

function statusColors(status: CandidateStatus): { bg: string; color: string } {
  switch (status) {
    case "ready":              return { bg: "#dcfce7", color: "#15803d" };
    case "possible_duplicate": return { bg: "#fef9c3", color: "#854d0e" };
    case "needs_review":       return { bg: "#fef3c7", color: "#92400e" };
    case "invalid":            return { bg: "#fee2e2", color: "#b91c1c" };
  }
}

const thStyle: React.CSSProperties = { textAlign: "left", fontSize: ".65rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".05em", padding: ".5rem .5rem", borderBottom: "1px solid #f0f0f2", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { fontSize: ".8rem", color: "#1d1d1f", padding: ".45rem .5rem", borderBottom: "1px solid #f5f5f7", verticalAlign: "top" };
const inputStyle: React.CSSProperties = { padding: ".35rem .5rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: ".78rem", color: "#1d1d1f", background: "#fff", width: "100%", boxSizing: "border-box", outline: "none" };

// Re-runs only the required-field check immediately on edit, for fast
// feedback — the server remains the authoritative validator at import time
// regardless of what this shows.
function revalidate(row: LocalRow): LocalRow {
  if (!row.name.trim() || !row.class_year.trim()) {
    return { ...row, status: "invalid", included: false };
  }
  if (row.status === "invalid") {
    const stillDuplicate = !!row.existingMatch || row.duplicateRowNumber != null;
    return { ...row, status: stillDuplicate ? "possible_duplicate" : "ready", included: !stillDuplicate };
  }
  return row;
}

export default function RosterImportModal({
  campaignSlug,
  onClose,
  onImported,
}: {
  campaignSlug: string;
  onClose: () => void;
  onImported: (created: ImportedAthlete[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState("");
  const [worksheetName, setWorksheetName] = useState<string | null>(null);
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResponse | null>(null);

  async function handleFile(file: File) {
    setError("");
    setStep("analyzing");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("campaign_slug", campaignSlug);
      const res = await fetch("/api/admin/athletes/import/parse", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to analyze file.");
        setStep("choose");
        return;
      }
      const candidates = (data.candidates as ImportCandidate[]).map((c): LocalRow => ({
        ...c,
        included:   defaultIncluded(c.status),
        resolution: null,
      }));
      setWorksheetName(data.worksheetName ?? null);
      setRows(candidates);
      setStep("review");
    } catch {
      setError("Network error while analyzing the file.");
      setStep("choose");
    }
  }

  function updateRow(rowNumber: number, patch: Partial<LocalRow>) {
    setRows(prev => prev.map(r => (r.rowNumber === rowNumber ? revalidate({ ...r, ...patch }) : r)));
  }

  function resolveDuplicate(rowNumber: number, resolution: "skip" | "import_anyway") {
    updateRow(rowNumber, { resolution, included: resolution === "import_anyway" });
  }

  async function handleConfirm() {
    setError("");
    setImporting(true);
    setStep("importing");
    try {
      const payloadRows = rows
        .filter(r => r.included)
        .map(r => ({
          rowNumber:          r.rowNumber,
          name:               r.name.trim(),
          class_year:         r.class_year.trim(),
          event:              r.event.trim(),
          overrideCollision:  r.resolution === "import_anyway",
        }));

      const res = await fetch("/api/admin/athletes/import", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ campaign_slug: campaignSlug, rows: payloadRows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        setStep("review");
        return;
      }
      const response = data as ImportResponse;
      setResults(response);
      const created = response.results
        .filter((r): r is Extract<BulkRowResult, { status: "created" }> => r.status === "created")
        .map(r => ({ id: r.athleteId, name: r.name, class_year: r.class_year, event: r.event }));
      onImported(created);
      setStep("results");
    } catch {
      setError("Network error during import.");
      setStep("review");
    } finally {
      setImporting(false);
    }
  }

  const readyCount     = rows.filter(r => r.status === "ready").length;
  const dupCount       = rows.filter(r => r.status === "possible_duplicate").length;
  const reviewCount    = rows.filter(r => r.status === "needs_review").length;
  const invalidCount   = rows.filter(r => r.status === "invalid").length;
  const selectedCount  = rows.filter(r => r.included).length;

  return (
    <div
      onClick={() => { if (step !== "analyzing" && step !== "importing") onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, padding: "1.5rem",
          width: "min(920px, 100%)", maxHeight: "min(90vh, 90dvh)", overflowY: "auto",
          boxShadow: "0 12px 48px rgba(0,0,0,.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#1d1d1f" }}>Upload Roster</h3>
          <button onClick={onClose} disabled={step === "analyzing" || step === "importing"}
            style={{ background: "none", border: "none", fontSize: "1.1rem", color: "#98989d", cursor: "pointer", lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {error && (
          <div style={{ padding: ".6rem .85rem", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, fontSize: ".78rem", color: "#b91c1c", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {step === "choose" && (
          <div>
            <p style={{ fontSize: ".82rem", color: "#4b5563", lineHeight: 1.5, marginTop: 0 }}>
              Upload a CSV or Excel (.xlsx) roster. You&apos;ll be able to review, edit, and exclude
              rows before anything is added to this campaign.
            </p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()}
              style={{ padding: ".6rem 1.1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".82rem", fontWeight: 600, cursor: "pointer" }}>
              Choose File…
            </button>
            <div style={{ fontSize: ".7rem", color: "#98989d", marginTop: ".6rem" }}>CSV or XLSX · max 5 MB · up to 1,000 rows</div>
          </div>
        )}

        {step === "analyzing" && (
          <div style={{ padding: "2rem 0", textAlign: "center", color: "#6e6e73", fontSize: ".85rem" }}>
            Analyzing roster…
          </div>
        )}

        {step === "review" && (
          <div>
            {worksheetName && (
              <div style={{ fontSize: ".72rem", color: "#98989d", marginBottom: ".5rem" }}>
                Reading worksheet: <strong>{worksheetName}</strong>
              </div>
            )}

            <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: ".9rem", fontSize: ".74rem", color: "#4b5563" }}>
              <span>{readyCount} ready</span>
              {dupCount > 0 && <span>· {dupCount} possible duplicate{dupCount !== 1 ? "s" : ""}</span>}
              {reviewCount > 0 && <span>· {reviewCount} need review</span>}
              {invalidCount > 0 && <span>· {invalidCount} invalid</span>}
            </div>

            <div style={{ overflowX: "auto", maxHeight: "45vh", overflowY: "auto", border: "1px solid #f0f0f2", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 34 }}>Import?</th>
                    <th style={thStyle}>Athlete Name</th>
                    <th style={{ ...thStyle, width: 130 }}>Class</th>
                    <th style={thStyle}>Event</th>
                    <th style={{ ...thStyle, width: 220 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.rowNumber}>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={r.included} disabled={r.status === "invalid"}
                          onChange={e => updateRow(r.rowNumber, { included: e.target.checked })} />
                      </td>
                      <td style={tdStyle}>
                        <input style={inputStyle} value={r.name} onChange={e => updateRow(r.rowNumber, { name: e.target.value })} />
                      </td>
                      <td style={tdStyle}>
                        <input style={inputStyle} value={r.class_year} list="roster-class-options"
                          onChange={e => updateRow(r.rowNumber, { class_year: e.target.value })} />
                      </td>
                      <td style={tdStyle}>
                        <input style={inputStyle} value={r.event} onChange={e => updateRow(r.rowNumber, { event: e.target.value })} />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", flexDirection: "column", gap: ".3rem", alignItems: "flex-start" }}>
                          <span style={{ padding: ".15rem .5rem", borderRadius: 100, fontSize: ".62rem", fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", ...statusColors(r.status) }}>
                            {statusLabel(r.status)}
                          </span>
                          {r.existingMatch && (
                            <span style={{ fontSize: ".68rem", color: "#92400e" }}>
                              Matches &quot;{r.existingMatch.name}&quot; ({r.existingMatch.class_year ?? "—"})
                              {r.existingMatch.linked && " · linked"}
                              {r.existingMatch.hasFundraisingHistory && " · has fundraising history"}
                            </span>
                          )}
                          {r.duplicateRowNumber != null && (
                            <span style={{ fontSize: ".68rem", color: "#92400e" }}>Duplicate of row {r.duplicateRowNumber} in this file</span>
                          )}
                          {r.status === "possible_duplicate" && (
                            <div style={{ display: "flex", gap: ".35rem" }}>
                              <button onClick={() => resolveDuplicate(r.rowNumber, "skip")}
                                style={{ padding: ".15rem .5rem", fontSize: ".68rem", fontWeight: 600, borderRadius: 6, border: "1px solid #e5e7eb", background: r.resolution === "skip" ? "#f5f5f7" : "#fff", cursor: "pointer" }}>
                                Skip
                              </button>
                              <button onClick={() => resolveDuplicate(r.rowNumber, "import_anyway")}
                                style={{ padding: ".15rem .5rem", fontSize: ".68rem", fontWeight: 600, borderRadius: 6, border: "1px solid #e5e7eb", background: r.resolution === "import_anyway" ? "#0b1e3d" : "#fff", color: r.resolution === "import_anyway" ? "#fff" : "#1d1d1f", cursor: "pointer" }}>
                                Import Anyway
                              </button>
                            </div>
                          )}
                          {r.status !== "possible_duplicate" && r.issues.length > 0 && (
                            <span style={{ fontSize: ".68rem", color: "#92400e" }}>{r.issues[0]}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <datalist id="roster-class-options">
              {CLASS_OPTIONS.map(c => <option key={c} value={c} />)}
            </datalist>

            <div style={{ display: "flex", gap: ".6rem", justifyContent: "flex-end", marginTop: "1.1rem" }}>
              <button onClick={onClose}
                style={{ padding: ".5rem 1rem", background: "#f5f5f7", border: "none", borderRadius: 8, fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f", cursor: "pointer" }}>
                Cancel Import
              </button>
              <button onClick={handleConfirm} disabled={selectedCount === 0 || importing}
                style={{
                  padding: ".5rem 1.1rem", background: selectedCount === 0 ? "#9ca3af" : "#0b1e3d", color: "#fff",
                  border: "none", borderRadius: 8, fontSize: ".8rem", fontWeight: 700,
                  cursor: selectedCount === 0 ? "not-allowed" : "pointer",
                }}>
                Import {selectedCount} Athlete{selectedCount !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div style={{ padding: "2rem 0", textAlign: "center", color: "#6e6e73", fontSize: ".85rem" }}>
            Importing athletes…
          </div>
        )}

        {step === "results" && results && (
          <div>
            <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1.25rem" }}>
              <div><div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#15803d" }}>{results.created}</div><div style={{ fontSize: ".7rem", color: "#98989d" }}>Created</div></div>
              <div><div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#854d0e" }}>{results.skipped}</div><div style={{ fontSize: ".7rem", color: "#98989d" }}>Skipped</div></div>
              <div><div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#b91c1c" }}>{results.failed}</div><div style={{ fontSize: ".7rem", color: "#98989d" }}>Failed</div></div>
            </div>

            {results.results.some(r => r.status !== "created") && (
              <div style={{ maxHeight: "30vh", overflowY: "auto", border: "1px solid #f0f0f2", borderRadius: 10, padding: ".5rem .75rem", marginBottom: "1rem" }}>
                {results.results.filter(r => r.status !== "created").map(r => (
                  <div key={r.rowNumber} style={{ fontSize: ".76rem", color: "#4b5563", padding: ".25rem 0" }}>
                    Row {r.rowNumber}: {"reason" in r ? r.reason : ""}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={onClose}
                style={{ padding: ".5rem 1.1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".8rem", fontWeight: 700, cursor: "pointer" }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
