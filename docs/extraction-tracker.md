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
- Next: each consumer separately verifies merchant/product permissions, expected payment identity, atomic event consumption, order lifecycle and live acceptance before an independently authorized deployment. Messaging, OTP and media were deferred at that release; the newer local preparation below supersedes messaging/OTP status.

## Messaging and verification preparation — 2026-09-19

The owner authorized starting the next extraction locally, retaining the current no-push/no-publication boundary. Implement `@app-foundation/messaging` and `@app-foundation/verification` as actual independent packages; do not create empty future modules. Mail templates, sender identities, secrets, message queues, code storage and account transactions stay in each application. No private application source, user data or credentials enter this public repository.

- [x] Explicit-config Resend transport with stable sanitized errors, bounded I/O, optional idempotency and injected transport tests.
- [x] Purpose/channel/target/challenge-bound OTP primitives and pure lifecycle decisions; no storage, env reads or silent legacy migration.
- [x] Compare both consumer contracts, pack/install in disposable consumers, test CJS/ESM/TypeScript, retain provenance and license.
- [x] Local checks and local commit only. New artifacts remain unpublished candidates; production manifests must not depend on local paths or nonexistent releases.

Media Range/container parsing is the next candidate to validate. SMS, password compatibility, HTTP utilities and operations templates require actual shared demand. Authentication/accounts, commerce/authorization workflows, database transactions and full storage services remain application-owned. This work does not cancel the existing payment consumer roadmap.

### Local evidence for the two new candidates

- Node 24.19.0 `pnpm check`: 60 tests pass (payments 30, messaging 16, verification 14), including timeout/body bounds, sanitized errors, header injection, acceptance validation, scoped digests, expiry/attempt limits and consumption. The database example is an in-memory contract, not proof of consumer transaction correctness.
- `pnpm pack:all` and `node scripts/verify-package.mjs`: all three current tarballs pass file allowlists, offline script-disabled installation and CommonJS/ESM/strict TypeScript consumption. The existing payments artifact hash is unchanged from the published release.
- A private harness reads both actual email modules into isolated temporary consumers, supplies synthetic environment values and fake fetch, and compares seven actual payloads against the packed messaging export. Three contract groups pass, including configuration lifetime, bilingual templates, unsubscribe headers and error differences. The harness contains application-specific knowledge and stays outside this public repository.
- Deliberate candidate changes: success requires a valid provider message ID; an empty 2xx is now an unknown INVALID_RESPONSE. Network/provider exceptions are sanitized. Existing wrappers and production dependencies have not been switched. Application adoption needs tests for pending/failed/retry behavior under those differences.
- Baselines: consumer A registration verification 7 tests; consumer B notification deduplication/unsubscribe 3 tests. Independent package review found no blocking issue. The two new package directories pass redacted secret scanning.
- Candidate SHA-256: messaging `13d2ba757089cbe6b27ce2108ab1b3a4ad72e30c0ba9e320c3bd9d516bb76f51`; verification `7af6ab435e354a170c3811c5aa8365c86a35a7bd51cf77687798a0ec3111de62`.
- CI configuration now covers all packages, but the changed workflow has not run on GitHub. No push, tag, release, actual email, database migration or application deployment occurred. Candidate 0.1.0 versions are package-specific and are not assets of the existing payments v0.1.0 release.

Next local work: validate the single-range media contract before deciding on a package. Future consumer adoption must use a newly published immutable artifact, preserve templates/configuration, and stage legacy OTP compatibility and application transactions separately. Do not overwrite the existing payment release.

## v0.2.0 publication preparation — 2026-09-19

The owner subsequently authorized necessary pushes. Prepare an immutable v0.2.0 repository release carrying messaging 0.1.0 and verification 0.1.0. Payments remains at its original v0.1.0 artifact URL and checksum. Run the reviewed test/pack/consumer checks, then Node 22/24 CI on the exact pushed source before publishing assets. Consumer adoption and production deployments remain separate. The previous no-push preparation record is historical, not the current push authorization.

## v0.2.0 published evidence — 2026-09-19

