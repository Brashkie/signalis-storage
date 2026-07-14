# Changelog

All notable changes to `@brashkie/signalis-storage` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.1.0] — 2026-07-12

Initial release. Extracts the storage layer from `@brashkie/signalis@0.7.0` into
a standalone, crypto-decoupled package.

### Added

- **Store interfaces** (generic over crypto types):
  - `IdentityStore<KP, PK>`
  - `PreKeyStore<OPK>`
  - `SignedPreKeyStore<SPK>`
  - `SessionStore<S>`
- **Codec contracts** — the decoupling mechanism:
  - `Codec<T>` (`serialize` / `deserialize`)
  - `Fingerprint<T>` (one-way stable string)
- **`ProtocolAddress`** — self-contained `(userId, deviceId)` peer identifier,
  filesystem-hardened, with `parse` / `toString` / `equals` / `toJSON`.
- **In-memory implementations**: `MemoryIdentityStore`, `MemoryPreKeyStore`,
  `MemorySignedPreKeyStore`, `MemorySessionStore`.
- **On-disk implementations**: `FileIdentityStore`, `FilePreKeyStore`,
  `FileSignedPreKeyStore`, `FileSessionStore` — atomic JSON writes.
- **Atomic file helpers**: `atomicWriteFile`, `readFileOrNull`, `unlinkIfExists`,
  `listFiles`. `atomicWriteFile` retries on transient Windows
  `EPERM` / `EBUSY` / `EACCES` with exponential backoff.
- **Error hierarchy**: `StorageError`, `StorageValidationError`,
  `SerializationError`, each with an optional structured `context`.
- Dual **CommonJS + ESM** build with full TypeScript declarations.
- 55 tests; 100% statement / line / function coverage, ~98% branch.

### Design notes

- **Zero dependency on the crypto core.** Crypto classes are injected via codecs,
  keeping the dependency graph acyclic so `@brashkie/signalis` can depend on this
  package without a cycle.
- The `FileIdentityStore` trusted-identity record is
  `{ version, address, fingerprint }`. (The pre-extraction implementation in
  `signalis@0.7.0` also wrote an informational `publicKeyHex` field; it was unused
  by the trust logic. Old files remain readable — the extra field is ignored.)

[Unreleased]: https://github.com/Brashkie/signalis-storage/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Brashkie/signalis-storage/releases/tag/v0.1.0
