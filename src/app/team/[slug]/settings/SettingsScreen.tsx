// Shared frame for every dedicated Settings screen: a clear "Back to
// Settings" link, the screen title and an optional one-line description.
// Presentation only (no hooks), so server pages render it directly. The
// Back link is a plain <a> — a full navigation always lands at the top of
// the Settings home and behaves the same inside the native apps.
import type { ReactNode } from "react";
import { ArrowLeft, Lock } from "lucide-react";

export const settingsScreenWrap = { animation: "elf-fadeUp .22s ease both", maxWidth: 700, margin: "0 auto" } as const;

export function BackToSettings({ slug }: { slug: string }) {
  return (
    <a
      href={`/team/${slug}/settings`}
      className="elf-focus-ring"
      data-testid="back-to-settings"
      style={{ display: "inline-flex", alignItems: "center", gap: ".35rem", minHeight: 40, fontSize: ".82rem", fontWeight: 700, color: "var(--text-secondary-app)", textDecoration: "none", borderRadius: 8 }}
    >
      <ArrowLeft size={16} strokeWidth={2.25} aria-hidden="true" /> Back to Settings
    </a>
  );
}

export default function SettingsScreen({
  slug, title, description, children, testId,
}: {
  slug: string;
  title: string;
  description?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div style={settingsScreenWrap} data-testid={testId}>
      <BackToSettings slug={slug} />
      <div style={{ margin: ".3rem 0 .85rem" }}>
        <span style={{ display: "block", fontSize: ".6rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: ".12rem" }}>
          Settings
        </span>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          {title}
        </h2>
        {description && (
          <p style={{ margin: ".3rem 0 0", fontSize: ".8rem", color: "var(--text-secondary-app)", lineHeight: 1.5 }}>{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/** Shown when a role opens a Settings screen it isn't allowed to use (e.g. a
 *  direct URL). Nothing from the screen is loaded or rendered. */
export function SettingsAccessGate({ slug, title, who }: { slug: string; title: string; who: "Head Coach" | "coaching staff" }) {
  return (
    <SettingsScreen slug={slug} title={title} testId="settings-access-gate">
      <div style={{ background: "var(--surface-light)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-app)", padding: "2rem 1.25rem", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: ".6rem", opacity: .4 }}>
          <Lock size={28} strokeWidth={1.75} aria-hidden="true" />
        </div>
        <div style={{ fontWeight: 800, fontSize: ".95rem", color: "var(--text-primary-app)", marginBottom: ".3rem" }}>
          {who === "Head Coach" ? "Head Coach Access Only" : "Coaching Staff Only"}
        </div>
        <p style={{ margin: 0, fontSize: ".82rem", color: "var(--text-secondary-app)", lineHeight: 1.5 }}>
          {who === "Head Coach"
            ? "This setting is only available to this team’s Head Coach."
            : "This setting is only available to this team’s coaches."}
        </p>
      </div>
    </SettingsScreen>
  );
}
