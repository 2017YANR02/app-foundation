# Source and license notice

The initial REST transport shape is derived from the user-owned open-source CubeRoot project, `core/apps/api/src/utils/email.ts`, as inspected at revision `03d19093c` on 2026-09-19. The existing GPL-3.0-only license is retained. Brand-specific templates, default sender, environment loading and application routes are not included.

This extraction introduces an explicit-config factory, injectable transport, bounded request/response handling, a full-operation timeout, sanitized typed errors, optional caller-owned idempotency and provider-acceptance validation. It contains no private application business source, database schema, credentials, customer records or shared running service.
