// Where the public marketing site's "Log in" goes. Production: the live ELF
// Team app (a separate deployment/subdomain), whichever environment the
// marketing site itself is deployed from. The isolated QA deployment
// (NEXT_PUBLIC_ELF_DEPLOYMENT_MODE=qa, set by next.config.ts from the
// deployment guard) serves the app and the marketing pages from one host and
// must never send testers to production: there it stays on its own /login.
export function teamAppLoginUrl(deploymentMode: string | undefined): string {
  return deploymentMode === "qa" ? "/login" : "https://app.elitelevelfundraising.com/login";
}
