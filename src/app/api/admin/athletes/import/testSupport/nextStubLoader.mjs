// Node module-customization hook, registered via node:module's register()
// from within roster-import route test files only (see e.g.
// parse/route.test.ts). Redirects the two Next.js subpaths those route
// files import ("next/server", "next/headers") to the local stubs in this
// directory, so the real route.ts files can be imported and exercised
// directly under the plain `node --test` runner — which otherwise cannot
// resolve Next.js's package subpaths outside the Next.js build pipeline.
//
// Scoped to this process only (node:module's register() does not affect
// other test files, which `node --test` runs as separate processes/workers).
//
// Also resolves the project's "@/*" -> "src/*" path alias (tsconfig.json)
// and bare extensionless relative imports (e.g. "./_client", as written in
// src/lib/platform/campaigns.ts) — both work under the bundler-based build
// (and under TypeScript's "bundler" moduleResolution) but not under plain
// Node ESM resolution. This is purely a resolution fallback for files this
// test suite needed to import as-is; it changes nothing about those files.
// Every specifier that already resolves normally passes straight through.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const STUBS = {
  "next/server":  new URL("./nextServerStub.mjs", import.meta.url).href,
  "next/headers": new URL("./nextHeadersStub.mjs", import.meta.url).href,
};

function findSrcRoot(dir) {
  while (path.basename(dir) !== "src") {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("nextStubLoader: could not locate the project's src/ directory");
    dir = parent;
  }
  return dir;
}

const SRC_ROOT = findSrcRoot(path.dirname(fileURLToPath(import.meta.url)));

function resolveAliasFile(relativePath) {
  const base = path.join(SRC_ROOT, relativePath);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS[specifier];
  if (stub) return { url: stub, shortCircuit: true };

  if (specifier.startsWith("@/")) {
    const file = resolveAliasFile(specifier.slice(2));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (isRelative && context.parentURL) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    throw err;
  }
}
