import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createAliyunFaceClient, FaceVerificationError } from "../dist/index.js";
const config = { accessKeyId: "fixture-key", accessKeySecret: "fixture-secret" };
const input = { id: "test-order", realName: "Synthetic User", idCard: "synthetic-identity", metaInfo: '{"device":"synthetic"}', sceneId: "1000", returnUrl: "https://example.test/verify" };
const client = response => createAliyunFaceClient(config, { fetch: async () => response });
test("signs POST identity data and returns only IDs and HTTPS URL", async () => {
  const api = createAliyunFaceClient(config, { now: () => 0, nonce: () => "fixed-nonce", fetch: async (url, options) => {
    assert.equal(url, "https://cloudauth.cn-shanghai.aliyuncs.com/");
    assert.equal(options.method, "POST"); assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
    const params = new URLSearchParams(options.body);
    assert.equal(params.get("ProductCode"), "ID_PRO"); assert.equal(params.get("Model"), "MOVE_ACTION");
    assert.equal(params.get("VideoEvidence"), "false"); assert.equal(params.get("CertNo"), input.idCard);
    assert.equal(params.get("Timestamp"), "1970-01-01T00:00:00Z"); assert.equal(params.get("SignatureNonce"), "fixed-nonce");
    const signature = params.get("Signature"); params.delete("Signature");
    const encode = s => encodeURIComponent(s).replace(/[!'()*]/gu, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const canonical = [...params.keys()].sort().map(k => `${encode(k)}=${encode(params.get(k))}`).join("&");
    assert.equal(signature, createHmac("sha1", "fixture-secret&").update(`POST&%2F&${encode(canonical)}`).digest("base64"));
    return Response.json({ Code: 200, ResultObject: { CertifyId: "fixture", CertifyUrl: "https://example.test/flow", MaterialInfo: "private" } });
  } });
  assert.deepEqual(await api.init(input), { certifyId: "fixture", certifyUrl: "https://example.test/flow" });
});
for (const [Code, ResultObject, status] of [[403, undefined, "pending"], ["424", undefined, "pending"], [200, { Passed: "T" }, "passed"], ["200", { Passed: "F", SubCode: "204" }, "failed"]]) {
  test(`maps ${Code}/${ResultObject?.Passed} to ${status}`, async () => {
    assert.deepEqual(await client(Response.json({ Code, ResultObject })).query("1000", "fixture"), { status });
  });
}
test("never infers a pass from similarity, SubCode, a boolean or a callback-like property", async () => {
  for (const ResultObject of [{ similarity: 100, SubCode: "200" }, { Passed: true }, { passed: true }, null, []]) {
    await assert.rejects(client(Response.json({ Code: 200, ResultObject })).query("1000", "fixture"), { code: "INVALID_RESPONSE" });
  }
});
test("keeps unfinished codes scoped to successful Describe responses", async () => {
  await assert.rejects(client(Response.json({ Code: 403 })).init(input), { code: "PROVIDER" });
  await assert.rejects(client(Response.json({ Code: 424 }, { status: 503 })).query("1000", "fixture"), { code: "PROVIDER" });
});
test("redacts provider messages, transport exceptions and malformed diagnostic IDs", async () => {
  for (const [Code, code] of [[411, "PERMISSION"], [412, "BALANCE"], ["private-detail", "PROVIDER"]]) {
    await assert.rejects(client(Response.json({ Code, Message: input.idCard, RequestId: input.idCard, ResultObject: input })).query("1000", "fixture"), error => {
      assert.equal(error.code, code); assert.ok(error instanceof FaceVerificationError);
      assert.equal(error.diagnostic.requestId, undefined); assert.ok(!JSON.stringify(error).includes(input.idCard)); return true;
    });
  }
  let calls = 0;
  const api = createAliyunFaceClient(config, { fetch: async () => { calls++; throw new Error(input.idCard); } });
  await assert.rejects(api.init(input), error => { assert.equal(error.code, "TRANSPORT"); assert.equal(error.cause, undefined); assert.ok(!error.message.includes(input.idCard)); return true; });
  assert.equal(calls, 1);
});
test("rejects invalid JSON, non-object responses and oversized material bodies", async () => {
  for (const response of [new Response("not-json"), Response.json([]), Response.json({ Code: 200, ResultObject: { Passed: "T", MaterialInfo: "x".repeat(262144) } })]) {
    await assert.rejects(client(response).query("1000", "fixture"), { code: "INVALID_RESPONSE" });
  }
});
test("validates config, input and returned URLs without leaking input or making invalid requests", async () => {
  assert.throws(() => createAliyunFaceClient({ ...config, accessKeySecret: "" }), { code: "INVALID_CONFIG" });
  let calls = 0;
  const api = createAliyunFaceClient(config, { fetch: async () => { calls++; throw Error(); } });
  await assert.rejects(api.init({ ...input, returnUrl: "https://user:secret@example.test" }), { code: "INVALID_INPUT" });
  await assert.rejects(api.init({ ...input, metaInfo: "x".repeat(16001) }), { code: "INVALID_INPUT" });
  assert.equal(calls, 0);
  for (const CertifyUrl of ["http://example.test", "javascript:alert(1)", "https://user:secret@example.test", "invalid"]) {
    await assert.rejects(client(Response.json({ Code: 200, ResultObject: { CertifyId: "fixture", CertifyUrl } })).init(input), { code: "INVALID_RESPONSE" });
  }
});
