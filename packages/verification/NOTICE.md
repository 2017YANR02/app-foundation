# Source and modifications

The numeric code generation and constant-time comparison starting points are derived from
`2017YANR02/cuberoot.me`, revision `03d19093cb32e21b2c719816685e8f2836c4f72c`,
`core/apps/api/src/utils/account.ts` (verification-code primitives).

The source repository supplies this work under GNU GPL version 3. The GPL-3.0-only
license is retained in LICENSE. Original project attribution remains in this notice;
public APIs and runtime behavior use neutral names. This extraction does not claim a
permissive relicensing.

Changes in September 2026: explicit configuration, strict hex validation, a new
versioned HMAC format binding purpose/channel/target/challenge identity, pure lifecycle
rules with explicit millisecond timestamps, isolated tests and standalone packaging.
Database queries, account models, session logic, environment configuration, messaging
transports, application templates and private application implementation are excluded.
