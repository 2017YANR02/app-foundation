import { test } from "node:test";
import assert from "node:assert/strict";
import { decimalToMinor, minorToDecimal, assertPaymentMatches, buildWechatV3Message, buildAlipaySignContent } from "../dist/core.js";

test("CNY conversion is exact including safe integer boundary", () => {
  assert.equal(decimalToMinor("10.01"), 1001);
  assert.equal(decimalToMinor("0.1"), 10);
  assert.equal(decimalToMinor("90071992547409.91"), Number.MAX_SAFE_INTEGER);
  assert.equal(minorToDecimal(Number.MAX_SAFE_INTEGER), "90071992547409.91");
  for (const value of ["1e2", "01", "-1", "1.001", " 1", "90071992547409.92"]) assert.throws(() => decimalToMinor(value));
  for (const value of [0, -1, 0.1, NaN, Infinity]) assert.throws(() => minorToDecimal(value));
});

test("payment binding rejects cross-order and changed totals", () => {
  const expected = { outTradeNo: "order-one", amountMinor: 1001, currency: "CNY" };
  assert.doesNotThrow(() => assertPaymentMatches({ ...expected }, expected));
  for (const change of [{ outTradeNo: "other" }, { amountMinor: 1000 }, { currency: "USD" }]) {
    assert.throws(() => assertPaymentMatches({ ...expected, ...change }, expected), { code: "IDENTITY_MISMATCH" });
  }
});

test("signature strings preserve canonical protocol delimiters", () => {
  assert.equal(buildWechatV3Message({ method: "post", urlPath: "/v3/path?a=1", timestamp: "123", nonce: "n", body: "{}" }), "POST\n/v3/path?a=1\n123\nn\n{}\n");
  assert.equal(buildAlipaySignContent({ z: "中文", a: 0, b: false, sign: "ignored", empty: "", null: null }), "a=0&b=false&z=中文");
});
