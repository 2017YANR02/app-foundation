import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  CODE_DIGEST_VERSION, generateNumericCode, constantTimeEqualHex,
  createCodeDigest, matchesCodeDigest, evaluateVerification, remainingCooldownMs,
} from "../dist/index.js";

const secret = "synthetic-key-for-tests-only-000000000000";
const input = { secret, purpose: "purpose-one", channel: "email", target: "test@example.invalid", challengeId: "challenge-one", code: "000123" };
const state = { status: "sent", expiresAtMs: 2000, attempts: 0, consumedAtMs: null };
const check = { nowMs: 1000, maxAttempts: 5, matches: true };

test("numeric generation has exact supported lengths and cryptographic defaults", () => {
  assert.match(generateNumericCode(), /^[0-9]{6}$/);
  for (let digits = 4; digits <= 10; digits++) {
    for (let i = 0; i < 10; i++) assert.match(generateNumericCode(digits), new RegExp(`^[0-9]{${digits}}$`));
  }
  for (const digits of [0, 3, 11, 6.5, NaN, Infinity, "6", null]) assert.throws(() => generateNumericCode(digits), TypeError);
});

test("strict hex rejects truncation, odd/empty strings and runtime type confusion", () => {
  assert.equal(constantTimeEqualHex("0011aaff", "0011AAFF"), true);
  assert.equal(constantTimeEqualHex("0011aaff", "0011aa00"), false);
  for (const [left, right] of [["", ""], ["a", "a"], ["ffz", "ffz"], ["ffzz", "ffzz"], ["00\n", "00\n"], ["00", "0000"], [null, null], [0, 0], [Buffer.from("a"), Buffer.from("a")]]) {
    assert.equal(constantTimeEqualHex(left, right), false);
  }
});

test("HMAC format is versioned, domain-separated and independently reproducible", () => {
  const message = JSON.stringify(["app-foundation/verification/v1", input.purpose, input.channel, input.target, input.challengeId, input.code]);
  const expected = "v1$" + createHmac("sha256", secret).update(message).digest("hex");
  assert.equal(CODE_DIGEST_VERSION, "v1");
  assert.equal(createCodeDigest(input), expected);
  assert.equal(matchesCodeDigest(input, expected), true);
  assert.equal(createCodeDigest({ ...input, secret: Buffer.from(secret) }), expected);
});

test("purpose, channel, target, challenge and independent application key are all bound", () => {
  const digest = createCodeDigest(input);
  for (const patch of [{ purpose: "purpose-two" }, { channel: "sms" }, { target: "other@example.invalid" }, { challengeId: "challenge-two" }, { code: "123000" }, { secret: "another-synthetic-key-0000000000000000" }]) {
    assert.equal(matchesCodeDigest({ ...input, ...patch }, digest), false);
  }
  assert.notEqual(createCodeDigest({ ...input, purpose: "a\nb", channel: "c" }), createCodeDigest({ ...input, purpose: "a", channel: "b\nc" }));
  assert.notEqual(createCodeDigest({ ...input, target: "Test@example.invalid" }), digest);
});

test("digest parsing rejects legacy hashes, unknown versions and malformed encodings", () => {
  const digest = createCodeDigest(input);
  for (const value of [digest.slice(3), digest.replace("v1$", "v2$"), digest + "0", digest + "\n", "v1$" + "z".repeat(64), digest.toUpperCase(), null, 1]) {
    assert.equal(matchesCodeDigest(input, value), false);
  }
});

test("digest creation validates keys, scope and code without embedding private input in errors", () => {
  for (const patch of [{ secret: "short" }, { secret: new Uint8Array(31) }, { secret: new Uint8Array(4097) }, { secret: null }, { target: "" }, { purpose: 1 }, { challengeId: "x".repeat(1025) }, { channel: null }, { code: "１２３４５６" }, { code: "123" }, { code: "12345678901" }, { code: "123456\n" }, { code: 123456 }]) {
    assert.throws(() => createCodeDigest({ ...input, ...patch }), error => error instanceof TypeError && !error.message.includes(secret) && !error.message.includes(input.target));
    assert.equal(matchesCodeDigest({ ...input, ...patch }, createCodeDigest(input)), false);
  }
});

test("a valid match consumes exactly once without mutating caller input", () => {
  const original = structuredClone(state);
  const result = evaluateVerification(Object.freeze({ ...state }), check);
  assert.equal(result.ok, true); assert.equal(result.reason, "verified");
  assert.deepEqual(result.nextState, { ...state, status: "consumed", consumedAtMs: 1000 });
  assert.deepEqual(state, original);
  assert.equal(evaluateVerification(result.nextState, check).reason, "consumed");
});

