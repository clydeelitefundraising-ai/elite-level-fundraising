import type { NextConfig } from "next";
import { assertDeploymentSafe } from "./src/lib/deploymentGuard.ts";

// Fails the build (before anything is deployed) — and `next start` / `next
// dev`, which load this file too — when a QA deployment is misconfigured;
// inert for every other deployment. See src/lib/deploymentGuard.ts.
export default function config(phase: string): NextConfig {
  const deployment = assertDeploymentSafe(process.env, phase === "phase-production-build" ? "build" : `server start (${phase})`);
  return {
    /* config options here */
    reactCompiler: true,
    // Build-time deployment mode for client code ("qa" or "standard"),
    // derived from the guard — not separately configurable.
    env: { NEXT_PUBLIC_ELF_DEPLOYMENT_MODE: deployment.mode },
  };
}
