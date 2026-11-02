"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";

// Stand-in for next/link inside the demo's generated twins: a plain anchor
// (next/link would prefetch real /team routes). Its clicks are intercepted
// by the page's guard and TeamAppDemo, which turn them into demo screens.
export default function DemoLink({ href, children, ...rest }: { href: string; children?: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <a href={href} {...rest}>{children}</a>;
}
