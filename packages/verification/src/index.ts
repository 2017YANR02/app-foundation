import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_DIGEST_VERSION = "v1" as const;
const DIGEST_PREFIX = `${CODE_DIGEST_VERSION}$`;
const CODE = /^[0-9]{4,10}$/;

export interface CodeDigestInput {
  /** Independently generated application key, at least 32 bytes; never a user password. */
  secret: string | Uint8Array;
  /** Application-owned values. Inputs are bound exactly, without normalization. */
  purpose: string;
  channel: string;
  target: string;
  challengeId: string;
  code: string;
}

/** Uses Node's unbiased cryptographic random integer generator; preserves leading zeroes. */
export function generateNumericCode(digits = 6): string {
  if (!Number.isInteger(digits) || digits < 4 || digits > 10) {
    throw new TypeError("Code length must be an integer from 4 to 10");
  }
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

/** Rejects malformed/empty/odd-length hex before decoding; equal-length bytes use timingSafeEqual. */
export function constantTimeEqualHex(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string" || left.length === 0
    || left.length !== right.length || left.length % 2 !== 0
    || !/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function bindingValue(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024;
}

/** New versioned format. This deliberately does not implement legacy application hashes. */
export function createCodeDigest(input: CodeDigestInput): string {
  if (!input || ![input.purpose, input.channel, input.target, input.challengeId].every(bindingValue)
    || typeof input.code !== "string" || !CODE.test(input.code)) {
    throw new TypeError("Invalid verification code binding");
  }
  if (typeof input.secret !== "string" && !(input.secret instanceof Uint8Array)) {
    throw new TypeError("Invalid verification secret");
  }
  const secret = typeof input.secret === "string"
    ? Buffer.from(input.secret, "utf8")
    : Buffer.from(input.secret);
  if (secret.length < 32 || secret.length > 4096) throw new TypeError("Invalid verification secret");
  // An explicit domain and JSON tuple prevent delimiter ambiguity and cross-protocol reuse.
  const message = JSON.stringify([
    "app-foundation/verification/v1", input.purpose, input.channel, input.target, input.challengeId, input.code,
  ]);
  return DIGEST_PREFIX + createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/** Malformed input, legacy/unknown versions and invalid secret configuration all fail closed. */
export function matchesCodeDigest(input: CodeDigestInput, digest: unknown): boolean {
  if (typeof digest !== "string" || !/^v1\$[0-9a-f]{64}$/.test(digest)) return false;
  try {
    return constantTimeEqualHex(createCodeDigest(input).slice(DIGEST_PREFIX.length), digest.slice(DIGEST_PREFIX.length));
  } catch {
    return false;
  }
}

export type VerificationStatus = "pending" | "sent" | "failed" | "consumed";
export interface VerificationState {
  status: VerificationStatus;
  /** Unix milliseconds, including explicit null for an unconsumed challenge. */
  expiresAtMs: number;
  attempts: number;
  consumedAtMs: number | null;
}
export interface VerificationCheck {
  /** Unix milliseconds from the application's trusted server clock. */
  nowMs: number;
  maxAttempts: number;
  /** Computed by matchesCodeDigest (or a deliberate application-owned legacy verifier). */
  matches: boolean;
}
export type VerificationFailure = "mismatch" | "not_sent" | "expired" | "attempts_exhausted" | "consumed" | "invalid";
export type VerificationDecision =
  | { ok: true; reason: "verified"; nextState: VerificationState }
  | { ok: false; reason: Exclude<VerificationFailure, "invalid">; nextState: VerificationState }
  | { ok: false; reason: "invalid"; nextState: null };

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Pure decision only: this does not establish atomicity or consume anything in storage.
 * Lock/read the challenge, decide, persist nextState and perform the protected business
 * mutation in ONE application transaction. Commit failed guesses as well as successful use.
 */
export function evaluateVerification(state: VerificationState, check: VerificationCheck): VerificationDecision {
  if (!state || !check || !["pending", "sent", "failed", "consumed"].includes(state.status)
    || !nonnegativeInteger(state.expiresAtMs) || !nonnegativeInteger(state.attempts)
    || (state.consumedAtMs !== null && !nonnegativeInteger(state.consumedAtMs))
    || !nonnegativeInteger(check.nowMs) || !nonnegativeInteger(check.maxAttempts) || check.maxAttempts === 0
    || typeof check.matches !== "boolean") return { ok: false, reason: "invalid", nextState: null };
  const nextState: VerificationState = { status: state.status, expiresAtMs: state.expiresAtMs,
    attempts: state.attempts, consumedAtMs: state.consumedAtMs };
  if (state.status === "consumed" || state.consumedAtMs !== null) return { ok: false, reason: "consumed", nextState };
  if (state.status !== "sent") return { ok: false, reason: "not_sent", nextState };
  if (state.expiresAtMs <= check.nowMs) return { ok: false, reason: "expired", nextState };
  if (state.attempts >= check.maxAttempts) {
    return { ok: false, reason: "attempts_exhausted", nextState: { ...nextState, status: "consumed", consumedAtMs: check.nowMs } };
  }
  if (check.matches) {
    return { ok: true, reason: "verified", nextState: { ...nextState, status: "consumed", consumedAtMs: check.nowMs } };
  }
  nextState.attempts += 1;
  if (nextState.attempts >= check.maxAttempts) {
    nextState.status = "consumed";
    nextState.consumedAtMs = check.nowMs;
  }
  return { ok: false, reason: "mismatch", nextState };
}

export interface CooldownCheck {
  lastIssuedAtMs: number | null;
  nowMs: number;
  cooldownMs: number;
}

/** Caller chooses which delivery statuses count; a backwards clock waits a full window. */
export function remainingCooldownMs({ lastIssuedAtMs, nowMs, cooldownMs }: CooldownCheck): number {
  if (!nonnegativeInteger(nowMs) || !nonnegativeInteger(cooldownMs)
    || (lastIssuedAtMs !== null && !nonnegativeInteger(lastIssuedAtMs))) {
    throw new TypeError("Invalid verification cooldown timestamps");
  }
  if (lastIssuedAtMs === null) return 0;
  const elapsed = Math.max(0, nowMs - lastIssuedAtMs);
  return Math.max(0, cooldownMs - elapsed);
}
