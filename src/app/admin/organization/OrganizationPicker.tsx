"use client";

import { useState } from "react";
import Link from "next/link";
import { filterOrganizations, organizationLabel, type OrgPickerRow } from "@/lib/organizationCenter";

// Organization Center — choose the school to edit. Every school is listed
// with its city/state (so same-named schools stay distinct) and how many
// team-seasons are linked to it. Nothing is edited until one is chosen.
export default function OrganizationPicker({
  schools,
  loadFailed = false,
  notFound = false,
}: {
  schools: OrgPickerRow[];
  loadFailed?: boolean;
  notFound?: boolean;
}) {
  const [query, setQuery] = useState("");
  const shown = filterOrganizations(schools, query);

  return (
    <div style={{ padding: "1.75rem 2rem", maxWidth: 860 }}>
      <h1 style={{ margin: "0 0 .35rem", fontSize: "1.25rem", fontWeight: 700, color: "#1d1d1f" }}>Choose a school</h1>
      <p style={{ margin: "0 0 1.25rem", fontSize: ".85rem", color: "#6e6e73", lineHeight: 1.5 }}>
        The Organization Center edits one school at a time. Pick the school whose profile, campaign defaults,
        communication templates and sponsor packages you want to change.
      </p>

      {notFound && (
        <div role="alert" style={{ marginBottom: "1rem", padding: ".75rem 1rem", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: ".85rem" }}>
          That school wasn&apos;t found. <Link href="/admin/organization" style={{ color: "#b91c1c", fontWeight: 600 }}>Choose a school</Link>.
        </div>
      )}
      {loadFailed && (
        <div role="alert" style={{ marginBottom: "1rem", padding: ".75rem 1rem", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: ".85rem" }}>
          Schools couldn&apos;t be loaded. Reload to try again.
        </div>
      )}

      {!notFound && (
        <>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by school, city or state"
            aria-label="Search schools by name, city or state"
            style={{ width: "100%", boxSizing: "border-box", padding: ".6rem .8rem", marginBottom: "1rem", borderRadius: 8, border: "1px solid #d2d2d7", fontSize: ".9rem" }}
          />
          {shown.length === 0 ? (
            <p style={{ fontSize: ".85rem", color: "#6e6e73" }}>{schools.length === 0 ? "No schools yet." : `No schools match "${query.trim()}".`}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: ".5rem" }}>
              {shown.map(s => (
                <li key={s.id}>
                  <Link
                    href={`/admin/organization?school=${s.id}`}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: ".8rem 1rem", borderRadius: 10, border: "1px solid #e5e5ea", background: "#fff", textDecoration: "none", color: "#1d1d1f" }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 600, fontSize: ".9rem", overflowWrap: "anywhere" }}>{organizationLabel(s)}</span>
                      <span style={{ display: "block", fontSize: ".75rem", color: "#86868b" }}>{s.slug}</span>
                    </span>
                    <span style={{ flexShrink: 0, fontSize: ".75rem", color: "#6e6e73" }}>
                      {s.team_count} linked team-season{s.team_count === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
