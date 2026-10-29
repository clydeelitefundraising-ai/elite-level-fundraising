// Settings Redesign — the compact Settings home: identity card, then
// "Team Management" and "Personal Settings" groups of category rows (icon,
// title, short status, chevron), then Sign Out. Only the categories this
// role may open are passed in (settingsCategoriesFor), so a row never
// appears for a screen that would refuse the user. No hooks — the server
// page renders it directly; each row is a plain link to its screen.
import type { ComponentType } from "react";
import {
  ArrowLeftRight, Bell, ChevronRight, HandCoins, Image as ImageIcon, KeyRound, Palette, ShieldCheck, Users,
} from "lucide-react";
import IdentityAvatar from "./IdentityAvatar";
import SignOutButton from "./SignOutButton";
import { SETTINGS_CATEGORY_TITLES, settingsCategoryHref, type SettingsCategory } from "./settingsCategories";
import { settingsScreenWrap } from "./SettingsScreen";

const ICONS: Record<SettingsCategory, ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean | "true" }>> = {
  access: KeyRound,
  branding: Palette,
  "coach-fundraising": HandCoins,
  "athlete-photos": ImageIcon,
  staff: Users,
  teams: ArrowLeftRight,
  notifications: Bell,
  account: ShieldCheck,
};

function GroupLabel({ children }: { children: string }) {
  return (
    <h3 style={{ margin: "1.25rem 0 .4rem", fontSize: ".65rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".09em" }}>
      {children}
    </h3>
  );
}

function CategoryRow({ slug, category, summary, last }: { slug: string; category: SettingsCategory; summary?: string; last: boolean }) {
  const Icon = ICONS[category];
  return (
    <li style={{ borderBottom: last ? "none" : "1px solid var(--border-app)" }}>
      <a
        href={settingsCategoryHref(slug, category)}
        className="elf-focus-ring"
        data-testid={`settings-row-${category}`}
        style={{ display: "flex", alignItems: "center", gap: ".75rem", minHeight: 56, padding: ".65rem .9rem", textDecoration: "none", color: "var(--text-primary-app)" }}
      >
        <span aria-hidden="true" style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-light-elevated)", color: "var(--team-primary)" }}>
          <Icon size={17} strokeWidth={2} aria-hidden="true" />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: ".86rem" }}>{SETTINGS_CATEGORY_TITLES[category]}</span>
          {summary && (
            <span style={{ display: "block", marginTop: ".1rem", fontSize: ".72rem", color: "var(--text-muted-app)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {summary}
            </span>
          )}
        </span>
        <ChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0, color: "var(--text-muted-app)", opacity: .7 }} />
      </a>
    </li>
  );
}

function CategoryList({ slug, categories, summaries }: { slug: string; categories: SettingsCategory[]; summaries: Partial<Record<SettingsCategory, string>> }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, background: "var(--surface-light)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-app)", overflow: "hidden" }}>
      {categories.map((c, i) => (
        <CategoryRow key={c} slug={slug} category={c} summary={summaries[c]} last={i === categories.length - 1} />
      ))}
    </ul>
  );
}

export default function SettingsHome({
  slug, name, roleLabel, photoUrl, categories, summaries,
}: {
  slug: string;
  name: string;
  roleLabel: string;
  photoUrl: string | null;
  categories: { team: SettingsCategory[]; personal: SettingsCategory[] };
  summaries: Partial<Record<SettingsCategory, string>>;
}) {
  return (
    <div style={settingsScreenWrap} data-testid="settings-home">
      <div style={{ background: "var(--surface-light)", borderRadius: "var(--radius-lg)", padding: ".75rem 1rem", border: "1px solid var(--border-app)", display: "flex", alignItems: "center", gap: ".75rem" }}>
        <IdentityAvatar name={name} photoUrl={photoUrl} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)", overflowWrap: "anywhere" }}>{name}</div>
          <div style={{ fontSize: ".72rem", color: "var(--text-muted-app)", marginTop: ".05rem" }}>{roleLabel}</div>
        </div>
      </div>

      {categories.team.length > 0 && (
        <div data-testid="settings-group-team">
          <GroupLabel>Team Management</GroupLabel>
          <CategoryList slug={slug} categories={categories.team} summaries={summaries} />
        </div>
      )}

      <div data-testid="settings-group-personal">
        <GroupLabel>Personal Settings</GroupLabel>
        <CategoryList slug={slug} categories={categories.personal} summaries={summaries} />
      </div>

      <SignOutButton />
    </div>
  );
}
