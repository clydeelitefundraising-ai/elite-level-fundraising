import MarketingPage from "./MarketingPage";
import AppEntry from "./AppEntry";

// NEXT_PUBLIC_APP_URL is set only in the ELF Team App Vercel project,
// not in the marketing site project — so this evaluates at build time
// to produce different static output for each deployment.
const IS_APP = Boolean(process.env.NEXT_PUBLIC_APP_URL);

export default function RootPage() {
  if (IS_APP) return <AppEntry />;
  return <MarketingPage />;
}
