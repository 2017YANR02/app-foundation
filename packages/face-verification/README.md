# @app-foundation/face-verification

Node >=22 server-only Alibaba Cloud financial-grade ID_PRO identity and liveness
client. Uses POST RPC with explicit credentials, a fixed Shanghai endpoint,
15-second timeout, bounded 256 KiB response reads, no redirect and no retries.
Do not import into browser bundles. No environment reads, logging or persistence.

```ts
import { createAliyunFaceClient } from "@app-foundation/face-verification";
const client = createAliyunFaceClient({ accessKeyId, accessKeySecret });
const { certifyId, certifyUrl } = await client.init({
  id: attemptId, realName, idCard, metaInfo, sceneId, returnUrl,
});
const result = await client.query(sceneId, certifyId);
// result.status is "pending", "passed" or "failed".
```

The application must derive the stored attempt from the authenticated account,
validate identity inputs and consent, reserve quota before the billable call,
and apply the result atomically against its session and attempt lifetime.
Do not accept an arbitrary client-supplied CertifyId or a redirect success flag.
This library does not grant account verification or select a retry policy.

Only Code 200 with Passed T returns `passed`; Passed F returns `failed`.
DescribeFaceVerify RPC codes 403 and 424 with successful HTTP return `pending`.
Other responses throw a sanitized `FaceVerificationError`. `code` distinguishes
INVALID_CONFIG, INVALID_INPUT, INVALID_RESPONSE, TRANSPORT, PERMISSION, BALANCE
and PROVIDER. Optional diagnostics expose only action, HTTP status, a three-digit
provider code and validated UUID RequestId. Provider messages, scores, materials,
full result objects and transport exception causes are never returned.

Optional dependencies `{ fetch, now, nonce }` support synthetic offline tests;
`now` returns milliseconds. No tests contact a provider or use real identities.
Credentials and the application-configured return URL belong to the consumer.
The consumer may further restrict the provider URL hostname.

Protocol references:
- https://help.aliyun.com/zh/id-verification/financial-grade-id-verification/describefaceverify
- https://help.aliyun.com/zh/id-verification/financial-grade-id-verification/error-code-person-verify

Distribution: package 0.1.0 in GitHub release v0.5.0. Consumers pin the exact
asset URL and lockfile integrity:

```sh
pnpm add 'https://github.com/2017YANR02/app-foundation/releases/download/v0.5.0/app-foundation-face-verification-0.1.0.tgz'
```
