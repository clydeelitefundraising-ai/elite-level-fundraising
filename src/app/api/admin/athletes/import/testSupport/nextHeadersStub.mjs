// Test-only stand-in for "next/headers"'s cookies(), used solely by a module
// resolution hook (nextStubLoader.mjs) registered from within roster-import
// route test files. Never imported by production code.
//
// A real request's cookie jar, reduced to exactly what the routes under test
// read: cookies().get("elf_admin")?.value, fed into the real verifyToken().
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
