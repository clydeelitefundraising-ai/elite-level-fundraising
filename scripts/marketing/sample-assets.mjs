// Generates the FICTIONAL sample artwork used by the marketing site's
// interactive fundraising preview (public/marketing/demo/). Everything is
// original, hand-built SVG: an invented school crest, illustrated (not
// photographic) athlete / coach / donor portraits, and logos for invented
// local businesses. No real people, schools, businesses or trademarks.
//
//   node scripts/marketing/sample-assets.mjs
//
// The names here must match src/components/marketing/demo/fixtures.ts
// (productRedesign.test.ts checks every referenced file exists).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "..", "public", "marketing", "demo");
mkdirSync(join(OUT, "people"), { recursive: true });
mkdirSync(join(OUT, "partners"), { recursive: true });

const NAVY = "#1D3E8A";
const GOLD = "#F2B705";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const write = (rel, svg) => writeFileSync(join(OUT, rel), svg.trim() + "\n");

// ── School crest ─────────────────────────────────────────────────────────────
write("sunridge-comets-logo.svg", `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="Sunridge Valley Comets crest (fictional)">
  <title>Sunridge Valley Comets (fictional)</title>
  <circle cx="120" cy="120" r="116" fill="${NAVY}"/>
  <circle cx="120" cy="120" r="104" fill="none" stroke="${GOLD}" stroke-width="6"/>
  <circle cx="120" cy="120" r="92" fill="#16306D"/>
  <!-- comet tail -->
  <path d="M42 150 C 80 120, 118 104, 150 92 L 158 106 C 124 116, 88 132, 50 164 Z" fill="${GOLD}" opacity=".55"/>
  <path d="M56 170 C 92 140, 126 124, 154 112 L 160 124 C 132 134, 100 150, 64 180 Z" fill="${GOLD}" opacity=".85"/>
  <path d="M36 128 C 78 104, 116 92, 146 84 L 150 96 C 118 102, 80 114, 40 140 Z" fill="#FFFFFF" opacity=".35"/>
  <!-- comet head (star) -->
  <path d="M168 66 L178 92 L206 94 L184 111 L192 138 L168 122 L144 138 L152 111 L130 94 L158 92 Z" fill="${GOLD}" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round"/>
  <text x="120" y="176" text-anchor="middle" font-family="'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="29" letter-spacing="2" fill="#FFFFFF">COMETS</text>
  <text x="120" y="195" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="11" letter-spacing="2.5" fill="${GOLD}">SUNRIDGE VALLEY</text>
</svg>`);

