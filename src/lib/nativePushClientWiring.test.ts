// Phase 2C: static guards for the Android FCM client integration -- registrar
// wiring, manifest metadata, Firebase client-config safety and everything that
// must NOT have changed (launcher icons, back handling, file bridge, deep links).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ANDROID_PUSH_CHANNEL_ID } from "./nativePushRegistration.ts";
import { FCM_ANDROID_CHANNEL_ID } from "./fcm.ts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const exists = (rel: string) => existsSync(join(process.cwd(), rel));

const REGISTRAR = "src/app/team/[slug]/_components/NativePushRegistrar.tsx";
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const MAIN_ACTIVITY = "android/app/src/main/java/com/elitelevelfundraising/team/MainActivity.java";
const GOOGLE_SERVICES = "android/app/google-services.json";

// ── Registrar ────────────────────────────────────────────────────────────────

test("registrar gates on getNativePlatform() (iOS or Android) and no longer on isNativeIosApp()", () => {
  const source = read(REGISTRAR);
  assert.ok(source.includes("getNativePlatform"));
  assert.ok(source.includes("if (!platform) return;"));
  assert.ok(!source.includes("isNativeIosApp"));
});

test("registrar only runs for authenticated users and never prompts by itself", () => {
  const source = read(REGISTRAR);
  assert.ok(source.includes("if (!isAuthenticated) return;"));
  assert.ok(!source.includes("requestPermissions"), "permission requests live in the tested helper only");
});

test("registrar delegates to the shared helper and registers the token through registerNativeDeviceToken", () => {
  const source = read(REGISTRAR);
  assert.ok(source.includes("startNativePushRegistration"));
  assert.ok(source.includes("registerToken: registerNativeDeviceToken"));
});

test("there is still exactly one registrar, mounted once in the team layout", () => {
  const layout = read("src/app/team/[slug]/layout.tsx");
  assert.equal(layout.split("<NativePushRegistrar").length - 1, 1);
});

test("notification taps go through isSafeInternalPath, never through DeepLinkValidator", () => {
  const helper = read("src/lib/nativePushRegistration.ts");
  const registrar = read(REGISTRAR);
  assert.ok(helper.includes("isSafeInternalPath(url)"));
  assert.ok(!/DeepLinkValidator/.test(helper.replace(/\/\/.*$/gm, "")));
  assert.ok(!/DeepLinkValidator/.test(registrar));
});

test("no console output in the new client code", () => {
  for (const file of ["src/lib/nativePushRegistration.ts", REGISTRAR]) {
    assert.ok(!/console\./.test(read(file)), file + " must not log");
  }
});

