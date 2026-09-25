/** Derived from CubeRoot's API v3 adapter. SPDX-License-Identifier: GPL-3.0-only */
import { createDecipheriv, createPrivateKey, createPublicKey, createSign, createVerify, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { PaymentError, type ClientDependencies, normalizePem, buildWechatV3Message, buildWechatV3VerifyMessage, assertPositiveMinor, assertHttpsUrl, isRecord } from "./core.js";

export interface WechatPayConfig {
  appId: string;
  merchantId: string;
  apiV3Key: string;
  certificateSerial: string;
  privateKey: string;
  platformPublicKeyId: string;
  platformPublicKey: string;
  h5Enabled?: boolean;
  miniAppId?: string;
  miniPayEnabled?: boolean;
  apiBase?: string;
}
export interface WechatSignatureHeaders { serial?: string; timestamp?: string; nonce?: string; signature?: string }
export interface WechatOrderInput { outTradeNo: string; amountCents: number; description: string; notifyUrl: string }
export interface WechatMiniProgramPayment { timeStamp: string; nonceStr: string; package: string; signType: "RSA"; paySign: string }
export interface WechatRefundInput { transactionId: string; refundNo: string; amountMinor: number; totalMinor: number; reason: string }

const invalid = (message: string): never => { throw new PaymentError("INVALID_RESPONSE", message); };
function inputText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value, "utf8") > max || /[\x00-\x1f\x7f]/.test(value)) {
    throw new PaymentError("INVALID_INPUT", `Invalid ${label}`);
  }
  return value;
}
function tradeNumber(value: unknown, label: string): string {
  const text = inputText(value, label, 64);
  if (!/^[a-zA-Z0-9_*|\-]{6,32}$/.test(text)) throw new PaymentError("INVALID_INPUT", `Invalid ${label}`);
  return text;
}
function refundNumber(value: unknown): string {
  const text = inputText(value, "refund number", 64);
  if (!/^[a-zA-Z0-9_*|@\-]{1,64}$/.test(text)) throw new PaymentError("INVALID_INPUT", "Invalid refund number");
  return text;
}
function responseText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.length > 256) return invalid(`Missing or invalid ${label}`);
  return value;
}
function responseAmount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) return invalid("Invalid WeChat amount");
  return value as number;
}

