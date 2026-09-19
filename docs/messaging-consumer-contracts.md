# Messaging consumer contracts — reviewed boundary

Reviewed 2026-09-19. The candidate package and isolated transport checks are complete locally; this is not publication, consumer migration, delivery testing or database verification. See extraction-tracker.md for exact evidence. Application details are intentionally represented as consumer A/B; no private application source, deployment configuration or user data belongs in this document.

## Smallest useful boundary

Extract a Resend HTTP transport first. Both consumers already send one recipient as a one-element `to` array, provide both HTML and plain text, accept successful HTTP responses, throw on failures, and use a ten-second fetch abort signal. Templates, localization, environment loading, sender selection, recipient authorization, unsubscribe-token creation and OTP persistence remain in each application.

Implemented candidate contract (the successful result is deliberately stricter than the legacy wrappers):

```ts
createResendClient(
  { apiKey, from, timeoutMs?: number },
  { fetch?: typeof globalThis.fetch },
).send({ to, subject, html, text, headers?: Record<string, string>, idempotencyKey?: string }): Promise<{ accepted: true; messageId: string }>
```

Use a fixed HTTPS provider endpoint, explicit nonempty credentials/sender and a bounded timeout defaulting to 10,000 ms. Never read environment variables or files inside the library. Each application controls whether configuration is optional, when it is reloaded and which sender it selects. A successful send means provider acceptance, not arrival in an inbox. The candidate explicitly requires the documented provider message ID and bounds response reading. Both legacy wrappers accepted any 2xx; a malformed 2xx now produces INVALID_RESPONSE, an unknown outcome rather than proof of rejection. Application adoption must preserve existing void exports if needed and review this intentional tightening; do not automatically resend on unknown outcomes.

