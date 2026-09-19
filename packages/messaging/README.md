# @app-foundation/messaging

Version 0.1.0. Node >=22, no runtime dependencies. Resend email transport with explicit configuration; no environment reads, templates, persistence or automatic retries.

```ts
import { createResendClient, MailError } from "@app-foundation/messaging";
const mail = createResendClient({ apiKey, from });
const result = await mail.send({
  to: "recipient@example.test", subject: "Verification", text: "Your application-owned text",
  idempotencyKey: "verification/unique-challenge-id",
});
// result = { accepted: true, messageId }; this is provider acceptance, not inbox delivery.
```

`html` and custom email `headers` are optional; text is required. Notification headers such as List-Unsubscribe and List-Unsubscribe-Post stay in the consumer. Addressing/content headers cannot override the sender, destination, subject or MIME contract. Envelope keys outside the supported API are rejected; max 100 recipients and 1 MiB serialized payload. Sender display names are supported; recipients are plain email addresses.

Configuration accepts `timeoutMs` (default 10000, maximum 60000), and dependencies accept `{ fetch }`. The deadline covers fetch and response reading, with a 16 KiB response limit. The endpoint is fixed HTTPS and redirects are disabled. Success requires a valid provider message ID.

`MailError.code` is one of CONFIGURATION, INVALID_INPUT, TIMEOUT, NETWORK_ERROR, PROVIDER_REJECTED, INVALID_RESPONSE. Rejected HTTP responses may expose only the numeric status. Provider bodies, recipient data, credentials and original error causes are never included in errors. Applications must also sanitize their own logs.

A network timeout, 5xx, or invalid response may follow provider acceptance. No retry is automatic. For caller-managed retries use one stable idempotency key for the identical message within the provider's documented retention window; do not change the message and reuse its key. The package neither generates nor stores that key. Consumers decide pending/sent/failed state, queueing and recovery; no guarantee of exactly-once delivery is made.

Official references checked 2026-09-19: [Send Email](https://resend.com/docs/api-reference/emails/send-email) and [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys). Domain verification, sender configuration, delivery events and unsubscribe policy remain application responsibilities.

Tests use injected synthetic HTTP only. They never send email. See NOTICE and LICENSE for provenance.
