import { mkdtemp, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const packages = ["payments", "messaging", "verification", "sms"];
const expected = await Promise.all(packages.map(async (name) => {
  const manifest = JSON.parse(await readFile(path.join(root, "packages", name, "package.json"), "utf8"));
  return `app-foundation-${name}-${manifest.version}.tgz`;
}));
const available = (await readdir(path.join(root, "artifacts"))).filter((file) => file.endsWith(".tgz"));
const artifacts = expected.sort();
if (artifacts.some(file => !available.includes(file))) throw new Error("Missing a current package artifact");
for (const artifact of artifacts) {
  const filename = path.join(root, "artifacts", artifact);
  const files = execFileSync("tar", ["-tzf", filename], { encoding: "utf8" }).trim().split("\n");
  if (files.some(file => !/^package\/(?:dist\/|src\/|package\.json$|tsconfig\.json$|README\.md$|NOTICE\.md$|LICENSE$)/u.test(file)
    || file.split("/").some(part => part === ".." || part.startsWith(".")))) throw new Error(`Unexpected tarball contents: ${artifact}`);
  console.log(`${createHash("sha256").update(await readFile(filename)).digest("hex")}  ${artifact}`);
}
const directory = await mkdtemp(path.join(tmpdir(), "foundation-consumer-"));
try {
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "isolated-consumer", private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", ...artifacts.map(file => path.join(root, "artifacts", file))], { cwd: directory, stdio: "pipe" });
  await writeFile(path.join(directory, "consumer.cjs"), `const assert = require("node:assert/strict");
const core = require("@app-foundation/payments/core");
assert.equal(core.decimalToMinor("10.01"), 1001);
assert.equal(typeof require("@app-foundation/payments/wechat").createWechatPayClient, "function");
assert.equal(typeof require("@app-foundation/payments/alipay").createAlipayClient, "function");
assert.equal(typeof require("@app-foundation/messaging").createResendClient, "function");
assert.equal(require("@app-foundation/verification").generateNumericCode().length, 6);
assert.equal(typeof require("@app-foundation/sms").createTencentSmsSender, "function");
`);
  await writeFile(path.join(directory, "consumer.mjs"), `import assert from "node:assert/strict";
import { createWechatPayClient, createAlipayClient, decimalToMinor } from "@app-foundation/payments";
assert.equal(typeof createWechatPayClient, "function");
assert.equal(typeof createAlipayClient, "function");
assert.equal(decimalToMinor("0.01"), 1);
import { createResendClient } from "@app-foundation/messaging";
import { createCodeDigest, matchesCodeDigest, evaluateVerification } from "@app-foundation/verification";
import { createTencentSmsSender, remainingSmsRetryMs } from "@app-foundation/sms";
const binding = { secret: "0".repeat(32), purpose: "register", channel: "email", target: "user@example.test", challengeId: "example", code: "123456" };
assert.ok(matchesCodeDigest(binding, createCodeDigest(binding)));
assert.equal(evaluateVerification({ status: "sent", expiresAtMs: 2000, attempts: 0, consumedAtMs: null }, { nowMs: 1000, maxAttempts: 5, matches: true }).reason, "verified");
const client = createResendClient({ apiKey: "test-key", from: "sender@example.test" }, { fetch: async () => new Response(JSON.stringify({ id: "test-message" }), { status: 200 }) });
assert.deepEqual(await client.send({ to: "user@example.test", subject: "Test", text: "Synthetic only" }), { accepted: true, messageId: "test-message" });
assert.equal(remainingSmsRetryMs({ lastAttemptAtMs: 1000, nowMs: 61000 }), 0);
const sms = createTencentSmsSender({ smsSdkAppId: "12345", signName: "Test", templateId: "123" }, { send: async input => ({ SendStatusSet: [{ Code: "Ok", PhoneNumber: input.PhoneNumberSet[0] }] }) });
assert.deepEqual(await sms.sendCode({ phone: "13800138000", code: "000123" }), { accepted: true });
`);
  await writeFile(path.join(directory, "consumer.ts"), `import { createWechatPayClient } from "@app-foundation/payments/wechat";
import { createAlipayClient } from "@app-foundation/payments/alipay";
import { type ExpectedPayment, assertPaymentMatches } from "@app-foundation/payments/core";
declare const wechatConfig: Parameters<typeof createWechatPayClient>[0];
declare const alipayConfig: Parameters<typeof createAlipayClient>[0];
declare const payment: ExpectedPayment;
assertPaymentMatches(payment, payment);
createWechatPayClient(wechatConfig).queryOrder("order-123");
createAlipayClient(alipayConfig).queryTrade("order-123");
import { createResendClient, type EmailAccepted } from "@app-foundation/messaging";
import { createCodeDigest, matchesCodeDigest, evaluateVerification, remainingCooldownMs, type CodeDigestInput, type VerificationState } from "@app-foundation/verification";
import { createAliyunSmsSender, createTencentSmsSender, type SmsCodeSender, type SmsAccepted } from "@app-foundation/sms";
declare const binding: CodeDigestInput;
declare const state: VerificationState;
const accepted: Promise<EmailAccepted> = createResendClient({ apiKey: "test-key", from: "sender@example.test" }).send({ to: "user@example.test", subject: "Test", text: "Test" });
evaluateVerification(state, { nowMs: 1000, maxAttempts: 5, matches: matchesCodeDigest(binding, createCodeDigest(binding)) });
remainingCooldownMs({ lastIssuedAtMs: null, nowMs: 1000, cooldownMs: 60000 });
const aliyun: SmsCodeSender = createAliyunSmsSender({ accessKeyId: "test-id", accessKeySecret: "test-secret", signName: "Test", templateCode: "SMS_123" });
const tencent: SmsCodeSender = createTencentSmsSender({ smsSdkAppId: "123", signName: "Test", templateId: "123" }, { send: async input => ({ SendStatusSet: [{ Code: "Ok", PhoneNumber: input.PhoneNumberSet[0] }] }) });
const smsAccepted: Promise<SmsAccepted> = tencent.sendCode({ phone: "13800138000", code: "123456" });
void aliyun; void smsAccepted;
`);
  for (const name of ["consumer.cjs", "consumer.mjs"]) execFileSync(process.execPath, [name], { cwd: directory, stdio: "pipe" });
  execFileSync(process.execPath, [path.join(root, "packages/payments/node_modules/typescript/bin/tsc"), "consumer.ts", "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16"], { cwd: directory, stdio: "pipe" });
  console.log("All four tarballs pass content allowlists, offline installation, CommonJS, ESM and strict TypeScript consumption. No external requests were made.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
