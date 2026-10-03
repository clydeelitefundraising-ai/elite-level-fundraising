// Test-only stand-in for "next/headers"'s cookies(), used solely by
// nextStubLoader.mjs's module resolution hook. Never imported by production
// code. The functions under test here (getActorForAccount) don't call
// cookies() at all, but importing their containing module still requires
// "next/headers" to resolve, since ES modules resolve every static import
// before any module body runs — this stub only needs to exist, not be
// exercised, for most of these tests.
export async function cookies() {
  return { get() { return undefined; } };
}
