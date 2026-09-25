# Dependency security status

Assessed on September 25, 2026 against `package-lock.json` with `npm audit`.

## Remediated

Safe, non-major dependency updates removed 11 of the 13 reported vulnerable package entries, including advisories affecting Vite, Vitest, React Server Components, Cloudflare's Vite tooling, Wrangler, esbuild, miniflare, sharp, undici, and ws.

## Deferred

`npm audit` still reports two high-severity entries for one dependency chain:

- `vinext@1.0.0-beta.3` -> `image-size@2.0.2`
- GHSA-5p2g-fcmc-qvqq: JXL and HEIF parser infinite-loop denial of service
- GHSA-w3rx-r6r6-pgpr: ICNS parser infinite-loop denial of service

The audit-proposed fix is `vinext@1.0.0-beta.12`. That is a prerelease framework upgrade outside the pinned version and requires coordinated compatibility validation, so it is intentionally deferred rather than forced into this security-only update.

Reachability is limited: the vulnerable parser is used by Vinext's image tooling, while this application does not accept or process user-uploaded JXL, HEIF, or ICNS images. Continue avoiding untrusted image inputs in build/development workflows until Vinext is upgraded and fully regression-tested.
