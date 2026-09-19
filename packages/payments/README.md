# @app-foundation/payments

Node >=22 server-side payment clients. One package provides independent `/wechat`, `/alipay`, and `/core` entry points; no application framework or database dependency is required. CommonJS output supports both `require()` and ESM imports, with TypeScript declarations.

## Configuration and use

```ts
import { createWechatPayClient } from "@app-foundation/payments/wechat";

const client = createWechatPayClient({
  appId: config.appId,
  merchantId: config.merchantId,
  apiV3Key: config.apiV3Key,
  certificateSerial: config.certificateSerial,
  privateKey: config.privateKey,
  platformPublicKeyId: config.platformPublicKeyId,
  platformPublicKey: config.platformPublicKey,
  h5Enabled: true, // only after merchant product enablement and application approval
});
const h5Url = await client.createH5({
  outTradeNo: attempt.providerOrderNo,
  amountCents: attempt.amountMinor,
  description: attempt.description,
  notifyUrl: config.notifyUrl,
  payerClientIp: trustedClientIp,
});
```

Supply independent configuration per merchant/client. The library never reads environment variables. Optional dependencies `{ fetch, now, nonce }` allow deterministic tests; `now` returns Unix milliseconds. Production transports must reach the official provider; injected transports are a caller trust boundary. Keep this package out of browser bundles.

## Capabilities

| Provider | Operations |
| --- | --- |
| WeChat | Native, H5 (explicit gate), Mini Program JSAPI (explicit AppID/gate), query, close, refund/query, payment notification verification/decryption |
| Alipay | PC/WAP checkout URL, query, close, refund/query, payment notification verification |

Wechat ordinary-merchant public-key mode and Alipay RSA2 public-key mode are supported. Service-provider/sub-merchant, platform certificate rotation, automatic bill download, refund webhooks, automatic renewal and business settlement are outside this release. Existing CloudBase orders must keep their original provider path.

## Payment safety contract

- CNY inputs use positive safe integer minor units (fen). Decimal conversions reject excess precision and floating-point rounding. No automatic currency conversion.
- Verify provider signatures over the original response bytes. Query failures throw `PaymentError`; `null` means only an authenticated not-found response.
- Notification authenticity and configured merchant/application checks do not prove the payment matches your business order. Load the immutable attempt and call `assertPaymentMatches`; preserve transaction/provider identity and currency. Handle refunds with their original stable request number.
- Apply results atomically and idempotently in your own database. Duplicate notifications remain possible; browser redirects, query failures and a refund request being accepted do not establish successful settlement.
- H5 return URL/domain and browser selection, trusted proxy/client IP extraction, HTTPS webhook routes, merchant product permissions and live acceptance remain application responsibilities.
- No automatic retry of create/refund requests, raw provider error bodies, persistent secret cache, business order mutation or audit database is included.

## Errors and tests

`PaymentError.code` distinguishes configuration, input, signature, invalid response, provider, network and identity mismatch errors. Error messages omit provider bodies and secrets. Code may inspect verified provider records for its own guarded logic, but must not log them unredacted.

See [NOTICE](NOTICE.md) for provenance and [LICENSE](LICENSE) for GPL-3.0 terms. Package tests use generated keys and fake HTTP, not real transactions.
