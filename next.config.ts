import type { NextConfig } from "next";
import { assertDeploymentSafe } from "./src/lib/deploymentGuard.ts";

// Fails the build (before anything is deployed) — and `next start` / `next
// dev`, which load this file too — when a QA deployment is misconfigured;
// inert for every other deployment. See src/lib/deploymentGuard.ts.
export default function config(phase: string): NextConfig {
  const deployment = assertDeploymentSafe(process.env, phase === "phase-production-build" ? "build" : `server start (${phase})`);
  if (deployment.mode === "qa") {
    // Evidence in the QA build log that the guard ran and passed (signal
    // names only, never values). Standard builds print nothing.
    console.log(`[deployment-guard] QA configuration accepted: ${deployment.triggers.join("; ")}`);
  }
  return {
    /* config options here */
    reactCompiler: true,
    // Build-time deployment mode for client code ("qa" or "standard"),
    // derived from the guard — not separately configurable.
    env: { NEXT_PUBLIC_ELF_DEPLOYMENT_MODE: deployment.mode },
    // Compatibility addresses for store listings and links that guess the
    // short form. The canonical legal documents stay where they are
    // (/trust/privacy, /legal/terms); these only forward to them (308).
    async redirects() {
      return [
        { source: "/privacy", destination: "/trust/privacy", permanent: true },
        { source: "/terms", destination: "/legal/terms", permanent: true },
      ];
    },
  };
}
