// @deprecated — prototype. Every page under this layout now redirects (see
// each page.tsx), so this layout never actually renders visible chrome to a
// real visitor. It's kept minimal on purpose: it used to render TeamHeader/
// BottomNav/PhoneShell, which pulled in the mock AppStore — now that
// AppStoreProvider no longer wraps the app (removed from the root layout as
// part of this neutralization), those components would throw. A plain
// pass-through avoids reintroducing that dependency.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team App Portal | Elite Level Fundraising",
  description: "Deprecated — superseded by /team/[slug].",
};

export default function TeamAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
