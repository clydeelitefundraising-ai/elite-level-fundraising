import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

// "secondary" is kept as an alias of the light/outline treatment for
// backward compatibility with existing call sites — new call sites can use
// "outline" directly. "dark" and "text" are additive.
type Variant = "primary" | "secondary" | "dark" | "outline" | "text";
type Size = "md" | "lg";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "mk-btn-primary",
  secondary: "mk-btn-outline",
  outline: "mk-btn-outline",
  dark: "mk-btn-dark",
  text: "mk-btn-text",
};

const classFor = (variant: Variant, size: Size, block?: boolean) =>
  [
    "mk-btn",
    VARIANT_CLASS[variant],
    size === "lg" ? "mk-btn-lg" : "",
    block ? "mk-btn-block" : "",
  ]
    .filter(Boolean)
    .join(" ");

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function LinkButton({ href, variant = "primary", size = "md", block, className, children, ...rest }: LinkButtonProps) {
  const cls = [classFor(variant, size, block), className].filter(Boolean).join(" ");
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} {...rest}>
      {children}
    </a>
  );
}

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function SubmitButton({ variant = "primary", size = "md", block, className, children, ...rest }: SubmitButtonProps) {
  const cls = [classFor(variant, size, block), className].filter(Boolean).join(" ");
  return (
    <button type="submit" className={cls} {...rest}>
      {children}
    </button>
  );
}
