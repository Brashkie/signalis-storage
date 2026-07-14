# Security Policy

## Scope

`@brashkie/signalis-storage` persists **sensitive cryptographic material** —
identity key pairs, signed prekeys, one-time prekeys, and Double Ratchet session
state. A vulnerability here can compromise the confidentiality or integrity of an
entire messaging deployment. We take reports seriously.

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ |
| < 0.1   | ❌ |

Pre-1.0, only the latest minor receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub Security Advisories on the
[repository](https://github.com/Brashkie/signalis-storage/security/advisories/new),
or contact the maintainer through the channels listed on the GitHub profile
[@Brashkie](https://github.com/Brashkie).

Please include:

- A description of the issue and its impact.
- Steps to reproduce (a minimal PoC is ideal).
- Affected version(s) and environment (OS, Node.js version).
- Any suggested remediation.

## What to expect

- **Acknowledgement** within a reasonable timeframe.
- An assessment of severity and affected versions.
- A coordinated fix and disclosure. We'll credit you unless you prefer to remain
  anonymous.

## Hardening guidance for integrators

- **Encrypt at rest.** Session and identity files are plaintext JSON by default.
  Wrap the codec to encrypt, or place `rootDir` on an encrypted filesystem / secure
  enclave.
- **Restrict file permissions.** The file stores write identity material with
  owner-only permissions (`0o600`) where the platform supports it. Ensure the parent
  directories are not world-readable.
- **Never reuse one-time prekeys.** Always `removePreKey` after a successful
  handshake — `@brashkie/signalis`'s `SessionBuilder` does this for you.
- **Validate untrusted input.** `ProtocolAddress` rejects path-traversal and
  control characters at construction; do not bypass it when building file paths.

## Out of scope

- Vulnerabilities in third-party backends (SQLite, Redis, etc.) — report to those
  projects. Adapter-specific issues in `signalis-storage-*` packages are in scope.
- Denial of service from unbounded application input (e.g. storing millions of
  sessions) — this is an integration concern.
