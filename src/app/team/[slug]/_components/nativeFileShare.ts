// Phase 8b: web-only iOS share fallback for Team QR's Download QR / Print
// Signup Sheet buttons. Root cause (see Phase 8 follow-up audit): inside
// the installed Capacitor iOS app, `<a download>` and `window.print()` are
// both silent no-ops — WKWebView has no download-manager UI by default and
// does not implement window.print(). Neither is a Capacitor bridge
// limitation, so the fix stays entirely web-side: the Web Share API
// (Level 2, file sharing) is a standard WebKit feature already proven
// working in this exact app for the text/url variant (see
// CampaignPageClient.tsx, AthleteProfileView.tsx, FundraiserView.tsx) —
// this reuses the same `navigator.share` entrypoint, just with `files`.
//
// Desktop/browser environments (where `navigator.canShare({files})` isn't
// available) are completely unaffected — callers always keep their
// original <a download> / window.print() as the `fallback` argument below.

type ShareNavigator = Navigator & {
  canShare?: (data: { files: File[] }) => boolean;
  share?:    (data: { files: File[] }) => Promise<void>;
};

/**
 * Convert a data: URL (e.g. the QR code's `qrDataUrl`) into a File, so it
 * can be handed to `navigator.share({ files: [...] })`. `fetch()` on a
 * data: URL is a same-process, effectively-synchronous resolve — this
 * does not introduce a real delay between the user's click and the
 * `share()` call, which the Web Share API requires to stay within the
 * same user-activation window.
 */
export async function dataUrlToFile(dataUrl: string, filename: string, mimeType: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: mimeType });
}

/**
 * Try to share `file` via the Web Share API; if unsupported, unavailable,
 * or it fails for a reason other than the user cancelling, run `fallback`
 * instead — a share attempt should never leave the button looking like a
 * silent no-op. A user dismissing the native share sheet (AbortError) is
 * expected, normal behavior, not a failure, so it does NOT trigger the
 * fallback.
 */
export async function shareFileOrFallback(file: File, fallback: () => void): Promise<void> {
  const nav = navigator as ShareNavigator;
  const canShareFiles =
    typeof nav.canShare === "function" &&
    typeof nav.share === "function" &&
    nav.canShare({ files: [file] });

  if (!canShareFiles) {
    fallback();
    return;
  }

  try {
    await nav.share!({ files: [file] });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return; // user cancelled — not an error
    fallback();
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/**
 * Renders the same signup-sheet content PrintSignupSheet.tsx shows for
 * browser printing onto an offscreen canvas, at a high-res 2x scale so it
 * reads cleanly whether the recipient eventually prints, AirDrops, or
 * saves it. No PDF library — a canvas-rendered PNG is the "shareable
 * document" the iOS share sheet's own Print action can already print
 * directly, without adding a new dependency.
 */
export async function renderSignupSheetImage(
  data: { heading: string; seasonLine: string | null; code: string },
  qrDataUrl: string | null,
  primaryColor: string,
  filename: string,
): Promise<File> {
  const scale = 2;
  const width = 850;
  const height = 1100;

  const canvas = document.createElement("canvas");
  canvas.width  = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.scale(scale, scale);

  const accent = primaryColor || "#0b1e3d";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#6b7280";
  ctx.font = "700 15px Georgia, 'Times New Roman', serif";
  ctx.fillText("ELITE LEVEL FUNDRAISING", width / 2, 90);

  ctx.fillStyle = accent;
  ctx.font = "800 40px Georgia, 'Times New Roman', serif";
  wrapText(ctx, data.heading, width / 2, 140, 680, 46);

  let y = 210;
  if (data.seasonLine) {
    ctx.fillStyle = "#374151";
    ctx.font = "24px Georgia, 'Times New Roman', serif";
    ctx.fillText(data.seasonLine, width / 2, y);
    y += 50;
  } else {
    y += 10;
  }

  if (qrDataUrl) {
    const qrSize = 320;
    const qrX = (width - qrSize) / 2;
    const border = 6;
    ctx.strokeStyle = accent;
    ctx.lineWidth = border;
    ctx.strokeRect(qrX - border / 2, y - border / 2, qrSize + border, qrSize + border);
    const img = await loadImage(qrDataUrl);
    ctx.drawImage(img, qrX, y, qrSize, qrSize);
    y += qrSize + 50;
  }

  ctx.fillStyle = "#6b7280";
  ctx.font = "20px Georgia, 'Times New Roman', serif";
  ctx.fillText("Or enter team code:", width / 2, y);
  y += 46;

  ctx.fillStyle = accent;
  ctx.font = "800 38px Georgia, 'Times New Roman', serif";
  ctx.fillText(data.code, width / 2, y);
  y += 70;

  ctx.textAlign = "left";
  ctx.fillStyle = "#374151";
  ctx.font = "22px Georgia, 'Times New Roman', serif";
  const steps = [
    "1. Scan the QR code.",
    "2. Choose Athlete or Parent.",
    "3. Select your athlete/name from the roster.",
    "4. Complete your ELF account setup.",
  ];
  const stepsX = (width - 460) / 2;
  for (const step of steps) {
    ctx.fillText(step, stepsX, y);
    y += 38;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error("Failed to render signup sheet image")); return; }
      resolve(new File([blob], filename, { type: "image/png" }));
    }, "image/png");
  });
}