test("logout still deactivates the device's own platform + token; unregister() is deliberately not called", () => {
  const device = read("src/lib/nativePushDevice.ts");
  assert.ok(device.includes("buildLogoutBody(getNativePlatform(), token)"));
  assert.ok(device.includes("clearSavedNativeDeviceToken();"));
  assert.ok(!/unregister\(/.test(device));
  assert.ok(!/unregister\(/.test(read("src/lib/nativePushRegistration.ts")));
});

test("channel id matches the server payload (fcm.ts) and the manifest default", () => {
  assert.equal(ANDROID_PUSH_CHANNEL_ID, FCM_ANDROID_CHANNEL_ID);
  const manifest = read(MANIFEST);
  assert.ok(manifest.includes('android:name="com.google.firebase.messaging.default_notification_channel_id"'));
  assert.ok(manifest.includes('android:value="' + FCM_ANDROID_CHANNEL_ID + '"'));
});

// ── Manifest ────────────────────────────────────────────────────────────────

test("manifest adds no permissions: still exactly one uses-permission, and POST_NOTIFICATIONS is not duplicated", () => {
  const manifest = read(MANIFEST);
  assert.equal((manifest.match(/<uses-permission/g) ?? []).length, 1);
  assert.ok(!manifest.includes("POST_NOTIFICATIONS"), "it is merged from @capacitor/push-notifications");
});

test("manifest declares the default notification icon (ic_stat_elf, not a launcher file), keeps the channel metadata, and adds no color/unrelated metadata", () => {
  const manifest = read(MANIFEST);
  const m = manifest.match(/default_notification_icon"\s+android:resource="@drawable\/([A-Za-z0-9_]+)"/);
  assert.ok(m, "default_notification_icon metadata present");
  assert.equal(m![1], "ic_stat_elf");
  assert.ok(!/^ic_launcher/.test(m![1]));
  assert.ok(exists("android/app/src/main/res/drawable/ic_stat_elf.xml"));
  assert.ok(manifest.includes('android:name="com.google.firebase.messaging.default_notification_channel_id"'));
  assert.ok(manifest.includes('android:value="elf_default"'));
  assert.ok(!manifest.includes("default_notification_color"), "no branding color metadata: the monochrome icon needs none");
  const firebaseMeta = manifest.match(/com\.google\.firebase\.messaging\.[a-z_]+/g) ?? [];
  assert.deepEqual([...new Set(firebaseMeta)].sort(), [
    "com.google.firebase.messaging.default_notification_channel_id",
    "com.google.firebase.messaging.default_notification_icon",
  ]);
});

// ── Notification icon (res/drawable/ic_stat_elf.xml) ─────────────────────────────

const ICON = "android/app/src/main/res/drawable/ic_stat_elf.xml";

test("ic_stat_elf is a 24dp VectorDrawable made only of flat white <path> shapes (single color, transparent background)", () => {
  const xml = read(ICON).replace(/<!--[\s\S]*?-->/g, "");
  assert.match(xml, /<vector\b/);
  assert.match(xml, /android:width="24dp"/);
  assert.match(xml, /android:height="24dp"/);
  assert.match(xml, /android:viewportWidth="24"/);
  assert.match(xml, /android:viewportHeight="24"/);
  const paths = xml.match(/<path\b[\s\S]*?\/>/g) ?? [];
  assert.ok(paths.length >= 2, "crown body plus details");
  for (const p of paths) assert.match(p, /android:fillColor="#FFFFFFFF"/);
  // every element inside the vector is a <path>: no background rect/group/clip, gradient, stroke, text or image
  const elements = (xml.match(/<([a-zA-Z][\w:-]*)/g) ?? []).map(s => s.slice(1));
  assert.deepEqual([...new Set(elements)].sort(), ["path", "vector"]);
  assert.ok(!/gradient|aapt:attr|android:strokeColor|android:strokeWidth|android:tint|android:background|clip-path|<text|<image/i.test(xml));
  const colors = xml.match(/#[0-9A-Fa-f]{6,8}/g) ?? [];
  assert.ok(colors.length > 0 && colors.every(c => c.toUpperCase() === "#FFFFFFFF"), "single flat color");
});

test("ic_stat_elf keeps padding inside the 24dp box so the system can never crop the crown", () => {
  const xml = read(ICON);
  const paths = xml.match(/android:pathData="([^"]+)"/g) ?? [];
  assert.ok(paths.length >= 2);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const attr of paths) {
    const d = attr.slice('android:pathData="'.length, -1);
    const hasArc = /A/.test(d);
    // conservative bounds: absolute M/L/A endpoints, each expanded by the arc radius when the shape contains arcs
    const radius = hasArc ? Number(d.match(/A\s*([\d.]+)/)?.[1] ?? 0) : 0;
    for (const seg of d.split(/(?=[MLAZ])/)) {
      const cmd = seg[0];
      const nums = (seg.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      let x: number | undefined, y: number | undefined;
      if (cmd === "M" || cmd === "L") [x, y] = nums;
      if (cmd === "A") [x, y] = [nums[5], nums[6]];
      if (x === undefined || y === undefined) continue;
      minX = Math.min(minX, x - radius); maxX = Math.max(maxX, x + radius);
      minY = Math.min(minY, y - radius); maxY = Math.max(maxY, y + radius);
    }
  }
  const PAD = 1.5;
  assert.ok(minX >= PAD && minY >= PAD && maxX <= 24 - PAD && maxY <= 24 - PAD, `bounds ${minX},${minY}-${maxX},${maxY}`);
});

test("no absolute launcher/iOS asset was touched by the notification icon (launcher hashes are pinned below)", () => {
  assert.ok(!read(ICON).includes("ic_launcher"));
});

test("manifest still points the app icon at the approved launcher assets", () => {
  const manifest = read(MANIFEST);
  assert.ok(manifest.includes('android:icon="@mipmap/ic_launcher"'));
  assert.ok(manifest.includes('android:roundIcon="@mipmap/ic_launcher_round"'));
});

// ── Gradle / dependencies ────────────────────────────────────────────────────

test("Gradle: the existing conditional google-services apply is unchanged and no Firebase dependency was added", () => {
  const gradle = read("android/app/build.gradle");
  assert.ok(gradle.includes("apply plugin: 'com.google.gms.google-services'"));
  assert.ok(gradle.includes("file('google-services.json')"));
  assert.ok(!/firebase-messaging|firebase-bom|firebase-admin/.test(gradle));
  const pkg = read("package.json");
  assert.ok(!/firebase-admin|"firebase"|@firebase\//.test(pkg), "no Firebase npm dependency");
});

// ── Firebase client config safety (booleans only; skipped when the file is absent) ──

test("google-services.json is the Android client config, not a service-account key", { skip: !exists(GOOGLE_SERVICES) }, () => {
  const raw = read(GOOGLE_SERVICES);
  const json = JSON.parse(raw) as {
    project_info?: { project_id?: unknown; project_number?: unknown };
    client?: Array<{ client_info?: { mobilesdk_app_id?: unknown; android_client_info?: { package_name?: unknown } } }>;
  };
  const clients = Array.isArray(json.client) ? json.client : [];
  assert.ok(Boolean(json.project_info) && clients.length > 0, "has project_info and client[]");
  assert.ok(
    clients.every(c => c.client_info?.android_client_info?.package_name === "com.elitelevelfundraising.team"),
    "package name matches",
  );
  assert.ok(typeof json.project_info?.project_id === "string" && (json.project_info.project_id as string).length > 0, "project_id present");
  assert.ok(typeof json.project_info?.project_number === "string" && (json.project_info.project_number as string).length > 0, "project_number present");
  assert.ok(clients.some(c => typeof c.client_info?.mobilesdk_app_id === "string"), "mobilesdk_app_id present");
  assert.ok(!/"private_key"/.test(raw), "no private_key");
  assert.ok(!/"private_key_id"/.test(raw), "no private_key_id");
  assert.ok(!/"client_email"/.test(raw), "no client_email");
  assert.ok(!/"type"\s*:\s*"service_account"/.test(raw), "not a service-account file");
  assert.ok(!/BEGIN (RSA )?PRIVATE KEY/.test(raw), "no PEM material");
});

// ── Approved launcher icons must not change ─────────────────────────────────

const LAUNCHER_SHA256: Record<string, string> = {
  "android/app/src/main/res/drawable/ic_launcher_background.xml": "61acabdec7880108a9850fdc6cea1a6fc974114bae875bdcadc70078bf4e615f",
  "android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml": "fe3c9a470d9dfc34dfefa1cbbaf67f16174cdd3d242a1d4f6bd09483ea38c29b",
  "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml": "9df7f1f1fb647e45268dcc3d481a845b7b32e064f05c7ba78e76c3f0125a7c76",
  "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml": "9df7f1f1fb647e45268dcc3d481a845b7b32e064f05c7ba78e76c3f0125a7c76",
  "android/app/src/main/res/mipmap-hdpi/ic_launcher.png": "62826e5998426554bdef2a22209a9603d0a43c1aae097e7f136ddb6590c0f9bd",
  "android/app/src/main/res/mipmap-hdpi/ic_launcher_background.png": "484185f9d465a72ba850b42cb773294c5f4be9f27558981fd7216e84a8c552a0",
  "android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png": "9104b80c4b2b712a8f804eeebeff4b536ec7e572253b4c22c3d899581cc3ccd9",
  "android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png": "5c662586d2143ddf7619fb3cd2b787edabc12848959e934640d62e4c1343c578",
  "android/app/src/main/res/mipmap-ldpi/ic_launcher.png": "9a9af1c5bdb489affcac8171cf559e59bc6da15e616c8419d25bed918ed1fc9d",
  "android/app/src/main/res/mipmap-ldpi/ic_launcher_background.png": "6211115ac1236777d447c065d3c82bd15d80e61b571fc53b8eb1c54185a92567",
  "android/app/src/main/res/mipmap-ldpi/ic_launcher_foreground.png": "95a5adf13c7dfdcf6a4816310b665df76b5eeaacec0f42d36abd1e4776f63c2e",
  "android/app/src/main/res/mipmap-ldpi/ic_launcher_round.png": "c012d9e36778b2a4f0635c35f81d8321e2b0003393c5c44b8af9a0b4187c9f44",
  "android/app/src/main/res/mipmap-mdpi/ic_launcher.png": "6fca048e0b44fd0be7e3d6b1d1f1cb0a49e3390ae3f886b9a145d70d556cfa71",
  "android/app/src/main/res/mipmap-mdpi/ic_launcher_background.png": "feed83e5fb671d921e67e0aa977a47f5bcb7a1b66999f27ec0f5a89d9c696ca6",
  "android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png": "af0a598bdb9d40ee3181408104764de7e4725f3b467b12e0f01f2581384b776f",
  "android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png": "099c6993451e99e71945d4a4a3a8d7c686fc76b4009d74ffa936c6391b641928",
  "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png": "73a082bfafccf06b56a4f7ba2e1544e5541cffb80570c5223df3cfcdbc919930",
  "android/app/src/main/res/mipmap-xhdpi/ic_launcher_background.png": "38750d57401723d4130ce02b1e2151bc313648f8cee8af11b01eb583873ee04f",
  "android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png": "af96a7b45a20b2c82a7584b05805c4910fe78c9b0f3cec79fcbe5ce4e57ac39d",
  "android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png": "ebd4718c5e482e0d6a5611f9b248b0f0fe7d2475a85b3e042285f9d088ec7c19",
  "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png": "bd492640369460d41036d427e5be5d58825fb0b05f9321a0e9c2b34cd27da53d",
  "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.png": "46893802be4bcf9e2a595d6644142c5c8401bb2c6b4eeda3124eb931fa93fd4e",
  "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png": "00dd5357f7688ef2f006ca3848a61269e5733d57a6a1b6430c3491006e7f2484",
  "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png": "fe3e8617b3063d73f8b0bdc70ab366cb21c4347b82bbed1f80e4ffef90d71a80",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png": "29fa7df67b57ca699b194830f2720180e6c6a3b7bcdf46037a3896559c3deece",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.png": "fcb706bfc831f4c7e1749ddb37a9a314ade48a1ccd5577fff199254b7e40ada6",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png": "1ce73df721b2c2b39819145a9f2cb82d0b97d19c0946a84810bc3471e969957d",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png": "ee44979c1e6bbcd320269bb523afc3793c91829b7625aa447bca827a8e5928df",
  "android/app/src/main/res/values/ic_launcher_background.xml": "1cab1aa686b81505433a474a3408f56d39a3dff8f1ff66c16d866a8fa4b806be",
};

test("every launcher icon file is byte-identical to the approved artwork", () => {
  for (const [file, expected] of Object.entries(LAUNCHER_SHA256)) {
    const actual = createHash("sha256").update(readFileSync(join(process.cwd(), file))).digest("hex");
    assert.equal(actual, expected, file);
  }
  assert.ok(Object.keys(LAUNCHER_SHA256).length >= 29);
});

// ── Completed Android phases stay intact ────────────────────────────────────

test("MainActivity keeps back handling, the file bridge, deep links and super.onNewIntent (plugins still get notification-tap intents)", () => {
  const source = read(MAIN_ACTIVITY);
  assert.ok(source.includes("new OnBackPressedCallback(true)"));
  assert.ok(source.includes("AndroidFileBridge.JS_NAME"));
  assert.ok(source.includes("DeepLinkValidator.destinationFor("));
  assert.ok(source.includes("super.onNewIntent(intent); // Capacitor plugins still receive every intent"));
});

test("DeepLinkValidator and AndroidFileBridge sources still exist and DeepLinkValidator stays invite-only", () => {
  const validator = read("android/app/src/main/java/com/elitelevelfundraising/team/DeepLinkValidator.java");
  for (const family of ["join", "coach-activate", "reset-password", "staff-invite"]) {
    assert.ok(validator.includes(family), family);
  }
  assert.ok(!/\/messages|\/calendar|\/notifications/.test(validator.replace(/\/\/.*$/gm, "")), "no notification target paths");
  assert.ok(exists("android/app/src/main/java/com/elitelevelfundraising/team/AndroidFileBridge.java"));
});

test("server-side provider modules are untouched by the client phase", () => {
  assert.ok(read("src/lib/fcm.ts").includes('export const FCM_ANDROID_CHANNEL_ID = "elf_default";'));
  assert.ok(read("src/lib/apns.ts").includes('platform === "ios"'));
});
