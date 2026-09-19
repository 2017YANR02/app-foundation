# Extraction tracker

## Scope and authorization — 2026-09-19

The owner authorized extracting the first payment library, maintaining tracking documents and publishing its GitHub repository. The owner explicitly selected public visibility. Consumer websites are not authorized for deployment. The public repository and v0.1.0 release are now published; consumer application changes remain local.

Source: CubeRoot `e35459d59`, `core/apps/api/src/payment/wechat.ts`, `alipay.ts`, and the necessary signing helpers from `core/packages/shared/src/payment.ts`. Preserve GPL-3.0 and attribution. No business records, credentials, application code or unrelated workspace dependencies are published.

One package, `@app-foundation/payments`, exposes `core`, `wechat`, and `alipay` subpaths. It uses Node >=22, compiled CommonJS and TypeScript declarations. Pure protocol clients take explicit configuration and injectable transport/time; orders, idempotency persistence, entitlements and approval stay in consumers.

## Work

- [x] Confirm source boundaries, provenance and existing license.
- [x] Implement and test explicit-config WeChat client, including close-order and signed responses.
- [x] Implement and test explicit-config Alipay client, including verified query responses and close-order.
- [x] Validate two consumer adapters against the packed artifact, with no runtime source-path imports.
- [x] Run isolated signed-response/notification negative cases and consumer regression checks.
- [x] Review packaged files and secret exposure; publish source, version and release artifact to GitHub.
- [x] Install the released exact artifact in consumers; record evidence and remaining live readiness.

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

## Consumer validation

- CubeRoot: 3 targeted suites / 40 tests pass; API typecheck and architecture boundary audit pass. Existing exported adapters and environment names are preserved.
- Mira: 2 targeted suites / 12 tests pass; direct merchant adapter requires explicit enablement and verifies expected order/amount. The current CloudBase adapter consumes the shared exact CNY converter; its payment authority is unchanged.
- Existing CubeRoot membership settlement does not yet bind every provider result to the expected amount/provider and atomically grant entitlements. This pre-existing application issue is tracked separately as a deployment blocker; library signature checks do not resolve it.
- Consumer adoption is local only. Both applications now install the exact GitHub Release artifact URL, with matching lockfile integrity; temporary packed-file dependencies have been removed. The original full checks used the byte-identical reviewed artifact before publication.
- Mira full `pnpm check` passes: boundaries, offline mini-program checks, lint, typecheck, 53 files / 350 Web tests, production build and artifact isolation. No consumer deployment or live funds were involved.

## Publication evidence

- Public repository: https://github.com/2017YANR02/app-foundation
- Release: https://github.com/2017YANR02/app-foundation/releases/tag/v0.1.0
- Annotated tag `v0.1.0` targets source commit `443bdbeab9e4b951fed22608e4abcbe4229eabe9`.
- Initial source CI: https://github.com/2017YANR02/app-foundation/actions/runs/35442183273 — Node 22 and 24 both passed protocol tests, packing and isolated installation checks.
- Published asset: `app-foundation-payments-0.1.0.tgz`, SHA-256 `27c2db1db0643ab6ca962cf43c0675d7b77794dedf1eefd81dd701a2082710b3`. Anonymous public download matches the locally reviewed package. `SHA256SUMS` is attached to the same release.
- This is a GitHub Release package, not an npm registry publication. Consumers pin the full versioned asset URL and lockfile integrity. Future changes require a new reviewed version; do not overwrite released assets or move tags.
- Next: each consumer separately verifies merchant/product permissions, expected payment identity, atomic event consumption, order lifecycle and live acceptance before an independently authorized deployment. Messaging, OTP and media extraction remain deferred.
