import { test } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createSign, createVerify, generateKeyPairSync } from "node:crypto";
import { createWechatPayClient } from "../dist/wechat.js";

const merchantKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const platformKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = {
  appId: "wxmain", merchantId: "1900000001", apiV3Key: "a".repeat(32), certificateSerial: "ABCDEF",
  privateKey: merchantKeys.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  platformPublicKeyId: "PUB_KEY_ID_TEST", platformPublicKey: platformKeys.publicKey.export({ format: "pem", type: "spki" }).toString(),
};
const now = 1800000000000;
const order = { outTradeNo: "order_123", amountCents: 150, description: "Sample service", notifyUrl: "https://merchant.example/notify" };
const paid = { mchid: config.merchantId, appid: config.appId, out_trade_no: order.outTradeNo, trade_state: "SUCCESS", transaction_id: "wx_transaction", amount: { total: 150, payer_total: 120, currency: "CNY", payer_currency: "CNY" } };
const refund = { refund_id: "wx_refund", out_refund_no: "refund_123", transaction_id: "wx_transaction", status: "PROCESSING", amount: { total: 150, refund: 50, currency: "CNY" } };
const refundInput = { transactionId: "wx_transaction", refundNo: "refund_123", amountMinor: 50, totalMinor: 150, reason: "Customer request" };
function signatureHeaders(body, timestamp = String(now / 1000), signer = platformKeys.privateKey) {
  const nonce = "response_nonce";
  return { serial: config.platformPublicKeyId, timestamp, nonce, signature: createSign("RSA-SHA256").update(`${timestamp}\n${nonce}\n${body}\n`).sign(signer, "base64") };
}
function response(value, status = 200, change = {}) {
  const body = status === 204 ? "" : typeof value === "string" ? value : JSON.stringify(value);
  const headers = { ...signatureHeaders(body), ...change };
  return new Response(status === 204 ? null : body, { status, headers: { "Wechatpay-Serial": headers.serial, "Wechatpay-Timestamp": headers.timestamp, "Wechatpay-Nonce": headers.nonce, "Wechatpay-Signature": headers.signature } });
}
function setup(result, overrides = {}, status = 200) {
  const calls = [];
  const client = createWechatPayClient({ ...config, ...overrides }, { now: () => now, nonce: () => "request_nonce", fetch: async (url, options) => {
    calls.push({ url, options });
    return typeof result === "function" ? result(url, options) : response(result, status);
  } });
  return { client, calls };
}
function notification(record = paid, changes = {}) {
  const nonce = "twelve_chars";
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(config.apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from("transaction"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(record)), cipher.final(), cipher.getAuthTag()]).toString("base64");
  const envelope = { event_type: "TRANSACTION.SUCCESS", resource_type: "encrypt-resource", resource: { algorithm: "AEAD_AES_256_GCM", original_type: "transaction", nonce, associated_data: "transaction", ciphertext }, ...changes };
  const body = JSON.stringify(envelope);
  return { body, headers: signatureHeaders(body) };
}
const errorCode = (code) => (error) => error.code === code;