/**
 * Rasterizes an existing DOM element into a high-resolution PNG File —
 * generic, DOM-region-oriented, not tied to any one feature. Used by
 * Calendar's Print Calendar (Phase 8c) to share the browser's own
 * .elf-calendar-print node (see ExportMenu.tsx/CalendarView.tsx) without
 * re-implementing its month-grid/event-list rendering a second time.
 *
 * `sourceEl` is commonly `display:none` in the live DOM (that's exactly
 * how this app's existing @media print / @media screen architecture keeps
 * a printable node always mounted but invisible on screen — see
 * CalendarView.tsx's .elf-calendar-print). That doesn't matter here: this
 * clones the node into a temporary, off-screen-but-laid-out container
 * (position:fixed, far off-canvas, not display:none) purely to measure
 * its natural height at the given width, reads its rendered HTML, then
 * removes the clone — the original element/DOM tree is never touched, so
 * the existing print CSS mechanism is completely unaffected.
 *
 * Rendering itself uses the standard dependency-free "HTML in an SVG
 * foreignObject, decoded as an Image, drawn to canvas" technique — no
 * html2canvas/jsPDF. Works cleanly here because the cloned content is
 * fully inline-styled with no external images (true of PrintMonthView.tsx
 * and PrintSignupSheet.tsx alike), so nothing needed for the foreignObject
 * to resolve is missing or cross-origin.
 */
export async function renderElementToImage(
  sourceEl: HTMLElement,
  options: { width: number; filename: string; scale?: number; backgroundColor?: string },
): Promise<File> {
  const { width, filename, scale = 2, backgroundColor = "#ffffff" } = options;

  // 1. Clone into an off-screen-but-laid-out container to get a real
  //    scrollHeight — the source element commonly has zero layout size
  //    (display:none) at the moment this runs.
  const clone = sourceEl.cloneNode(true) as HTMLElement;
  clone.style.display = "block";
  const measureHost = document.createElement("div");
  measureHost.style.cssText = `position:fixed; top:0; left:-99999px; width:${width}px; background:${backgroundColor};`;
  measureHost.appendChild(clone);
  document.body.appendChild(measureHost);
  const height = Math.max(1, Math.ceil(measureHost.scrollHeight));
  const html = measureHost.innerHTML;
  document.body.removeChild(measureHost);

  // 2. Wrap that HTML in an SVG foreignObject and decode it as an Image —
  //    a zero-dependency way to rasterize arbitrary inline-styled HTML.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;box-sizing:border-box;background:${backgroundColor};">${html}</div>` +
    `</foreignObject></svg>`;
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await loadImage(svgUrl);

  // 3. Draw onto a canvas at `scale`x resolution, filling an opaque
  //    background first — PNG supports transparency, and some share
  //    targets (e.g. certain print/preview flows) render a transparent
  //    background as black, which would make this unusable for printing.
  const canvas = document.createElement("canvas");
  canvas.width  = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error("Failed to render image")); return; }
      resolve(new File([blob], filename, { type: "image/png" }));
    }, "image/png");
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, lineY);
}
