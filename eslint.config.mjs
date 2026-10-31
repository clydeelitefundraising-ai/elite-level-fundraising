import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { TWINS } from "./scripts/marketing/generate-team-app-demo-twins.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Team App demo's generated twins: verbatim copies of real app
    // components (only import lines differ), so they're linted as their
    // real files — a test regenerates and compares every twin.
    ...TWINS.map((t) => t.to),
  ]),
]);

export default eslintConfig;
