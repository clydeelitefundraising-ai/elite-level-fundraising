// Phase 1C.2: static guards for the Android file bridge. Nothing here can run
// Java or render React (no jsdom/RTL harness in this repo), so these pin the
// structural properties that matter: the native bridge exists, is registered,
// checks origin, sanitizes names, exposes only cache files through a narrow
// FileProvider path, adds no storage permissions, and every audited web flow
// has an Android-gated branch while still containing its previous iOS/web path.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

const TEAM = "src/app/team/[slug]";
const JAVA_DIR = "android/app/src/main/java/com/elitelevelfundraising/team";
const BRIDGE = `${JAVA_DIR}/AndroidFileBridge.java`;
const MAIN_ACTIVITY = `${JAVA_DIR}/MainActivity.java`;

// ── native bridge ──

test("AndroidFileBridge exposes saveAndShare and openWithViewer as @JavascriptInterface methods", () => {
  const src = read(BRIDGE);
  assert.match(src, /@JavascriptInterface\s+public String saveAndShare\(String base64Data, String fileName, String mimeType\)/);
  assert.match(src, /@JavascriptInterface\s+public String openWithViewer\(String base64Data, String fileName, String mimeType\)/);
  assert.ok(src.includes('static final String JS_NAME = "ElfAndroidFiles"'));
});

