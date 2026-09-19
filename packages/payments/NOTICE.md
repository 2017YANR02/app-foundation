# Source and modifications

This library is derived from the payment implementation in `2017YANR02/cuberoot.me`, revision `e35459d59`:

- `core/apps/api/src/payment/wechat.ts`
- `core/apps/api/src/payment/alipay.ts`
- Necessary WeChat and Alipay signing helpers in `core/packages/shared/src/payment.ts`

The source repository provides these files under GNU GPL version 3. The license is retained in LICENSE; this extraction does not claim a permissive relicensing. Original project attribution is retained here while public APIs and runtime defaults use neutral names.

Changes in September 2026: explicit per-client configuration and injected dependencies, input and identity validation, error classification, signed Alipay query responses, order close operations, isolated tests, and standalone versioned packaging. Application business logic, user data, credentials and database schemas are not included.
