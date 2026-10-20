// Test-only Node module hooks for the attendance screen tests (never used
// by the app or the build). Lets plain `node --test` import the screen's
// .tsx components and render them with react-dom/server:
//   - .tsx is transpiled with the project's own TypeScript (jsx: react-jsx)
//   - *.module.css resolves to a proxy whose class names are their keys
//   - "next/link", "next/navigation", "next/headers", "next/server" are
//     small stubs; "@/…" and extensionless relative imports resolve like
//     the bundler does (same rules as lib/testSupport/nextStubLoader.mjs).
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB_SUPPORT = path.resolve(HERE, "../../../../../lib/testSupport");

const STUBS = {
  "next/link": pathToFileURL(path.join(HERE, "nextLinkStub.mjs")).href,
  "next/navigation": pathToFileURL(path.join(HERE, "nextNavigationStub.mjs")).href,
  "next/headers": pathToFileURL(path.join(LIB_SUPPORT, "nextHeadersStub.mjs")).href,
  "next/server": pathToFileURL(path.join(LIB_SUPPORT, "nextServerStub.mjs")).href,
};

function findSrcRoot(dir) {
  while (path.basename(dir) !== "src") {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("uiLoader: could not locate src/");
    dir = parent;
  }
  return dir;
}
const SRC_ROOT = findSrcRoot(HERE);

function firstExisting(base) {
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
  if (specifier.endsWith(".module.css")) {
    const base = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : SRC_ROOT;
    return { url: pathToFileURL(path.resolve(base, specifier)).href + "?cssmodule", shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const file = firstExisting(path.join(SRC_ROOT, specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && context.parentURL && !path.extname(specifier)) {
    const file = firstExisting(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith("?cssmodule")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default new Proxy({}, { get: (_t, key) => (typeof key === 'string' ? key : undefined) });",
    };
  }
  if (url.startsWith("file:") && url.endsWith(".tsx")) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: false,
        isolatedModules: true,
      },
    });
    return { format: "module", shortCircuit: true, source: out.outputText };
  }
  return nextLoad(url, context);
}