test("MainActivity registers the bridge after super.onCreate and keeps the AndroidX back callback", () => {
  const src = read(MAIN_ACTIVITY);
  const superIdx = src.indexOf("super.onCreate(savedInstanceState)");
  const registerIdx = src.indexOf("addJavascriptInterface(new AndroidFileBridge(this), AndroidFileBridge.JS_NAME)");
  assert.ok(superIdx !== -1 && registerIdx > superIdx, "must register after the Capacitor bridge/WebView exist");
  assert.ok(src.includes("new OnBackPressedCallback(true)"));
  assert.ok(src.includes("getOnBackPressedDispatcher().addCallback(this,"));
  assert.ok(!/void\s+onBackPressed\s*\(/.test(src), "no legacy back override");
});

test("the bridge only serves the trusted https server origin", () => {
  const src = read(BRIDGE);
  assert.ok(src.includes("isTrustedOrigin()"));
  assert.ok(src.includes('"https".equalsIgnoreCase(page.getScheme())'));
  assert.ok(src.includes("getBridge().getServerUrl()"));
  assert.ok(src.includes('error("forbidden_origin")'));
  // origin check comes before any decoding or file work
  assert.ok(src.indexOf("isTrustedOrigin()") < src.indexOf("Base64.decode"));
});

test("the bridge sanitizes names, allowlists MIME types and caps size", () => {
  const src = read(BRIDGE);
  assert.ok(src.includes('name.replaceAll("[^A-Za-z0-9._ -]", "_")'));
  assert.ok(src.includes("lastIndexOf('/')") && src.includes("lastIndexOf('\\\\')"));
  assert.ok(src.includes("getCanonicalPath().startsWith(root.getCanonicalPath()"));
  for (const mime of ["application/pdf", "text/csv", "text/calendar", "image/png", "image/jpeg", "image/webp", "image/gif", "application/octet-stream"]) {
    assert.ok(src.includes(`"${mime}"`), mime);
  }
  assert.ok(src.includes("MAX_BYTES = 25L * 1024 * 1024"));
  assert.ok(src.includes('error("bad_mime")') && src.includes('error("too_large")') && src.includes('error("empty_data")'));
});

test("the bridge writes only under cache/shared_files, purges stale files, and never throws into JS", () => {
  const src = read(BRIDGE);
  assert.ok(src.includes('CACHE_SUBDIR = "shared_files"'));
  assert.ok(src.includes("activity.getCacheDir()"));
  assert.ok(src.includes("purgeStale(root)"));
  assert.ok(src.includes("catch (Throwable t)"));
});

test("URI access goes through FileProvider with read-only, per-intent grants", () => {
  const src = read(BRIDGE);
  assert.ok(src.includes('FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file)'));
  assert.ok(src.includes("FLAG_GRANT_READ_URI_PERMISSION"));
  assert.ok(src.includes("setClipData(ClipData.newRawUri"));
  assert.ok(!src.includes("grantUriPermission("), "no blanket grantUriPermission to all packages");
  assert.ok(!src.includes("FLAG_GRANT_WRITE_URI_PERMISSION"));
});

test("share uses ACTION_SEND through the chooser; viewing uses ACTION_VIEW and reports no_handler visibly", () => {
  const src = read(BRIDGE);
  assert.ok(src.includes("Intent.ACTION_SEND") && src.includes("Intent.createChooser(send"));
  assert.ok(src.includes("Intent.ACTION_VIEW") && src.includes("setDataAndType(uri, mime)"));
  assert.ok(src.includes("catch (ActivityNotFoundException e)"));
  assert.ok(src.includes("Toast.makeText"));
  assert.ok(src.includes("No app installed to open this file. Try saving it instead."));
  assert.ok(src.includes('return error("no_handler")'));
  // untyped files can't be viewed (silent no-op): they fall back to the share/save sheet
  assert.ok(src.includes('boolean asView = view && !"application/octet-stream".equals(mime);'));
});

test("UI work (WebView, Toast, startActivity) is posted to the UI thread with a timeout", () => {
  const src = read(BRIDGE);
  assert.ok(src.includes("activity.runOnUiThread(future)"));
  assert.ok(src.includes("future.get(UI_TIMEOUT_SECONDS, TimeUnit.SECONDS)"));
});

// ── FileProvider paths and manifest ──

test("file_paths.xml no longer exposes external storage or the whole cache", () => {
  const xml = read("android/app/src/main/res/xml/file_paths.xml");
  assert.ok(!/<external-path\b/.test(xml), "the broad external-path \".\" must be gone");
  assert.ok(!/<cache-path[^>]*path="\."/.test(xml), "the whole cache must not be exposed");
  assert.ok(xml.includes('<cache-path name="shared_files" path="shared_files/" />'));
});

test("file_paths.xml keeps only the narrow camera-capture directory Capacitor's file chooser needs", () => {
  const xml = read("android/app/src/main/res/xml/file_paths.xml");
  assert.ok(xml.includes('<external-files-path name="camera_captures" path="Pictures/" />'));
  assert.equal((xml.match(/<(external-files-path|cache-path|files-path|external-path|external-cache-path)\b/g) ?? []).length, 2);
});

test("the manifest adds no storage/media permissions and keeps the provider private", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.ok(!/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|READ_MEDIA_/.test(manifest));
  assert.ok(/android:authorities="\$\{applicationId\}\.fileprovider"/.test(manifest));
  assert.ok(/android:exported="false"/.test(manifest));
});

// ── web routing (Android branch present, iOS/web path preserved) ──

test("shareFileOrFallback routes Android to the native share first and keeps the Web Share + fallback path", () => {
  const src = read(`${TEAM}/_components/nativeFileShare.ts`);
  const androidIdx = src.indexOf("if (isAndroidNativeApp())");
  assert.ok(androidIdx !== -1);
  assert.ok(src.includes("saveAndShareOnAndroid(file, file.name, file.type)"));
  assert.ok(androidIdx < src.indexOf("nav.canShare"), "Android branch must precede the Web Share path");
  assert.ok(src.includes("typeof nav.canShare"));
  assert.ok(src.includes("nav.share!({ files: [file] })"));
  assert.ok(src.includes("fallback();"));
});