test("Native request signs exact path and JSON using configured merchant and injected clock", async () => {
  const { client, calls } = setup({ code_url: "weixin://wxpay/bizpayurl?pr=test" });
  assert.equal(await client.createNative(order), "weixin://wxpay/bizpayurl?pr=test");
  const { url, options } = calls[0]; const fields = Object.fromEntries([...options.headers.Authorization.matchAll(/(\w+)="([^"]+)"/g)].map((match) => [match[1], match[2]]));
  assert.equal(options.redirect, "error"); assert.ok(options.signal); assert.equal(fields.mchid, config.merchantId);
  assert.equal(JSON.parse(options.body).amount.total, 150); assert.equal(JSON.parse(options.body).appid, config.appId);
  assert.equal(url, "https://api.mch.weixin.qq.com/v3/pay/transactions/native");
  assert.ok(createVerify("RSA-SHA256").update(`POST\n/v3/pay/transactions/native\n${fields.timestamp}\n${fields.nonce_str}\n${options.body}\n`).verify(merchantKeys.publicKey, fields.signature, "base64"));
});

test("explicit config snapshots isolate merchant clients and reject nonofficial API gateways", async () => {
  assert.throws(() => createWechatPayClient({ ...config, apiBase: "https://evil.example" }), errorCode("CONFIGURATION"));
  assert.throws(() => createWechatPayClient({ ...config, privateKey: "invalid" }), errorCode("CONFIGURATION"));
  assert.throws(() => createWechatPayClient({ ...config, apiV3Key: "你".repeat(32) }), errorCode("CONFIGURATION"));
  const first = setup(paid); const second = setup(paid, { merchantId: "1900000002" });
  assert.equal((await first.client.queryOrder(order.outTradeNo)).paid, true);
  await assert.rejects(second.client.queryOrder(order.outTradeNo), errorCode("IDENTITY_MISMATCH"));
});

test("H5 requires explicit product gate, validated IP and official destination", async () => {
  const url = "https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=abc";
  const input = { ...order, payerClientIp: "203.0.113.5" };
  await assert.rejects(setup({ h5_url: url }).client.createH5(input), errorCode("CONFIGURATION"));
  const { client, calls } = setup({ h5_url: url }, { h5Enabled: true });
  assert.equal(await client.createH5(input), url); assert.equal(JSON.parse(calls[0].options.body).scene_info.payer_client_ip, input.payerClientIp);
  await assert.rejects(client.createH5({ ...input, payerClientIp: "127.0.0.1, 203.0.113.5" }), errorCode("INVALID_INPUT"));
  for (const bad of ["https://evil.example/pay", "https://wx.tenpay.com.evil.example/cgi-bin/mmpayweb-bin/checkmweb", "https://user@wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb", "http://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb"]) {
    await assert.rejects(setup({ h5_url: bad }, { h5Enabled: true }).client.createH5(input), errorCode("INVALID_RESPONSE"));
  }
});

test("mini program signs invocation with its bound app, never web app", async () => {
  const input = { ...order, openid: "mini_openid" };
  await assert.rejects(setup({}).client.createMiniProgram(input), errorCode("CONFIGURATION"));
  const { client, calls } = setup({ prepay_id: "wx_prepay" }, { miniPayEnabled: true, miniAppId: "wxmini" });
  const result = await client.createMiniProgram(input);
  assert.equal(JSON.parse(calls[0].options.body).appid, "wxmini");
  assert.ok(createVerify("RSA-SHA256").update(`wxmini\n${result.timeStamp}\n${result.nonceStr}\n${result.package}\n`).verify(merchantKeys.publicKey, result.paySign, "base64"));
  assert.equal(client.isPaymentAppId("wxmini"), true); assert.equal(client.isPaymentAppId("wxother"), false);
});

test("rejects malformed amounts, identifiers, callback URLs before sending", async () => {
  const { client, calls } = setup({});
  for (const amountCents of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(client.createNative({ ...order, amountCents }), errorCode("INVALID_INPUT"));
  for (const notifyUrl of ["http://merchant.example/notify", "https://user:pass@merchant.example/notify", "https://merchant.example/notify#fragment"]) await assert.rejects(client.createNative({ ...order, notifyUrl }), errorCode("INVALID_INPUT"));
  await assert.rejects(client.createNative({ ...order, outTradeNo: "../123456" }), errorCode("INVALID_INPUT"));
  await assert.rejects(client.createNative({ ...order, description: "你".repeat(43) }), errorCode("INVALID_INPUT"));
  assert.equal(calls.length, 0);
});

test("query requires signed response, exact merchant/app/order and valid amount/state", async () => {
  assert.equal((await setup({ ...paid, trade_state: "NOTPAY", transaction_id: undefined }).client.queryOrder(order.outTradeNo)).paid, false);
  for (const change of [{ mchid: "1900000002" }, { appid: "wxother" }, { out_trade_no: "another_order" }]) await assert.rejects(setup({ ...paid, ...change }).client.queryOrder(order.outTradeNo), errorCode("IDENTITY_MISMATCH"));
  for (const change of [{ amount: { total: 150, currency: "USD" } }, { amount: { total: 1.5, currency: "CNY" } }, { amount: { total: 150, currency: "CNY", payer_total: 200 } }, { transaction_id: undefined }, { trade_state: "UNKNOWN" }]) await assert.rejects(setup({ ...paid, ...change }).client.queryOrder(order.outTradeNo), errorCode("INVALID_RESPONSE"));
  await assert.rejects(setup(() => response(paid, 200, { signature: "bad" })).client.queryOrder(order.outTradeNo), errorCode("SIGNATURE_INVALID"));
});

test("only authenticated not-found returns null; transport and provider failures throw safely", async () => {
  assert.equal(await setup({ code: "ORDER_NOT_EXIST" }, {}, 404).client.queryOrder(order.outTradeNo), null);
  await assert.rejects(setup({ code: "NOAUTH", message: "sensitive raw provider payload" }, {}, 403).client.queryOrder(order.outTradeNo), (e) => e.code === "PROVIDER_ERROR" && !e.message.includes("sensitive"));
  await assert.rejects(setup(() => response({ code: "ORDER_NOT_EXIST" }, 404, { signature: "invalid" })).client.queryOrder(order.outTradeNo), errorCode("SIGNATURE_INVALID"));
  const { client, calls } = setup(() => { throw new Error("secret transport payload"); });
  await assert.rejects(client.createNative(order), (e) => e.code === "NETWORK_ERROR" && !e.message.includes("secret")); assert.equal(calls.length, 1);
});

test("close requires signed empty 204 and configured merchant", async () => {
  const { client, calls } = setup(null, {}, 204); await client.closeOrder(order.outTradeNo);
  assert.equal(JSON.parse(calls[0].options.body).mchid, config.merchantId); assert.match(calls[0].url, /order_123\/close$/);
  await assert.rejects(setup(() => new Response(null, { status: 204 })).client.closeOrder(order.outTradeNo), errorCode("SIGNATURE_INVALID"));
});

test("refund requests validate exact signed transaction, refund id and integer CNY amounts", async () => {
  const { client, calls } = setup(refund);
  assert.equal((await client.createRefund(refundInput)).status, "PROCESSING"); assert.equal(JSON.parse(calls[0].options.body).out_refund_no, refundInput.refundNo);
  for (const change of [{ transaction_id: "wrong" }, { out_refund_no: "other_refund" }, { mchid: "1900000002" }, { amount: { total: 150, refund: 49, currency: "CNY" } }]) await assert.rejects(setup({ ...refund, ...change }).client.createRefund(refundInput), errorCode("IDENTITY_MISMATCH"));
  await assert.rejects(client.createRefund({ ...refundInput, amountMinor: 151 }), errorCode("INVALID_INPUT"));
  await assert.rejects(client.createRefund({ ...refundInput, reason: "你".repeat(27) }), errorCode("INVALID_INPUT"));
  assert.equal((await client.queryRefund("refund_123")).status, "PROCESSING");
  assert.equal(await setup({ code: "RESOURCE_NOT_EXISTS" }, {}, 404).client.queryRefund("refund_123"), null);
  await assert.rejects(setup({ ...refund, amount: { total: 150, refund: 50, currency: "USD" } }).client.queryRefund("refund_123"), errorCode("INVALID_RESPONSE"));
  const longId = "r".repeat(64); assert.equal((await setup({ ...refund, out_refund_no: longId }).client.queryRefund(longId)).out_refund_no, longId);
});

test("signature verifier rejects wrong key, serial, tampering and stale/future replay windows", () => {
  const { client } = setup({}); const body = '{"a":1}'; const headers = signatureHeaders(body);
  assert.equal(client.verifySignature(headers, body), true);
  for (const altered of [{ ...headers, serial: "PUB_KEY_ID_OTHER" }, signatureHeaders(body, String(now / 1000 - 301)), signatureHeaders(body, String(now / 1000 + 301)), signatureHeaders(body, String(now / 1000), merchantKeys.privateKey), { ...headers, timestamp: "1e9" }]) assert.equal(client.verifySignature(altered, body), false);
  assert.equal(client.verifySignature(headers, body + " "), false);
});

test("notification verifies before decryption and checks merchant, app, currency, state", () => {
  const { client } = setup({}); const valid = notification(); assert.deepEqual(client.parseNotification(valid.body, valid.headers), paid);
  assert.throws(() => client.parseNotification(valid.body + " ", valid.headers), errorCode("SIGNATURE_INVALID"));
  for (const change of [{ mchid: "1900000002" }, { appid: "wxother" }]) { const bad = notification({ ...paid, ...change }); assert.throws(() => client.parseNotification(bad.body, bad.headers), errorCode("IDENTITY_MISMATCH")); }
  for (const change of [{ trade_state: "NOTPAY" }, { amount: { total: 150, currency: "USD" } }, { transaction_id: undefined }]) { const bad = notification({ ...paid, ...change }); assert.throws(() => client.parseNotification(bad.body, bad.headers), errorCode("INVALID_RESPONSE")); }
  const unsupported = notification(paid, { event_type: "REFUND.SUCCESS" }); assert.throws(() => client.parseNotification(unsupported.body, unsupported.headers), errorCode("INVALID_RESPONSE"));
  const corrupt = JSON.parse(valid.body); corrupt.resource.ciphertext = "a".repeat(60); const raw = JSON.stringify(corrupt);
  assert.throws(() => client.parseNotification(raw, signatureHeaders(raw)), errorCode("INVALID_RESPONSE"));
});

test("reject signed malformed JSON and oversized response bodies", async () => {
  await assert.rejects(setup(() => response("not-json")).client.queryOrder(order.outTradeNo), errorCode("INVALID_RESPONSE"));
  await assert.rejects(setup(() => response("[]")).client.queryOrder(order.outTradeNo), errorCode("INVALID_RESPONSE"));
  await assert.rejects(setup(() => response("a".repeat(1024 * 1024 + 1))).client.queryOrder(order.outTradeNo), errorCode("INVALID_RESPONSE"));
});
