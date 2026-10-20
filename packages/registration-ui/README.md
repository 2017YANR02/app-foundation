# @app-foundation/registration-ui

React 19 links for ICP and public security registration. No framework, theme,
application numbers, network requests, tracking or client hooks are included.

Import `IcpRegistration` and `PublicSecurityRegistration` from the package.
Pass `number` (the full display label) to both. For public security pass the
numeric `code`, and `badgeSrc` from the exported `registration-ui/beian-badge.png`
asset through the host bundler (Next static imports expose `.src`).
`className` belongs to the host; public security links should use inline-flex,
centered items and the desired gap. `badgeSize` defaults to 14px. Layout,
separator and conditional visibility remain with the host. Both links open
in a new tab with noopener/noreferrer. The badge is decorative for accessibility.

Version 0.1.0 is a local extraction candidate. Consumers pin the same packed
artifact and integrity; publication and application release are separate steps.
