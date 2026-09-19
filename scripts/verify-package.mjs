import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = (await readdir(path.join(root, "artifacts"))).filter((file) => file.endsWith(".tgz"));
if (artifacts.length !== 1) throw new Error("Expected exactly one package artifact");
const directory = await mkdtemp(path.join(tmpdir(), "foundation-consumer-"));
try {
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "isolated-consumer", private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", path.join(root, "artifacts", artifacts[0])], { cwd: directory, stdio: "pipe" });
  await writeFile(path.join(directory, "consumer.cjs"), `const assert = require("node:assert/strict");
const core = require("@app-foundation/payments/core");
assert.equal(core.decimalToMinor("10.01"), 1001);
assert.equal(typeof require("@app-foundation/payments/wechat").createWechatPayClient, "function");
assert.equal(typeof require("@app-foundation/payments/alipay").createAlipayClient, "function");
`);
  await writeFile(path.join(directory, "consumer.mjs"), `import assert from "node:assert/strict";
import { createWechatPayClient, createAlipayClient, decimalToMinor } from "@app-foundation/payments";
assert.equal(typeof createWechatPayClient, "function");
assert.equal(typeof createAlipayClient, "function");
assert.equal(decimalToMinor("0.01"), 1);
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
`);
  for (const name of ["consumer.cjs", "consumer.mjs"]) execFileSync(process.execPath, [name], { cwd: directory, stdio: "pipe" });
  execFileSync(process.execPath, [path.join(root, "packages/payments/node_modules/typescript/bin/tsc"), "consumer.ts", "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16"], { cwd: directory, stdio: "pipe" });
  console.log("Packed artifact installs offline; CommonJS, ESM and TypeScript consumers pass.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