test("downloadViaFetch has an explicit Android branch and keeps the anchor-download fallback", () => {
  const src = read(`${TEAM}/_components/fileDownload.ts`);
  assert.ok(src.includes("isAndroidNativeApp()") && src.includes("saveAndShareOnAndroid(blob, finalName, blob.type)"));
  assert.ok(src.includes("function fallbackAnchorDownload"));
  assert.ok(src.includes("shareFileOrFallback(file, () => fallbackAnchorDownload(blob, finalName))"));
  assert.ok(src.includes("export async function openFileViaFetchOnAndroid"));
  assert.ok(src.includes("openWithViewerOnAndroid(blob,"));
  assert.ok(src.includes("export function openAttachmentLinkOnAndroid"));
});

test("Calendar: .ics and print go through the Android path; the browser location download and window.print remain", () => {
  const src = read(`${TEAM}/calendar/ExportMenu.tsx`);
  assert.ok(src.includes("downloadViaFetch(`/api/team/${slug}/calendar/download`)"));
  assert.ok(src.includes("window.location.href = `/api/team/${slug}/calendar/download`"));
  assert.ok(src.includes("const fallback = () => window.print();"));
  assert.ok(src.includes("if (isAndroidNativeApp()) window.alert(androidErrorMessage(err));"));
  assert.ok(src.includes("catch(err => window.alert(androidErrorMessage(err)))"));
});

test("Calendar: the Apple Calendar action is hidden on Android only; Google Calendar and copy link are untouched", () => {
  const src = read(`${TEAM}/calendar/ExportMenu.tsx`);
  assert.ok(/\{!isAndroidNativeApp\(\) && \(\s*<a href=\{status\.webcalUrl\}[^>]*>Add to Apple Calendar<\/a>\s*\)\}/.test(src));
  assert.ok(src.includes("openAppleCalendar"), "iOS handler intact");
  assert.ok(src.includes("AppLauncher.openUrl({ url: status.webcalUrl })"));
  assert.ok(src.includes('<a href={status.googleUrl} target="_blank" rel="noopener noreferrer" style={linkButton}>Add to Google Calendar</a>'));
  assert.ok(src.includes('copied ? "Copied!" : "Copy Subscription Link"'));
});

test("Team QR: Android failures are shown; browser/iOS keep the anchor-download and window.print fallbacks", () => {
  const src = read(`${TEAM}/_components/TeamQrModal.tsx`);
  assert.equal((src.match(/if \(isAndroidNativeApp\(\)\) setError\(androidErrorMessage\(err\)\);\s*else fallback\(\);/g) ?? []).length, 2);
  assert.ok(src.includes("a.download = qrFilename;"));
  assert.ok(src.includes("const fallback = () => window.print();"));
  assert.ok(src.includes("renderSignupSheetImage(signupData, qrDataUrl, settings.primary_color, filename)"));
});

test("Follow-Ups CSV export uses the shared helper, shows Android failures, and keeps its anchor fallback", () => {
  const src = read(`${TEAM}/fundraiser/useFollowUpsWorkspace.ts`);
  assert.ok(src.includes("shareFileOrFallback(file, fallback).catch("));
  assert.ok(src.includes("if (isAndroidNativeApp()) window.alert(androidErrorMessage(err));"));
  assert.ok(src.includes("a.download = filename;"));
  assert.ok(src.includes("const handlePrint = () => window.print();"), "unrelated print left alone");
});

test("CSV exports (Analytics, Coach contacts) still go through downloadViaFetch and show errors", () => {
  const analytics = read(`${TEAM}/analytics/AnalyticsView.tsx`);
  const contacts = read(`${TEAM}/contacts/coach/CoachContactsView.tsx`);
  assert.ok(analytics.includes("await downloadViaFetch(`/api/team/${slug}/analytics/export/${path}`)"));
  assert.ok(analytics.includes('setError(err instanceof Error ? err.message : "Download failed.")'));
  assert.ok(contacts.includes("await downloadViaFetch(`/api/team/${slug}/contacts/export`)"));
  assert.ok(contacts.includes('setExportError(err instanceof Error ? err.message : "Export failed.")'));
});

