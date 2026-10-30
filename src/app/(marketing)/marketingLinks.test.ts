// Marketing R2 — legal compatibility routes, public support page and
// broken-link fixes. Static guards (the marketing pages are server
// components without a render harness here), plus an internal-link audit:
// every internal href on the marketing site must reach a real page or a
// configured redirect.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const MK = "src/app/(marketing)";

const REDIRECTS: Record<string, string> = { "/privacy": "/trust/privacy", "/terms": "/legal/terms" };

/** Does a site-relative path resolve to a page in the app router (or a redirect)? */
function routeExists(path: string): boolean {
  const clean = path.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  if (REDIRECTS[clean]) return true;
  if (clean === "/") return existsSync(join(ROOT, "src/app/page.tsx"));
  for (const base of ["src/app", MK]) {
    if (existsSync(join(ROOT, base, clean, "page.tsx"))) return true;
  }
  return false;
}

test("/privacy and /terms permanently redirect to the unchanged canonical legal pages", () => {
  const cfg = read("next.config.ts");
  assert.match(cfg, /\{ source: "\/privacy", destination: "\/trust\/privacy", permanent: true \}/);
  assert.match(cfg, /\{ source: "\/terms", destination: "\/legal\/terms", permanent: true \}/);
  for (const page of ["trust/privacy", "legal/terms"]) assert.ok(existsSync(join(ROOT, MK, page, "page.tsx")), page);
  // No page competes with the redirects.
  assert.ok(!existsSync(join(ROOT, MK, "privacy", "page.tsx")) && !existsSync(join(ROOT, MK, "terms", "page.tsx")));
});

test("/support is a public marketing page that only uses contact routes already published on the site", () => {
  const src = read(`${MK}/support/page.tsx`);
  assert.match(src, /alternates: \{ canonical: "\/support" \}/);
  assert.ok(!/getTeamActor|getAccountSession|redirect\(/.test(src), "no sign-in required");
  const emails = [...new Set(src.match(/[a-z]+@elitelevelfundraising\.com/g) ?? [])].sort();
  assert.deepEqual(emails, ["privacy@elitelevelfundraising.com", "support@elitelevelfundraising.com"]);
  assert.match(read(`${MK}/faq/page.tsx`), /support@elitelevelfundraising\.com/, "support@ already published (FAQ)");
  assert.match(read(`${MK}/trust/privacy/page.tsx`), /privacy@elitelevelfundraising\.com/, "privacy@ already published (Privacy Policy)");
  assert.ok(!/\b(within|hours?|business days?|24\/7|guarantee)\b/i.test(src.replace(/\/\/.*$/gm, "")), "no response-time promise");
  assert.match(src, /Settings<\/strong>, then <strong>Account &amp; Privacy<\/strong>, then\{" "\}\s*<strong>Delete Account<\/strong>/, "existing in-app deletion path");
  assert.ok(read("src/app/sitemap.ts").includes(`"/support",`));
});

test("How It Works points to the /how-it-works walkthrough everywhere (no /#how anchor remains)", () => {
  const files = execSync("git ls-files src", { cwd: ROOT }).toString().trim().split("\n").filter(f => /\.tsx?$/.test(f) && !/\.test\./.test(f));
  for (const f of files) assert.ok(!read(f).includes(`"/#how"`), `${f} still links to /#how`);
  assert.match(read("src/components/marketing/MarketingFooter.tsx"), /<Link href="\/how-it-works">How It Works<\/Link>/);
  assert.match(read("src/components/marketing/MarketingNav.tsx"), /\{ href: "\/how-it-works", label: "How It Works" \}/);
});

test("hero is unchanged apart from its secondary action now opening /how-it-works", () => {
  const page = read("src/app/MarketingPage.tsx");
  assert.ok(!/Watch video/i.test(page.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")), "no video claim");
  assert.ok(!page.includes(`d="M6 4l14 8-14 8z"`), "play icon removed");
  assert.match(page, /<a href="\/how-it-works" className="mk-hero-watch">[\s\S]*?See how it works\s*<\/a>/);
  // Hero headline, image, callout and primary CTA unchanged.
  assert.match(page, /src="\/marketing\/brand\/hero\.png"/);
  assert.match(page, /Fund<br \/>\s*the<br \/>\s*<span className="mk-marker-underline">season\.<\/span>/);
  assert.match(page, /<LinkButton href="\/demo" variant="yellow" size="lg">Get Started &rarr;<\/LinkButton>/);
  assert.match(page, /Same grind\. Bigger opportunities\./);
  assert.match(page, /Better gear\.<br \/>More travel\.<br \/>Unforgettable experiences\./);
});

test("the flat promotional composites are gone from the homepage (no baked-in buttons such as 'Explore Stories')", () => {
  const page = read("src/app/MarketingPage.tsx");
  for (const img of ["raise-more-do-more.png", "real-opportunities-banner.png"]) assert.ok(!page.includes(img), `${img} still on the homepage`);
  assert.ok(!/mk-row1-banner-link|mk-row2-banner-link/.test(page), "no hit-areas over baked-in artwork buttons");
  assert.ok(!/Explore Stories/.test(page), "no claim of a stories page");
});

test("footers keep every legal, trust and support link; Platform column follows the new product pages", () => {
  const footer = read("src/components/marketing/MarketingFooter.tsx");
  for (const [href, label] of [["/trust", "Trust Center"], ["/trust/privacy", "Privacy Policy"], ["/legal/terms", "Terms"], ["/legal/cookies", "Cookie Policy"],
    ["/trust/accessibility", "Accessibility"], ["/trust/status", "System Status"], ["/support", "Support"], ["/about", "About"], ["/pricing", "Pricing"], ["/faq", "Resources"], ["/contact", "Contact"],
    ["/fundraising", "Fundraising"], ["/product", "Team App"], ["/how-it-works", "How It Works"], ["/sponsors", "Community Partners"], ["/communication", "Communication"]]) {
    assert.ok(footer.includes(`<Link href="${href}">${label}</Link>`), `${href} ${label}`);
  }
  assert.equal(footer.split(`<Link href="/support">Support</Link>`).length - 1, 2, "Support in both footers");
  for (const href of ["/trust/security", "/trust/privacy", "/trust/compliance", "/trust/data-protection"]) assert.ok(footer.includes(`href="${href}"`), href);
});

test("internal link audit: every internal href on the marketing site resolves to a page or redirect", () => {
  const files = execSync(`git ls-files "${MK}" src/components/marketing src/app/MarketingPage.tsx`, { cwd: ROOT }).toString().trim().split("\n")
    .filter(f => f.endsWith(".tsx"));
  const broken: string[] = [];
  let checked = 0;
  for (const f of files) {
    for (const m of read(f).matchAll(/href[=:]\s*\{?\s*["'`](\/[^"'`$]*)["'`]/g)) {
      const href = m[1];
      if (href.startsWith("//") || href.startsWith("/_next") || /\.(png|jpe?g|svg|webp|ico|pdf|xml|txt)$/.test(href)) continue;
      checked++;
      if (!routeExists(href)) broken.push(`${f}: ${href}`);
    }
  }
  assert.ok(checked > 40, `audited ${checked} internal links`);
  assert.deepEqual(broken, []);
});
