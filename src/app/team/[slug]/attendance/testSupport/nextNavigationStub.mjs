// Test-only stand-in for "next/navigation" (see uiLoader.mjs). redirect()
// and notFound() throw recognizable errors (like the real ones, they never
// return); useRouter() records navigations.
export class RedirectSignal extends Error {
  constructor(url) { super(`redirect:${url}`); this.url = url; }
}
export class NotFoundSignal extends Error {
  constructor() { super("notFound"); }
}
export function redirect(url) { throw new RedirectSignal(url); }
export function notFound() { throw new NotFoundSignal(); }

export const navigations = [];
const router = {
  push: href => { navigations.push({ mode: "push", href }); },
  replace: href => { navigations.push({ mode: "replace", href }); },
  refresh: () => {},
  back: () => {},
  prefetch: () => {},
};
export function useRouter() { return router; }
export function usePathname() { return "/"; }
export function useSearchParams() { return new URLSearchParams(); }
// Route params for components that call useParams(); tests set
// globalThis.__testRouteParams before rendering.
export function useParams() { return globalThis.__testRouteParams ?? {}; }