test("pending/failed and a stale sent status with consumption timestamp never verify", () => {
  for (const status of ["pending", "failed"]) assert.equal(evaluateVerification({ ...state, status }, check).reason, "not_sent");
  assert.equal(evaluateVerification({ ...state, consumedAtMs: 999 }, check).reason, "consumed");
  assert.equal(evaluateVerification({ ...state, status: "consumed" }, check).reason, "consumed");
});

test("expiry uses explicit milliseconds and rejects the exact expiry boundary", () => {
  assert.equal(evaluateVerification(state, { ...check, nowMs: 1999 }).ok, true);
  assert.equal(evaluateVerification(state, { ...check, nowMs: 2000 }).reason, "expired");
  assert.equal(evaluateVerification(state, { ...check, nowMs: 2001 }).reason, "expired");
});

test("failed guesses persist counters and consume on the final allowed guess", () => {
  let current = state;
  for (let guesses = 1; guesses <= 5; guesses++) {
    const result = evaluateVerification(current, { ...check, matches: false });
    assert.equal(result.ok, false); assert.equal(result.reason, "mismatch");
    assert.equal(result.nextState.attempts, guesses);
    assert.equal(result.nextState.status, guesses === 5 ? "consumed" : "sent");
    current = result.nextState;
  }
  assert.equal(evaluateVerification(current, check).ok, false);
  assert.equal(evaluateVerification({ ...state, attempts: 5 }, check).reason, "attempts_exhausted");
  assert.equal(evaluateVerification({ ...state, attempts: 4 }, check).ok, true);
});

test("malformed lifecycle runtime inputs fail closed without proposing a write", () => {
  for (const patch of [{ attempts: -1 }, { attempts: 0.5 }, { attempts: Number.MAX_SAFE_INTEGER + 1 }, { expiresAtMs: NaN }, { expiresAtMs: Infinity }, { expiresAtMs: "2000" }, { status: "unknown" }, { consumedAtMs: undefined }, { consumedAtMs: -1 }]) {
    assert.deepEqual(evaluateVerification({ ...state, ...patch }, check), { ok: false, reason: "invalid", nextState: null });
  }
  for (const patch of [{ nowMs: -1 }, { nowMs: "1000" }, { maxAttempts: 0 }, { maxAttempts: 1.5 }, { matches: "true" }]) assert.equal(evaluateVerification(state, { ...check, ...patch }).reason, "invalid");
});

test("cooldown boundary, absent issue, backwards clock and caller-owned failure policy", () => {
  const value = { lastIssuedAtMs: 1000, nowMs: 1001, cooldownMs: 60000 };
  assert.equal(remainingCooldownMs(value), 59999);
  assert.equal(remainingCooldownMs({ ...value, nowMs: 61000 }), 0);
  assert.equal(remainingCooldownMs({ ...value, nowMs: 100000 }), 0);
  assert.equal(remainingCooldownMs({ ...value, nowMs: 999 }), 60000);
  assert.equal(remainingCooldownMs({ ...value, lastIssuedAtMs: null }), 0);
  assert.equal(remainingCooldownMs({ ...value, cooldownMs: 0 }), 0);
  for (const patch of [{ nowMs: NaN }, { lastIssuedAtMs: -1 }, { cooldownMs: 1.1 }, { lastIssuedAtMs: undefined }]) assert.throws(() => remainingCooldownMs({ ...value, ...patch }), TypeError);
});

test("consumer transaction example serializes concurrent successes and rolls back failed protected action", async () => {
  let stored = structuredClone(state);
  let protectedActions = 0;
  let tail = Promise.resolve();
  const consume = shouldFail => {
    const transaction = tail.then(() => {
      const decision = evaluateVerification(stored, check);
      if (decision.ok && shouldFail) throw new Error("synthetic business failure");
      if (decision.nextState) stored = decision.nextState;
      if (decision.ok) protectedActions++;
      return decision.ok;
    });
    tail = transaction.catch(() => {});
    return transaction;
  };
  await assert.rejects(consume(true), /synthetic business failure/);
  assert.equal(stored.status, "sent");
  assert.deepEqual(await Promise.all([consume(false), consume(false)]), [true, false]);
  assert.equal(protectedActions, 1);
});

test("two application scopes use independent keys, delivery state and storage", () => {
  const a = { ...input, secret: "application-a-test-key-0000000000000" };
  const b = { ...input, secret: "application-b-test-key-0000000000000" };
  const digestA = createCodeDigest(a); const digestB = createCodeDigest(b);
  assert.equal(matchesCodeDigest(b, digestA), false);
  assert.equal(matchesCodeDigest(a, digestB), false);
  const consumedA = evaluateVerification(state, { ...check, matches: matchesCodeDigest(a, digestA) });
  const pendingB = evaluateVerification({ ...state, status: "pending" }, { ...check, matches: matchesCodeDigest(b, digestB) });
  assert.equal(consumedA.ok, true); assert.equal(pendingB.ok, false); assert.equal(pendingB.nextState.status, "pending");
});
