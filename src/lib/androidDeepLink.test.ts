// Phase 1C.3: Android deep links. Two layers:
//  1. The REAL DeepLinkValidator.java is compiled and run with the JDK (it is pure Java on purpose)
//     against the full accept/reject matrix. Skipped, with a clear reason, if no JDK is found.
//  2. Static guards over MainActivity / the manifest: strict route families, one cold-start hook,
//     replay protection, and no token logging.
// All tokens below are placeholders.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const MAIN_ACTIVITY = "android/app/src/main/java/com/elitelevelfundraising/team/MainActivity.java";
const VALIDATOR = "android/app/src/main/java/com/elitelevelfundraising/team/DeepLinkValidator.java";
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const CAP_CONFIG = "capacitor.config.ts";
const ORIGIN = "https://app.elitelevelfundraising.com";

// ── JDK harness ─────────────────────────────────────────────────────────────

function findTool(name: "javac" | "java"): string | null {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const candidates: string[] = [];
  if (process.env.JAVA_HOME) candidates.push(join(process.env.JAVA_HOME, "bin", exe));
  candidates.push("C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\" + exe);
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    execFileSync(name, ["-version"], { stdio: "ignore" });
    return name;
  } catch {
    return null;
  }
}

const HARNESS = `package com.elitelevelfundraising.team;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Base64;

public class DeepLinkHarness {
    public static void main(String[] args) throws Exception {
        for (String line : Files.readAllLines(Paths.get(args[0]), StandardCharsets.UTF_8)) {
            String input = new String(Base64.getDecoder().decode(line), StandardCharsets.UTF_8);
            String result = DeepLinkValidator.destinationFor(input);
            System.out.println(result == null ? "NULL" : result);
        }
        System.out.println("URL:" + DeepLinkValidator.urlFor("/join/EXAMPLE1"));
        System.out.println("DUP1:" + DeepLinkValidator.isDuplicate("/join/EXAMPLE1", 1000, "/join/EXAMPLE1", 1500));
        System.out.println("DUP2:" + DeepLinkValidator.isDuplicate("/join/EXAMPLE1", 1000, "/join/EXAMPLE1", 6000));
        System.out.println("DUP3:" + DeepLinkValidator.isDuplicate("/join/EXAMPLE1", 1000, "/join/OTHER", 1500));
        System.out.println("DUP4:" + DeepLinkValidator.isDuplicate(null, 0, "/join/EXAMPLE1", 10));
        System.out.println("DUP5:" + DeepLinkValidator.isDuplicate("/join/EXAMPLE1", 5000, "/join/EXAMPLE1", 1000));
    }
}
`;

const VALID: Array<[string, string]> = [
  [`${ORIGIN}/join/ABC123`, "/join/ABC123"],
  [`${ORIGIN}/coach-activate/example`, "/coach-activate/example"],
  [`${ORIGIN}/reset-password/example`, "/reset-password/example"],
  [`${ORIGIN}/staff-invite/example`, "/staff-invite/example"],
  // legitimate query preserved verbatim
  [`${ORIGIN}/join/ABC123?utm=x&a=b`, "/join/ABC123?utm=x&a=b"],
  [`${ORIGIN}/coach-activate/example?src=email&x=1%202`.replace("%202", "%3D2"), "/coach-activate/example?src=email&x=1%3D2"],
  // scheme/host are case-insensitive; explicit :443 is the default port
  ["HTTPS://APP.ELITELEVELFUNDRAISING.COM/join/ABC123", "/join/ABC123"],
  [`https://app.elitelevelfundraising.com:443/join/ABC123`, "/join/ABC123"],
  // one trailing slash is dropped (avoids a framework redirect hop); empty query is dropped
  [`${ORIGIN}/join/ABC123/`, "/join/ABC123"],
  [`${ORIGIN}/join/ABC123?`, "/join/ABC123"],
  // safe percent-encoding of an unreserved character is fine
  [`${ORIGIN}/join/A%2DB`, "/join/A%2DB"],
  [`${ORIGIN}/staff-invite/a_b-c.d~e`, "/staff-invite/a_b-c.d~e"],
];

