import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createAliyunSmsSender, createTencentSmsSender, remainingSmsRetryMs, SmsError } from "../dist/index.js";

const aliyun = { accessKeyId: "synthetic-id", accessKeySecret: "synthetic-secret", signName: "Test", templateCode: "SMS_123" };
const tencent = { smsSdkAppId: "123456", signName: "Test", templateId: "123" };
const message = { phone: "+8613800138000", code: "000123" };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test("Aliyun signs the existing V2 RPC shape with explicit synthetic inputs", async () => {
  let seen;
  const sender = createAliyunSmsSender(aliyun, {
    now: () => new Date("2026-09-23T00:00:00.000Z"), nonce: () => "synthetic-nonce",
    fetch: async (url, options) => {
      seen = { url: String(url), options };
      return response({ Code: "OK", RequestId: "synthetic-request" });
    },
  });
  assert.deepEqual(await sender.sendCode(message), { accepted: true, requestId: "synthetic-request" });
  const url = new URL(seen.url);
  assert.equal(url.origin, "https://dysmsapi.aliyuncs.com");
  assert.equal(seen.options.method, "GET");
  assert.equal(seen.options.redirect, "error");
  assert.equal(url.searchParams.get("PhoneNumbers"), "13800138000");
  assert.equal(url.searchParams.get("TemplateParam"), '{"code":"000123"}');
  assert.equal(url.searchParams.get("SignatureNonce"), "synthetic-nonce");
  const parameters = [...url.searchParams.entries()].filter(([key]) => key !== "Signature").sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const encode = value => encodeURIComponent(value).replace(/\*/g, "%2A").replace(/%7E/gi, "~");
  const canonical = parameters.map(([key, value]) => `${encode(key)}=${encode(value)}`).join("&");
  const expected = createHmac("sha1", "synthetic-secret&").update(`GET&%2F&${encode(canonical)}`).digest("base64");
  assert.equal(url.searchParams.get("Signature"), expected);
});

test("Aliyun rejects explicit provider refusal and never exposes response text in errors", async () => {
  const sender = createAliyunSmsSender(aliyun, {
    fetch: async () => response({ Code: "isv.BUSINESS_LIMIT_CONTROL", Message: "private provider details" }),
  });
  await assert.rejects(sender.sendCode(message), error => error instanceof SmsError
    && error.code === "PROVIDER_REJECTED" && error.providerCode === "isv.BUSINESS_LIMIT_CONTROL"
    && !error.message.includes("private provider details") && !error.message.includes(message.phone));
});

test("Aliyun separates timeout, malformed response and network uncertainty without retrying", async () => {
  let calls = 0;
  const stalled = createAliyunSmsSender({ ...aliyun, timeoutMs: 5 }, {
    fetch: async () => { calls++; return await new Promise(() => {}); },
  });
  await assert.rejects(stalled.sendCode(message), { code: "TIMEOUT" });
  assert.equal(calls, 1);
  const malformed = createAliyunSmsSender(aliyun, { fetch: async () => new Response("x".repeat(16 * 1024 + 1)) });
  await assert.rejects(malformed.sendCode(message), { code: "INVALID_RESPONSE" });
  const offline = createAliyunSmsSender(aliyun, { fetch: async () => { throw new Error("secret in transport"); } });
  await assert.rejects(offline.sendCode(message), error => error.code === "NETWORK_ERROR" && !error.message.includes("secret"));
});

test("Tencent builds one domestic SendSms request and accepts only explicit Ok", async () => {
  let request;
  const sender = createTencentSmsSender(tencent, { send: async input => {
    request = input;
    return { SendStatusSet: [{ Code: "Ok", PhoneNumber: input.PhoneNumberSet[0], Message: "send success" }], RequestId: "synthetic-request" };
  } });
  assert.deepEqual(await sender.sendCode({ phone: "13800138000", code: "000123", templateId: "456" }),
    { accepted: true, requestId: "synthetic-request" });
  assert.deepEqual(request, { SmsSdkAppId: "123456", SignName: "Test", TemplateId: "456",
    TemplateParamSet: ["000123"], PhoneNumberSet: ["+8613800138000"] });
  const rejected = createTencentSmsSender(tencent, { send: async input => ({ SendStatusSet: [{ Code: "FailedOperation", PhoneNumber: input.PhoneNumberSet[0], Message: "private" }] }) });
  await assert.rejects(rejected.sendCode(message), error => error.code === "PROVIDER_REJECTED"
    && error.providerCode === "FailedOperation" && !error.message.includes("private"));
  const missing = createTencentSmsSender(tencent, { send: async () => ({ SendStatusSet: [] }) });
  await assert.rejects(missing.sendCode(message), { code: "INVALID_RESPONSE" });
  const wrongRecipient = createTencentSmsSender(tencent, { send: async () => ({ SendStatusSet: [{ Code: "Ok", PhoneNumber: "+8613900138000" }] }) });
  await assert.rejects(wrongRecipient.sendCode(message), { code: "INVALID_RESPONSE" });
  const timedOut = createTencentSmsSender(tencent, { send: async () => { throw new Error("SDK timeout with phone"); } });
  await assert.rejects(timedOut.sendCode(message), error => error.code === "NETWORK_ERROR" && !error.message.includes("phone"));
});

test("input and configuration errors never make a provider call", async () => {
  let calls = 0;
  const tencentSender = createTencentSmsSender(tencent, { send: async input => { calls++; return { SendStatusSet: [{ Code: "Ok", PhoneNumber: input.PhoneNumberSet[0] }] }; } });
  for (const patch of [{ phone: "123" }, { code: "12345" }, { templateId: "bad template" }, { code: "１２３４５６" }]) {
    await assert.rejects(tencentSender.sendCode({ ...message, ...patch }), { code: "INVALID_INPUT" });
  }
  assert.equal(calls, 0);
  assert.throws(() => createTencentSmsSender({ ...tencent, smsSdkAppId: "" }, { send: async () => ({}) }), { code: "CONFIGURATION" });
  assert.throws(() => createAliyunSmsSender({ ...aliyun, accessKeySecret: "" }), { code: "CONFIGURATION" });
});

test("retry delay starts at the attempt, handles boundaries and a backwards clock", () => {
  assert.equal(remainingSmsRetryMs({ lastAttemptAtMs: null, nowMs: 1000 }), 0);
  assert.equal(remainingSmsRetryMs({ lastAttemptAtMs: 1000, nowMs: 2000 }), 59_000);
  assert.equal(remainingSmsRetryMs({ lastAttemptAtMs: 1000, nowMs: 61_000 }), 0);
  assert.equal(remainingSmsRetryMs({ lastAttemptAtMs: 1000, nowMs: 999 }), 60_000);
  assert.throws(() => remainingSmsRetryMs({ lastAttemptAtMs: -1, nowMs: 1000 }), { code: "INVALID_INPUT" });
});
