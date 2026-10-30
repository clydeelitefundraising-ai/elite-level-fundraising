import type { Metadata } from "next";
import TeamAppDemo from "@/components/marketing/team-app-demo/TeamAppDemo";
import { DEMO_NETWORK_GUARD_SCRIPT } from "@/components/marketing/team-app-demo/networkGuard";
import { DEMO_ROLES, type DemoRole } from "@/components/marketing/team-app-demo/demoProtocol";
import { SAMPLE_NOTICE } from "@/components/marketing/demo/fixtures";

// The isolated ELF Team App demo shown (in a phone frame) on /product. It
// renders real Team App presentation components with fictional Sunridge
// Valley Comets data held only in the visitor's browser — see
// TeamAppDemo.tsx. No sign-in, no session, no database, no API: the
// inline network guard below runs before any bundle and blocks every
// request except the page's own static files. Never indexed.
export const metadata: Metadata = {
  title: "Team App Demo | Elite Level Fundraising",
  robots: { index: false, follow: false },
};

export default async function TeamAppDemoPage({ searchParams }: { searchParams: Promise<{ role?: string; embed?: string }> }) {
  const { role, embed } = await searchParams;
  const initialRole: DemoRole = DEMO_ROLES.includes(role as DemoRole) ? (role as DemoRole) : "coach";
  const embedded = embed === "1";
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: DEMO_NETWORK_GUARD_SCRIPT }} />
      {/* Same keyframes the Team App shell defines (team/[slug]/layout.tsx). */}
      <style>{`
        @keyframes elf-fadeUp{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
        @keyframes elf-modalIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}
        @keyframes elf-backdropIn{from{opacity:0}to{opacity:1}}
      `}</style>
      {/* Opened directly (not inside /product's labelled frame), the page
          carries its own sample notice. */}
      {!embedded && (
        <div
          role="note"
          style={{
            position: "relative", zIndex: 1000, background: "#121110", color: "#FFCA2A",
            font: "700 12px/1.4 system-ui, sans-serif", letterSpacing: ".02em", textAlign: "center", padding: "7px 12px",
          }}
        >
          Preview · {SAMPLE_NOTICE} Nothing you do here is sent or saved.
        </div>
      )}
      <TeamAppDemo initialRole={initialRole} embedded={embedded} />
    </>
  );
}
