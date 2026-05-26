import type { Metadata } from "next";
import "./team-app.css";
import PhoneShell from "./_components/PhoneShell";
import TeamHeader from "./_components/TeamHeader";
import BottomNav from "./_components/BottomNav";

export const metadata: Metadata = {
  title: "Team App Portal | Elite Level Fundraising",
  description: "Mobile team app prototype for Elite Level Fundraising.",
};

export default function TeamAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PhoneShell>
      {/* TeamHeader and BottomNav are fixed chrome; main scrolls between them */}
      <TeamHeader />
      <main
        className="ta-no-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          pointerEvents: "auto",
          paddingBottom: 40,
        }}
      >
        {children}
      </main>
      <BottomNav />
    </PhoneShell>
  );
}
