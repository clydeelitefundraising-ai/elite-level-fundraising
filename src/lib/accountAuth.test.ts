import test from "node:test";
import assert from "node:assert/strict";
import {
  generateAccountSalt,
  hashAccountPassword,
  makeAccountCookie,
  verifyAccountCookie,
} from "./accountAuth.ts";

// Phase A33: password recovery relies on salt rotation to invalidate every
// existing elf_session cookie for an account, with no sessions table and no
// change to verifyAccountCookie itself (see accountAuth.ts). This test
// proves that reliance is sound: a cookie minted under the OLD salt must
// fail verification once the account's salt has been rotated, using the
// exact same verification function every authenticated request already
// calls — nothing about session verification was changed to make this true.

const prevPepper = process.env.ELF_ACCOUNT_PEPPER;
process.env.ELF_ACCOUNT_PEPPER = "test-pepper-for-account-auth-spec";
test.after(() => {
  if (prevPepper === undefined) delete process.env.ELF_ACCOUNT_PEPPER;
  else process.env.ELF_ACCOUNT_PEPPER = prevPepper;
});

test("password reset session invalidation: an elf_session cookie minted under the old salt fails verification after rotation", () => {
  const accountId = "11111111-1111-1111-1111-111111111111";

  const oldSalt   = generateAccountSalt();
  const oldCookie = makeAccountCookie(accountId, oldSalt);
  assert.equal(verifyAccountCookie(oldCookie, accountId, oldSalt), true);

  // Simulate the reset endpoint's salt rotation.
  const newSalt = generateAccountSalt();
  assert.notEqual(newSalt, oldSalt);

  // The old cookie, checked against the account's NEW current salt (what
  // every real request does via a fresh DB read), must now fail.
  assert.equal(verifyAccountCookie(oldCookie, accountId, newSalt), false);

  // A cookie minted under the new salt verifies correctly going forward.
  const newCookie = makeAccountCookie(accountId, newSalt);
  assert.equal(verifyAccountCookie(newCookie, accountId, newSalt), true);
});

test("password reset changes the stored password hash so the old password no longer verifies", () => {
  const salt = generateAccountSalt();
  const oldHash = hashAccountPassword("old-password-123", salt);

  const newSalt = generateAccountSalt();
  const newHash = hashAccountPassword("new-password-456", newSalt);

  assert.notEqual(oldHash, newHash);
  // Old password checked against the new stored hash/salt must fail.
  assert.notEqual(hashAccountPassword("old-password-123", newSalt), newHash);
  // New password verifies against the new stored hash.
  assert.equal(hashAccountPassword("new-password-456", newSalt), newHash);
});
