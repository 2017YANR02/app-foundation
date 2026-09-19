# @app-foundation/verification

Local 0.1.0 candidate for Node >=22. Pure server-side verification-code cryptography
and lifecycle rules, compiled as CommonJS with TypeScript declarations. Not published.
No database, environment reads, network, messages, account types or application templates.

```ts
import {
  generateNumericCode, createCodeDigest, matchesCodeDigest, evaluateVerification,
} from "@app-foundation/verification";

const binding = {
  secret: applicationVerificationKey, // at least 32 independently random bytes
  purpose: "application-owned-purpose",
  channel: "email",
  target: canonicalTarget, // normalize and validate in the application
  challengeId: uniqueChallengeId,
};
const code = generateNumericCode(); // six digits, including leading zeroes
const digest = createCodeDigest({ ...binding, code }); // v1$ + 64 lowercase hex
// Persist a pending challenge; send via your own transport, then mark THIS challenge sent.
// Never log the code, key or target. Persist a digest, never plaintext code.

// INSIDE an application transaction that locks/rechecks the exact challenge:
const decision = evaluateVerification(storedState, {
  nowMs: trustedServerTimeMs,
  maxAttempts: 5,
  matches: matchesCodeDigest({ ...binding, code: submittedCode }, storedDigest),
});
// Persist decision.nextState whenever non-null, including failed guesses.
// If decision.ok, atomically consume and perform the protected business operation.
```

## API and rules

- `generateNumericCode(digits = 6)` uses `node:crypto.randomInt`; integer lengths
  4–10 are supported. Shorter codes provide fewer possibilities; choose your own
  attempt/rate policies. There is no injectable production RNG or clock.
- `constantTimeEqualHex(left, right)` returns false for non-strings, empty, odd-length,
  unequal-length or malformed hex. Valid hex is decoded and compared using Node's
  constant-time primitive. Syntax and length validation themselves are not constant-time.
- `createCodeDigest(input)` requires a string or Uint8Array key of 32–4096 bytes,
  nonempty binding strings of up to 1024 UTF-16 code units, and a 4–10 digit code.
  Invalid inputs throw TypeError with no secret or target in the message.
  A domain-separated JSON tuple binds all four scope fields and the code without
  delimiter ambiguity. No implicit case conversion, trimming or target normalization.
- `matchesCodeDigest(input, digest)` accepts only the exact `v1$` format and fails
  closed on malformed input, wrong versions or invalid configuration. Use
  `createCodeDigest` when validating configuration at setup time.
- `remainingCooldownMs({lastIssuedAtMs,nowMs,cooldownMs})` returns a nonnegative
  millisecond delay. A null prior issue means zero; equality at the cooldown boundary
  means zero. A backwards clock waits one full window. Invalid timestamps throw
  TypeError. Callers decide whether failed sends count (pass null to skip them).
- `evaluateVerification(state, {nowMs,maxAttempts,matches})` returns
  `{ok,reason,nextState}` without mutating input. `state` contains `status`,
  `expiresAtMs`, `attempts`, and explicit `consumedAtMs: number | null`.
  All times use Unix milliseconds; times/counters must be nonnegative safe integers,
  and maxAttempts must be positive. Invalid runtime input returns `reason: "invalid"`
  and `nextState: null`.
- Only `sent`, unconsumed, unexpired challenges below the failed-attempt limit can
  succeed. Expiry is inclusive (`expiresAtMs <= nowMs` rejects). Success always
  consumes. A failed guess increments attempts and consumes on the final allowed
  guess. `pending`/`failed` never verify. An existing consumption timestamp rejects
  even if status was accidentally left `sent`.

The decision is **not a database lock or a one-time-use guarantee by itself**.
Consumers own atomic read/compare/write, superseding old challenges, purpose policies,
send cooldowns, distributed rate limits, abuse controls and target validation. A send
failure must never activate a pending challenge; delayed send completion must update
by the exact challenge ID. Perform consumption and its protected action in the same
transaction. Do not roll back failed-attempt increments merely because the code did
not match. Re-read under the transaction lock before deciding; two decisions from the
same stale state can otherwise both report success.

## Consumer migration contract

This candidate does not replace any application's existing hashes or active codes.
Legacy peppered hashes and previous HMAC serialization remain application-owned.
Do not send an old digest to `matchesCodeDigest` and silently retry another algorithm.
A future migration must explicitly persist/select the algorithm version on each
challenge, continue the existing verifier only for its own legacy rows until expiry,
and create new-format rows with a fresh unique challenge ID and an independent key.
The database digest column must accommodate at least 67 ASCII characters (the old
64-character hash columns cannot hold this format). Persist challenge identity and
version alongside the immutable target/purpose/channel; do not regenerate a challenge
ID while verifying. Review the old-code expiry window before removing its verifier.
These pure rules do not repair an existing consumer that inserts before send without
a delivery-state guard, or consumes a code outside the protected business transaction.
No data migration, production dependency change or release is included here. Consumers
must eventually pin a reviewed immutable release; source-path imports and local-file
production dependencies are not supported.

Local validation: `pnpm --filter @app-foundation/verification check`. Tests use only
synthetic bindings and in-memory transaction simulations; no real messages or databases.
See [NOTICE](NOTICE.md) for provenance and [LICENSE](LICENSE) for GPL-3.0 terms.