The optional `headers` are **email headers inside the JSON payload**, not HTTP request headers. Preserve `List-Unsubscribe` and `List-Unsubscribe-Post` exactly. They must never override HTTP Authorization, endpoint or content type. Validate names/values for header injection while retaining these existing uses. Resend documents support for custom email headers: [official reference](https://resend.com/changelog/custom-email-headers).

Errors should expose stable categories such as configuration/input, timeout/network and provider rejection, optionally with the HTTP status. Do not include recipient, body, OTP, API key, raw provider response or an unsanitized nested exception in the public error or logs. The library itself should not log. Do not automatically retry: a timeout can follow acceptance. Caller-owned idempotency is an optional explicit input; use the same key and payload for retries within the documented provider retention window ([official documentation](https://resend.com/changelog/idempotency-keys)). Neither reviewed consumer currently supplies such a key.

## Compatibility matrix

| Concern | Consumer A | Consumer B | Shared boundary |
| --- | --- | --- | --- |
| Configuration | Dynamically checks dedicated key, sender and OTP pepper together | Transport key/sender captured when its module loads; sender has a product default | Explicit transport config only; each wrapper preserves its configuration policy |
| Template | Registration-specific text/HTML and fixed language | Localized authentication text/HTML plus separate notification templates | Templates remain application-owned; no shared brand or mandatory subject format |
| Email headers | No custom headers currently needed | Notification calls include one-click unsubscribe headers | Optional JSON `headers` must survive unchanged |
| Send failure | HTTP failures sanitized in wrapper; raw network exceptions mapped by the registration service | Provider response excerpt can flow into error messages and caller logs | Sanitized shared errors are a deliberate privacy improvement; verify caller behavior |
| OTP availability | Pending reservation becomes usable only after successful send, guarded by attempt identity | Code record is inserted as usable before send; failed send does not deactivate it | Do not claim transport extraction harmonizes availability |
| Resend/cooldown | Transactional reservation; failed state permits another attempt; superseded attempts cannot mark the replacement sent | Cooldown read, prior-code invalidation and insertion are separate operations by default | Persistence and concurrency changes need application-specific work |
| Consumption | Immediate SQLite transaction consumes code together with account/profile creation; a creation error rolls both back | PostgreSQL row lock protects attempts/consumption; common email routes consume before their subsequent account mutation | Preserve transaction boundaries; do not move DB ownership into a library |
| Digest | HMAC-SHA256 with purpose-bound message | Legacy prefixed SHA256 over secret/channel/target/code; purpose is a DB selector, absent from the digest | Existing hashes are incompatible; never silently replace the legacy algorithm |

Both use six decimal digits from a cryptographic RNG, ten-minute validity, a sixty-second send cooldown and five failed verification attempts. Similar constants do not make the issue/consume lifecycle interchangeable. Consumer B also has transaction-aware callers and non-email purposes; its helper cannot be replaced with a registration-only API. The new OTP package implements one explicit versioned, scoped HMAC format and pure rules. Legacy algorithms remain in the applications; persistence, locking, counters, activation, rollback and account changes stay application-side. A migration must preserve or explicitly expire existing codes under an approved policy; no fallback guessing across digest algorithms.

Existing evidence is uneven: consumer A has in-memory database tests for pending rejection, concurrent send reservation, failure sanitization, resend invalidation, attempt limits and rollback with account creation. Consumer B has notification deduplication/unsubscribe tests and PostgreSQL integration tests for identity-code flows; its common email send/failure lifecycle has no equivalent focused tests located in this review. The subsequent local extraction reran both focused baselines and a seven-payload packed transport comparison; no real database or message delivery was exercised.

## Unpublished package validation without changing application dependencies

1. Implement only the reviewed transport in its own package when authorized, preserving source provenance and license. Do not import either application or add placeholder provider/OTP modules.
2. Build and pack to a dedicated scratch artifact directory. Inspect the tarball allowlist and checksum. The verifier now expects the exact three current artifacts and checks each file allowlist, checksum and public export.
3. Install the tarball **offline with scripts disabled** into a newly created disposable consumer directory, with a separate package manifest and lockfile. Check CommonJS, ESM and strict TypeScript imports through the public package exports. Do not add a workspace link, file dependency, source-path import or alias to either running application's manifest, lockfile or source.
4. In private local test harnesses, invoke each actual application email wrapper with fake configuration and a capturing fake fetch. Feed the captured message into the packed candidate transport, again with fake fetch. Compare endpoint, method, single-recipient array, subject, HTML, text, optional email headers and timeout behavior. This proves wire-contract compatibility; it does not claim that the unchanged applications consume the new package.
5. Cover non-2xx, network errors, aborts, no automatic resend, malformed configuration/header injection and absence of provider/recipient/code details in thrown errors. Preserve the notification unsubscribe case. Run existing application OTP tests against their original adapters as baseline evidence; add actual adapter adoption tests only in a separately authorized integration stage.
6. Keep application-specific harnesses and fixtures private. Public fixtures use reserved example addresses and generic A/B labels. A published immutable version and a separate consumer integration review are required before changing production dependency pins. A local contract pass does not authorize publication or sending mail.

## Other candidates and order

- **Single byte-range parser:** the clearest independent next extraction. Both have the same single-range/open-ended/suffix and clamping behavior, but one returns `undefined` and the other `null`. A small pure parser can normalize this through wrappers. Keep authentication, response headers, file streams and caching policies outside. Specify valid file-size inputs and preserve caller behavior for malformed/multipart ranges before adoption. This can be cheaper than an OTP package, but should not interrupt the bounded messaging transport review.
- **MP4/media inspection:** defer a shared package. One consumer validates an in-memory single H.264 video track, media duration and sample-table consistency; the other probes file-backed movie duration and also supports additional containers. “Parses MP4” does not establish a common safety contract. Agree on security invariants and an adversarial fixture corpus before extracting any parser.
- **Storage, account authorization and notification preferences:** keep application-owned. Filesystem/cloud storage policy, identity ownership, unsubscribe authorization, recipient deduplication and audit retention are not a single proven shared runtime contract.

No application runtime source, dependency, configuration, database or runtime behavior was changed. A private local verification harness was added separately. Nothing was pushed, published, deployed or emailed.
