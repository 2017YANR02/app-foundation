// SPDX-License-Identifier: GPL-3.0-only
// Derived from CubeRoot's payment/alipay.ts; see NOTICE.md for provenance.
import { createPrivateKey, createPublicKey, createSign, createVerify } from "node:crypto";
import {
  PaymentError, type ClientDependencies, type SignParams, normalizePem,
  buildAlipaySignContent, assertPositiveMinor, minorToDecimal, decimalToMinor,
  assertHttpsUrl, requireText, isRecord,
} from "./core.js";

export interface AlipayConfig {
  appId: string;
  privateKey: string;
  publicKey: string;
  gateway?: string;
  sellerId?: string;
}

export interface AlipayCheckoutInput {
  outTradeNo: string;
  amountCents: number;
  subject: string;
  clientType: "pc" | "wap";
  notifyUrl: string;
  returnUrl: string;
}

export interface AlipayPaymentEvent {
  provider: "alipay";
  eventId: string;
  orderNo: string;
  transactionId: string;
  amountMinor: number;
  currency: "CNY";
  merchantId: string;
  paid: boolean;
  raw: SignParams;
}

async function readResponse(response: Response): Promise<string> {
  if (!response.body) throw new PaymentError("INVALID_RESPONSE", "Empty Alipay response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let raw = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1_048_576) {
        await reader.cancel();
        throw new PaymentError("INVALID_RESPONSE", "Alipay response exceeds size limit");
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    return raw + decoder.decode();
  } finally { reader.releaseLock(); }
}

/** Parse JSON without accepting duplicate decoded keys, retaining original root value bytes. */
function responseEnvelope(raw: string): { value: Record<string, unknown>; spans: Map<string, string> } {
  const invalid = (): never => { throw new PaymentError("INVALID_RESPONSE", "Invalid Alipay response envelope"); };
  if (raw.length > 1_048_576) invalid();
  let at = 0;
  const spans = new Map<string, string>();
  const whitespace = () => { while (/[\t\n\r ]/.test(raw[at] ?? "x")) at++; };
  const string = (): string => {
    const start = at++;
    while (at < raw.length) {
      if (raw[at] === "\\") { at += 2; continue; }
      if (raw[at++] === "\"") {
        try { return JSON.parse(raw.slice(start, at)) as string; } catch { return invalid(); }
      }
    }
    return invalid();
  };
  const value = (depth: number): void => {
    if (depth > 64) invalid();
    whitespace();
    if (raw[at] === "\"") { string(); return; }
    if (raw[at] === "{") {
      at++;
      whitespace();
      const keys = new Set<string>();
      if (raw[at] === "}") { at++; return; }
      while (at < raw.length) {
        if (raw[at] !== "\"") invalid();
        const key = string();
        if (keys.has(key)) invalid();
        keys.add(key);
        whitespace();
        if (raw[at++] !== ":") invalid();
        whitespace();
        const start = at;
        value(depth + 1);
        if (depth === 0) spans.set(key, raw.slice(start, at));
        whitespace();
        if (raw[at] === "}") { at++; return; }
        if (raw[at++] !== ",") invalid();
        whitespace();
      }
      return invalid();
    }
    if (raw[at] === "[") {
      at++;
      whitespace();
      if (raw[at] === "]") { at++; return; }
      while (at < raw.length) {
        value(depth + 1);
        whitespace();
        if (raw[at] === "]") { at++; return; }
        if (raw[at++] !== ",") invalid();
      }
      return invalid();
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(at));
    if (!match) invalid();
    at += match![0].length;
  };
  whitespace();
  if (raw[at] !== "{") invalid();
  value(0);
  whitespace();
  if (at !== raw.length) invalid();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return invalid();
    return { value: parsed, spans };
  } catch { return invalid(); }
}

function beijingTimestamp(ms: number): string {
  if (!Number.isFinite(ms)) throw new PaymentError("CONFIGURATION", "Invalid clock");
  const date = new Date(ms + 8 * 60 * 60 * 1000);
  try { return date.toISOString().slice(0, 19).replace("T", " "); }
  catch { throw new PaymentError("CONFIGURATION", "Invalid clock"); }
}