const CTRL = String.fromCharCode(1);
const INVALID: Array<[string, string]> = [
  ["http instead of https", `http://app.elitelevelfundraising.com/join/ABC123`],
  ["www host", `https://www.elitelevelfundraising.com/join/ABC123`],
  ["vercel.app host", `https://elf-team-app.vercel.app/join/ABC123`],
  ["unrelated host", `https://evil.example/join/ABC123`],
  ["lookalike suffix host", `https://app.elitelevelfundraising.com.evil.example/join/ABC123`],
  ["lookalike prefix host", `https://evil-app.elitelevelfundraising.com/join/ABC123`],
  ["trailing-dot host", `https://app.elitelevelfundraising.com./join/ABC123`],
  ["non-default port", `https://app.elitelevelfundraising.com:8443/join/ABC123`],
  ["userinfo", `https://user@app.elitelevelfundraising.com/join/ABC123`],
  ["userinfo host trick", `https://app.elitelevelfundraising.com@evil.example/join/ABC123`],
  ["bare /join", `${ORIGIN}/join`],
  ["/join/ (empty code)", `${ORIGIN}/join/`],
  ["/joinfoo", `${ORIGIN}/joinfoo`],
  ["/joinfoo/x", `${ORIGIN}/joinfoo/x`],
  ["/coach-activatefoo/x", `${ORIGIN}/coach-activatefoo/x`],
  ["bare /coach-activate", `${ORIGIN}/coach-activate`],
  ["bare /reset-password", `${ORIGIN}/reset-password`],
  ["bare /staff-invite", `${ORIGIN}/staff-invite`],
  ["unrelated path /login", `${ORIGIN}/login`],
  ["unrelated path /team/x", `${ORIGIN}/team/x`],
  ["root", `${ORIGIN}/`],
  ["family case mismatch", `${ORIGIN}/Join/ABC123`],
  ["extra segment", `${ORIGIN}/join/ABC123/more`],
  ["double slash after family", `${ORIGIN}//join/ABC123`],
  ["double slash inside", `${ORIGIN}/join//ABC123`],
  ["double slash trailing", `${ORIGIN}/join/ABC123//`],
  ["fragment", `${ORIGIN}/join/ABC123#frag`],
  ["fragment in query", `${ORIGIN}/join/ABC123?a=b#frag`],
  ["backslash in path", `${ORIGIN}/join/AB\\C123`],
  ["backslash in query", `${ORIGIN}/join/ABC123?a=b\\c`],
  ["encoded slash", `${ORIGIN}/join/AB%2FC`],
  ["encoded backslash", `${ORIGIN}/join/AB%5CC`],
  ["encoded null", `${ORIGIN}/join/AB%00C`],
  ["double encoding", `${ORIGIN}/join/AB%252FC`],
  ["dot segment", `${ORIGIN}/join/.`],
  ["dot-dot segment", `${ORIGIN}/join/..`],
  ["encoded dot-dot segment", `${ORIGIN}/join/%2e%2e`],
  ["malformed percent (path)", `${ORIGIN}/join/AB%ZZ`],
  ["truncated percent (path)", `${ORIGIN}/join/AB%2`],
  ["malformed percent (query)", `${ORIGIN}/join/ABC123?a=%GG`],
  ["encoded CRLF in query", `${ORIGIN}/join/ABC123?a=%0d%0aSet-Cookie:x`],
  ["control character", `${ORIGIN}/join/AB${CTRL}C`],
  ["space", `${ORIGIN}/join/AB C`],
  ["non-ascii", `${ORIGIN}/join/ABÇ`],
  ["angle brackets", `${ORIGIN}/join/<script>`],
  ["over-length URL", `${ORIGIN}/join/${"A".repeat(2100)}`],
  ["over-length segment", `${ORIGIN}/join/${"A".repeat(201)}`],
  ["over-length query", `${ORIGIN}/join/ABC123?${"a".repeat(1025)}`],
  ["javascript: scheme", `javascript:alert(1)`],
  ["intent: scheme", `intent://app.elitelevelfundraising.com/join/ABC123#Intent;scheme=https;end`],
  ["file: scheme", `file:///sdcard/join/ABC123`],
  ["content: scheme", `content://com.example/join/ABC123`],
  ["data: scheme", `data:text/html,hello`],
  ["market: scheme", `market://details?id=x`],
  ["custom scheme", `elfteam://join/ABC123`],
  ["scheme only", `https://`],
  ["host only", `https://app.elitelevelfundraising.com`],
  ["empty string", ``],
];

const jdk = { javac: findTool("javac"), java: findTool("java") };
const skipReason = jdk.javac && jdk.java ? false : "no JDK (javac/java) found via JAVA_HOME, Android Studio jbr or PATH";

