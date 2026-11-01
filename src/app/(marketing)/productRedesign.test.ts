// Product-focused marketing redesign — guards for the navigation, the moved
// walkthrough, store links, honest copy, demo data isolation and the
// fundraising-preview lead gate. Pages are server components without a
// render harness here, so most checks are static; the lead rules are
// exercised directly through the pure module.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import {
  validatePreviewLead, isBot, previewLeadReadiness, isSameOrigin, recordPreviewLead, likeExact, normalizeEmail,
  PREVIEW_LEAD_SOURCE, MARKETING_CONSENT_TEXT, type PreviewLeadStore, type ConsentRecord,
} from "../../lib/marketing/previewLead.ts";
import { escapeHtml } from "../../lib/email.ts";
import {
  SAMPLE_TEAM, SAMPLE_ATHLETES, SAMPLE_COACHES, SAMPLE_DONATIONS, SAMPLE_PARTNERS, SAMPLE_PREVIEW_PARTNERS,
  samplePortrait, sampleAvatar, samplePortraitFor, sampleAvatarFor,
} from "../../components/marketing/demo/fixtures.ts";
import { COMMUNITY_PARTNER_SLOT_COUNT } from "../../lib/platform/communityPartnerSlots.ts";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const MK = "src/app/(marketing)";
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── Navigation and routes ────────────────────────────────────────────────────

