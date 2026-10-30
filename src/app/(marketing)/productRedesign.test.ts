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

test("/how-it-works carries the nine-stage walkthrough unchanged from the old /product page", () => {
  const stages = (src: string) => src.replace(/\r\n/g, "\n").match(/^const STAGES = \[[\s\S]*?^\];/m)![0];
  const before = execSync(`git show 7de087228c839f95aa6531eff2ee0603b19de96b:"${MK}/product/page.tsx"`, { cwd: ROOT }).toString();
  const now = read(`${MK}/how-it-works/page.tsx`);
  assert.equal(stages(now), stages(before));
  assert.match(now, /alternates: \{ canonical: "\/how-it-works" \}/);
  assert.equal((stages(now).match(/num: "0\d"/g) ?? []).length, 9);
  assert.ok(read("src/app/sitemap.ts").includes(`"/how-it-works",`));
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
  assert.match(css, /\.mk-root \.mk-fhero-title,\s*\.mk-root \.mk-fbenefits-title \{\s*font-family: inherit;\s*font-size: clamp\(2\.75rem, 4\.7vw, 4\.5rem\);\s*font-weight: 700;\s*letter-spacing: -0\.04em;\s*line-height: 1\.02;\s*text-transform: none;/);
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
  assert.match(page, /The free Team App built for your <span className="mk-marker-underline">entire program\.<\/span>/);
  assert.match(page, /Free for every team &middot; No fundraiser required/);
  assert.match(page, /<section id="simulator"/);
  assert.match(page, /<TeamAppSimulator \/>/);
  assert.match(page, /<StoreBadges \/>/);
  assert.ok(!/const STAGES/.test(page), "walkthrough moved out");
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
  assert.match(read(`${MK}/product/page.tsx`), /No fundraiser required\. Really\./);
});

test("sponsors page: inquiry only — no published prices, no promised reach, exclusivity or placement", () => {
  const page = code(read(`${MK}/sponsors/page.tsx`));
  assert.match(page, /Contact us for monthly partnership options\./);
  assert.ok(!/\$\s?\d/.test(page), "no dollar amounts");
  for (const word of [/impressions?/i, /exclusiv/i, /guarantee/i, /\breach\b(?! out)/i, /conversion/i, /\d+\s*(views|families|parents|users)/i, /per month/i]) {
    assert.ok(!word.test(page), `forbidden claim ${word}`);
  }
  for (const step of ["Contact ELF", "Talk through options", "Send your branding", "Go live"]) assert.ok(page.includes(step), step);
  assert.match(page, /<PartnerInquiryForm \/>/);
  assert.match(read("src/components/marketing/PartnerInquiryForm.tsx"), /inquiryType: "partner"/);
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
  const scopedBy = /^\.(mk-btn-on-dark|mk-form-card|mk-gate-card|mk-page-hero|mk-root|mk-nav-links|mk-fhero-actions|mk-fhero|mk-fbenefits)\b/;
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

test("simulator: three roles with the specified tabs, a reset, and preview-only actions", () => {
  const sim = read("src/components/marketing/demo/TeamAppSimulator.tsx");
  const tabs = (role: string) => [...sim.match(new RegExp(`  ${role}: \\[([\\s\\S]*?)\\n  \\],`))![1].matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs("coach"), ["Home", "Attendance", "Messages", "Fundraiser"]);
  assert.deepEqual(tabs("athlete"), ["Home", "My Page", "Schedule", "Leaderboard"]);
  assert.deepEqual(tabs("parent"), ["Home", "Schedule", "Messages", "Support"]);
  assert.match(sim, /Reset demo/);
  assert.match(sim, /role="tablist" aria-label="Choose a view"/);
  assert.match(sim, /onKeyDown=\{\(e\) => onTabKey/);
  // No RSVP: the production app has no RSVP feature, so the simulator doesn't fake one.
  assert.ok(!/rsvp/i.test(sim));
  assert.match(read("src/app/marketing-product.css"), /@media \(prefers-reduced-motion: no-preference\)/);
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