let results: string[] = [];
if (!skipReason) {
  const dir = mkdtempSync(join(tmpdir(), "elf-deeplink-"));
  try {
    const pkgDir = join(dir, "src", "com", "elitelevelfundraising", "team");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "DeepLinkHarness.java"), HARNESS);
    writeFileSync(join(pkgDir, "DeepLinkValidator.java"), read(VALIDATOR));
    const out = join(dir, "out");
    mkdirSync(out);
    execFileSync(
      jdk.javac as string,
      ["-d", out, join(pkgDir, "DeepLinkValidator.java"), join(pkgDir, "DeepLinkHarness.java")],
      { stdio: "pipe" },
    );
    const inputs = [...VALID.map(v => v[0]), ...INVALID.map(v => v[1])];
    // one base64 input per line (an empty input is an empty line; the trailing newline keeps it counted)
    writeFileSync(join(dir, "cases.txt"), inputs.map(i => Buffer.from(i, "utf8").toString("base64")).join("\n") + "\n");
    const stdout = execFileSync(jdk.java as string, ["-cp", out, "com.elitelevelfundraising.team.DeepLinkHarness", join(dir, "cases.txt")], {
      encoding: "utf8",
    });
    results = stdout.split(/\r?\n/).filter(l => l.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("DeepLinkValidator.java compiles and runs under a plain JDK", { skip: skipReason }, () => {
  assert.ok(results.length >= VALID.length + INVALID.length, "harness produced output for every case");
});

for (let i = 0; i < VALID.length; i++) {
  const [input, expected] = VALID[i];
  test(`DeepLinkValidator accepts ${input.replace(ORIGIN, "<origin>")}`, { skip: skipReason }, () => {
    assert.equal(results[i], expected);
  });
}

for (let i = 0; i < INVALID.length; i++) {
  const [label] = INVALID[i];
  test(`DeepLinkValidator rejects: ${label}`, { skip: skipReason }, () => {
    assert.equal(results[VALID.length + i], "NULL");
  });
}

test("DeepLinkValidator builds URLs only from the fixed origin", { skip: skipReason }, () => {
  assert.ok(results.includes(`URL:${ORIGIN}/join/EXAMPLE1`));
});

test("DeepLinkValidator duplicate/replay window: same destination twice quickly is a duplicate, otherwise not", { skip: skipReason }, () => {
  assert.ok(results.includes("DUP1:true"), "same destination within the window");
  assert.ok(results.includes("DUP2:false"), "same destination after the window");
  assert.ok(results.includes("DUP3:false"), "different destination");
  assert.ok(results.includes("DUP4:false"), "nothing handled yet");
  assert.ok(results.includes("DUP5:false"), "clock going backwards is never a duplicate");
});

// ── Static wiring ───────────────────────────────────────────────────────────

test("DeepLinkValidator has no android imports and never logs or prints", () => {
  const source = read(VALIDATOR);
  assert.ok(!/import android\./.test(source), "must stay pure Java so it can be unit-tested with a plain JDK");
  assert.ok(!/\bLog\.\w+\s*\(/.test(source), "no android.util.Log calls");
  assert.ok(!/System\.(out|err)/.test(source), "no stdout/stderr output");
  assert.ok(!/new \w*Exception\s*\(/.test(source), "no exception construction that could embed the URL");
});

test("manifest claims exactly the four link families, with trailing slashes", () => {
  const manifest = read(MANIFEST);
  const prefixes = [...manifest.matchAll(/android:pathPrefix="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(prefixes.sort(), ["/coach-activate/", "/join/", "/reset-password/", "/staff-invite/"]);
  assert.ok(!/pathPrefix="\/join"/.test(manifest), "the old bare /join prefix also matched /joinfoo");
  assert.ok(!/pathPrefix="\/coach-activate"/.test(manifest), "the old bare /coach-activate prefix also matched /coach-activatefoo");
});

test("manifest keeps https + the app host + autoVerify + VIEW/DEFAULT/BROWSABLE, and claims no other host", () => {
  const manifest = read(MANIFEST);
  assert.ok(manifest.includes('<intent-filter android:autoVerify="true">'));
  assert.ok(manifest.includes('android:name="android.intent.action.VIEW"'));
  assert.ok(manifest.includes('android:name="android.intent.category.DEFAULT"'));
  assert.ok(manifest.includes('android:name="android.intent.category.BROWSABLE"'));
  const schemes = [...manifest.matchAll(/android:scheme="([^"]+)"/g)].map(m => m[1]);
  assert.ok(schemes.length === 4 && schemes.every(s => s === "https"));
  const hosts = [...manifest.matchAll(/android:host="([^"]+)"/g)].map(m => m[1]);
  assert.ok(hosts.length === 4 && hosts.every(h => h === "app.elitelevelfundraising.com"));
  assert.ok(!/www\.elitelevelfundraising|vercel\.app/.test(manifest.replace(/<!--[\s\S]*?-->/g, "")));
});

test("manifest keeps singleTask + exported MainActivity and adds no permissions", () => {
  const manifest = read(MANIFEST);
  assert.ok(manifest.includes('android:launchMode="singleTask"'));
  assert.ok(/android:exported="true"/.test(manifest));
  const permissions = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(permissions, ["android.permission.INTERNET"]);
});

test("MainActivity uses the validator for cold start (onCreate) and warm/background (onNewIntent)", () => {
  const source = read(MAIN_ACTIVITY);
  assert.ok(source.includes("DeepLinkValidator.destinationFor("));
  assert.ok(/protected void onNewIntent\(Intent intent\)/.test(source));
  assert.ok(/protected void onCreate\(Bundle savedInstanceState\)/.test(source));
});

test("cold start overrides Capacitor's first URL via server.appStartPath BEFORE super.onCreate (no post-load handoff)", () => {
  const source = read(MAIN_ACTIVITY);
  const onCreate = source.slice(source.indexOf("protected void onCreate"));
  assert.ok(onCreate.indexOf("this.config = deepLinkConfig") !== -1);
  assert.ok(
    onCreate.indexOf("this.config = deepLinkConfig") < onCreate.indexOf("super.onCreate(savedInstanceState)"),
    "config must be assigned before BridgeActivity.load() builds the bridge",
  );
  assert.ok(source.includes('server.put("appStartPath", destination)'));
  assert.ok(!/postDelayed|Thread\.sleep|Handler\(/.test(source), "no arbitrary delays");
});

test("MainActivity only loads validated destinations on the fixed origin, never raw intent data", () => {
  const source = read(MAIN_ACTIVITY);
  const loads = [...source.matchAll(/\.loadUrl\(([^)]*)\)/g)].map(m => m[1].trim());
  assert.deepEqual(loads, ["target"]);
  assert.ok(source.includes("String target = DeepLinkValidator.urlFor(destination);"));
  assert.ok(!/loadUrl\([^)]*(getData|getDataString)/.test(source));
  assert.ok(source.includes("DeepLinkValidator.ORIGIN.equals(serverUrl)"), "override only applies when server.url is the ELF origin");
});

test("replay protection: consumed intents, launched-from-history ignored, recreated activity ignored, duplicate window", () => {
  const source = read(MAIN_ACTIVITY);
  assert.ok(source.includes("FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY"));
  assert.ok(source.includes("intent.setData(null)"));
  assert.ok(source.includes("launchIntent.setData(null)"));
  assert.ok(source.includes("savedInstanceState == null"));
  assert.ok(source.includes("DeepLinkValidator.isDuplicate("));
  assert.ok(source.includes("if (inCreate || intent == null) return;"), "load() re-delivers the launch intent from inside onCreate");
});

test("no token can reach a log, toast or exception message from MainActivity", () => {
  const source = read(MAIN_ACTIVITY);
  assert.ok(!/\bLog\.\w+\s*\(/.test(source));
  assert.ok(!/Toast/.test(source));
  assert.ok(!/System\.(out|err)/.test(source));
  assert.ok(!/printStackTrace/.test(source));
  assert.ok(!/Logger\./.test(source));
  assert.ok(source.includes('android.put("loggingBehavior", "none")'), "Capacitor's 'Loading app at <url>' line is switched off for deep-link launches");
});

test("Phase 1C.1 back handling and Phase 1C.2 file bridge are still registered by MainActivity", () => {
  const source = read(MAIN_ACTIVITY);
  assert.ok(source.includes("new OnBackPressedCallback(true)"));
  assert.ok(source.includes("getOnBackPressedDispatcher().addCallback(this,"));
  assert.ok(source.includes("addJavascriptInterface(new AndroidFileBridge(this), AndroidFileBridge.JS_NAME)"));
  assert.ok(!/void\s+onBackPressed\s*\(/.test(source));
});

test("no new dependency or shared config: capacitor.config.ts has no appStartPath / @capacitor/app, package.json unchanged", () => {
  const config = read(CAP_CONFIG);
  assert.ok(!/appStartPath/.test(config));
  assert.ok(!/@capacitor\/app\b/.test(config));
  const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
  assert.ok(!("@capacitor/app" in (pkg.dependencies ?? {})));
});
