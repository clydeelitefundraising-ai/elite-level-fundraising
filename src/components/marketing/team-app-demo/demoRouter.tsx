"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { demoSearch, subscribeDemoLocation } from "./demoHistory";

export { resetDemoLocation } from "./demoHistory";

// Stand-ins for next/navigation's useRouter/useSearchParams inside the
// demo. The generated twins (scripts/marketing/generate-team-app-demo-twins.mjs)
// import these under the same names, so their bodies stay byte-for-byte the
// real components' while every "navigation" becomes an in-demo screen change
// (TeamAppDemo's navigate) and never a real route — and nothing prefetches.
// useSearchParams reads the demo's virtual location (demoHistory.ts).

type DemoNav = {
  navigate: (href: string) => void;
  notify: (message?: string) => void;
};

const DemoNavContext = createContext<DemoNav>({ navigate: () => {}, notify: () => {} });

export function DemoNavProvider({ value, children }: { value: DemoNav; children: ReactNode }) {
  return <DemoNavContext.Provider value={value}>{children}</DemoNavContext.Provider>;
}

export function useDemoNav(): DemoNav {
  return useContext(DemoNavContext);
}

/** Same surface the twins use from next/navigation's router. */
export function useRouter() {
  const { navigate } = useContext(DemoNavContext);
  return useMemo(() => ({
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href),
    back: () => navigate("back"),
    refresh: () => {},
    prefetch: () => {},
  }), [navigate]);
}

export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribeDemoLocation, demoSearch, () => "");
  return useMemo(() => new URLSearchParams(search), [search]);
}