// ── Illustrated portraits ────────────────────────────────────────────────────
// One drawing per person; the 4:5 portrait and the square avatar are the same
// drawing with different viewBoxes, so they always match.
const SHADE = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * (1 - amt))));
  return `#${[c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

function hair(style, color) {
  switch (style) {
    case "buzz":
      return `<path d="M122 200 C 112 86, 288 86, 278 200 C 262 160, 236 148, 200 148 C 164 148, 138 160, 124 196 Z" fill="${color}" opacity=".85"/>`;
    case "curly":
      return [[134, 168], [152, 146], [176, 134], [200, 130], [224, 134], [248, 146], [266, 168], [142, 190], [258, 190]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="24" fill="${color}"/>`).join("");
    case "fade":
      return `<path d="M124 204 C 110 84, 290 84, 276 204 C 268 176, 262 168, 254 164 C 236 144, 164 144, 146 164 C 138 168, 132 176, 126 200 Z" fill="${color}"/>
              <path d="M124 206 C 124 190, 128 180, 134 172 L 134 214 Z M276 206 C 276 190, 272 180, 266 172 L 266 214 Z" fill="${color}" opacity=".45"/>`;
    case "wavy":
      return `<path d="M116 212 C 102 78, 298 76, 284 212 C 276 186, 266 172, 252 170 C 240 156, 226 166, 212 156 C 198 166, 184 154, 170 164 C 156 156, 140 170, 130 182 C 124 190, 120 200, 118 210 Z" fill="${color}"/>`;
    case "sidepart":
      return `<path d="M118 208 C 102 80, 298 76, 282 206 C 276 182, 270 170, 260 164 C 230 150, 190 168, 150 160 C 136 168, 126 184, 120 206 Z" fill="${color}"/>
              <path d="M150 160 C 170 150, 200 146, 230 152" stroke="${SHADE(color, -0.6)}" stroke-width="3" fill="none" opacity=".5"/>`;
    case "fringe":
      return `<path d="M116 216 C 100 82, 300 82, 284 216 L 276 184 C 250 172, 150 172, 124 184 Z" fill="${color}"/>`;
    case "ponytail":
      return `<ellipse cx="292" cy="250" rx="30" ry="62" transform="rotate(-18 292 250)" fill="${color}"/>
              <path d="M116 216 C 100 80, 300 80, 284 216 C 276 178, 262 160, 240 156 C 214 150, 186 150, 160 156 C 138 160, 124 178, 118 214 Z" fill="${color}"/>
              <rect x="268" y="176" width="16" height="12" rx="4" fill="${GOLD}"/>`;
    case "shoulder":
      return `<path d="M112 300 C 96 210, 104 116, 200 112 C 296 116, 304 210, 288 300 L 268 300 C 276 240, 270 190, 254 168 C 226 150, 174 150, 146 168 C 130 190, 124 240, 132 300 Z" fill="${color}"/>`;
    case "bun":
      return `<circle cx="200" cy="100" r="34" fill="${color}"/>
              <path d="M118 208 C 104 86, 296 86, 282 208 C 272 168, 240 150, 200 150 C 160 150, 128 168, 120 206 Z" fill="${color}"/>`;
    case "cap":
      return `<path d="M118 192 C 118 120, 282 120, 282 192 Z" fill="${NAVY}"/>
              <path d="M200 186 L 312 192 C 300 206, 250 210, 200 204 Z" fill="${SHADE(NAVY, 0.25)}"/>
              <text x="200" y="176" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="26" fill="${GOLD}">SV</text>`;
    default: // short
      return `<path d="M120 206 C 106 84, 294 84, 280 206 C 272 172, 248 156, 200 154 C 152 156, 128 172, 122 204 Z" fill="${color}"/>`;
  }
}

function outfit(kind, number, shirt) {
  if (kind === "jersey") {
    return `<path d="M30 500 C 40 404, 112 360, 200 356 C 288 360, 360 404, 370 500 Z" fill="${NAVY}"/>
            <path d="M44 430 C 70 396, 100 380, 128 372 L 136 392 C 106 400, 80 414, 58 440 Z M356 430 C 330 396, 300 380, 272 372 L 264 392 C 294 400, 320 414, 342 440 Z" fill="${GOLD}"/>
            <path d="M160 360 L 200 404 L 240 360 Z" fill="#FFFFFF"/>
            <path d="M166 360 L 200 396 L 234 360" fill="none" stroke="${GOLD}" stroke-width="7"/>
            <text x="200" y="488" text-anchor="middle" font-family="'Arial Black', Impact, Arial, sans-serif" font-weight="900" font-size="74" fill="#FFFFFF" stroke="${GOLD}" stroke-width="3">${number}</text>`;
  }
  if (kind === "polo") {
    return `<path d="M30 500 C 40 404, 112 360, 200 356 C 288 360, 360 404, 370 500 Z" fill="${NAVY}"/>
            <path d="M150 362 L 200 410 L 250 362 L 232 356 L 200 388 L 168 356 Z" fill="#FFFFFF"/>
            <path d="M200 410 L 200 470" stroke="#FFFFFF" stroke-width="4" opacity=".5"/>
            <path d="M176 380 C 160 420, 150 450, 158 470" stroke="#C9CED8" stroke-width="4" fill="none"/>
            <rect x="148" y="466" width="22" height="14" rx="4" fill="#C9CED8"/>
            <path d="M286 420 L 316 420" stroke="${GOLD}" stroke-width="6"/>`;
  }
  return `<path d="M30 500 C 40 404, 112 360, 200 356 C 288 360, 360 404, 370 500 Z" fill="${shirt}"/>
          <path d="M162 362 C 176 386, 224 386, 238 362" fill="none" stroke="${SHADE(shirt, 0.25)}" stroke-width="8"/>`;
}

