// Start-up validation: Next.js calls register() once per server instance
// before it serves requests. The QA deployment guard throws here when a QA
// deployment is misconfigured (inert everywhere else) — see
// src/lib/deploymentGuard.ts. next.config.ts runs the same check at build.
export async function register() {
  const { assertDeploymentSafe } = await import("./lib/deploymentGuard");
  assertDeploymentSafe(process.env, "startup");
}
