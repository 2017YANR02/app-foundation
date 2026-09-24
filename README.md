# App Foundation

Small, independently versioned building blocks for server applications. The first release extracts WeChat Pay and Alipay protocol clients; application accounts, orders, databases, fulfillment and merchant secrets stay with each consumer.

## Packages

| Package | Scope | Status |
| --- | --- | --- |
| `@app-foundation/payments` | Explicit-configuration WeChat Pay API v3 and Alipay clients, signature verification, integer CNY amounts and expected-order matching | Published 0.1.0 |
| `@app-foundation/messaging` | Resend transport, sanitized errors, bounded requests and caller-owned idempotency | Published 0.1.0 in release v0.2.0 |
| `@app-foundation/verification` | Scoped code digests, numeric generation, verification and cooldown rules | Published 0.1.0 in release v0.2.0 |
| `@app-foundation/sms` | Aliyun and Tencent SMS submission behind one sender contract, sanitized errors and resend timing | Published 0.1.1 in release v0.3.1; 0.1.0 superseded before consumer adoption |

Mail templates, code storage and account transactions remain consumer-owned. Media and other candidates are tracked without placeholder packages. There is no shared online payment or identity server.

## Development

Node >=22 and pnpm 11.22.0 are required.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm pack:all
node scripts/verify-package.mjs
```

Tests generate ephemeral keys and inject HTTP/provider responses. They never use merchant credentials, real payment endpoints or send email/SMS. Packaging is verified with fresh ESM, CommonJS and TypeScript consumers.

## Distribution

Payments 0.1.0 is published in repository release v0.1.0. Messaging 0.1.0 and verification 0.1.0 are published in v0.2.0; SMS 0.1.1 is published in v0.3.1. Use each immutable asset URL and its lockfile integrity; earlier artifacts have not changed.

The GitHub release `v0.1.0` supplies the npm-format package artifact and SHA-256 checksum. Install the exact release URL and commit the resulting dependency lockfile. Nothing is published to the npm registry in this release.

```sh
pnpm add 'https://github.com/2017YANR02/app-foundation/releases/download/v0.1.0/app-foundation-payments-0.1.0.tgz'
pnpm add 'https://github.com/2017YANR02/app-foundation/releases/download/v0.2.0/app-foundation-messaging-0.1.0.tgz'
pnpm add 'https://github.com/2017YANR02/app-foundation/releases/download/v0.2.0/app-foundation-verification-0.1.0.tgz'
pnpm add 'https://github.com/2017YANR02/app-foundation/releases/download/v0.3.1/app-foundation-sms-0.1.1.tgz'
```

Consumers can adopt a release independently. Do not use a relative source path, symlink, moving branch or unversioned workspace dependency across repositories. Publishing this library does not deploy any consumer application or enable a payment product.

## Boundaries and provenance

WeChat supports the ordinary-merchant API v3 public-key mode. An existing CloudBase cloudPay/service-provider integration is a separate adapter, not an interchangeable merchant configuration. Alipay supports RSA2 public-key mode. Capabilities, validation and sample use are documented in [the package README](packages/payments/README.md).

The initial protocol code is derived from CubeRoot revision `e35459d59`. Source attribution and modifications are recorded in [NOTICE](packages/payments/NOTICE.md). GPL-3.0 is retained in [LICENSE](LICENSE); the extraction does not relicense the source. No private application business code, customer data, credentials or database schemas are included.

Work and delivery evidence: [extraction tracker](docs/extraction-tracker.md).
