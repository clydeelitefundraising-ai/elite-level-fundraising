// Tests for the ELF QA guard (run by rehearse-local.sh; also:
// node --test scripts/qa/guard.test.mjs). Synthetic values only.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateQaConfig, checkDbUrl, checkKey, loadQaConfig, isInsideRepository, parseEnvFile, QA_PROJECT_REF } from "./guard.mjs";
import { prepareBaseline } from "./prepare-baseline.mjs";
import { readFileSync } from "node:fs";

const QA = QA_PROJECT_REF;
const PROD = "nggabucgcoaffpppchsp";
const jwt = (payload) => ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");
const good = () => ({
  ELF_QA_MODE: "qa",
  QA_PROJECT_REF: QA,
  QA_SUPABASE_URL: `https://${QA}.supabase.co`,
  QA_SERVICE_ROLE_KEY: jwt({ ref: QA, role: "service_role" }),
  QA_ANON_KEY: jwt({ ref: QA, role: "anon" }),
  QA_DB_URL: `postgresql://postgres:p%40ss@db.${QA}.supabase.co:5432/postgres`,
});

test("a correct QA configuration passes, and the summary contains no secret", () => {
  const r = validateQaConfig(good());
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.deepEqual(r.summary, { mode: "qa", ref: QA, dbKind: "direct", dbHost: `db.${QA}.supabase.co`, dbUser: "postgres", dbName: "postgres" });
  assert.ok(!JSON.stringify(r.summary).includes("p%40ss") && !JSON.stringify(r.summary).includes("p@ss"));
});

test("the session pooler in the QA region is accepted only with the QA project's user", () => {
  const ok = { ...good(), QA_DB_URL: `postgresql://postgres.${QA}:x@aws-0-us-east-2.pooler.supabase.com:5432/postgres` };
  assert.equal(validateQaConfig(ok).ok, true);
  for (const url of [
    `postgresql://postgres.${PROD}:x@aws-0-us-east-2.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${QA}:x@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:x@aws-0-us-east-2.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${QA}:x@aws-0-us-east-2.pooler.supabase.com:6543/postgres`,
  ]) assert.equal(validateQaConfig({ ...good(), QA_DB_URL: url }).ok, false, url);
});

test("the PRODUCTION project is refused wherever it appears", () => {
  const variants = [
    { QA_PROJECT_REF: PROD },
    { QA_SUPABASE_URL: `https://${PROD}.supabase.co` },
    { QA_DB_URL: `postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres` },
    { QA_SERVICE_ROLE_KEY: jwt({ ref: PROD, role: "service_role" }) },
    { QA_ANON_KEY: jwt({ ref: PROD, role: "anon" }) },
    { SOME_NOTE: `copied from ${PROD.toUpperCase()}` },
  ];
  for (const v of variants) {
    const r = validateQaConfig({ ...good(), ...v });
    assert.equal(r.ok, false, JSON.stringify(Object.keys(v)));
    assert.ok(r.errors.some(e => /PRODUCTION|ref|different project|must be/.test(e)), r.errors.join("; "));
  }
  assert.ok(validateQaConfig({ ...good(), QA_DB_URL: `postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres` })
    .errors.some(e => e.includes("PRODUCTION")));
});

test("any other project, host, scheme or key is refused", () => {
  const bad = [
    { QA_PROJECT_REF: "abcdefghijklmnopqrst" },
    { QA_SUPABASE_URL: `http://${QA}.supabase.co` },
    { QA_SUPABASE_URL: `https://${QA}.supabase.co.evil.example` },
    { QA_SUPABASE_URL: `https://${QA}.supabase.co/rest/v1` },
    { QA_DB_URL: `postgresql://postgres:x@db.other.supabase.co:5432/postgres` },
    { QA_DB_URL: `postgresql://postgres:x@localhost:55439/postgres` },
    { QA_DB_URL: `postgresql://postgres:x@db.${QA}.supabase.co:5432/template1` },
    { QA_DB_URL: `postgresql://admin:x@db.${QA}.supabase.co:5432/postgres` },
    { QA_DB_URL: `mysql://postgres:x@db.${QA}.supabase.co:5432/postgres` },
    { QA_SERVICE_ROLE_KEY: jwt({ ref: QA, role: "anon" }) },
    { QA_SERVICE_ROLE_KEY: "not-a-key" },
    { QA_ANON_KEY: jwt({ ref: "abcdefghijklmnopqrst", role: "anon" }) },
    { ELF_QA_MODE: "production" },
    { QA_DB_URL: "" },
  ];
  for (const v of bad) assert.equal(validateQaConfig({ ...good(), ...v }).ok, false, JSON.stringify(v));
});

test("new-format keys are accepted with a warning (verified at connect time)", () => {
  const r = validateQaConfig({ ...good(), QA_SERVICE_ROLE_KEY: "sb_secret_abc", QA_ANON_KEY: "sb_publishable_abc" });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 2);
  assert.equal(checkKey("K", "sb_publishable_x", QA, "service_role").ok, false, "a publishable key is never the service key");
});

test("local rehearsal: localhost on a dedicated port only, and no cloud values at all", () => {
  const local = { ELF_QA_MODE: "local-rehearsal", QA_PROJECT_REF: "local-rehearsal", QA_DB_URL: "postgresql://postgres@localhost:55439/elfqa" };
  assert.equal(validateQaConfig(local).ok, true);
  for (const v of [
    { QA_DB_URL: "postgresql://postgres@localhost:5432/elfqa" },
    { QA_DB_URL: `postgresql://postgres:x@db.${QA}.supabase.co:5432/postgres` },
    { QA_SUPABASE_URL: `https://${QA}.supabase.co` },
    { QA_SERVICE_ROLE_KEY: jwt({ ref: QA, role: "service_role" }) },
    { QA_PROJECT_REF: QA },
  ]) assert.equal(validateQaConfig({ ...local, ...v }).ok, false, JSON.stringify(v));
  assert.equal(checkDbUrl("postgresql://p@db.example.com:55439/x", "local-rehearsal", "local-rehearsal").ok, false);
});

test("the config file must live outside every repository", () => {
  assert.equal(isInsideRepository("C:\\Projects\\elf-complete-season\\qa.env"), true);
  assert.equal(isInsideRepository("C:/projects/anything/qa.env"), true);
  const dir = mkdtempSync(join(tmpdir(), "elfqa-"));
  const f = join(dir, "qa.env");
  writeFileSync(f, Object.entries(good()).map(([k, v]) => `${k}="${v}"`).join("\n"));
  assert.equal(isInsideRepository(f), false);
  assert.equal(loadQaConfig(f).ok, true);
  assert.equal(validateQaConfig(good(), { envFilePath: "C:\\Projects\\x\\qa.env" }).ok, false);
  assert.equal(loadQaConfig(join(dir, "missing.env")).ok, false);
});

test("env parsing handles quotes and comments", () => {
  assert.deepEqual(parseEnvFile("# c\nA=1\nB=\"two\"\nC='3'\n\nbad line\n"), { A: "1", B: "two", C: "3" });
});

test("baseline preparation removes exactly the platform-managed rls_auto_enable function and its 3 grants", () => {
  const src = readFileSync(new URL("../../supabase/baseline/schema.sql", import.meta.url), "utf8");
  const { text, removedLines } = prepareBaseline(src);
  assert.ok(!text.includes("rls_auto_enable"));
  assert.equal(removedLines, 33);
  assert.equal(src.split(/\r?\n/).length - text.split(/\r?\n/).length, 33);
  assert.throws(() => prepareBaseline(text), /not found/);
});
