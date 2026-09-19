import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign, createVerify } from "node:crypto";
import { createAlipayClient } from "../dist/alipay.js";
import { buildAlipaySignContent } from "../dist/core.js";

const keys = () => generateKeyPairSync("rsa", { modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const merchant = keys();
const provider = keys();
const config = { appId: "app-one", sellerId: "seller-one", privateKey: merchant.privateKey, publicKey: provider.publicKey };
const signed = (text) => createSign("RSA-SHA256").update(text).sign(provider.privateKey, "base64");
const envelope = (method, data, raw = JSON.stringify(data)) =>
  `{"${method.replaceAll(".", "_")}_response":${raw},"sign":${JSON.stringify(signed(raw))}}`;
const queryData = { code: "10000", out_trade_no: "order-1", trade_no: "txn-1", total_amount: "10.01", trade_status: "TRADE_SUCCESS" };
const fake = (handler, override = {}) => createAlipayClient({ ...config, ...override }, {
  now: () => Date.UTC(2026, 8, 19),
  fetch: async (url, init) => {
    assert.equal(url, "https://openapi.alipay.com/gateway.do");
    assert.equal(init.redirect, "error");
    const params = Object.fromEntries(new URLSearchParams(init.body));
    assert.equal(createVerify("RSA-SHA256").update(buildAlipaySignContent(params)).verify(merchant.publicKey, params.sign, "base64"), true);
    return handler(params.method, JSON.parse(params.biz_content), params);
  },
});
const response = (method, data, raw) => new Response(envelope(method, data, raw));
const checkCode = (code) => (error) => error?.code === code;

test("query verifies exact raw escaped nested JSON and preserves envelope", async () => {
  const raw = '{"code":"10000","out_trade_no":"order-1","trade_no":"txn-1","total_amount":"10.01","trade_status":"TRADE_SUCCESS","extra":{"text":"\\u4e2d } \\\" sign","array":[{},[1,true,null]]}}';
  const client = fake((method) => response(method, {}, raw));
  const result = await client.queryTrade("order-1");
  assert.equal(result.paid, true);
  assert.equal(result.txn, "txn-1");
  assert.equal(result.raw.alipay_trade_query_response.extra.text, '中 } " sign');
});

test("signed query WAIT_BUYER_PAY is an unpaid result, not an error", async () => {
  assert.equal((await fake((m) => response(m, { ...queryData, trade_status: "WAIT_BUYER_PAY" })).queryTrade("order-1")).paid, false);
});

test("only signed provider not-found returns null", async () => {
  const data = { code: "40004", sub_code: "ACQ.TRADE_NOT_EXIST" };
  assert.equal(await fake((m) => response(m, data)).queryTrade("order-1"), null);
  await assert.rejects(fake(() => new Response(JSON.stringify({ alipay_trade_query_response: data }))).queryTrade("order-1"), checkCode("SIGNATURE_INVALID"));
  await assert.rejects(fake((m) => response(m, { code: "40004", sub_code: "ACQ.SYSTEM_ERROR", sub_msg: "secret details" })).queryTrade("order-1"), (e) => e.code === "PROVIDER_ERROR" && !e.message.includes("secret"));
});

test("signed error_response is authenticated and HTTP failure never yields null", async () => {
  const raw = JSON.stringify({ code: "40004", sub_code: "ACQ.TRADE_NOT_EXIST" });
  const text = `{"error_response":${raw},"sign":${JSON.stringify(signed(raw))}}`;
  assert.equal(await fake(() => new Response(text)).queryTrade("order-1"), null);
  await assert.rejects(fake(() => new Response(text, { status: 500 })).queryTrade("order-1"), checkCode("PROVIDER_ERROR"));
});

test("tampered signed response is rejected", async () => {
  const raw = envelope("alipay.trade.query", queryData).replace('"10.01"', '"10.02"');
  await assert.rejects(fake(() => new Response(raw)).queryTrade("order-1"), checkCode("SIGNATURE_INVALID"));
});

test("duplicate root keys, escaped keys and nested duplicate keys are rejected", async () => {
  const ordinary = envelope("alipay.trade.query", queryData);
  const rawData = JSON.stringify(queryData);
  const cases = [
    ordinary.replace('{"alipay_trade_query_response":', `{"alipay_trade_query_response":{},"alipay_trade_query_response":`),
    ordinary.replace('"sign":', '"s\\u0069gn":"fake","sign":'),
    envelope("alipay.trade.query", {}, rawData.replace('"code":"10000"', '"code":"10000","code":"10000"')),
    envelope("alipay.trade.query", {}, rawData.replace('"code":"10000"', '"code":"10000","extra":{"x":1,"x":2}')),
  ];
  for (const raw of cases) await assert.rejects(fake(() => new Response(raw)).queryTrade("order-1"), checkCode("INVALID_RESPONSE"));
});

test("unexpected or competing response envelopes are rejected", async () => {
  const other = envelope("alipay.trade.close", queryData);
  await assert.rejects(fake(() => new Response(other)).queryTrade("order-1"), checkCode("INVALID_RESPONSE"));
  const both = envelope("alipay.trade.query", queryData).replace('{"alipay', '{"error_response":{},"alipay');
  await assert.rejects(fake(() => new Response(both)).queryTrade("order-1"), checkCode("INVALID_RESPONSE"));
});

test("query rejects mismatched order, merchant identity and invalid amount", async () => {
  for (const extra of [{ out_trade_no: "other" }, { app_id: "other" }, { seller_id: "other" }]) {
    await assert.rejects(fake((m) => response(m, { ...queryData, ...extra })).queryTrade("order-1"), checkCode("IDENTITY_MISMATCH"));
  }
  for (const total_amount of ["10.001", "0", "9007199254740992", 10.01]) {
    await assert.rejects(fake((m) => response(m, { ...queryData, total_amount })).queryTrade("order-1"), checkCode("INVALID_RESPONSE"));
  }
});

test("close verifies response and matches order", async () => {
  await fake((method, biz) => { assert.equal(method, "alipay.trade.close"); assert.equal(biz.out_trade_no, "order-1"); return response(method, { code: "10000", out_trade_no: "order-1" }); }).closeOrder("order-1");
  await assert.rejects(fake((m) => response(m, { code: "10000", out_trade_no: "other" })).closeOrder("order-1"), checkCode("IDENTITY_MISMATCH"));
  await assert.rejects(fake(() => new Response('{"alipay_trade_close_response":{"code":"10000"}}')).closeOrder("order-1"), checkCode("SIGNATURE_INVALID"));
});

test("refund create uses stable request and signed query verification", async () => {
  const calls = [];
  const client = fake((method, biz) => {
    calls.push(method); assert.equal(biz.trade_no, "txn-1"); assert.equal(biz.out_request_no, "refund-1");
    if (method === "alipay.trade.refund") { assert.equal(biz.refund_amount, "10.01"); return response(method, { code: "10000", trade_no: "txn-1", refund_fee: "10.01", fund_change: "N" }); }
    return response(method, { code: "10000", trade_no: "txn-1", out_request_no: "refund-1", refund_amount: "10.01", refund_status: "REFUND_SUCCESS" });
  });
  const result = await client.createRefund({ transactionId: "txn-1", requestId: "refund-1", amountMinor: 1001, reason: "cancelled" });
  assert.equal(result.refund_status, "REFUND_SUCCESS");
  assert.deepEqual(calls, ["alipay.trade.refund", "alipay.trade.fastpay.refund.query"]);
});

test("refund queries reject identity errors and creation amount mismatch", async () => {
  const data = { code: "10000", trade_no: "txn-1", out_request_no: "refund-1", refund_amount: "10.01", refund_status: "REFUND_SUCCESS" };
  for (const extra of [{ trade_no: "other" }, { out_request_no: "other" }]) {
    await assert.rejects(fake((m) => response(m, { ...data, ...extra })).queryRefund("txn-1", "refund-1"), checkCode("IDENTITY_MISMATCH"));
  }
  await assert.rejects(fake((m) => response(m, { code: "10000", trade_no: "txn-1", refund_fee: "10.00" })).createRefund({ transactionId: "txn-1", requestId: "refund-1", amountMinor: 1001, reason: "cancelled" }), checkCode("INVALID_RESPONSE"));
  assert.equal(await fake((m) => response(m, { code: "40004", sub_code: "ACQ.REFUND_NOT_EXIST" })).queryRefund("txn-1", "refund-1"), null);
  await assert.rejects(fake(() => new Response('{"alipay_trade_fastpay_refund_query_response":{"code":"10000"}}')).queryRefund("txn-1", "refund-1"), checkCode("SIGNATURE_INVALID"));
});

const notification = (extra = {}) => {
  const params = { app_id: "app-one", seller_id: "seller-one", sign_type: "RSA2", notify_id: "notification-1", out_trade_no: "order-1", trade_no: "txn-1", total_amount: "10.01", trade_status: "TRADE_SUCCESS", ...extra };
  params.sign = signed(buildAlipaySignContent(params, ["sign", "sign_type"]));
  return params;
};
test("notification checks signature plus merchant, preserves literal percent encoding", () => {
  const client = createAlipayClient(config);
  const params = notification({ subject: "A%20B+中" });
  assert.equal(client.verifyNotify(params), true);
  assert.equal(client.parseNotification(params).amountMinor, 1001);
  for (const bad of [notification({ app_id: "other" }), notification({ seller_id: "other" }), { ...params, total_amount: "10.02" }, notification({ sign_type: "RSA" })]) assert.equal(client.verifyNotify(bad), false);
  assert.throws(() => client.parseNotification(notification({ total_amount: "10.001" })), checkCode("INVALID_RESPONSE"));
});

test("notification event identity preserves different status events for one transaction", () => {
  const client = createAlipayClient(config);
  const first = client.parseNotification(notification({ notify_id: "event-success", trade_status: "TRADE_SUCCESS" }));
  const second = client.parseNotification(notification({ notify_id: "event-finished", trade_status: "TRADE_FINISHED" }));
  assert.equal(first.transactionId, second.transactionId);
  assert.equal(first.eventId, "event-success");
  assert.equal(second.eventId, "event-finished");
  assert.notEqual(first.eventId, second.eventId);
  const missing = notification();
  delete missing.notify_id;
  missing.sign = signed(buildAlipaySignContent(missing, ["sign", "sign_type"]));
  assert.throws(() => client.parseNotification(missing), checkCode("INVALID_INPUT"));
  assert.throws(() => client.parseNotification(notification({ notify_id: "" })), checkCode("INVALID_INPUT"));
  assert.equal(client.verifyNotify({ ...notification(), notify_id: "tampered" }), false);
});

test("separate clients never mix merchant configuration and checkout rejects invalid inputs", () => {
  const first = createAlipayClient(config, { now: () => Date.UTC(2026, 8, 19) });
  const second = createAlipayClient({ ...config, appId: "app-two" });
  const input = { outTradeNo: "order-1", amountCents: 1001, subject: "test", clientType: "wap", notifyUrl: "https://merchant.example/notify", returnUrl: "https://merchant.example/result" };
  const checkout = new URL(first.createCheckoutUrl(input));
  assert.equal(checkout.searchParams.get("timestamp"), "2026-09-19 08:00:00");
  assert.equal(checkout.searchParams.get("method"), "alipay.trade.wap.pay");
  assert.equal(new URL(second.createCheckoutUrl(input)).searchParams.get("app_id"), "app-two");
  assert.equal(first.verifyNotify(notification()), true);
  assert.equal(second.verifyNotify(notification()), false);
  assert.equal(JSON.parse(checkout.searchParams.get("biz_content")).total_amount, "10.01");
  for (const amountCents of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => first.createCheckoutUrl({ ...input, amountCents }), checkCode("INVALID_INPUT"));
  assert.throws(() => first.createCheckoutUrl({ ...input, notifyUrl: "http://merchant.example/notify" }), checkCode("INVALID_INPUT"));
  assert.throws(() => createAlipayClient({ ...config, gateway: "https://evil.example/gateway.do" }), checkCode("CONFIGURATION"));
});

test("transport and oversized response failures never become unpaid", async () => {
  const client = createAlipayClient(config, { fetch: async () => { throw new Error("secret transport details"); } });
  await assert.rejects(client.queryTrade("order-1"), (e) => e.code === "NETWORK_ERROR" && !e.message.includes("secret"));
  await assert.rejects(fake(() => new Response("x".repeat(1_048_577))).queryTrade("order-1"), checkCode("INVALID_RESPONSE"));
});