export function createAlipayClient(config: AlipayConfig, dependencies: ClientDependencies = {}) {
  const appId = requireText(config.appId, "Alipay appId");
  const sellerId = config.sellerId === undefined ? undefined : requireText(config.sellerId, "Alipay sellerId");
  const gateway = config.gateway ?? "https://openapi.alipay.com/gateway.do";
  assertHttpsUrl(gateway, "Alipay gateway");
  const gatewayUrl = new URL(gateway);
  if (!["openapi.alipay.com", "openapi.alipaydev.com", "openapi-sandbox.dl.alipaydev.com"].includes(gatewayUrl.hostname)
      || gatewayUrl.pathname !== "/gateway.do" || gatewayUrl.search || gatewayUrl.hash || gatewayUrl.port) {
    throw new PaymentError("CONFIGURATION", "Unsupported Alipay gateway");
  }
  let privateKey: ReturnType<typeof createPrivateKey>;
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    privateKey = createPrivateKey(normalizePem(config.privateKey, "PRIVATE KEY"));
    publicKey = createPublicKey(normalizePem(config.publicKey, "PUBLIC KEY"));
    if (privateKey.asymmetricKeyType !== "rsa" || publicKey.asymmetricKeyType !== "rsa"
        || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
        || (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
  } catch { throw new PaymentError("CONFIGURATION", "Invalid Alipay RSA keys"); }
  const requestFetch = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const sign = (content: string) => createSign("RSA-SHA256").update(content, "utf8").sign(privateKey, "base64");
  const verify = (content: string, signature: unknown): boolean => {
    if (typeof signature !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
    try { return createVerify("RSA-SHA256").update(content, "utf8").verify(publicKey, signature, "base64"); }
    catch { return false; }
  };
  const paramsFor = (method: string, biz: Record<string, unknown>, extra: SignParams = {}): URLSearchParams => {
    const params: SignParams = { app_id: appId, method, format: "JSON", charset: "utf-8", sign_type: "RSA2",
      timestamp: beijingTimestamp(now()), version: "1.0", biz_content: JSON.stringify(biz), ...extra };
    params.sign = sign(buildAlipaySignContent(params, ["sign"]));
    return new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  };
  const identity = (data: Record<string, unknown>, notification = false) => {
    if ((notification || data.app_id !== undefined) && data.app_id !== appId
        || sellerId !== undefined && (notification || data.seller_id !== undefined) && data.seller_id !== sellerId
        || sellerId !== undefined && data.seller_user_id !== undefined && data.seller_user_id !== sellerId) {
      throw new PaymentError("IDENTITY_MISMATCH", "Alipay merchant identity mismatch");
    }
  };
  const request = async (method: string, biz: Record<string, unknown>) => {
    let response: Response;
    let raw: string;
    const body = paramsFor(method, biz).toString();
    try {
      response = await requestFetch(gateway, { method: "POST", redirect: "error",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body, signal: AbortSignal.timeout(15_000) });
      raw = await readResponse(response);
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw new PaymentError("NETWORK_ERROR", "Alipay request failed");
    }
    const envelope = responseEnvelope(raw);
    const expected = `${method.replaceAll(".", "_")}_response`;
    const candidates = [...envelope.spans.keys()].filter((key) => key.endsWith("_response"));
    if (candidates.length !== 1 || ![expected, "error_response"].includes(candidates[0])) {
      throw new PaymentError("INVALID_RESPONSE", "Ambiguous Alipay response envelope");
    }
    const key = candidates[0];
    if (!verify(envelope.spans.get(key)!, envelope.value.sign)) {
      throw new PaymentError("SIGNATURE_INVALID", "Alipay response signature verification failed");
    }
    const data = envelope.value[key];
    if (!isRecord(data) || typeof data.code !== "string") {
      throw new PaymentError("INVALID_RESPONSE", "Invalid Alipay response payload");
    }
    identity(data);
    if (!response.ok) throw new PaymentError("PROVIDER_ERROR", "Alipay HTTP request was not accepted");
    return { data, envelope: envelope.value };
  };
  const success = (data: Record<string, unknown>) => {
    if (data.code !== "10000") throw new PaymentError("PROVIDER_ERROR", "Alipay operation was not accepted");
  };
  const notFound = (data: Record<string, unknown>, refund = false) => data.code === "40004"
    && (data.sub_code === "ACQ.TRADE_NOT_EXIST" || refund && data.sub_code === "ACQ.REFUND_NOT_EXIST");
  const matches = (actual: unknown, expected: string) => {
    if (actual !== expected) throw new PaymentError("IDENTITY_MISMATCH", "Alipay transaction identity mismatch");
  };
  const amount = (value: unknown): number => {
    try {
      if (typeof value !== "string") throw new Error();
      const minor = decimalToMinor(value);
      assertPositiveMinor(minor);
      return minor;
    } catch { throw new PaymentError("INVALID_RESPONSE", "Invalid Alipay amount"); }
  };
  const verifyNotify = (params: SignParams): boolean => {
    if (!isRecord(params) || params.sign_type !== "RSA2"
        || Object.values(params).some((value) => typeof value !== "string")) return false;
    if (!verify(buildAlipaySignContent(params, ["sign", "sign_type"]), params.sign)) return false;
    try { identity(params, true); return true; } catch { return false; }
  };
  const queryRefund = async (transactionId: string, requestId: string): Promise<Record<string, unknown> | null> => {
    requireText(transactionId, "transactionId"); requireText(requestId, "requestId");
    const { data } = await request("alipay.trade.fastpay.refund.query", { trade_no: transactionId, out_request_no: requestId });
    if (notFound(data, true)) return null;
    success(data);
    matches(data.trade_no, transactionId); matches(data.out_request_no, requestId);
    amount(data.refund_amount);
    if (data.refund_status !== undefined && data.refund_status !== "REFUND_SUCCESS") {
      throw new PaymentError("INVALID_RESPONSE", "Unknown Alipay refund status");
    }
    return data;
  };
  return {
    createCheckoutUrl(input: AlipayCheckoutInput): string {
      requireText(input.outTradeNo, "outTradeNo"); requireText(input.subject, "subject");
      assertPositiveMinor(input.amountCents);
      assertHttpsUrl(input.notifyUrl, "notifyUrl"); assertHttpsUrl(input.returnUrl, "returnUrl");
      if (input.clientType !== "pc" && input.clientType !== "wap") throw new PaymentError("INVALID_INPUT", "Invalid checkout client type");
      const wap = input.clientType === "wap";
      return `${gateway}?${paramsFor(wap ? "alipay.trade.wap.pay" : "alipay.trade.page.pay", {
        out_trade_no: input.outTradeNo, total_amount: minorToDecimal(input.amountCents), subject: input.subject,
        product_code: wap ? "QUICK_WAP_WAY" : "FAST_INSTANT_TRADE_PAY", timeout_express: "15m",
      }, { notify_url: input.notifyUrl, return_url: input.returnUrl }).toString()}`;
    },
    verifyNotify,
    parseNotification(params: SignParams): AlipayPaymentEvent {
      if (!verifyNotify(params)) throw new PaymentError("SIGNATURE_INVALID", "Alipay notification verification failed");
      const eventId = requireText(params.notify_id, "notify_id");
      const orderNo = requireText(params.out_trade_no, "out_trade_no");
      const transactionId = requireText(params.trade_no, "trade_no");
      const status = params.trade_status;
      if (!["WAIT_BUYER_PAY", "TRADE_CLOSED", "TRADE_SUCCESS", "TRADE_FINISHED"].includes(String(status))) {
        throw new PaymentError("INVALID_RESPONSE", "Unknown Alipay payment status");
      }
      return { provider: "alipay" as const, eventId, orderNo, transactionId,
        amountMinor: amount(params.total_amount), currency: "CNY" as const, merchantId: appId,
        paid: status === "TRADE_SUCCESS" || status === "TRADE_FINISHED", raw: { ...params } };
    },
    async queryTrade(outTradeNo: string) {
      requireText(outTradeNo, "outTradeNo");
      const { data, envelope } = await request("alipay.trade.query", { out_trade_no: outTradeNo });
      if (notFound(data)) return null;
      success(data); matches(data.out_trade_no, outTradeNo);
      const txn = requireText(data.trade_no, "trade_no");
      amount(data.total_amount);
      if (!["WAIT_BUYER_PAY", "TRADE_CLOSED", "TRADE_SUCCESS", "TRADE_FINISHED"].includes(String(data.trade_status))) {
        throw new PaymentError("INVALID_RESPONSE", "Unknown Alipay payment status");
      }
      return { paid: data.trade_status === "TRADE_SUCCESS" || data.trade_status === "TRADE_FINISHED", txn, raw: envelope };
    },
    async closeOrder(outTradeNo: string): Promise<void> {
      requireText(outTradeNo, "outTradeNo");
      const { data } = await request("alipay.trade.close", { out_trade_no: outTradeNo });
      success(data); matches(data.out_trade_no, outTradeNo);
    },
    queryRefund,
    async createRefund(input: { transactionId: string; requestId: string; amountMinor: number; reason: string }) {
      requireText(input.transactionId, "transactionId"); requireText(input.requestId, "requestId");
      requireText(input.reason, "reason"); assertPositiveMinor(input.amountMinor);
      const { data } = await request("alipay.trade.refund", { trade_no: input.transactionId,
        out_request_no: input.requestId, refund_amount: minorToDecimal(input.amountMinor), refund_reason: input.reason });
      success(data); matches(data.trade_no, input.transactionId);
      if (amount(data.refund_fee) !== input.amountMinor) throw new PaymentError("INVALID_RESPONSE", "Alipay refund amount mismatch");
      const verified = await queryRefund(input.transactionId, input.requestId);
      if (!verified) throw new PaymentError("PROVIDER_ERROR", "Alipay refund confirmation is pending");
      if (amount(verified.refund_amount) !== input.amountMinor) throw new PaymentError("INVALID_RESPONSE", "Alipay refund amount mismatch");
      return verified;
    },
  };
}
