import { resolveTeamTheme } from "@/lib/theme/teamTheme";

// Phase 2 visual proof harness — reachable at /team/[slug]/theme-proof-phase2,
// NOT linked from any nav, dev/QA use only.
// Demonstrates the theming mechanism (resolveTeamTheme + contrast
// protection) against three representative color inputs rather than a
// full screen redesign, per the Phase 2 spec's "minimal representative
// surface" instruction. Safe to delete before Phase 3, or keep as a
// living fixture — parent's call.
const SAMPLES = [
  { label: "Default ELF theme (no custom color)", primary: null, secondary: null },
  { label: "Dark school primary color", primary: "#1A2F4E", secondary: "#8FA6C2" },
  { label: "Light school primary color", primary: "#F4E04D", secondary: "#2C2C2C" },
] as const;

function Panel({ label, primary, secondary }: { label: string; primary: string | null; secondary: string | null }) {
  const theme = resolveTeamTheme(primary, secondary);
  return (
    <section
      style={{
        ...(theme as React.CSSProperties),
        background: "var(--canvas)",
        border: "1px solid var(--border-app)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-6)",
        marginBottom: "var(--space-6)",
      }}
    >
      <h2 style={{ fontSize: "var(--text-lg)", color: "var(--text-primary-app)", marginBottom: "var(--space-1)" }}>
        {label}
      </h2>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted-app)", marginBottom: "var(--space-4)" }}>
        primary input: {primary ?? "null → falls back to ELF orange"} · resolved foreground: {theme["--team-primary-foreground"]}
      </p>

      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-4)" }}>
        <button className="elf-btn elf-btn-primary">Primary action</button>
        <button className="elf-btn elf-btn-secondary">Secondary action</button>
        <span className="elf-avatar">A</span>
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
            borderRadius: "var(--radius-full)", background: "var(--team-primary)",
            color: "var(--team-primary-foreground)", fontSize: "var(--text-xs)", fontWeight: 600,
          }}
        >
          Team badge
        </span>
      </div>

      <div style={{ marginBottom: "var(--space-2)" }}>
        <div className="elf-progress elf-progress-md" style={{ background: "var(--border-app)" }}>
          <div style={{ width: "57%", height: "100%", borderRadius: "var(--radius-full)", background: "var(--team-primary)" }} />
        </div>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted-app)", marginTop: 4 }}>
          Fundraiser-style progress bar using --team-primary
        </p>
      </div>

      {/* Semantic colors must NOT change across panels — this is the
          proof that team branding never overrides success/warning/error/info. */}
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginTop: "var(--space-4)" }}>
        <span className="elf-badge elf-badge-live">Success (fixed)</span>
        <span className="elf-badge elf-badge-ending">Warning (fixed)</span>
        <span
          className="elf-badge"
          style={{ background: "rgba(239,68,68,0.12)", color: "var(--color-error)", border: "1px solid rgba(239,68,68,0.3)" }}
        >
          Error (fixed)
        </span>
      </div>
    </section>
  );
}

export default function ThemeProofPage() {
  return (
    <div style={{ padding: "var(--space-6)", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", marginBottom: "var(--space-2)", color: "var(--text-primary-app)" }}>
        Phase 2 Theme Proof
      </h1>
      <p style={{ color: "var(--text-muted-app)", marginBottom: "var(--space-8)" }}>
        Dev-only harness. Not linked from navigation. Canvas/surface/text stay
        constant white/near-black across all three panels — only the
        team-accent elements (buttons, avatar, badge, progress fill) change.
      </p>
      {SAMPLES.map((s) => (
        <Panel key={s.label} label={s.label} primary={s.primary} secondary={s.secondary} />
      ))}
    </div>
  );
}
