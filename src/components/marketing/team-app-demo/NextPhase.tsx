"use client";

import { LayoutGrid } from "lucide-react";

// Screens the demo hasn't built yet (later phases), shown in the app's own
// empty-state style. Only ever seen on hosted previews before release.
export default function NextPhaseScreen({ title }: { title: string }) {
  return (
    <div className="elf-empty-state" style={{ marginTop: "1.5rem", animation: "elf-fadeUp .22s ease both" }}>
      <LayoutGrid aria-hidden="true" size={22} strokeWidth={1.75} />
      <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-secondary-app)" }}>{title}</div>
      <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>
        This screen is coming in the next phase of the demo.
      </div>
    </div>
  );
}
