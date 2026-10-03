// Test-only stand-in for "next/headers"'s cookies(), used solely by
// nextStubLoader.mjs's module resolution hook. Never imported by production
// code. A real request's cookie jar, reduced to exactly what the routes/
// session helpers under test read via cookies().get(name)?.value.
let store = new Map();

export function __setTestCookie(name, value) {
  if (value === undefined) store.delete(name);
  else store.set(name, value);
}

export async function cookies() {
  return {
    get(name) {
      const value = store.get(name);
      return value === undefined ? undefined : { name, value };
    },
  };
}
