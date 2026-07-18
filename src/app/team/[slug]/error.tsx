"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function TeamError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  // /team/<slug>/... — safe to derive from the URL even if the failure
  // happened while loading the team's own data.
  const slug = pathname.split("/")[2];

  useEffect(() => {
    // Server-side/console only — never rendered to the user.
    console.error("Team hub route error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div style={{ padding: "2.5rem 1.5rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
      <div style={{ fontSize: "2rem" }}>⚠️</div>
      <div>
        <h1 style={{ margin: "0 0 .35rem", fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d" }}>
          Something went wrong
        </h1>
        <p style={{ margin: 0, fontSize: ".88rem", color: "#6b7280", lineHeight: 1.5, maxWidth: 340 }}>
          This page couldn&apos;t load. Try again, or head back to a safe spot.
        </p>
      </div>

      <div style={{ display: "flex", gap: ".6rem", marginTop: ".25rem" }}>
        <button
          onClick={reset}
          style={{ padding: ".6rem 1.25rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 700, cursor: "pointer" }}
        >
          Retry
        </button>
        {slug && (
          <a
            href={`/team/${slug}/home`}
            style={{ padding: ".6rem 1.25rem", background: "#fff", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            Team Home
          </a>
        )}
        <a
          href="/teams"
          style={{ padding: ".6rem 1.25rem", background: "#fff", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          Switch Team
        </a>
      </div>
    </div>
  );
}
