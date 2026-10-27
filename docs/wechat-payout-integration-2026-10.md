# WeChat payouts: Mira and CubeRoot

Work started 2026-10-26; local handoff 2026-10-27. This is implemented consumer integration, not a claim of production activation or real funds acceptance.

## Shared package

`@app-foundation/payments` 0.1.3 exposes merchant-transfer creation, signed original-bill queries, terminal-notification signature verification/decryption, and bounded raw-body notification reading through `/wechat` and `/wechat-notification`.

The library accepts explicit configuration and injectable transport. It contains no merchant credentials, environment reads, application imports, identity store, database, approval workflow or retry scheduler. Each consumer owns account eligibility, encrypted recipient snapshots, funds reservations, approval and reconciliation.

- Transfer creation targets the merchant-transfer API with immutable merchant bill number, AppID, recipient and integer minor amount. Sensitive recipient names use the configured WeChat platform key. Scene metadata remains consumer-provided.
- `findTransfer` returns null only for a signed NOT_FOUND response, not for transport, authentication or configuration errors. All other failures remain errors. `queryTransfer` requires a verified existing result.
- `parseTransferNotification` validates merchant/app/event/resource and returns the original bill identity; consumers then query that original transfer and update their own ledger atomically.
- `readWechatNotification` preserves signed UTF-8 bytes; rejects missing signature headers, oversized or unsupported bodies; limits input to 64 KiB and 2 seconds. It does not acknowledge delivery or mutate an application ledger.
- Results validate original identity and amount, supported states and bounded confirmation package. A client confirmation callback never constitutes payment proof.

## Consumers

| Consumer | Business-owned implementation |
| --- | --- |
| Mira | Web wallet and official Mini Program request against CloudBase balance; admin approval dispatches through Web; signed callback and recovery update the original CloudBase withdrawal; encrypted identity/name/merchant snapshots; manual bank remains independent |
| CubeRoot | Instructor self-service request and finance generation reserve the same signed PostgreSQL ledger; finance approval dispatches through API; migration 0296 stores immutable transfer attempts; Mini Program binds and confirms the receiving identity; callback/recovery updates original payout |

Both use 1005 commission remuneration, confirmed by the owner as enabled and applicable to their respective businesses. They independently configure receiving AppID, merchant, min/max and funding. Merchant configuration and live capability have not been independently verified here.

Both consumers use the same local immutable candidate artifact:

- `app-foundation-payments-0.1.3.tgz`
- SHA-256: `f65332dfb9fc6c66714a08116d07d498db3f460b544b784ff34d1e07c104ed7d`
- Mira pins `apps/mira-web/vendor/app-foundation/` with a file dependency and frozen lock.
- CubeRoot pins `core/vendor/app-foundation/` with a file dependency and frozen lock.

No runtime path imports or symlinks connect the repositories. Package publication is separate from consumer deployment. Once published/consumed as a released artifact, do not replace the version's bytes; publish a new version for further changes.

## State and rollout boundary

Unknown provider outcomes retain reservations. Consumers retry only the original recent attempt after a verified missing/ACCEPTED result and an atomic retry lease. New out-bill numbers, changed recipient snapshots and splitting payouts to bypass limits are prohibited. Only verified SUCCESS credits paid; verified FAIL/CANCELLED releases the reservation. Queries remain usable when new payouts are disabled.

Package build/pack and both consumer installations completed locally. Consumer compilation and diff review are the scoped checks; no new tests, real transfers, browser or device acceptance were performed under the owner's instructions. No public package release or consumer production deployment is part of this handoff. The two consumer tracking documents list environment keys, migration/cloud-function dependencies, startup configuration and pending real payout evidence.

## Provider references

- [Create transfer](https://pay.wechatpay.cn/doc/v3/merchant/4012716434)
- [Query original merchant bill](https://pay.wechatpay.cn/doc/v3/merchant/4012716437)
- [Transfer notification](https://pay.wechatpay.cn/doc/v3/merchant/4012712115)
- [Mini Program receipt confirmation](https://pay.wechatpay.cn/doc/v3/merchant/4012716430)
- [Scene information](https://pay.wechatpay.cn/doc/v3/merchant/4013774590)

Reviewed official contracts informed the implementation; merchant-specific quotas and readiness must be verified against each real account before activation.