function person({ skin, hairStyle, hairColor, kind = "jersey", number = "", shirt = "#4B7BBE", bg = ["#E7EEFA", "#C7D6EF"], id }) {
  const shade = SHADE(skin, 0.14);
  const lip = SHADE(skin, 0.38);
  return `
  <defs><linearGradient id="bg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
  <rect width="400" height="500" fill="url(#bg-${id})"/>
  <circle cx="200" cy="200" r="150" fill="#FFFFFF" opacity=".35"/>
  ${hairStyle === "ponytail" || hairStyle === "shoulder" ? hair(hairStyle, hairColor).split("\n")[0] : ""}
  ${outfit(kind, number, shirt)}
  <rect x="168" y="286" width="64" height="82" rx="26" fill="${shade}"/>
  <ellipse cx="124" cy="226" rx="13" ry="21" fill="${shade}"/>
  <ellipse cx="276" cy="226" rx="13" ry="21" fill="${shade}"/>
  <ellipse cx="200" cy="216" rx="78" ry="92" fill="${skin}"/>
  ${hair(hairStyle, hairColor)}
  <path d="M158 202 C 166 196, 178 196, 186 200 M214 200 C 222 196, 234 196, 242 202" stroke="${SHADE(hairColor, 0.1)}" stroke-width="5" stroke-linecap="round" fill="none"/>
  <ellipse cx="172" cy="222" rx="7" ry="8" fill="#1E1B18"/>
  <ellipse cx="228" cy="222" rx="7" ry="8" fill="#1E1B18"/>
  <circle cx="174" cy="219" r="2" fill="#FFFFFF"/><circle cx="230" cy="219" r="2" fill="#FFFFFF"/>
  <path d="M200 230 C 196 246, 194 252, 204 254" stroke="${shade}" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M176 270 C 190 284, 212 284, 226 270" stroke="${lip}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <ellipse cx="156" cy="252" rx="12" ry="7" fill="#E8796B" opacity=".18"/><ellipse cx="244" cy="252" rx="12" ry="7" fill="#E8796B" opacity=".18"/>`;
}

