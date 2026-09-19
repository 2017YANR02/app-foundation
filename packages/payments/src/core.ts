// Signing helpers adapted from CubeRoot e35459d59; see NOTICE.md and LICENSE.
export type PaymentErrorCode =
  | "CONFIGURATION" | "INVALID_INPUT" | "SIGNATURE_INVALID" | "INVALID_RESPONSE"
  | "PROVIDER_ERROR" | "NETWORK_ERROR" | "IDENTITY_MISMATCH";

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  constructor(code: PaymentErrorCode, message: string) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
  }
}

export interface ClientDependencies {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  nonce?: () => string;
}

export type SignParams = Record<string, string | number | boolean | null | undefined>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function requireText(value: unknown, name: string, max = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new PaymentError("INVALID_INPUT", `Invalid ${name}`);
  }
  return value;
}

export function assertPositiveMinor(value: unknown, name = "amount"): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new PaymentError("INVALID_INPUT", `Invalid ${name}: expected positive integer minor units`);
  }
}

/** Exact CNY conversion, no binary floating point multiplication. */
export function decimalToMinor(value: string): number {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(value) || value.length > 32) {
    throw new PaymentError("INVALID_INPUT", "Invalid CNY decimal amount");
  }
  const [whole, fraction = ""] = value.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new PaymentError("INVALID_INPUT", "Amount exceeds safe integer range");
  return Number(minor);
}

export function minorToDecimal(value: number): string {
  assertPositiveMinor(value);
  const amount = BigInt(value);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}

export function assertHttpsUrl(value: unknown, name = "URL"): string {
  const text = requireText(value, name, 2048);
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) throw new Error();
    return text;
  } catch {
    throw new PaymentError("INVALID_INPUT", `Invalid ${name}: expected HTTPS URL without credentials or fragment`);
  }
}

export function normalizePem(raw: string, type: "PRIVATE KEY" | "PUBLIC KEY"): string {
  const value = raw.trim();
  if (!value) return "";
  if (value.includes("-----BEGIN")) return value.replace(/\\n/g, "\n");
  const body = value.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? value;
  return `-----BEGIN ${type}-----\n${body}\n-----END ${type}-----`;
}

export function buildWechatV3Message(input: { method: string; urlPath: string; timestamp: string; nonce: string; body: string }): string {
  return `${input.method.toUpperCase()}\n${input.urlPath}\n${input.timestamp}\n${input.nonce}\n${input.body}\n`;
}

export function buildWechatV3VerifyMessage(input: { timestamp: string; nonce: string; body: string }): string {
  return `${input.timestamp}\n${input.nonce}\n${input.body}\n`;
}

export function buildAlipaySignContent(params: SignParams, excluded: readonly string[] = ["sign"]): string {
  return Object.keys(params).filter((key) => !excluded.includes(key) && params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort().map((key) => `${key}=${String(params[key])}`).join("&");
}

export interface ExpectedPayment {
  outTradeNo: string;
  amountMinor: number;
  currency: "CNY";
}

/** Call only on an authenticated provider result. Does not mutate/settle any order. */
export function assertPaymentMatches(actual: ExpectedPayment, expected: ExpectedPayment): void {
  assertPositiveMinor(expected.amountMinor);
  if (actual.outTradeNo !== expected.outTradeNo || actual.amountMinor !== expected.amountMinor
    || actual.currency !== "CNY" || expected.currency !== "CNY") {
    throw new PaymentError("IDENTITY_MISMATCH", "Payment does not match the expected order");
  }
}
