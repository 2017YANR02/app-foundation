# App Foundation

Maintain small, versioned server-side libraries. Payment extraction is the first scope; do not create placeholder packages for future modules.

- Read `docs/extraction-tracker.md` before changing public interfaces.
- No application imports, environment-variable reads, database access, business domains, merchant credentials, or user data in libraries.
- Keep source provenance and the existing GPL-3.0 license. Do not relicense derived code without explicit rights-holder authorization.
- Use strict TypeScript, two spaces, double quotes and semicolons. Node >=22; compiled CommonJS supports both ESM import and require.
- Provider tests use generated ephemeral keys and injected HTTP only. Never call real payment endpoints in tests.
- Run `pnpm check` and `pnpm pack:payments` before releasing. Review tarball contents and install it in isolated consumers.
- Keep immutable release artifacts, exact dependency versions and checksums. Publishing this repository does not authorize deploying consumer applications.
