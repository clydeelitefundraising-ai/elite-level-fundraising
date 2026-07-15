import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";
type Size = "md" | "lg";

const classFor = (variant: Variant, size: Size, block?: boolean) =>
  [
    "mk-btn",
    variant === "primary" ? "mk-btn-primary" : "mk-btn-secondary",
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