const svgPortrait = (body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${body}</svg>`;
const svgAvatar = (body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="88 104 224 224" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${body}</svg>`;

// slug -> drawing. Slugs are referenced from fixtures.ts.
const PEOPLE = {
  "maya-torres":     { skin: "#C68642", hairStyle: "ponytail", hairColor: "#2B1D16", number: "12" },
  "jordan-ellis":    { skin: "#8D5524", hairStyle: "short",    hairColor: "#141110", number: "7" },
  "caleb-brooks":    { skin: "#FFDBAC", hairStyle: "buzz",     hairColor: "#6A4E42", number: "44" },
  "isaiah-grant":    { skin: "#5C3A21", hairStyle: "curly",    hairColor: "#141110", number: "22" },
  "noah-ramirez":    { skin: "#E0AC69", hairStyle: "sidepart", hairColor: "#1F1A17", number: "71" },
  "elijah-carter":   { skin: "#A0522D", hairStyle: "fade",     hairColor: "#141110", number: "3" },
  "mason-reyes":     { skin: "#E0AC69", hairStyle: "wavy",     hairColor: "#3B2A20", number: "21" },
  "owen-patel":      { skin: "#C68642", hairStyle: "sidepart", hairColor: "#141110", number: "9" },
  "lucas-bennett":   { skin: "#FFE0BD", hairStyle: "short",    hairColor: "#B5835A", number: "88" },
  "gabriel-nguyen":  { skin: "#F1C27D", hairStyle: "fringe",   hairColor: "#141110", number: "15" },
  "dana-whitfield":  { skin: "#FFDBAC", hairStyle: "shoulder", hairColor: "#8B4A26", kind: "polo" },
  // donors
  "grandma-ellis":   { skin: "#8D5524", hairStyle: "bun",      hairColor: "#C9C5C0", kind: "shirt", shirt: "#B5487A", bg: ["#FBEFF4", "#F1D3E0"] },
  "coach-k":         { skin: "#E0AC69", hairStyle: "cap",      hairColor: "#1F1A17", kind: "shirt", shirt: "#3D4A5C", bg: ["#EEF1F5", "#D5DCE6"] },
  "sam-p":           { skin: "#FFDBAC", hairStyle: "wavy",     hairColor: "#C28E4E", kind: "shirt", shirt: "#2F8F6B", bg: ["#ECF8F2", "#CDEBDD"] },
};

for (const [slug, p] of Object.entries(PEOPLE)) {
  const label = `Illustrated portrait (fictional)`;
  const body = person({ ...p, id: slug });
  write(`people/${slug}.svg`, svgPortrait(body, label));
  write(`people/${slug}-avatar.svg`, svgAvatar(body, label));
}

// Family and anonymous donor avatars.
function family(id, a, b, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 224 224" role="img" aria-label="Illustrated family (fictional)"><title>Illustrated family (fictional)</title>
  <rect width="224" height="224" fill="${bg}"/>
  <svg x="-34" y="10" width="190" height="238" viewBox="0 0 400 500">${person({ ...a, kind: "shirt", id: `${id}-a`, bg: [bg, bg] })}</svg>
  <svg x="84" y="62" width="150" height="188" viewBox="0 0 400 500"><rect width="400" height="500" fill="none"/>${person({ ...b, kind: "shirt", id: `${id}-b`, bg: ["#00000000", "#00000000"] }).replace(/<rect width="400" height="500"[^>]*\/>/, "").replace(/<circle cx="200" cy="200" r="150"[^>]*\/>/, "")}</svg>
</svg>`;
}
write("people/alvarez-family-avatar.svg", family("alvarez", { skin: "#C68642", hairStyle: "shoulder", hairColor: "#2B1D16", shirt: "#D9643A" }, { skin: "#C68642", hairStyle: "short", hairColor: "#2B1D16", shirt: GOLD }, "#FDF0E6"));
write("people/brooks-family-avatar.svg", family("brooks", { skin: "#FFDBAC", hairStyle: "short", hairColor: "#6A4E42", shirt: "#3E6FB0" }, { skin: "#FFDBAC", hairStyle: "ponytail", hairColor: "#A0703C", shirt: "#E05A7A" }, "#EAF1FB"));
write("people/anonymous-avatar.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 224 224" role="img" aria-label="Anonymous donor"><title>Anonymous donor</title>
  <rect width="224" height="224" fill="#EEF0F4"/>
  <path d="M112 168 C 60 132, 48 104, 60 84 C 72 64, 100 66, 112 88 C 124 66, 152 64, 164 84 C 176 104, 164 132, 112 168 Z" fill="${NAVY}" opacity=".85"/>
</svg>`);

// ── Community Partner logos ──────────────────────────────────────────────────
// Each: a badge shape in the brand color with a white category icon, and the
// business name as a wordmark. Shapes, colors and type styles vary so no two
// read alike.
const ICONS = {
  coffee:   `<path d="M30 42 h40 v22 a20 20 0 0 1 -40 0 Z" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><path d="M70 48 a10 10 0 0 1 0 18" fill="none" stroke="#fff" stroke-width="6"/><path d="M40 22 c-6 8 6 10 0 18 M54 22 c-6 8 6 10 0 18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
  tooth:    `<path d="M50 30 C 40 22, 24 24, 24 42 C 24 60, 32 66, 34 80 C 36 90, 44 90, 46 78 C 48 68, 52 68, 54 78 C 56 90, 64 90, 66 80 C 68 66, 76 60, 76 42 C 76 24, 60 22, 50 30 Z" fill="#fff"/>`,
  wrench:   `<path d="M66 22 a18 18 0 0 0 -20 24 L 24 68 a7 7 0 0 0 10 10 L 56 56 a18 18 0 0 0 24 -20 l -10 10 -10 -2 -2 -10 Z" fill="#fff"/>`,
  pizza:    `<path d="M20 30 C 40 20, 60 20, 80 30 L 50 84 Z" fill="#fff"/><circle cx="42" cy="42" r="5" fill="currentColor"/><circle cx="58" cy="46" r="5" fill="currentColor"/><circle cx="50" cy="62" r="4" fill="currentColor"/>`,
  house:    `<path d="M18 50 L 50 22 L 82 50" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/><path d="M28 48 V 80 H 72 V 48" fill="none" stroke="#fff" stroke-width="7"/><rect x="44" y="58" width="12" height="22" fill="#fff"/>`,
  plus:     `<path d="M40 18 h20 v22 h22 v20 h-22 v22 h-20 v-22 h-22 v-20 h22 Z" fill="#fff"/>`,
  dumbbell: `<rect x="14" y="36" width="12" height="28" rx="3" fill="#fff"/><rect x="74" y="36" width="12" height="28" rx="3" fill="#fff"/><rect x="26" y="42" width="8" height="16" fill="#fff"/><rect x="66" y="42" width="8" height="16" fill="#fff"/><rect x="34" y="46" width="32" height="8" fill="#fff"/>`,
  hardhat:  `<path d="M22 66 C 22 40, 36 28, 50 28 C 64 28, 78 40, 78 66 Z" fill="#fff"/><rect x="14" y="66" width="72" height="10" rx="4" fill="#fff"/><rect x="46" y="22" width="8" height="24" fill="currentColor" opacity=".35"/>`,
  cactus:   `<g stroke="#fff" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M50 86 V 22" stroke-width="15"/><path d="M50 62 H 34 V 42" stroke-width="10"/><path d="M50 52 H 66 V 34" stroke-width="10"/></g>`,
  pepper:   `<path d="M30 34 C 26 62, 46 84, 84 86 C 66 74, 54 58, 50 38 C 46 28, 36 26, 30 34 Z" fill="#fff"/><path d="M34 32 C 32 22, 36 16, 44 14" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
  shield:   `<path d="M50 16 L 80 26 V 48 C 80 68, 66 80, 50 86 C 34 80, 20 68, 20 48 V 26 Z" fill="#fff"/><path d="M36 50 l10 10 18 -20" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  smile:    `<path d="M24 44 C 30 76, 70 76, 76 44" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M70 14 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z" fill="#fff"/>`,
  mountain: `<path d="M12 80 L 38 36 L 52 56 L 64 40 L 88 80 Z" fill="#fff"/><path d="M38 36 L 46 48 L 38 46 L 32 50 Z" fill="currentColor" opacity=".35"/>`,
  drop:     `<path d="M50 16 C 40 34, 28 46, 28 62 a22 22 0 0 0 44 0 C 72 46, 60 34, 50 16 Z" fill="#fff"/><circle cx="76" cy="30" r="7" fill="none" stroke="#fff" stroke-width="4"/><circle cx="24" cy="34" r="5" fill="none" stroke="#fff" stroke-width="4"/>`,
  bank:     `<path d="M14 40 L 50 18 L 86 40 Z" fill="#fff"/><rect x="22" y="44" width="8" height="28" fill="#fff"/><rect x="38" y="44" width="8" height="28" fill="#fff"/><rect x="54" y="44" width="8" height="28" fill="#fff"/><rect x="70" y="44" width="8" height="28" fill="#fff"/><rect x="14" y="74" width="72" height="8" fill="#fff"/>`,
  camera:   `<rect x="14" y="32" width="72" height="48" rx="8" fill="#fff"/><rect x="34" y="22" width="22" height="12" rx="3" fill="#fff"/><circle cx="50" cy="56" r="14" fill="currentColor"/><circle cx="50" cy="56" r="7" fill="#fff"/>`,
  paw:      `<ellipse cx="50" cy="62" rx="18" ry="15" fill="#fff"/><ellipse cx="28" cy="44" rx="7" ry="9" fill="#fff"/><ellipse cx="42" cy="30" rx="7" ry="9" fill="#fff"/><ellipse cx="58" cy="30" rx="7" ry="9" fill="#fff"/><ellipse cx="72" cy="44" rx="7" ry="9" fill="#fff"/>`,
  snow:     `<g stroke="#fff" stroke-width="6" stroke-linecap="round"><path d="M50 16 V 84 M20 33 L 80 67 M20 67 L 80 33"/><path d="M42 22 l8 8 8 -8 M42 78 l8 -8 8 8" fill="none"/></g>`,
  cone:     `<path d="M34 46 L 50 88 L 66 46 Z" fill="#fff" opacity=".8"/><circle cx="40" cy="40" r="14" fill="#fff"/><circle cx="60" cy="40" r="14" fill="#fff"/><circle cx="50" cy="26" r="14" fill="#fff"/>`,
  sign:     `<rect x="16" y="22" width="68" height="40" rx="5" fill="#fff"/><rect x="46" y="62" width="8" height="22" fill="#fff"/><path d="M28 36 h44 M28 48 h28" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`,
  scissors: `<circle cx="30" cy="70" r="11" fill="none" stroke="#fff" stroke-width="6"/><circle cx="70" cy="70" r="11" fill="none" stroke="#fff" stroke-width="6"/><path d="M38 62 L 72 18 M62 62 L 28 18" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`,
};

function badge(shape, color) {
  switch (shape) {
    case "square":  return `<rect x="58" y="14" width="84" height="84" rx="18" fill="${color}"/>`;
    case "shield":  return `<path d="M100 10 L 144 24 V 58 C 144 84, 124 98, 100 106 C 76 98, 56 84, 56 58 V 24 Z" fill="${color}"/>`;
    case "hex":     return `<path d="M100 10 L 142 34 V 82 L 100 106 L 58 82 V 34 Z" fill="${color}"/>`;
    case "diamond": return `<rect x="66" y="24" width="68" height="68" rx="10" transform="rotate(45 100 58)" fill="${color}"/>`;
    case "ring":    return `<circle cx="100" cy="58" r="46" fill="#fff" stroke="${color}" stroke-width="8"/><circle cx="100" cy="58" r="36" fill="${color}"/>`;
    default:        return `<circle cx="100" cy="58" r="46" fill="${color}"/>`;
  }
}

const FONTS = {
  sans:  "Arial, Helvetica, sans-serif",
  heavy: "'Arial Black', Impact, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  cond:  "'Arial Narrow', 'Roboto Condensed', Arial, sans-serif",
};

// file slug, name lines, icon, color, shape, font. Names must match fixtures.ts.
export const PARTNERS = [
  ["comet-coffee",        ["COMET", "COFFEE CO."],          "coffee",   "#6B3E26", "circle",  "heavy"],
  ["valley-family-dental",["Valley Family", "Dental"],      "tooth",    "#1F9AA8", "ring",    "sans"],
  ["ridgeline-auto-care", ["RIDGELINE", "AUTO CARE"],       "wrench",   "#C8372D", "shield",  "heavy"],
  ["sunridge-pizza",      ["Sunridge", "Pizza Kitchen"],    "pizza",    "#D9561E", "circle",  "serif"],
  ["desert-bloom-realty", ["Desert Bloom", "REALTY"],       "house",    "#B0417A", "square",  "serif"],
  ["summit-pt",           ["SUMMIT", "PHYSICAL THERAPY"],   "plus",     "#2C7A4B", "hex",     "cond"],
  ["iron-mesa-fitness",   ["IRON MESA", "FITNESS"],         "dumbbell", "#20242C", "square",  "heavy"],
  ["copperline",          ["COPPERLINE", "CONSTRUCTION"],   "hardhat",  "#B5651D", "shield",  "cond"],
  ["saguaro-hardware",    ["Saguaro", "Hardware & Supply"], "cactus",   "#3F7D3A", "hex",     "sans"],
  ["blue-agave",          ["Blue Agave", "TAQUERIA"],       "pepper",   "#2457A6", "diamond", "serif"],
  ["northgate-insurance", ["NORTHGATE", "INSURANCE GROUP"], "shield",   "#2E3F6E", "ring",    "cond"],
  ["bright-smiles",       ["Bright Smiles", "Orthodontics"],"smile",    "#E0457B", "circle",  "sans"],
  ["trailhead-outfitters",["TRAILHEAD", "OUTFITTERS"],      "mountain", "#4D6B3C", "diamond", "heavy"],
  ["cactus-creek-wash",   ["Cactus Creek", "CAR WASH"],     "drop",     "#1C8FD1", "circle",  "sans"],
  ["sunridge-cu",         ["Sunridge Valley", "Credit Union"], "bank",  "#5A3E8C", "square",  "serif"],
  ["golden-hour-photo",   ["Golden Hour", "PHOTOGRAPHY"],   "camera",   "#C58B12", "ring",    "serif"],
  ["ridgeview-pet",       ["Ridgeview", "Pet Clinic"],      "paw",      "#2F8C8C", "hex",     "sans"],
  ["high-desert-air",     ["HIGH DESERT", "PLUMBING & AIR"],"snow",     "#1F6FB2", "shield",  "cond"],
  ["corner-scoop",        ["The Corner", "Scoop"],          "cone",     "#E46FA0", "circle",  "serif"],
  ["pinnacle-print",      ["PINNACLE", "PRINT & SIGN"],     "sign",     "#E06A1B", "diamond", "cond"],
  ["hometown-barber",     ["Hometown", "BARBER CO."],       "scissors", "#8E2430", "ring",    "heavy"],
];

// Logos are drawn for the small Community Partner card (the card prints the
// full business name underneath), so each is a large badge plus ONE short,
// bold brand word that stays readable at card size.
const MARKS = {
  "comet-coffee": "COMET", "valley-family-dental": "VALLEY", "ridgeline-auto-care": "RIDGELINE", "sunridge-pizza": "Sunridge",
  "desert-bloom-realty": "Bloom", "summit-pt": "SUMMIT", "iron-mesa-fitness": "IRON MESA", "copperline": "COPPERLINE",
  "saguaro-hardware": "SAGUARO", "blue-agave": "Agave", "northgate-insurance": "NORTHGATE", "bright-smiles": "Bright",
  "trailhead-outfitters": "TRAILHEAD", "cactus-creek-wash": "CACTUS", "sunridge-cu": "SVCU", "golden-hour-photo": "Golden Hour",
  "ridgeview-pet": "Ridgeview", "high-desert-air": "HIGH DESERT", "corner-scoop": "Scoop", "pinnacle-print": "PINNACLE",
  "hometown-barber": "HOMETOWN",
};

for (const [slug, lines, icon, color, shape, font] of PARTNERS) {
  const mark = MARKS[slug];
  const size = mark.length <= 6 ? 34 : mark.length <= 9 ? 29 : 24;
  const label = `${lines.join(" ")} logo (fictional business)`;
  write(`partners/${slug}.svg`, `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 176" role="img" aria-label="${esc(label)}">
  <title>${esc(label)}</title>
  <g transform="translate(100 66) scale(1.3) translate(-100 -58)">
    ${badge(shape, color)}
    <g transform="translate(70 28) scale(.6)" color="${color}">${ICONS[icon]}</g>
  </g>
  <text x="100" y="166" text-anchor="middle" font-family="${FONTS[font]}" font-weight="${font === "serif" ? 700 : 900}" font-size="${size}" letter-spacing="${/^[A-Z ]+$/.test(mark) ? 1 : 0}" fill="${SHADE(color, 0.2)}">${esc(mark)}</text>
</svg>`);
}

console.log(`wrote crest, ${Object.keys(PEOPLE).length * 2 + 3} people files, ${PARTNERS.length} partner logos to ${OUT}`);
