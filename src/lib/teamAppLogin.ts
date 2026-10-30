// Where the public marketing site's "Log in" goes. Production: the live ELF
// Team app (a separate deployment/subdomain), whichever environment the
// marketing site itself is deployed from. The isolated QA deployment
// (NEXT_PUBLIC_ELF_DEPLOYMENT_MODE=qa, set by next.config.ts from the
// deployment guard) serves the app and the marketing pages from one host and
// must never send testers to production: there it stays on its own /login.
//
// Hosted marketing preview: a marketing-only build of a branch (no app mode,
// no secrets — see docs/MARKETING_PREVIEW.md) is deployed as a preview of the
// QA project with the build-time flag NEXT_PUBLIC_ELF_MARKETING_PREVIEW=qa.
// Its "Log in" goes to the QA Team App, never production. The flag accepts
// only "qa" and the destination is fixed here, so it can't be pointed
// anywhere else; production builds never set it.
export const QA_TEAM_APP_LOGIN_URL = "https://elf-team-qa-clydeelitefundraising-5717s-projects.vercel.app/login";

export function teamAppLoginUrl(deploymentMode: string | undefined, marketingPreview?: string): string {
  if (deploymentMode === "qa") return "/login";
  if (marketingPreview === "qa") return QA_TEAM_APP_LOGIN_URL;
  return "https://app.elitelevelfundraising.com/login";
}