/** Direct-merchant API v3 in public-key mode. No business records or environment reads. */
export function createWechatPayClient(config: WechatPayConfig, dependencies: ClientDependencies = {}) {
  // Snapshot config so a caller cannot switch merchant identity beneath an in-flight request.
  const c = { ...config };
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const nonce = dependencies.nonce ?? (() => randomUUID().replace(/-/g, ""));
  const base = c.apiBase ?? "https://api.mch.weixin.qq.com";
  if (!["https://api.mch.weixin.qq.com", "https://api2.mch.weixin.qq.com"].includes(base)
    || !/^[a-zA-Z0-9_-]+$/.test(c.appId ?? "") || !/^\d+$/.test(c.merchantId ?? "")
    || !/^[a-zA-Z0-9]+$/.test(c.certificateSerial ?? "") || !/^PUB_KEY_ID_[a-zA-Z0-9_]+$/.test(c.platformPublicKeyId ?? "")
    || typeof c.apiV3Key !== "string" || Buffer.byteLength(c.apiV3Key, "utf8") !== 32
    || (c.miniPayEnabled && !/^[a-zA-Z0-9_-]+$/.test(c.miniAppId ?? ""))) {
    throw new PaymentError("CONFIGURATION", "Invalid WeChat merchant configuration");
  }
  let privateKey: ReturnType<typeof createPrivateKey>;
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    privateKey = createPrivateKey(normalizePem(c.privateKey, "PRIVATE KEY"));
    publicKey = createPublicKey(normalizePem(c.platformPublicKey, "PUBLIC KEY"));
    if (privateKey.asymmetricKeyType !== "rsa" || publicKey.asymmetricKeyType !== "rsa"
      || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
      || (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
  } catch { throw new PaymentError("CONFIGURATION", "Invalid WeChat RSA keys"); }
  const sign = (content: string) => createSign("RSA-SHA256").update(content, "utf8").sign(privateKey, "base64");
  const isPaymentAppId = (appId: unknown) => appId === c.appId || Boolean(c.miniPayEnabled && c.miniAppId && appId === c.miniAppId);
  function verifySignature(headers: WechatSignatureHeaders, rawBody: string): boolean {
    const { serial, timestamp, nonce: responseNonce, signature } = headers;
    if (typeof rawBody !== "string" || Buffer.byteLength(rawBody, "utf8") > 1024 * 1024 || serial !== c.platformPublicKeyId || !timestamp || !/^\d{1,12}$/.test(timestamp)
      || !responseNonce || responseNonce.length > 256 || !signature || signature.length > 2048
      || Math.abs(Math.floor(now() / 1000) - Number(timestamp)) > 300) return false;
    try {
      return createVerify("RSA-SHA256").update(buildWechatV3VerifyMessage({ timestamp, nonce: responseNonce, body: rawBody }), "utf8").verify(publicKey, signature, "base64");
    } catch { return false; }
  }
  async function request(method: "GET" | "POST", path: string, data?: unknown) {
    const body = data === undefined ? "" : JSON.stringify(data);
    const timestamp = String(Math.floor(now() / 1000));
    const requestNonce = inputText(nonce(), "nonce", 32);
    if (!/^[a-zA-Z0-9_-]+$/.test(requestNonce)) throw new PaymentError("INVALID_INPUT", "Invalid nonce");
    const signature = sign(buildWechatV3Message({ method, urlPath: path, timestamp, nonce: requestNonce, body }));
    let response: Response;
    let raw: string;
    try {
      response = await fetcher(base + path, {
        method, redirect: "error", signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${c.merchantId}",nonce_str="${requestNonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${c.certificateSerial}"`,
          "Wechatpay-Serial": c.platformPublicKeyId, Accept: "application/json", "Content-Type": "application/json", "User-Agent": "app-foundation-payments/0.1",
        }, body: method === "GET" ? undefined : body,
      });
      if (Number(response.headers.get("content-length") ?? 0) > 1024 * 1024) return invalid("WeChat response too large");
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 1024 * 1024) { await reader.cancel(); return invalid("WeChat response too large"); }
            chunks.push(chunk.value);
          }
        } finally { reader.releaseLock(); }
      }
      raw = Buffer.concat(chunks).toString("utf8");
    } catch (error) { if (error instanceof PaymentError) throw error; throw new PaymentError("NETWORK_ERROR", "WeChat request failed; outcome may be unknown, query before retrying"); }
    if (!verifySignature({ serial: response.headers.get("Wechatpay-Serial") ?? undefined, timestamp: response.headers.get("Wechatpay-Timestamp") ?? undefined, nonce: response.headers.get("Wechatpay-Nonce") ?? undefined, signature: response.headers.get("Wechatpay-Signature") ?? undefined }, raw)) {
      throw new PaymentError("SIGNATURE_INVALID", "WeChat response signature verification failed");
    }
    let json: Record<string, unknown> = {};
    if (raw) {
      try { const parsed: unknown = JSON.parse(raw); if (!isRecord(parsed)) return invalid("Invalid WeChat JSON response"); json = parsed; }
      catch (error) { if (error instanceof PaymentError) throw error; return invalid("Invalid WeChat JSON response"); }
    }
    return { status: response.status, json };
  }
  function expectStatus(actual: number, expected: number) {
    if (actual !== expected) throw new PaymentError("PROVIDER_ERROR", `WeChat request rejected (HTTP ${actual})`);
  }
  function identity(record: Record<string, unknown>, requireApp: boolean) {
    if (record.mchid !== c.merchantId || (requireApp && !isPaymentAppId(record.appid)) || (record.appid !== undefined && !isPaymentAppId(record.appid))) {
      throw new PaymentError("IDENTITY_MISMATCH", "WeChat merchant or application mismatch");
    }
  }
  function transaction(record: Record<string, unknown>, expectedOrder?: string) {
    identity(record, true);
    const order = responseText(record.out_trade_no, "order number");
    if (expectedOrder !== undefined && order !== expectedOrder) throw new PaymentError("IDENTITY_MISMATCH", "WeChat order mismatch");
    const state = String(record.trade_state);
    if (!["SUCCESS", "REFUND", "NOTPAY", "CLOSED", "REVOKED", "USERPAYING", "PAYERROR"].includes(state)) return invalid("Invalid WeChat trade state");
    // The query API marks amount optional; a signed CLOSED/NOTPAY response can
    // omit it. Never accept a money-bearing SUCCESS/REFUND without an amount.
    if (record.amount === undefined) {
      if (state === "SUCCESS" || state === "REFUND") return invalid("Missing WeChat payment amount");
    } else {
      if (!isRecord(record.amount) || record.amount.currency !== "CNY") return invalid("Invalid WeChat currency or amount");
      const total = responseAmount(record.amount.total);
      if (record.amount.payer_total !== undefined && (!Number.isSafeInteger(record.amount.payer_total) || (record.amount.payer_total as number) < 0 || (record.amount.payer_total as number) > total)) return invalid("Invalid WeChat payer amount");
      if (record.amount.payer_currency !== undefined && record.amount.payer_currency !== "CNY") return invalid("Invalid WeChat payer currency");
    }
    if (state === "SUCCESS") responseText(record.transaction_id, "transaction ID");
    return record;
  }
  function orderBody(input: WechatOrderInput, appId = c.appId) {
    tradeNumber(input.outTradeNo, "order number"); assertPositiveMinor(input.amountCents); assertHttpsUrl(input.notifyUrl);
    return { appid: appId, mchid: c.merchantId, description: inputText(input.description, "description", 127), out_trade_no: input.outTradeNo, notify_url: input.notifyUrl, amount: { total: input.amountCents, currency: "CNY" } };
  }
  function refundRecord(record: Record<string, unknown>, refundNo: string, expected?: WechatRefundInput) {
    if (record.mchid !== undefined && record.mchid !== c.merchantId) throw new PaymentError("IDENTITY_MISMATCH", "WeChat refund merchant mismatch");
    if (record.appid !== undefined && !isPaymentAppId(record.appid)) throw new PaymentError("IDENTITY_MISMATCH", "WeChat refund application mismatch");
    if (record.out_refund_no !== refundNo) throw new PaymentError("IDENTITY_MISMATCH", "WeChat refund number mismatch");
    responseText(record.refund_id, "refund ID"); responseText(record.transaction_id, "transaction ID");
    if (!isRecord(record.amount) || record.amount.currency !== "CNY") return invalid("Invalid WeChat refund currency or amount");
    const total = responseAmount(record.amount.total); const refund = responseAmount(record.amount.refund);
    if (refund > total || !["SUCCESS", "CLOSED", "PROCESSING", "ABNORMAL"].includes(String(record.status))) return invalid("Invalid WeChat refund state or amount");
    if (expected && (record.transaction_id !== expected.transactionId || total !== expected.totalMinor || refund !== expected.amountMinor)) throw new PaymentError("IDENTITY_MISMATCH", "WeChat refund request mismatch");
    return record;
  }
  return {
    isPaymentAppId,
    verifySignature,
    async createNative(input: WechatOrderInput): Promise<string> {
      const { status, json } = await request("POST", "/v3/pay/transactions/native", orderBody(input)); expectStatus(status, 200);
      if (typeof json.code_url !== "string" || json.code_url.length > 2048 || !/^weixin:\/\/wxpay\/bizpayurl\?[^\s]+$/.test(json.code_url)) return invalid("Invalid WeChat Native payment URL");
      return json.code_url;
    },
    async createH5(input: WechatOrderInput & { payerClientIp: string }): Promise<string> {
      if (!c.h5Enabled) throw new PaymentError("CONFIGURATION", "WeChat H5 is not enabled");
      if (!isIP(input.payerClientIp)) throw new PaymentError("INVALID_INPUT", "Invalid payer client IP");
      const { status, json } = await request("POST", "/v3/pay/transactions/h5", { ...orderBody(input), scene_info: { payer_client_ip: input.payerClientIp, h5_info: { type: "Wap" } } }); expectStatus(status, 200);
      let url: URL;
      try { url = new URL(String(json.h5_url)); } catch { return invalid("Invalid WeChat H5 payment URL"); }
      if (typeof json.h5_url !== "string" || json.h5_url.length > 2048 || url.origin !== "https://wx.tenpay.com" || url.pathname !== "/cgi-bin/mmpayweb-bin/checkmweb" || url.username || url.password || url.hash) return invalid("Invalid WeChat H5 payment URL");
      return json.h5_url;
    },
    async createMiniProgram(input: WechatOrderInput & { openid: string }): Promise<WechatMiniProgramPayment> {
      if (!c.miniPayEnabled || !c.miniAppId) throw new PaymentError("CONFIGURATION", "WeChat Mini Program Pay is not enabled");
      const { status, json } = await request("POST", "/v3/pay/transactions/jsapi", { ...orderBody(input, c.miniAppId), payer: { openid: inputText(input.openid, "openid", 128) } }); expectStatus(status, 200);
      const prepayId = responseText(json.prepay_id, "prepay ID");
      if (!/^[a-zA-Z0-9_-]+$/.test(prepayId)) return invalid("Invalid WeChat prepay ID");
      const timeStamp = String(Math.floor(now() / 1000)); const nonceStr = inputText(nonce(), "nonce", 32); const paymentPackage = `prepay_id=${prepayId}`;
      return { timeStamp, nonceStr, package: paymentPackage, signType: "RSA", paySign: sign(`${c.miniAppId}\n${timeStamp}\n${nonceStr}\n${paymentPackage}\n`) };
    },
    async queryOrder(outTradeNo: string): Promise<{ paid: boolean; txn?: string; raw: Record<string, unknown> } | null> {
      tradeNumber(outTradeNo, "order number");
      const { status, json } = await request("GET", `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(c.merchantId)}`);
      if (status === 404 && ["ORDER_NOT_EXIST", "ORDERNOTEXIST", "RESOURCE_NOT_EXISTS"].includes(String(json.code))) return null;
      expectStatus(status, 200); transaction(json, outTradeNo);
      return { paid: json.trade_state === "SUCCESS", txn: typeof json.transaction_id === "string" ? json.transaction_id : undefined, raw: json };
    },
    async closeOrder(outTradeNo: string): Promise<void> {
      tradeNumber(outTradeNo, "order number"); const { status } = await request("POST", `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`, { mchid: c.merchantId }); expectStatus(status, 204);
    },
    async createRefund(input: WechatRefundInput): Promise<Record<string, unknown>> {
      inputText(input.transactionId, "transaction ID", 32); refundNumber(input.refundNo); assertPositiveMinor(input.amountMinor); assertPositiveMinor(input.totalMinor);
      if (input.amountMinor > input.totalMinor) throw new PaymentError("INVALID_INPUT", "Refund exceeds original amount");
      const { status, json } = await request("POST", "/v3/refund/domestic/refunds", { transaction_id: input.transactionId, out_refund_no: input.refundNo, ...(input.reason === "" ? {} : { reason: inputText(input.reason, "refund reason", 80) }), amount: { refund: input.amountMinor, total: input.totalMinor, currency: "CNY" } });
      expectStatus(status, 200); return refundRecord(json, input.refundNo, input);
    },
    async queryRefund(refundNo: string): Promise<Record<string, unknown> | null> {
      refundNumber(refundNo); const { status, json } = await request("GET", `/v3/refund/domestic/refunds/${encodeURIComponent(refundNo)}`);
      if (status === 404 && json.code === "RESOURCE_NOT_EXISTS") return null;
      expectStatus(status, 200); return refundRecord(json, refundNo);
    },
    /** Verifies payment notifications only. Consumers must atomically deduplicate and match expected business amount. */
    parseNotification(rawBody: string, headers: WechatSignatureHeaders): Record<string, unknown> {
      if (!verifySignature(headers, rawBody)) throw new PaymentError("SIGNATURE_INVALID", "WeChat notification signature verification failed");
      let envelope: unknown;
      try { envelope = JSON.parse(rawBody); } catch { return invalid("Invalid WeChat notification JSON"); }
      if (!isRecord(envelope) || envelope.event_type !== "TRANSACTION.SUCCESS" || envelope.resource_type !== "encrypt-resource" || !isRecord(envelope.resource)) return invalid("Unsupported WeChat notification");
      const resource = envelope.resource;
      if (resource.algorithm !== "AEAD_AES_256_GCM" || resource.original_type !== "transaction" || typeof resource.nonce !== "string" || Buffer.byteLength(resource.nonce) !== 12 || typeof resource.ciphertext !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(resource.ciphertext) || (resource.associated_data !== undefined && typeof resource.associated_data !== "string")) return invalid("Invalid WeChat encrypted resource");
      let decrypted: unknown;
      try {
        const ciphertext = Buffer.from(resource.ciphertext, "base64");
        if (ciphertext.length <= 16) throw new Error();
        const decipher = createDecipheriv("aes-256-gcm", Buffer.from(c.apiV3Key, "utf8"), Buffer.from(resource.nonce));
        decipher.setAuthTag(ciphertext.subarray(-16)); decipher.setAAD(Buffer.from(resource.associated_data as string ?? ""));
        decrypted = JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString("utf8"));
      } catch { return invalid("WeChat notification decryption failed"); }
      if (!isRecord(decrypted)) return invalid("Invalid WeChat notification transaction");
      transaction(decrypted);
      if (decrypted.trade_state !== "SUCCESS") return invalid("Notification event and trade state mismatch");
      return decrypted;
    },
  };
}
export type WechatPayClient = ReturnType<typeof createWechatPayClient>;