- Immutable tag and release v0.2.0 target `9b989fcfde0c94b6012e7f46471aa549a17ce1db`. Source pushed under the owner's subsequent authorization.
- [Exact-source CI](https://github.com/2017YANR02/app-foundation/actions/runs/35451483436): Node 22 and 24 both passed build, all 60 tests, packing and isolated consumption.
- [Release](https://github.com/2017YANR02/app-foundation/releases/tag/v0.2.0) contains messaging 0.1.0, verification 0.1.0 and SHA256SUMS. The README preparation changes are included in these final bytes, so historical candidate hashes above are not release hashes.
- messaging SHA-256: `412b677472d09cf2877fc9fe105f8da49eba1ad2ebe3d927ca5bc06c7e8f8272`.
- verification SHA-256: `cf30fe212c946026ee33e7873959de5d1c54bc1f8b0f072a977db71eba4f21c5`.
- Anonymous downloads matched the reviewed local tarballs byte-for-byte. Existing payments remains at its original URL and checksum. No assets or tags were overwritten.
- Both consumers now have local adapters pinned to the published artifacts with integrity checks. Application verification, commits and deployment evidence remain in their own repositories; this public record includes no private application logic. No consumer deployment or live email/payment is implied.
- Media single-range parsing remains application-local: the present small parser overlap does not justify another distribution unit. Multipart/status/stream authorization differ; MP4 rules differ materially. Revisit after a shared contract change creates a real maintenance need.

## SMS verification transport — 2026-09-23

The owner requested a shared SMS component for Mira and CubeRoot and separately approved publishing a versioned `app-foundation` release. The shared scope is one `SmsCodeSender` contract, explicit-config Aliyun Dysmsapi V2 and Tencent SendSms transport adapters, sanitized acceptance/error outcomes, and pure 60-second retry timing. Aliyun signing is adapted from the owner's GPL CubeRoot transport; the Tencent request adapter follows the public provider API and contains no private Mira source. The applications continue to own phone eligibility, templates, SDK credentials, code/challenge storage, rate limits, account identity, verification and delivery callbacks. A provider `OK` is submission acceptance, not handset delivery; timeout/network results are unknown and never trigger an automatic resend.

The new `@app-foundation/sms@0.1.0` package targets Node >=16.13 for Mira's current CloudBase `user` runtime; Aliyun use additionally needs a global or injected `fetch`. Synthetic tests cover both provider shapes, signing, rejection, unknown results, malformed/oversized responses, invalid input and cooldown boundaries. No real SMS was sent. Local `pnpm check` passed all 66 package tests, `pnpm pack:all` and isolated CommonJS/ESM/strict-TypeScript consumption passed, and a Node 16.13 CommonJS Tencent smoke passed. The current SMS tarball SHA-256 is `82356764e08b2ea64f213f267c7b3cd56b07e682fdf6cf0b4114d2f0fb64f680` before source publication. Existing payments/messaging/verification releases must not be overwritten; their local repacked bytes need not match the historical immutable GitHub assets.

Next: push this source, require exact-commit CI, publish only the new SMS asset and checksum in a new immutable GitHub release, then pin that release independently in Mira and CubeRoot and run their narrow adapter tests. Publishing the package does not authorize consumer pushes, deployments, CloudBase updates or live send tests.

### v0.3.0 release and recipient-match follow-up

- Source commit `7a51f1081bea2401765aae428bad6f006f7d7da0` passed [Node 22/24 CI](https://github.com/2017YANR02/app-foundation/actions/runs/35962539609) and was published as [v0.3.0](https://github.com/2017YANR02/app-foundation/releases/tag/v0.3.0). The SMS 0.1.0 asset SHA-256 is `82356764e08b2ea64f213f267c7b3cd56b07e682fdf6cf0b4114d2f0fb64f680`; existing releases were not changed.
- Consumer integration review found one missing invariant: Tencent's success status must name the requested recipient. No consumer had adopted 0.1.0. The corrective 0.1.1 source and tests require exact `SendStatusSet[0].PhoneNumber` equality before acceptance, including a wrong-recipient negative test. Keep v0.3.0 immutable but supersede it with a new release; consumers must pin 0.1.1, not 0.1.0.

### Published fixed version and consumer boundary

- [v0.3.1](https://github.com/2017YANR02/app-foundation/releases/tag/v0.3.1) contains SMS 0.1.1 from source commit `12ec3c4e65d60f4b3dc3c59633ab06bb70479ab3`. [CI 35963093557](https://github.com/2017YANR02/app-foundation/actions/runs/35963093557) passed Node 22/24; Node 16.13 CommonJS import was also checked for Mira CloudBase compatibility. The released tarball SHA-256 is `f334bf0060c1e85df4ab7c233e461f96d4db2244de50c22e23502515b3c2e0b4` and matches the release asset digest.
- Mira and CubeRoot locally pin this exact asset and lockfile integrity. Mira wraps its existing Tencent SDK; CubeRoot uses the standard Aliyun Dysmsapi transport. Each application retains its own credentials, templates, cooldown enforcement, account state and verification. Shared code never automatically retries or claims handset delivery. Application rollout and actual handset acceptance are separate from package publication.

### Payment query correction candidate (2026-09-25)

- A real signed WeChat API v3 query returned `CLOSED` for an unpaid order with no `amount` member, as permitted by the query contract. Payment package 0.1.0 rejected every such result as `INVALID_RESPONSE`, blocking Mira from recording a confirmed closure.
- Payments 0.1.1 accepts an omitted amount only for non-success states, while still validating any supplied amount and requiring the amount for `SUCCESS` and `REFUND`. Merchant, application, order and signature checks remain mandatory. Synthetic tests cover omitted and malformed amounts; `pnpm check`, `pnpm pack:payments`, and isolated package consumption passed locally. The candidate tarball SHA-256 is `901c2815c97457f3a69382cb14095db4fc814650b70ec2baa5c9cc7cc4459bd2`.
- A new immutable release is required before either consumer changes its exact dependency. This package change does not settle or cancel any application order by itself.
