import { test } from "node:test";
import assert from "node:assert/strict";
import { createResendClient, MailError } from "../dist/index.js";

const config = { apiKey: "synthetic-provider-token", from: "Example <sender@example.test>" };
const message = { to: "recipient@example.test", subject: "Synthetic verification", text: "code 000123", html: "<p>000123</p>" };
const accepted = () => Response.json({ id: "message-001", ignored: "private-provider-field" });
const secret = "private recipient and credential not for errors";

function rejects(code) { return error => { assert.ok(error instanceof MailError); assert.equal(error.code, code); assert.equal(String(error).includes(secret), false); assert.equal("cause" in error, false); return true; }; }

test("uses explicit sender, snapshots payload and preserves consumer unsubscribe headers", async () => {
  let calls = 0;
  const settings = { ...config };
  const client = createResendClient(settings, { fetch: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.resend.com/emails"); assert.equal(init.method, "POST"); assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, "Bearer synthetic-provider-token");
    assert.equal(init.headers["Idempotency-Key"], "message/challenge-001");
    assert.deepEqual(JSON.parse(init.body), { from: config.from, to: [message.to], subject: message.subject, text: message.text, html: message.html,
      headers: { "List-Unsubscribe": "<https://example.test/unsubscribe/token>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    return accepted();
  } });
  settings.apiKey = "changed"; settings.from = "Changed <changed@example.test>";
  assert.deepEqual(await client.send({ ...message, idempotencyKey: "message/challenge-001", headers: { "List-Unsubscribe": "<https://example.test/unsubscribe/token>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }), { accepted: true, messageId: "message-001" });
  assert.equal(calls, 1);
});

test("supports plain-text and explicit multiple recipients with no implicit template or environment", async () => {
  const client = createResendClient(config, { fetch: async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { from: config.from, to: ["first@example.test", "second@example.test"], subject: "Subject", text: "Content" });
    return accepted();
  } });
  await client.send({ to: ["first@example.test", "second@example.test"], subject: "Subject", text: "Content" });
});

test("rejects invalid configuration before constructing a transport", () => {
  for (const patch of [{ apiKey: "" }, { apiKey: "bad\nsecret" }, { from: "bad\r\nBcc: other" }, { timeoutMs: 0 }, { timeoutMs: 60001 }, { timeoutMs: NaN }]) {
    assert.throws(() => createResendClient({ ...config, ...patch }), rejects("CONFIGURATION"));
  }
});

test("rejects bad destinations, header injection, payload overflow and unknown fields before transport", async () => {
  let calls = 0; const client = createResendClient(config, { fetch: async () => { calls++; return accepted(); } });
  for (const patch of [{ to: [] }, { to: "no-address" }, { to: "a@example.test\nBcc: x@y.test" }, { subject: "bad\r\nheader" }, { text: "" }, { text: "x".repeat(1024 * 1024) },
    { headers: { From: "spoof@example.test" } }, { headers: { To: "other@example.test" } }, { headers: { "X-Test": "bad\nline" } },
    { idempotencyKey: "bad\nkey" }, { from: "spoof@example.test" }, { to: Array(101).fill("a@example.test") }]) {
    await assert.rejects(client.send({ ...message, ...patch }), rejects("INVALID_INPUT"));
  }
  assert.equal(calls, 0);
});

for (const status of [400, 401, 409, 422, 429, 500, 503]) {
  test(`HTTP ${status} is sanitized and never automatically retried`, async () => {
    let calls = 0; let reads = 0;
    const client = createResendClient(config, { fetch: async () => {
      calls++;
      const response = new Response(secret, { status });
      response.text = async () => { reads++; throw new Error(secret); };
      return response;
    } });
    await assert.rejects(client.send(message), error => { rejects("PROVIDER_REJECTED")(error); assert.equal(error.status, status); return true; });
    assert.equal(calls, 1); assert.equal(reads, 0);
  });
}

test("network errors expose neither original messages nor causes", async () => {
  const client = createResendClient(config, { fetch: async () => { throw new Error(secret); } });
  await assert.rejects(client.send(message), rejects("NETWORK_ERROR"));
});

test("a timeout rejects even when an injected transport ignores its AbortSignal", async () => {
  let signal;
  const client = createResendClient({ ...config, timeoutMs: 15 }, { fetch: async (_url, init) => { signal = init.signal; return new Promise(() => {}); } });
  await assert.rejects(client.send(message), rejects("TIMEOUT")); assert.equal(signal.aborted, true);
});

test("the same deadline includes a stalled response body and cancels its reader", async () => {
  let cancelled = false;
  const client = createResendClient({ ...config, timeoutMs: 15 }, { fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"id":')); }, cancel() { cancelled = true; },
  })) });
  await assert.rejects(client.send(message), rejects("TIMEOUT"));
  assert.equal(cancelled, true);
});

test("missing id, malformed and oversized success responses are unknown outcomes, never reported accepted", async () => {
  for (const make of [() => Response.json({}), () => new Response("invalid " + secret), () => Response.json({ id: secret }),
    () => new Response("x".repeat(16385)), () => new Response("{}", { headers: { "content-length": "16385" } }),
    () => new Response(new Uint8Array([0xff]))]) {
    const client = createResendClient(config, { fetch: async () => make() });
    await assert.rejects(client.send(message), rejects("INVALID_RESPONSE"));
  }
});

test("same-message retries are caller-owned and keep exactly one idempotency identity and payload", async () => {
  const sent = [];
  const client = createResendClient(config, { fetch: async (_url, init) => { sent.push({ headers: init.headers, body: init.body }); if (sent.length === 1) throw new Error(secret); return accepted(); } });
  const input = { ...message, idempotencyKey: "challenge/001" };
  await assert.rejects(client.send(input), rejects("NETWORK_ERROR"));
  await client.send(input); assert.deepEqual(sent[0], sent[1]);
});
