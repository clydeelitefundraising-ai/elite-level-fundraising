// Node module-customization hook, registered via node:module's register()
// from within lib-level test files that need to import a module which
// transitively imports "next/headers" (which this repo's plain `node --test`
// runner cannot resolve outside a Next build). Redirects that one subpath to
// a minimal stub and resolves the project's "@/*" alias and bare
// extensionless relative imports (both handled by the bundler-based build,
// not by plain Node ESM resolution) — mirrors the equivalent loader already
// used by the roster-import route tests
// (src/app/api/admin/athletes/import/testSupport/nextStubLoader.mjs).
// Changes nothing about the files it resolves; purely a test-time fallback.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const STUBS = {
  "next/headers":    new URL("./nextHeadersStub.mjs", import.meta.url).href,
  "next/server":     new URL("./nextServerStub.mjs", import.meta.url).href,
  "next/navigation": new URL("./nextNavigationStub.mjs", import.meta.url).href,
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