test("Team Files and Clearance: Android PDFs get Open PDF; other types keep the blob preview iframe", () => {
  for (const [file, viewing] of [
    [`${TEAM}/files/FilesView.tsx`, "viewingFile"],
    [`${TEAM}/team/ClearanceView.tsx`, "viewingAttachment"],
  ] as const) {
    const src = read(file);
    assert.ok(src.includes("import { OpenPdfButton }"), file);
    assert.ok(src.includes('if (isAndroidNativeApp() && '), file);
    assert.ok(src.includes(`isAndroidNativeApp() && ${viewing}.file_type === "pdf"`), file);
    assert.ok(src.includes("<OpenPdfButton url={`/api/team/${slug}/files/"), file);
    assert.ok(src.includes(`<iframe src={viewUrl} title={${viewing}.name}`), `${file}: web/iOS iframe preserved`);
    assert.ok(src.includes("downloadViaFetch(`/api/team/${slug}/files/"), `${file}: download still uses the shared helper`);
  }
});

test("announcement attachment links keep target=_blank for web/iOS and open a viewer on Android", () => {
  for (const [file, hrefPart] of [
    [`${TEAM}/files/UpdateCard.tsx`, "/api/team/${slug}/files/${att.id}"],
    [`${TEAM}/home/HomeView.tsx`, "/api/team/${a.campaign_slug}/files/${att.id}"],
  ] as const) {
    const src = read(file);
    assert.ok(src.includes(`href={\`${hrefPart}\`}`), file);
    assert.ok(src.includes('target="_blank"'), file);
    assert.ok(src.includes(`onClick={e => openAttachmentLinkOnAndroid(e, \`${hrefPart}\`, att.name)}`), file);
    assert.ok(src.includes('import { openAttachmentLinkOnAndroid } from "../_components/fileDownload"'), file);
  }
});

test("message attachment viewer: PDFs use the hydration-safe fallback; images, video and DOC states are untouched", () => {
  const page = read(`${TEAM}/messages/attachments/[attachmentId]/view/page.tsx`);
  assert.ok(page.includes("<PdfViewerFallback apiHref={apiHref} fileName={attachment.original_filename} />"));
  assert.ok(!page.includes("<iframe"), "the raw iframe moved into the client component");
  assert.ok(page.includes('attachment.attachment_kind === "image"'));
  assert.ok(page.includes("<video"));
  assert.ok(page.includes("isn&apos;t supported in the app yet"));

  const actions = read(`${TEAM}/_components/AndroidPdfActions.tsx`);
  assert.ok(actions.startsWith('"use client";'));
  assert.ok(actions.includes("useSyncExternalStore(subscribe, isAndroidNativeApp, () => false)"), "server snapshot false = no hydration mismatch");
  assert.ok(actions.includes('style={{ display: "block", width: "100%", height: "80vh", border: "none" }}'), "web/iOS iframe unchanged");
  assert.ok(actions.includes("Open PDF"));
});

// ── status bar ──

test("NativeBootstrap: Android stops forcing white icons; iOS keeps the exact previous calls", () => {
  const src = read("src/app/_components/NativeBootstrap.tsx");
  const androidIdx = src.indexOf("if (isAndroidNativeApp())");
  assert.ok(androidIdx !== -1);
  assert.ok(src.includes("StatusBar.setStyle({ style: Style.Default })"));
  const androidBlock = src
    .slice(androidIdx, src.indexOf("return;", androidIdx))
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith("//"))
    .join(" ");
  assert.ok(!androidBlock.includes("Style.Dark"), "Android branch must not force white icons");
  const afterAndroid = src.slice(src.indexOf("return;", androidIdx));
  assert.ok(afterAndroid.includes('StatusBar.setBackgroundColor({ color: "#0b1e3d" })'));
  assert.ok(afterAndroid.includes("StatusBar.setStyle({ style: Style.Dark })"), "iOS path unchanged");
  assert.ok(src.includes("if (!Capacitor.isNativePlatform()) return;"));
});
