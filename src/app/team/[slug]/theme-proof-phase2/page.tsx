import { resolveTeamTheme } from "@/lib/theme/teamTheme";

// Visual proof harness — reachable at /team/[slug]/theme-proof-phase2,
// NOT linked from any nav, dev/QA use only. Extended in Phase 3 to
// demonstrate the explicit branding_customized flag (see
// supabase/migrations/phase_a32_team_branding_customized.sql) rather than
// the color value alone — the 4th panel is the actual Phase 3 product
// decision made visible: a real, well-formed dark school color is
// completely ignored when brandingCustomized is false.
const SAMPLES = [
  { label: "Default ELF theme (branding_customized=false, no color set)", primary: null, secondary: null, customized: false },
  { label: "branding_customized=false — real school color on file, still ignored", primary: "#1A2F4E", secondary: "#8FA6C2", customized: false },
  { label: "branding_customized=true — dark school primary color", primary: "#1A2F4E", secondary: "#8FA6C2", customized: true },
  { label: "branding_customized=true — light school primary color", primary: "#F4E04D", secondary: "#2C2C2C", customized: true },
] as const;

function Panel({ label, primary, secondary, customized }: { label: string; primary: string | null; secondary: string | null; customized: boolean }) {
  const theme = resolveTeamTheme(primary, secondary, customized);
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
        branding_customized: {String(customized)} · stored primary_color: {primary ?? "null"} · resolved --team-primary: {theme["--team-primary"]} · resolved foreground: {theme["--team-primary-foreground"]}
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
        Theme + Branding-Mode Proof
      </h1>
      <p style={{ color: "var(--text-muted-app)", marginBottom: "var(--space-8)" }}>
        Dev-only harness. Not linked from navigation. Canvas/surface/text stay
        constant white/near-black across all four panels — only the
        team-accent elements (buttons, avatar, badge, progress fill) change,
        and only when branding_customized is true.
      </p>
      {SAMPLES.map((s) => (
        <Panel key={s.label} label={s.label} primary={s.primary} secondary={s.secondary} customized={s.customized} />
      ))}
    </div>
  );
}