test("top navigation is exactly Fundraising | Team App | How It Works | Sponsors | Pricing | Resources", () => {
  const nav = read("src/components/marketing/MarketingNav.tsx");
  const block = nav.match(/export const MARKETING_NAV_LINKS: NavLink\[\] = \[([\s\S]*?)\];/)![1];
  const links = [...block.matchAll(/\{ href: "([^"]+)", label: "([^"]+)" \}/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(links, [
    ["Fundraising", "/fundraising"], ["Team App", "/product"], ["How It Works", "/how-it-works"],
    ["Sponsors", "/sponsors"], ["Pricing", "/pricing"], ["Resources", "/faq"],
  ]);
  for (const [, href] of links) assert.ok(href === "/" || existsSync(join(ROOT, MK, href, "page.tsx")), href);
  // Log in + Get Started kept; current page is announced.
  assert.match(nav, /Log in/);
  assert.match(nav, /"Get Started"/);
  assert.match(nav, /aria-current=\{current\(l\.href\)\}/);
  // /communication stays public (page exists, linked from the footer).
  assert.ok(existsSync(join(ROOT, MK, "communication", "page.tsx")));
});

test("/how-it-works: the short redesign — hero, three steps, closing CTA, approved type and real captures only", () => {
  const page = read(`${MK}/how-it-works/page.tsx`);
  const copy = code(page);
  assert.match(page, /alternates: \{ canonical: "\/how-it-works" \}/);
  assert.ok(read("src/app/sitemap.ts").includes(`"/how-it-works",`));
  // Structure and approved copy.
  assert.match(copy, /Everything your team needs\. Nothing it doesn&rsquo;t\./);
  assert.match(copy, /ELF brings your coaches, athletes and parents together in one free app\. When it&rsquo;s\s+time to fundraise, everything is already connected\./);
  for (const step of ["Set up your team.", "Stay connected all season.", "Fundraise when you’re ready."]) assert.ok(page.includes(step), step);
  assert.ok(page.includes("Work with ELF to launch a campaign. Athletes share their pages, supporters donate securely, and coaches track progress."));
  assert.match(copy, /Ready to bring your team together\?/);
  assert.equal((page.match(/^\s{2}\{\n\s{4}title:/gm) ?? []).length, 3, "three steps");
  // Approved typography: Inter headings (Variation A classes), no condensed display face.
  assert.match(page, /className="mk-fhero-title"/);
  assert.match(page, /className="mk-va-title mk-hiw-steps-title"/);
  assert.ok(!/mk-display|mk-page-hero|mk-capability|mk-marker-underline|ProductPreview/.test(copy), "no legacy walkthrough layout");
  // Only real, current captures — no Riverside screenshots or legacy sponsor graphics.
  const images = [...page.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(images.sort(), ["/marketing/fundraiser-campaign-current.png", "/marketing/team-app-coach-home.png", "/marketing/team-app-communications.png"]);
  for (const img of images) assert.ok(existsSync(join(ROOT, "public", img)), img);
  assert.ok(!/Riverside|\/marketing\/(campaign-hero|leaderboard|sponsors|communications)\.png/.test(page));
  // Accuracy: free, self-service team setup; fundraising set up with ELF; a
  // demo is optional, never required; no invented numbers.
  assert.match(page, /Free for every team &middot; No fundraiser required/);
  assert.match(page, /const SIGNUP_URL = teamAppLoginUrl\([\s\S]*?\.replace\(\/\\\/login\$\/, "\/signup"\);/);
  assert.match(page, /<LinkButton href=\{SIGNUP_URL\} size="lg">Create Your Free Team<\/LinkButton>/);
  assert.match(copy, /Prefer a guided walkthrough\? <a href="\/demo">Book a free demo<\/a>\./);
  assert.ok(!/setup call|schedule a call|must book|required demo/i.test(copy));
  assert.ok(!/testimonial|trusted by|\d{2,}\+?\s*(schools|teams|programs|customers)|raised over/i.test(copy));
});

test("/how-it-works: signup goes to the same Team App (and environment) as the nav's Log in", async () => {
  const { teamAppLoginUrl } = await import("../../lib/teamAppLogin.ts");
  const signup = (mode?: string, preview?: string) => teamAppLoginUrl(mode, preview).replace(/\/login$/, "/signup");
  assert.equal(signup(undefined, undefined), "https://app.elitelevelfundraising.com/signup");
  assert.equal(signup("qa"), "/signup");
  assert.equal(signup(undefined, "qa"), "https://elf-team-qa-clydeelitefundraising-5717s-projects.vercel.app/signup");
  assert.ok(existsSync(join(ROOT, "src/app/signup/page.tsx")), "the Team App's self-service signup exists");
});

test("/fundraising: current campaign screenshot up top; the 'Every dollar, visible.' section is gone", () => {
  const page = read(`${MK}/fundraising/page.tsx`) + read("src/components/marketing/fundraising/FundraisingTop.tsx");
  assert.match(page, /src="\/marketing\/fundraiser-campaign-current\.png"/);
  assert.ok(existsSync(join(ROOT, "public/marketing/fundraiser-campaign-current.png")));
  for (const gone of ["Every dollar, visible.", "/marketing/campaign-hero.png", "/marketing/leaderboard.png", "mk-fund-support", "Riverside"]) {
    assert.ok(!page.includes(gone), `still on /fundraising: ${gone}`);
  }
  // Hero copy and calls to action unchanged (editorial layout from the approved mockup).
  assert.match(page, /<h1 id="mk-fhero-title" className="mk-fhero-title">\s*Raise more<br \/> for the season\.\s*<\/h1>/);
  assert.match(page, /<FundraisingHero \/>\s*<FundraisingBenefits \/>/, "/fundraising renders the shared sections");
});

test("/fundraising typography: approved Variation A (Inter 700, sentence case) and Inter benefit numerals; review page removed", () => {
  const page = read(`${MK}/fundraising/page.tsx`) + read("src/components/marketing/fundraising/FundraisingTop.tsx");
  assert.ok(!/mk-display[^"]*mk-(fhero|fbenefits)-title|mk-(fhero|fbenefits)-title[^"]*mk-display/.test(page), "no condensed display face on the two headlines");
  const css = read("src/app/marketing-product.css");
  assert.match(css, /\.mk-root \.mk-fhero-title,\s*\.mk-root \.mk-fbenefits-title,\s*\.mk-root \.mk-va-title \{\s*font-family: inherit;\s*font-size: clamp\(2\.75rem, 4\.7vw, 4\.5rem\);\s*font-weight: 700;\s*letter-spacing: -0\.04em;\s*line-height: 1\.02;\s*text-transform: none;/);
  // Timeline and FAQ headlines share the same Variation A treatment; copy unchanged.
  assert.match(page, /<h2 id="mk-fund-process" className="mk-va-title">We make fundraising simple\.<\/h2>/);
  assert.match(page, /<h2 id="mk-fund-faq" className="mk-va-title">Fundraising questions\.<\/h2>/);
  // Timeline 01–04 numerals in Inter 500 (positions/markers unchanged).
  assert.match(css, /\.mk-timeline-num \{\s*display: block;\s*font-family: inherit;\s*font-weight: 500;/);
  // No condensed display face left on any /fundraising section headline (the final CTA was already Inter).
  assert.ok(!/<h[12][^>]*mk-display/.test(read(`${MK}/fundraising/page.tsx`)), "no mk-display headings on /fundraising");
  assert.match(read(`${MK}/fundraising/page.tsx`), /<h2>See a fundraiser built around your sport\.<\/h2>/);
  assert.match(css, /\.mk-fbenefit-num \{ font-family: inherit; font-weight: 500;[^}]*font-size: 3\.5rem;[^}]*color: #CFC9C0;/);
  // The temporary comparison page and its styles are gone.
  assert.ok(!existsSync(join(ROOT, MK, "fundraising", "typography")));
  assert.ok(!/mk-typo/.test(css));
  assert.ok(!read("src/app/robots.ts").includes("/fundraising/typography"));
  assert.match(page, /Give every athlete a role in your team&rsquo;s success\. ELF brings personal fundraising\s+pages, live progress tracking, and secure online donations together&mdash;making it\s+easier to raise the resources your program needs\./);
  assert.match(page, /<LinkButton href="\/demo" size="lg">Book a Free Demo<\/LinkButton>/);
  assert.match(page, /<a href="#preview" className="mk-fhero-link">Explore a Sample Fundraiser <span aria-hidden="true">&rarr;<\/span><\/a>/);
  assert.match(page, /Sunridge Valley High School is a fictional sample team\./);
});

test("/fundraising benefits: numbered 01–06 editorial grid, no cards, approved copy kept", () => {
  const page = read(`${MK}/fundraising/page.tsx`) + read("src/components/marketing/fundraising/FundraisingTop.tsx");
  assert.match(page, /<ol className="mk-fbenefit-grid">/);
  assert.match(page, /String\(i \+ 1\)\.padStart\(2, "0"\)/);
  assert.ok(!/mk-benefit-grid|className="mk-benefit"/.test(page), "the old bordered cards are gone from /fundraising");
  const titles = [...page.matchAll(/\{ title: "([^"]+)", copy: "([^"]+)" \}/g)].map((m) => m[1]);
  assert.deepEqual(titles, ["Every athlete has a role.", "Every dollar moves you forward.", "Giving made simple.", "Show what you're building.", "Less admin. More coaching.", "Backed by your community."]);
  assert.match(page, /Built for the whole team\.<\/h2>\s*<p>Simple for coaches\. Easy for athletes\. Seamless for supporters\.<\/p>/);
  const css = read("src/app/marketing-product.css");
  assert.match(css, /\.mk-fbenefit-grid \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.mk-fbenefit \{[^}]*grid-template-columns: auto 28px minmax\(0, 1fr\)/);
  const benefitRules = css.slice(css.indexOf(".mk-fbenefits {"));
  assert.ok(!/\.mk-fbenefit[^{]*\{[^}]*(border|box-shadow)/.test(benefitRules), "no borders or shadows on the benefits");
});

test("/fundraising 'How ELF fundraising works': editorial four-step timeline, accurate step 1", () => {
  const page = read(`${MK}/fundraising/page.tsx`) + read("src/components/marketing/fundraising/FundraisingTop.tsx");
  assert.match(page, /How ELF fundraising works/);
  assert.match(page, /We make fundraising simple\./);
  const steps = [...page.matchAll(/\{ num: "(0\d)", title: "([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(steps, ["01 Launch Your Campaign", "02 Your Team Shares", "03 Watch It Grow", "04 Stay in Control"]);
  // Fundraising is enabled and configured with ELF (it starts off for self-created teams), so step 1
  // must read as a partnership, not as a coach self-launching or ELF doing everything alone.
  assert.match(page, /We work with you to get your team's branded campaign ready/);
  assert.match(page, /<ol className="mk-timeline">/);
  assert.ok(!/mk-three-steps|mk-four-steps/.test(page), "no generic step cards on /fundraising");
  const css = read("src/app/marketing-product.css");
  assert.match(css, /\.mk-timeline \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 900px\) \{\s*\.mk-timeline \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /prefers-reduced-motion: no-preference\) \{\s*@supports \(animation-timeline: view\(\)\)/);
});

test("/fundraising sample-fundraiser intro: new copy, sans-serif sentence-case headline, disclosure kept", () => {
  const page = read(`${MK}/fundraising/page.tsx`) + read("src/components/marketing/fundraising/FundraisingTop.tsx");
  assert.match(page, /<span className="mk-eyebrow">See ELF in action<\/span>/);
  assert.match(page, /<h2 id="mk-fund-preview" className="mk-fp-title">Your team\. Your fundraiser\.<\/h2>/);
  assert.match(page, /See what fundraising with ELF looks like\. Explore a sample campaign, switch between team\s+and athlete pages, and experience the platform your supporters will use\./);
  const css = read("src/app/marketing-product.css");
  assert.match(css, /\.mk-root \.mk-fp-title \{[^}]*font-family: inherit;[^}]*font-weight: 800;[^}]*text-transform: none;/);
  const ui = read("src/components/marketing/demo/FundraisingPreview.tsx");
  assert.match(ui, /<span className="mk-fp-badge">Live product preview<\/span>/);
  // The fictional-team disclosure stays visible: under the preview and inside it.
  assert.match(ui, /<p className="mk-fp-note">\s*\{SAMPLE_NOTICE\}/);
  assert.match(read("src/app/preview/fundraiser/page.tsx"), /Preview · \{SAMPLE_NOTICE\} Donations are turned off\./);
});

test("/product is now the free Team App page with the simulator", () => {
  const page = read(`${MK}/product/page.tsx`);
  assert.match(page, /<h1 id="mk-phero-title" className="mk-fhero-title">\s*One team\. One app\.<br \/> Everything connected\.\s*<\/h1>/);
  assert.match(page, /Bring coaches, athletes and parents together with messaging, schedules, attendance and\s+team updates &mdash; all in one free app\./);
  assert.match(page, /Free for every team &middot; No fundraiser required/);
  assert.match(page, /<section id="simulator"/);
  assert.match(page, /<TeamAppSimulator \/>/);
  assert.match(page, /<StoreBadges \/>/);
  assert.match(page, /<StoreBadges tone="light"/);
  assert.ok(!/const STAGES/.test(page), "walkthrough moved out");
});

test("/product redesign: Variation A headings, real app visual, numbered 10-feature grid, one closing band", () => {
  const page = read(`${MK}/product/page.tsx`);
  assert.ok(!/mk-display|mk-marker-underline|mk-app-hero-points|mk-benefit-grid|mk-partners-band/.test(page), "old hero blocks, cards and bands removed");
  // Hero visual is a real Coach Home capture of the fictional Sunridge QA
  // team (not a mock-up), labelled fictional; no Riverside sample left.
  assert.match(page, /src="\/marketing\/team-app-coach-home\.png"/);
  assert.match(page, /Sunridge Valley High School is a fictional sample team\./);
  assert.ok(!/Riverside/.test(page), "outdated Riverside capture replaced");
  assert.ok(existsSync("public/marketing/team-app-coach-home.png"), "hero capture committed");
  assert.match(page, /<h2 id="mk-sim-title" className="mk-va-title">See how your team stays connected\.<\/h2>/);
  assert.match(page, /<h2 id="mk-app-features" className="mk-fbenefits-title">Everything your team needs, in one place\.<\/h2>/);
  assert.match(page, /<ol className="mk-fbenefit-grid mk-fbenefit-grid-2">/);
  assert.equal((page.match(/\{ title: "/g) ?? []).length, 10, "all ten features kept");
  // One closing band: free message + Get Started + fundraising link + badges.
  assert.equal((page.match(/mk-cta-band/g) ?? []).length, 1);
  assert.match(page, /Your team deserves a better way to stay connected\./);
  assert.match(page, /<LinkButton href="\/demo" variant="yellow" size="lg">Get Started Free<\/LinkButton>/);
  assert.match(page, /href="\/fundraising"/);
  const css = read("src/app/marketing-product.css");
  assert.match(css, /\.mk-fbenefit-grid\.mk-fbenefit-grid-2 \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
});

// ── Store links ──────────────────────────────────────────────────────────────

test("store badges use the verified ELF Team listings and the official badge artwork only", () => {
  const badges = read("src/components/marketing/StoreBadges.tsx");
  assert.match(badges, /APP_STORE_URL = "https:\/\/apps\.apple\.com\/us\/app\/elf-team\/id6799780615"/);
  assert.match(badges, /GOOGLE_PLAY_URL = "https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.elitelevelfundraising\.team"/);
  assert.match(read("capacitor.config.ts"), /appId: 'com\.elitelevelfundraising\.team'/, "Play id matches the app package");
  for (const f of ["public/marketing/badges/app-store-badge.svg", "public/marketing/badges/google-play-badge.png"]) assert.ok(existsSync(join(ROOT, f)), f);
  assert.ok(!/<script|javascript:/i.test(read("public/marketing/badges/app-store-badge.svg")), "badge SVG is inert");
  // No other store URL anywhere in the marketing source.
  const files = execSync(`git ls-files "${MK}" src/components/marketing src/app/MarketingPage.tsx`, { cwd: ROOT }).toString().trim().split("\n").filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));
  for (const f of files) {
    const urls = read(f).match(/https:\/\/(apps\.apple\.com|play\.google\.com)[^"'\s]*/g) ?? [];
    for (const u of urls) assert.ok(f.endsWith("StoreBadges.tsx"), `${f} hard-codes a store URL: ${u}`);
  }
  assert.match(read("src/app/MarketingPage.tsx"), /<StoreBadges \/>/);
});

// ── Honest, factual copy ─────────────────────────────────────────────────────

test("the Team App is presented as free, with no fundraiser required", () => {
  assert.match(read("src/app/MarketingPage.tsx"), /Free for every team &mdash; no fundraiser required\./);
  assert.match(read(`${MK}/fundraising/page.tsx`), /Does my team have to run a fundraiser to use ELF\?/);
  assert.match(read(`${MK}/product/page.tsx`), /free for every team &mdash; no fundraiser required\./);
});

test("sponsors page: the approved structure and copy, approved type, real captures only", () => {
  const raw = read(`${MK}/sponsors/page.tsx`);
  const page = code(raw);
  assert.match(page, /<span className="mk-eyebrow">ELF Community Partners<\/span>/);
  assert.match(page, /Your next customers are cheering from the sidelines\./);
  assert.match(page, /Put your business in front of local sports families through the ELF Team App and team\s+fundraising pages\. Build recognition in your community while helping youth programs thrive\./);
  assert.match(page, /Flexible monthly partnerships\. No long-term commitment\./);
  assert.match(page, /<LinkButton href="#inquire" size="lg">Become a Community Partner<\/LinkButton>/);
  assert.match(page, /<a href="#placements" className="mk-fhero-link">See where your business appears/);
  for (const t of ["Good for your business. Great for your community.", "Reach local families.", "Stay part of the conversation.", "Support something that matters.",
    "Real placement. Real community visibility.", "Local advertising that fits your business.", "Monthly partnership options.",
    "No long-term commitment.", "Clear placement details before you begin."]) assert.ok(raw.includes(t), t);
  assert.match(page, /<LinkButton href="#inquire" size="lg">Ask About Monthly Options<\/LinkButton>/);
  assert.match(page, /Let&rsquo;s put your business on the team\./);
  assert.match(page, /Your business grows with the community\. Let&rsquo;s support both\./);
  assert.match(page, /id="placements"/);
  assert.match(page, /id="inquire"/);
  // Approved typography: Inter headings (Variation A classes), no condensed display face or old placeholders.
  assert.match(page, /className="mk-fhero-title"/);
  assert.ok(!/mk-display|mk-page-hero|mk-marker-underline|mk-partner-hero|CommunityPartnerSlots|SAMPLE_PARTNERS/.test(page), "no legacy layout or letter tiles");
  // Only the real captures of the fictional sample.
  const images = [...new Set([...raw.matchAll(/src="([^"]+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(images, ["/marketing/partners-fundraising-page.png", "/marketing/partners-fundraising-section.png", "/marketing/partners-team-app.png"]);
  for (const img of images) assert.ok(existsSync(join(ROOT, "public", img)), img);
  assert.match(page, /Sunridge Valley High School and every business shown on this page are fictional samples\./);
});

test("sponsors page: accurate — no prices, numbers or promises; placements confirmed; partners distinct from team sponsors", () => {
  const page = code(read(`${MK}/sponsors/page.tsx`));
  assert.ok(!/\$\s?\d/.test(page), "no dollar amounts");
  // "Guarantee" only ever appears negated ("don't guarantee placement").
  for (const word of [/impressions?/i, /exclusiv/i, /(?<!don(?:&rsquo;|')t )guarantee/i, /\breach(es)?\s+(of\s+)?[\d,]+/i, /\breaches\b/i, /conversion/i, /\bROI\b/, /\d[\d,]*\+?\s*(views|families|parents|users|people|visitors|teams|schools)/i, /per month/i, /fee[- ]free|no (service )?fees?/i, /testimonial/i]) {
    assert.ok(!word.test(page.replace(/\s+/g, " ")), `forbidden claim ${word}`);
  }
  // Platform-wide rotation: no school, team or area targeting; preferences never guaranteed.
  assert.match(page, /ELF\s+Community Partners rotate across participating schools &mdash; placement isn&rsquo;t tied to\s+a particular school, team or area\./);
  assert.match(page, /Preferences help us plan, but they don&rsquo;t\s+guarantee placement in a specific area or at a specific school\./);
  assert.match(page, /we confirm the placements included in your\s+partnership before it begins/);
  assert.match(page, /walk you through\s+available partnership options and where your business can appear\./);
  assert.ok(!/available teams|teams you&rsquo;d like to support|communities you&rsquo;d like to support|select (your )?(teams|schools)/i.test(page), "no team selection");
  // Until the cancellation agreement is final: no cancellation or refund mechanics.
  assert.ok(!/cancel|refund|month-to-month/i.test(page), "no cancellation or refund wording");
  assert.match(page, /separate from the sponsors a team\s+manages itself, which teams list under Team Sponsors/);
  assert.match(page, /Featured placement may also be available\./);
  // The working inquiry form: same component, field mapping, endpoint and
  // validation — only the reused field's label/placeholder and the thank-you
  // copy changed (community preference, not team selection).
  assert.match(page, /<PartnerInquiryForm \/>/);
  const form = read("src/components/marketing/PartnerInquiryForm.tsx");
  assert.match(form, /inquiryType: "partner"/);
  assert.match(form, /fetch\("\/api\/marketing\/demo-request"/);
  assert.match(form, /sportProgram: String\(data\.get\("teams"\) \|\| ""\),/);
  assert.match(form, /\{field\("teams", "Preferred community or area \(optional\)", \{ placeholder: "e\.g\. North Phoenix" \}\)\}/);
  assert.ok(!/School or team you'd like to support|teams you&rsquo;d like to support/.test(form));
  const required = [...form.matchAll(/field\("(\w+)"[^)]*required: true/g)].map((m) => m[1]);
  assert.deepEqual(required, ["businessName", "firstName", "lastName", "email"], "required fields unchanged");
  assert.equal(execSync(`git diff --stat 51f5652 -- "src/app/api/marketing" src/lib/email.ts src/lib/platform/marketingDemoRequests.ts`, { cwd: ROOT }).toString().trim(), "", "endpoint, email and CRM unchanged");
});

test("no invented testimonials, customer counts or results on the redesigned pages", () => {
  for (const f of ["src/app/MarketingPage.tsx", `${MK}/fundraising/page.tsx`, `${MK}/product/page.tsx`, `${MK}/sponsors/page.tsx`]) {
    const src = code(read(f)).replace(/className="[^"]*"/g, ""); // class names aren't copy
    assert.ok(!/testimonial|5[- ]star|trusted by|\d{2,}\+?\s*(schools|teams|programs|customers)|raised over|\d+%\s*(more|increase)/i.test(src), f);
  }
});

test("the redesign stylesheet never restyles a class the existing marketing pages already use", () => {
  // (A collision here once restyled ProductPreview's .mk-preview-frame on
  // /communication and /how-it-works.) Shared classes are allowed only when
  // the rule is scoped under one of the redesign's own containers.
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = (f: string) => strip(read(f)).split("}").map((r) => r.split("{")[0]).filter((s) => s && !s.includes("@"))
    .flatMap((s) => s.split(",").map((p) => p.trim())).filter(Boolean);
  const existing = new Set(rules("src/app/marketing.css").flatMap((s) => (s.match(/\.(mk-[a-z0-9-]+)/g) ?? []).map((c) => c.slice(1))));
  const scopedBy = /^\.(mk-btn-on-dark|mk-form-card|mk-gate-card|mk-page-hero|mk-root|mk-nav-links|mk-fhero-actions|mk-fhero|mk-fbenefits|mk-fund-faq|mk-home-section\.mk-fund-faq|mk-phero|mk-pclose)\b/;
  for (const sel of rules("src/app/marketing-product.css")) {
    const target = (sel.match(/\.(mk-[a-z0-9-]+)/g) ?? []).pop()?.slice(1);
    if (target && existing.has(target)) assert.ok(scopedBy.test(sel), `marketing-product.css restyles existing .${target}: "${sel}"`);
  }
});

// ── Demo data isolation ──────────────────────────────────────────────────────

const DEMO_FILES = [
  "src/components/marketing/demo/fixtures.ts",
  "src/components/marketing/demo/TeamAppSimulator.tsx",
  "src/components/marketing/demo/SampleCampaign.tsx",
  "src/components/marketing/demo/FundraisingPreview.tsx",
  "src/app/preview/fundraiser/page.tsx",
];

test("demo/preview code never imports anything that can reach a server, session, payment or email", () => {
  const forbidden = /from\s+["'](?:[^"']*\/_client|[^"']*\/api\/|[^"']*stripe[^"']*|[^"']*supabase[^"']*|@\/lib\/email|[^"']*rateLimit|[^"']*accountAuth|[^"']*session[^"']*|next\/headers|[^"']*platform\/(?!communityPartnerSlots)[^"']*|[^"']*demoPersonas|[^"']*demoTemplates)["']/i;
  for (const f of DEMO_FILES) {
    for (const line of read(f).split("\n").filter((l) => /^\s*import /.test(l))) assert.ok(!forbidden.test(line), `${f}: ${line}`);
  }
  // Only the preview's own lead form may make a request, and only to the lead endpoint.
  for (const f of DEMO_FILES) {
    const src = code(read(f));
    const calls = src.match(/\bfetch\(\s*["'`]([^"'`]*)/g) ?? [];
    if (f.endsWith("FundraisingPreview.tsx")) assert.deepEqual(calls, [`fetch("/api/marketing/preview-lead`]);
    else assert.deepEqual(calls, [], `${f} makes a request`);
    assert.ok(!/XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.clipboard/.test(src), `${f} uses a network/clipboard API`);
  }
  for (const f of ["src/components/marketing/demo/TeamAppSimulator.tsx", "src/components/marketing/demo/SampleCampaign.tsx"]) {
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code(read(f))), `${f} persists data`);
  }
});

test("the sample campaign is the real page component with donations disabled and no photo requests", () => {
  const sample = read("src/components/marketing/demo/SampleCampaign.tsx");
  assert.match(sample, /import PublicCampaignPage from "@\/app\/campaign\/_shared\/PublicCampaignPage"/);
  assert.match(sample, /handleDonate=\{\(\) => setDonateError\(PREVIEW_DONATE_MESSAGE\)\}/);
  assert.match(sample, /donating=\{false\}/);
  // Sample imagery comes from static files via the optional resolvers, never the photo API.
  assert.match(sample, /athletePhotoSrcFor=\{samplePortraitFor\}/);
  assert.match(sample, /avatarSrcFor=\{sampleAvatarFor\}/);
  assert.match(sample, /logoUrl=\{SAMPLE_TEAM\.logoUrl\}/);
  for (const a of SAMPLE_ATHLETES) assert.match(samplePortraitFor(a.id)!, /^\/marketing\/demo\/people\/[a-z-]+\.svg$/);
  // The live campaign page: same photo route by default, initials when no avatar resolver.
  const pcp = read("src/app/campaign/_shared/PublicCampaignPage.tsx");
  assert.match(pcp, /const src = srcFor \? srcFor\(athlete\.id\) : athletePhotoSrc\(slug, athlete\.id\);/);
  assert.match(pcp, /: <span className="pc-lb-avatar">\{initials\(person\.name\)\}<\/span>;/);
  assert.ok(!/athletePhotoSrcFor|avatarSrcFor/.test(read("src/app/campaign/_shared/CampaignPageClient.tsx")), "real pages never pass sample imagery");
});

test("sample artwork: crest, a portrait for every person, and all 21 partner positions filled with unique fictional businesses", () => {
  const pub = (url: string) => join(ROOT, "public", url);
  assert.ok(existsSync(pub(SAMPLE_TEAM.logoUrl)), "crest");
  for (const p of [...SAMPLE_ATHLETES, ...SAMPLE_COACHES]) {
    assert.ok(existsSync(pub(samplePortrait(p.image))), p.name);
    assert.ok(existsSync(pub(sampleAvatar(p.image))), p.name);
  }
  for (const d of SAMPLE_DONATIONS) assert.ok(existsSync(pub(sampleAvatarFor({ name: d.name })!)), d.name);
  assert.equal(SAMPLE_PREVIEW_PARTNERS.length, COMMUNITY_PARTNER_SLOT_COUNT, "every position filled");
  assert.equal(new Set(SAMPLE_PREVIEW_PARTNERS.map((p) => p.business_name)).size, COMMUNITY_PARTNER_SLOT_COUNT, "unique names");
  assert.equal(new Set(SAMPLE_PREVIEW_PARTNERS.map((p) => p.logo_url)).size, COMMUNITY_PARTNER_SLOT_COUNT, "unique logos");
  for (const p of SAMPLE_PREVIEW_PARTNERS) {
    assert.equal(p.website_url, null, `${p.business_name} links nowhere`);
    assert.ok(existsSync(pub(p.logo_url)), p.logo_url);
    assert.ok(!/<script|<image|href=/i.test(readFileSync(pub(p.logo_url), "utf8")), `${p.logo_url} is inert, self-contained artwork`);
  }
  // The first six keep the names used elsewhere on the site (Sponsors page).
  assert.deepEqual(SAMPLE_PREVIEW_PARTNERS.slice(0, SAMPLE_PARTNERS.length).map((p) => p.business_name), SAMPLE_PARTNERS.map((p) => p.business_name));
  assert.match(read("src/components/marketing/demo/SampleCampaign.tsx"), /communityPartners=\{SAMPLE_PREVIEW_PARTNERS\}/);
});

test("fictional data: no real websites, emails or URLs, and every surface labels the data as a sample", () => {
  const fx = read("src/components/marketing/demo/fixtures.ts");
  const partners = fx.match(/export const SAMPLE_PARTNERS = \[([\s\S]*?)\];/)![1];
  assert.equal((partners.match(/website_url: null, logo_url: null/g) ?? []).length, (partners.match(/business_name:/g) ?? []).length);
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(fx), "no email addresses in sample data");
  assert.ok(!/https?:\/\//.test(fx), "no URLs in sample data");
  for (const f of ["src/app/preview/fundraiser/page.tsx", "src/components/marketing/demo/TeamAppSimulator.tsx", "src/components/marketing/demo/FundraisingPreview.tsx"]) {
    assert.match(read(f), /SAMPLE_NOTICE/, f);
  }
});

test("the preview route is never indexed", () => {
  assert.match(read("src/app/preview/fundraiser/page.tsx"), /robots: \{ index: false, follow: false \}/);
  assert.match(read("src/app/robots.ts"), /"\/preview"/);
  assert.ok(!read("src/app/sitemap.ts").includes("/preview"));
});

test("simulator: three roles, a reset and the isolated Team App demo in the phone frame", () => {
  const sim = read("src/components/marketing/demo/TeamAppSimulator.tsx");
  assert.deepEqual([...sim.matchAll(/\{ id: "(coach|athlete|parent)", label: "([^"]+)"/g)].map((m) => m[2]), ["Coach", "Athlete", "Parent"]);
  assert.match(sim, /Reset demo/);
  assert.match(sim, /role="tablist" aria-label="Choose a view"/);
  assert.match(sim, /onKeyDown=\{\(e\) => onTabKey/);
  // The phone shows the isolated demo page (see team-app-demo/teamAppDemo.test.ts).
  assert.match(sim, /<iframe[\s\S]*?src=\{src\}[\s\S]*?title="Interactive ELF Team App demo/);
  assert.match(sim, /setSrc\(`\$\{DEMO_PAGE_PATH\}\?role=\$\{start\}&embed=1`\)/);
  // No RSVP: the production app has no RSVP feature, so the demo doesn't fake one.
  assert.ok(!/rsvp/i.test(sim));
  assert.match(read("src/app/marketing-product.css"), /@media \(prefers-reduced-motion: no-preference\)/);
});

test("/product attendance copy matches the app: coach-managed, no athlete absence reporting", () => {
  const page = read(`${MK}/product/page.tsx`);
  assert.match(page, /title: "Attendance", copy: "Coaches take attendance in a few taps and record a reason for each absence\. Athletes and parents can see their own absences on the athlete's profile\."/);
  assert.ok(!/report absences|ahead of time/i.test(page));
});

// ── Lead gate rules ──────────────────────────────────────────────────────────

test("validation: full name and email required, email normalized, consent strictly optional boolean", () => {
  assert.deepEqual(validatePreviewLead({ fullName: "  Pat   Lee ", email: " Pat.Lee@Example.COM " }),
    { ok: true, value: { fullName: "Pat Lee", email: "pat.lee@example.com", marketingConsent: false } });
  assert.deepEqual(validatePreviewLead({ fullName: "Pat Lee", email: "pat@example.com", marketingConsent: true }),
    { ok: true, value: { fullName: "Pat Lee", email: "pat@example.com", marketingConsent: true } });
  const missing = validatePreviewLead({});
  assert.equal(missing.ok, false);
  assert.ok(!missing.ok && missing.errors.fullName && missing.errors.email);
  for (const email of ["nope", "a@b", "a*b@example.com", "a,b@example.com", "a(b)@example.com", "x".repeat(195) + "@ex.com"]) {
    assert.equal(validatePreviewLead({ fullName: "Pat", email }).ok, false, email);
  }
  assert.equal(validatePreviewLead({ fullName: "<script>", email: "p@example.com" }).ok, false);
  assert.equal(validatePreviewLead({ fullName: "x".repeat(121), email: "p@example.com" }).ok, false);
  assert.equal(validatePreviewLead({ fullName: "Pat", email: "p@example.com", marketingConsent: "true" }).ok, false, "consent must be a real boolean");
  assert.equal(normalizeEmail("  A@B.Co "), "a@b.co");
  assert.equal(likeExact("a_b%c\\d@x.com"), "a\\_b\\%c\\\\d@x.com");
});

test("abuse protection: honeypot, same-origin, and the gate stays off until every dependency exists", () => {
  assert.equal(isBot({ website: "http://spam" }), true);
  assert.equal(isBot({ website: "" }), false);
  assert.equal(isSameOrigin("https://www.elitelevelfundraising.com", "www.elitelevelfundraising.com"), true);
  assert.equal(isSameOrigin("https://evil.example", "www.elitelevelfundraising.com"), false);
  assert.equal(isSameOrigin(null, "www.elitelevelfundraising.com"), false);
  const full = {
    UPSTASH_REDIS_REST_URL: "u", UPSTASH_REDIS_REST_TOKEN: "t", DEMO_NOTIFICATION_EMAIL: "biz@example.com",
    SUPABASE_SERVICE_ROLE_KEY: "k", NEXT_PUBLIC_SUPABASE_URL: "https://x", MARKETING_PREVIEW_LEAD_GATE: "on",
  };
  assert.deepEqual(previewLeadReadiness(full), { ready: true, missing: [] });
  for (const key of Object.keys(full)) {
    assert.equal(previewLeadReadiness({ ...full, [key]: undefined }).ready, false, `ready without ${key}`);
  }
  assert.equal(previewLeadReadiness({ ...full, MARKETING_PREVIEW_LEAD_GATE: "true" }).ready, false);

  const route = code(read("src/app/api/marketing/preview-lead/route.ts"));
  const order = ["previewLeadReadiness(", "isSameOrigin(", "isBot(", "consumeRateLimitStrict(", "validatePreviewLead(", "recordPreviewLead("].map((s) => route.indexOf(s));
  assert.ok(order.every((i) => i >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]), "checks run in order, before any write");
  assert.ok(!/consumeRateLimit\(/.test(route), "never the fail-open limiter");
  assert.match(route, /notifyTo: process\.env\.DEMO_NOTIFICATION_EMAIL as string/);
  assert.match(read("src/lib/rateLimit.ts"), /consumeRateLimitStrict[\s\S]*?failing closed[\s\S]*?allowed: false/);
});

function fakeStore(existing: { id: string; marketing_consent: boolean | null } | null, opts: { failCreate?: boolean } = {}) {
  const calls: { op: string; args: unknown[] }[] = [];
  const store: PreviewLeadStore = {
    async findContactByEmail(email) { calls.push({ op: "find", args: [email] }); return existing; },
    async createContact(input) { calls.push({ op: "create", args: [input] }); if (opts.failCreate) throw new Error("db down"); return { id: "new-1" }; },
    async addActivity(id, title, body) { calls.push({ op: "activity", args: [id, title, body] }); },
    async recordConsent(id, consent: ConsentRecord) { calls.push({ op: "consent", args: [id, consent] }); },
  };
  return { store, calls };
}

const NOW = () => new Date("2026-10-30T12:00:00Z");

test("new lead: one CRM contact (source Fundraising Preview), one activity, business inbox notified", async () => {
  const { store, calls } = fakeStore(null);
  const sent: { to: string; email: string }[] = [];
  const r = await recordPreviewLead({ fullName: "Pat Lee", email: "pat@example.com", marketingConsent: false },
    { store, notify: async (p) => { sent.push(p); }, notifyTo: "biz@example.com", now: NOW });
  assert.deepEqual(r, { contactId: "new-1", isNewContact: true, notified: true });
  assert.deepEqual(calls.map((c) => c.op), ["find", "create", "activity"]);
  assert.deepEqual(calls[1].args[0], { name: "Pat Lee", email: "pat@example.com", source: PREVIEW_LEAD_SOURCE, consent: null });
  assert.equal(PREVIEW_LEAD_SOURCE, "Fundraising Preview");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "biz@example.com", "only the configured business inbox");
  assert.notEqual(sent[0].to, "pat@example.com");
});

test("opt-in is recorded with time, exact wording and source; opting out records nothing", async () => {
  const { store, calls } = fakeStore(null);
  await recordPreviewLead({ fullName: "Pat Lee", email: "pat@example.com", marketingConsent: true },
    { store, notify: async () => {}, notifyTo: "biz@example.com", now: NOW });
  assert.deepEqual((calls[1].args[0] as { consent: ConsentRecord }).consent,
    { at: "2026-10-30T12:00:00.000Z", text: MARKETING_CONSENT_TEXT, source: "Fundraising Preview (preview-v1)" });
});

test("existing contact (same normalized email): nothing overwritten, activity logged, consent only ever added", async () => {
  for (const [priorConsent, newConsent, expectConsentWrite] of [[false, true, true], [true, true, false], [false, false, false], [true, false, false]] as const) {
    const { store, calls } = fakeStore({ id: "c-9", marketing_consent: priorConsent });
    const r = await recordPreviewLead({ fullName: "Different Name", email: "pat@example.com", marketingConsent: newConsent },
      { store, notify: async () => {}, notifyTo: "biz@example.com", now: NOW });
    assert.equal(r.isNewContact, false);
    assert.ok(!calls.some((c) => c.op === "create"), "never creates a duplicate");
    assert.equal(calls.some((c) => c.op === "consent"), expectConsentWrite, `prior=${priorConsent} new=${newConsent}`);
    const activity = calls.find((c) => c.op === "activity")!;
    assert.equal(activity.args[0], "c-9");
    assert.match(String(activity.args[2]), /Existing contact — details left unchanged\./);
  }
  // The store interface has no general "update contact" — the only write to an
  // existing contact is recordConsent (opt-in fields only).
  assert.deepEqual(Object.keys(fakeStore(null).store).sort(), ["addActivity", "createContact", "findContactByEmail", "recordConsent"]);
  const storage = read("src/lib/platform/previewLeads.ts");
  const updates = storage.match(/restUpdate\([^,]+,\s*\{([\s\S]*?)\}\)/g) ?? [];
  assert.equal(updates.length, 1);
  assert.deepEqual([...updates[0].matchAll(/(\w+):/g)].map((m) => m[1]).filter((k) => k !== "eq"),
    ["marketing_consent", "marketing_consent_at", "marketing_consent_text", "marketing_consent_source", "updated_at"]);
});

test("a failed notification never loses the lead; a failed CRM write is reported, not swallowed", async () => {
  const ok = fakeStore(null);
  const r = await recordPreviewLead({ fullName: "Pat", email: "p@example.com", marketingConsent: false },
    { store: ok.store, notify: async () => { throw new Error("resend down"); }, notifyTo: "biz@example.com", now: NOW });
  assert.equal(r.notified, false);
  assert.deepEqual(ok.calls.map((c) => c.op), ["find", "create", "activity"]);
  const bad = fakeStore(null, { failCreate: true });
  await assert.rejects(recordPreviewLead({ fullName: "Pat", email: "p@example.com", marketingConsent: false },
    { store: bad.store, notify: async () => {}, notifyTo: "biz@example.com", now: NOW }));
});

test("preview access never depends on consent: unchecked by default, unlocks on success regardless", () => {
  const ui = read("src/components/marketing/demo/FundraisingPreview.tsx");
  assert.match(ui, /name="marketingConsent" type="checkbox" defaultChecked=\{false\}/);
  assert.ok(!/required[^>]*marketingConsent|marketingConsent[^>]*required/.test(ui));
  assert.match(ui, /if \(res\.ok && json\.ok\) \{\s*onUnlocked\(\);/);
  assert.match(ui, /href="\/trust\/privacy"/);
  // Gate is evaluated from the same readiness rules as the endpoint.
  assert.match(read(`${MK}/fundraising/page.tsx`), /const GATE_ENABLED = previewLeadReadiness\(process\.env\)\.ready;/);
});

test("consent migration is additive only and not referenced by any applied-migration list", () => {
  const sql = read("supabase/migrations/phase_m1_crm_marketing_consent.sql").replace(/--.*$/gm, "");
  assert.ok(!/\b(DROP|DELETE|UPDATE|TRUNCATE|RENAME)\b/i.test(sql), "no destructive statements");
  for (const col of ["marketing_consent ", "marketing_consent_at", "marketing_consent_text", "marketing_consent_source"]) assert.ok(sql.includes(`ADD COLUMN IF NOT EXISTS ${col}`), col);
});

// ── Partner inquiries and email safety ───────────────────────────────────────

test("partner inquiries: role fixed server-side, business inbox notified, no email to the visitor's address", () => {
  const route = code(read("src/app/api/marketing/demo-request/route.ts"));
  assert.match(route, /const isPartner = body\.inquiryType === "partner";/);
  assert.match(route, /const role = isPartner \? PARTNER_ROLE : clean\(body\.role, MAX_FIELD\);/);
  assert.match(route, /if \(!isPartner\) \{\s*try \{\s*await sendDemoRequestConfirmation/);
  assert.match(route, /kind: isPartner \? "partner" : "demo"/);
});

test("visitor text is HTML-escaped in every marketing notification email", () => {
  assert.equal(escapeHtml(`<b onclick="x">Tom & 'Jo'</b>`), "&lt;b onclick=&quot;x&quot;&gt;Tom &amp; &#39;Jo&#39;&lt;/b&gt;");
  const email = read("src/lib/email.ts");
  for (const fn of ["sendDemoRequestNotification", "sendPreviewLeadNotification"]) {
    const body = email.slice(email.indexOf(`export async function ${fn}`));
    const html = body.slice(body.indexOf("const html = `"), body.indexOf("</html>`;"));
    assert.ok(html.length > 0, fn);
    assert.ok(!/\$\{p\./.test(html), `${fn}: no raw visitor field in the HTML`);
    // Detail rows go through the escaping renderer.
    assert.match(body.slice(0, body.indexOf("const html = `")), /detailRowsHtml\(/, fn);
  }
  assert.match(email, /escapeHtml\(p\.message\)/);
  assert.match(email, /function detailRowsHtml[\s\S]*?escapeHtml\(label\)[\s\S]*?escapeHtml\(value\)/);
});

test("/fundraising benefit numerals: 48px between 901 and 1500px, 56px wider, dash re-centred", () => {
  const css = read("src/app/marketing-product.css");
  assert.match(css, /@media \(min-width: 901px\) and \(max-width: 1500px\) \{\s*\.mk-fbenefit-num \{ font-size: 3rem; \}\s*\.mk-fbenefit-rule \{ margin-top: 1\.33rem; \}\s*\}/);
  assert.match(css, /\.mk-fbenefit-num \{[^}]*font-size: 3\.5rem;/);
});

test("buttons: 12px radius on every marketing page via the shared .mk-btn; campaign and Team App untouched", () => {
  const base = read("src/app/marketing.css");
  assert.match(base, /\.mk-btn \{[^}]*border-radius: var\(--mk-btn-radius, var\(--mk-radius-md\)\);/);
  const css = read("src/app/marketing-product.css");
  assert.match(css, /\.mk-root \{ --mk-btn-radius: 12px; \}/);
  assert.match(css, /\.mk-root \.mk-btn:focus-visible \{ border-radius: var\(--mk-btn-radius\); \}/);
  assert.match(css, /\.mk-seg \{[^}]*border-radius: 12px; overflow: hidden;/);
  assert.match(css, /\.mk-sim-reset \{[^}]*border-radius: var\(--mk-btn-radius\);/);
  // Every marketing CTA / form submit goes through the shared button (no one-off <a className="mk-btn ...">
  // outside the nav and Button component).
  const files = execSync(`git ls-files "${MK}" src/components/marketing src/app/MarketingPage.tsx`, { cwd: ROOT }).toString().trim().split("\n")
    .filter((f) => f.endsWith(".tsx") && !/Button\.tsx$|MarketingNav\.tsx$/.test(f));
  for (const f of files) assert.ok(!/className="mk-btn /.test(read(f)) || f.endsWith("FundraisingPreview.tsx"), `${f} hand-rolls a .mk-btn`);
  // The real campaign page (and the sample fundraiser inside the preview) never sees the variable;
  // .mk-root only exists inside the marketing shell, so the Team App and admin are unaffected.
  assert.ok(!read("src/app/campaign/_shared/campaign.css").includes("--mk-btn-radius"));
  assert.match(read("src/components/marketing/MarketingShell.tsx"), /mk-root/);
});

test("/fundraising FAQ is compact and scoped; the shared FAQ list and /faq are unchanged", () => {
  const page = read(`${MK}/fundraising/page.tsx`);
  assert.match(page, /<section className="mk-home-section mk-home-alt mk-fund-faq" aria-labelledby="mk-fund-faq">/);
  assert.match(page, /<FaqList items=\{FAQS\} \/>/);
  assert.equal((page.match(/\{ q: "/g) ?? []).length, 6, "all six questions kept");
  const css = read("src/app/marketing-product.css");
  assert.match(css, /\.mk-home-section\.mk-fund-faq \{ padding: var\(--mk-space-16\) 0; \}/);
  assert.match(css, /\.mk-fund-faq \.mk-faq-item summary \{ padding: 19px 0; \}/);
  // Base FAQ styles (used on /faq) untouched.
  assert.match(read("src/app/marketing.css"), /\.mk-faq-item summary \{[^}]*padding: var\(--mk-space-6\) 0;/);
  assert.ok(!read(`${MK}/faq/page.tsx`).includes("mk-fund-faq"));
});
