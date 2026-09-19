# Extraction tracker

## Scope and authorization — 2026-09-19

The owner authorized extracting the first payment library, maintaining tracking documents and publishing its GitHub repository. The owner explicitly selected public visibility. Consumer websites are not authorized for deployment. No remote repository exists yet.

Source: CubeRoot `e35459d59`, `core/apps/api/src/payment/wechat.ts`, `alipay.ts`, and the necessary signing helpers from `core/packages/shared/src/payment.ts`. Preserve GPL-3.0 and attribution. No business records, credentials, application code or unrelated workspace dependencies are published.

One package, `@app-foundation/payments`, exposes `core`, `wechat`, and `alipay` subpaths. It uses Node >=22, compiled CommonJS and TypeScript declarations. Pure protocol clients take explicit configuration and injectable transport/time; orders, idempotency persistence, entitlements and approval stay in consumers.

## Work

- [x] Confirm source boundaries, provenance and existing license.
- [x] Implement and test explicit-config WeChat client, including close-order and signed responses.
- [x] Implement and test explicit-config Alipay client, including verified query responses and close-order.
- [x] Validate two consumer adapters against the packed artifact, with no runtime source-path imports.
- [ ] Run isolated signed-response/notification negative cases and consumer regression checks.
- [ ] Review packaged files and secret exposure; publish source, version and release artifact to GitHub.
- [ ] Install the released exact artifact in consumers; record evidence and remaining live readiness.

## Contract

Factory methods: `createWechatPayClient(config, dependencies?)` and `createAlipayClient(config, dependencies?)`.
Dependencies: `{ fetch?: typeof fetch, now?: () => number, nonce?: () => string }`; `now` uses milliseconds.
Core owns `PaymentError` with stable codes, validation, integer CNY amounts and signing-string helpers. Query failures must throw; only authenticated not-found responses return `null`. No silent retries of payment creation. Notifications verify signatures before parsing and check configured merchant/application identity; applications additionally check expected order and amount and consume events atomically.

Consumers: CubeRoot keeps compatibility adapters and existing business routes; Mira gains a disabled-by-default server adapter for future direct merchant checkout, preserving its CloudBase payment authority and existing payment path. No new live checkout route or UI is part of this extraction.

## Local evidence

- `pnpm check`: 30 tests pass (12 WeChat, 15 Alipay, 3 common rules), with generated test keys and injected transport only.
- `pnpm pack:payments` and `node scripts/verify-package.mjs`: packed artifact installs in a disposable directory; CommonJS, ESM and strict TypeScript consumers pass.
- Independent code review found a notification identity issue; Alipay now returns signed `notify_id` as `eventId` and keeps transaction ID separate. Review recheck passed.
- Tarball allowlist contains compiled JavaScript/declarations, corresponding TypeScript source, build config, README, NOTICE and LICENSE only. Staged source secret scan passed.
- This establishes protocol and packaging evidence, not live merchant enablement, real payments or application settlement correctness.

## Consumer validation before publication

- CubeRoot: 3 targeted suites / 40 tests pass; API typecheck and architecture boundary audit pass. Existing exported adapters and environment names are preserved.
- Mira: 2 targeted suites / 12 tests pass; direct merchant adapter requires explicit enablement and verifies expected order/amount. The current CloudBase adapter consumes the shared exact CNY converter; its payment authority is unchanged.
- Existing CubeRoot membership settlement does not yet bind every provider result to the expected amount/provider and atomically grant entitlements. This pre-existing application issue is tracked separately as a deployment blocker; library signature checks do not resolve it.
- Consumer adoption is local only. Temporary packed-file dependencies are for verification and will be replaced by the released exact GitHub artifact URL before consumer commits.
