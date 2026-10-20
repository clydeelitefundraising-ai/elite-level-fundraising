// Test-only stand-in for "next/link" (see uiLoader.mjs): a plain anchor.
import { createElement } from "react";

const LINK_ONLY_PROPS = ["prefetch", "replace", "scroll"];

export default function Link(props) {
  const { href, children, ...rest } = props;
  for (const p of LINK_ONLY_PROPS) delete rest[p];
  return createElement("a", { href: typeof href === "string" ? href : String(href?.pathname ?? ""), ...rest }, children);
}
