<div align="center">

# @brashkie/signalis-storage

**The decoupled storage layer for the [Signalis](https://github.com/Brashkie/signalis) Signal-Protocol implementation.**

[![CI](https://github.com/Brashkie/signalis-storage/actions/workflows/ci.yml/badge.svg)](https://github.com/Brashkie/signalis-storage/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@brashkie/signalis-storage.svg)](https://www.npmjs.com/package/@brashkie/signalis-storage)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![types](https://img.shields.io/badge/types-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](#testing--coverage)
[![node](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](https://nodejs.org/)

[English](./README.md) · [Español](./README.es.md)

</div>

---

Canonical Signal-Protocol store interfaces (`IdentityStore`, `PreKeyStore`, `SignedPreKeyStore`, `SessionStore`), the `ProtocolAddress` primitive, atomic file helpers, and two production-ready implementations — **in-memory** and **on-disk** — all **generic** over the crypto object types and wired through injected codecs.

This package carries **zero dependency on the crypto core.** The cryptographic classes (`IdentityKeyPair`, `Session`, and friends) are supplied by the consumer through small codec objects. The result is an acyclic dependency graph and a storage layer you can test, version, and reuse independently of the protocol.

```
  @brashkie/signalis  ──depends on──▶  @brashkie/signalis-storage
        │                                       ▲
        └── injects codecs ─────────────────────┘   (no reverse import)
```

---

## Table of Contents

- [Who is this for?](#who-is-this-for)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Architecture: why codecs?](#architecture-why-codecs)
- [API reference](#api-reference)
- [Writing a custom adapter](#writing-a-custom-adapter)
- [On-disk layout](#on-disk-layout)
- [Durability & atomic writes](#durability--atomic-writes)
- [Security considerations](#security-considerations)
- [Testing & coverage](#testing--coverage)
- [Ecosystem](#ecosystem)
- [Versioning & stability](#versioning--stability)
- [License](#license)

---

## Who is this for?

**Most people should not install this package directly.** `@brashkie/signalis` re-exports pre-wired versions of every store, so application code gets `new FileIdentityStore(dir)` with no codecs to think about.

Install `@brashkie/signalis-storage` directly if you are:

- **Building a custom storage adapter** — SQLite, Redis, IndexedDB, Postgres, Strenor, or any other backend.
- **Writing tooling** that inspects or migrates Signalis on-disk state.
- **Auditing** the storage layer in isolation from the crypto core.

---

## Installation

```bash
npm install @brashkie/signalis-storage
# or
pnpm add @brashkie/signalis-storage
# or
yarn add @brashkie/signalis-storage
```

Ships dual **CommonJS + ESM** with full TypeScript declarations. Node.js **≥ 18**.

---

## Quick start

Using the bundled file store to build a custom adapter (the crypto codec is what
`@brashkie/signalis` normally provides for you):

```ts
import {
  FileSessionStore,
  ProtocolAddress,
  type Codec,
} from '@brashkie/signalis-storage';

// A codec bridges your crypto object <-> a JSON-friendly snapshot.
const sessionCodec: Codec<MySession> = {
  serialize: (s) => s.serialize(),
  deserialize: (snap) => MySession.deserialize(snap),
};

const store = new FileSessionStore('/var/lib/myapp/signal', sessionCodec);

await store.saveSession(new ProtocolAddress('alice@example.com', 1), session);
const restored = await store.loadSession(new ProtocolAddress('alice@example.com', 1));
```

---

## Architecture: why codecs?

The store implementations must serialize crypto objects to durable storage and
reconstruct them later — e.g. `IdentityKeyPair.deserialize(bytes)`. Those classes
live in `@brashkie/signalis`. If storage imported them directly while `signalis`
imported storage, the result would be a **circular dependency**.

The resolution: storage never names a crypto class. Each store that needs
serialization receives a **codec**, and each store that needs to compare public
keys receives a **fingerprint**:

```ts
interface Codec<T> {
  serialize(value: T): unknown;      // → a JSON-serializable snapshot
  deserialize(snapshot: unknown): T; // ← reconstruct the object
}

interface Fingerprint<T> {
  fingerprint(value: T): string;     // a stable, comparable string
}
```

`@brashkie/signalis` supplies the concrete codecs exactly once, wraps the generic
stores in thin subclasses, and re-exports them. Application authors never see this
machinery — they instantiate `new FileIdentityStore(dir)` and it just works.

**Design consequences:**

| Property | Benefit |
|----------|---------|
| Zero crypto import | Acyclic dependency graph; storage builds & tests standalone |
| Generic over `T` | One implementation serves every crypto shape |
| Codec at the boundary | At-rest encryption, compression, or format changes are localized |
| Interfaces are the contract | Any backend (SQL, KV, cloud) is a drop-in |

---

## API reference

### Address

| Export | Description |
|--------|-------------|
| `ProtocolAddress` | `(userId, deviceId)` peer identifier; filesystem-safe, immutable |
| `isProtocolAddress(v)` | Type guard |
| `MAX_DEVICE_ID`, `MAX_USER_ID_LENGTH` | Validation bounds |

```ts
const addr = new ProtocolAddress('alice@example.com', 1);
addr.toString();          // "alice@example.com.1"
ProtocolAddress.parse('alice@example.com.1'); // round-trips
addr.equals(other);       // structural equality
```

### Store interfaces (generic)

| Interface | Type params | Responsibility |
|-----------|-------------|----------------|
| `IdentityStore<KP, PK>` | key pair, public key | own identity + registration id + trusted-peer fingerprints (TOFU) |
| `PreKeyStore<OPK>` | one-time prekey | one-time prekeys (delete-after-use) |
| `SignedPreKeyStore<SPK>` | signed prekey | signed prekeys + active pointer |
| `SessionStore<S>` | session | per-peer Double Ratchet state |

### Codec contracts

| Export | Description |
|--------|-------------|
| `Codec<T>` | `serialize` / `deserialize` round-trip |
| `Fingerprint<T>` | one-way stable string for comparison |

### Bundled implementations

| Class | Backend | Needs |
|-------|---------|-------|
| `MemoryIdentityStore<KP, PK>` | in-process Map | `Fingerprint<PK>` |
| `MemoryPreKeyStore<OPK>` | in-process Map | — |
| `MemorySignedPreKeyStore<SPK>` | in-process Map | — |
| `MemorySessionStore<S>` | in-process Map | `Codec<S>` |
| `FileIdentityStore<KP, PK>` | JSON on disk | `Codec<KP>` + `Fingerprint<PK>` |
| `FilePreKeyStore<OPK>` | JSON on disk | `Codec<OPK>` |
| `FileSignedPreKeyStore<SPK>` | JSON on disk | `Codec<SPK>` |
| `FileSessionStore<S>` | JSON on disk | `Codec<S>` |

### File helpers

`atomicWriteFile`, `readFileOrNull`, `unlinkIfExists`, `listFiles` — exposed for
authors of custom file-based adapters.

### Errors

`StorageError` (base) · `StorageValidationError` · `SerializationError`. All carry
an optional structured `context` bag.

---

## Writing a custom adapter

Implement the interface you need. Everything is generic over your crypto types, so
your adapter never hard-codes a crypto class:

```ts
import type { SessionStore, Codec } from '@brashkie/signalis-storage';
import { ProtocolAddress } from '@brashkie/signalis-storage';

export class RedisSessionStore<S> implements SessionStore<S> {
  constructor(
    private readonly redis: RedisClient,
    private readonly codec: Codec<S>,
  ) {}

  async saveSession(address: ProtocolAddress, session: S): Promise<void> {
    const snapshot = this.codec.serialize(session);
    await this.redis.set(`sess:${address.toString()}`, JSON.stringify(snapshot));
  }

  async loadSession(address: ProtocolAddress): Promise<S | null> {
    const raw = await this.redis.get(`sess:${address.toString()}`);
    return raw === null ? null : this.codec.deserialize(JSON.parse(raw));
  }

  async containsSession(address: ProtocolAddress): Promise<boolean> {
    return (await this.redis.exists(`sess:${address.toString()}`)) === 1;
  }

  async deleteSession(address: ProtocolAddress): Promise<void> {
    await this.redis.del(`sess:${address.toString()}`);
  }

  async loadAllSessions(): Promise<Array<{ address: ProtocolAddress; session: S }>> {
    const keys = await this.redis.keys('sess:*');
    const out: Array<{ address: ProtocolAddress; session: S }> = [];
    for (const key of keys) {
      const raw = await this.redis.get(key);
      if (raw === null) continue;
      out.push({
        address: ProtocolAddress.parse(key.slice('sess:'.length)),
        session: this.codec.deserialize(JSON.parse(raw)),
      });
    }
    return out;
  }
}
```

The consumer (usually `@brashkie/signalis`) wires the concrete codec:

```ts
import { Session } from '@brashkie/signalis';

const sessionCodec = {
  serialize: (s: Session) => s.serialize(),
  deserialize: (snap: unknown) => Session.deserialize(snap as never),
};

const store = new RedisSessionStore(redis, sessionCodec);
```

---

## On-disk layout

The `File*` stores use a predictable, human-inspectable JSON layout:

```
<rootDir>/
├── identity.json              # own keypair — sensitive (written chmod 600)
├── registration-id.json
├── trusted/
│   └── <address>.json         # one file per peer (TOFU fingerprints)
├── prekeys/
│   └── <id>.json
├── signed-prekeys/
│   ├── <id>.json
│   └── active.json            # pointer to the active signed prekey id
└── sessions/
    └── <address>.json         # per-peer ratchet state — sensitive
```

Every record is a small versioned JSON document (`{ version, ... }`) so future
format migrations are detectable.

---

## Durability & atomic writes

Signal key material must never be left half-written after a crash. Every write goes
through `atomicWriteFile`, which performs:

1. Write to `<path>.tmp.<random>`
2. `fsync()` to flush kernel buffers to the physical device
3. `rename()` to the final path (atomic on the same filesystem)

At any instant the file on disk is either the complete old value or the complete
new value — never a partial write.

**Windows resilience.** On Windows, the final `rename()` can transiently fail with
`EPERM` / `EBUSY` / `EACCES` when anti-virus, the search indexer, or another handle
briefly holds the target. `atomicWriteFile` retries up to five times with
exponential backoff (1 → 16 ms) before surfacing the error — the same hardening
pattern used by `esbuild`, `sharp`, and other mature native-adjacent packages.

---

## Security considerations

- **Session and identity files contain sensitive key material.** At-rest
  encryption is strongly recommended in production. Because the codec sits at the
  serialization boundary, you can wrap it to encrypt/decrypt transparently, or
  deploy the file stores onto an encrypted filesystem / secure enclave.
- **One-time prekeys are single-use.** They MUST be deleted after a successful
  handshake (`removePreKey`) — reuse breaks forward secrecy. The `SessionBuilder`
  in `@brashkie/signalis` enforces this.
- **`ProtocolAddress` is filesystem-hardened.** `userId` values containing path
  separators, control characters, or shell-meta characters are rejected at
  construction, preventing path traversal in the file stores.
- **No secrets in logs.** Error `context` bags never include key material — only
  ids and addresses.

Report vulnerabilities per [SECURITY.md](./SECURITY.md).

---

## Testing & coverage

```bash
npm test            # run the suite
npm run test:coverage
```

The suite exercises every store (memory + file), the codec-injection boundary,
`ProtocolAddress` validation, atomic-write error paths (including simulated
Windows `EPERM` retries), and the error hierarchy.

| Metric | Coverage |
|--------|----------|
| Statements | 100% |
| Branches | ~98% |
| Functions | 100% |

The small remaining uncovered lines are defensive dead-code (nested `catch`
cleanup blocks) that cannot be triggered without corrupting the test sandbox.

---

## Ecosystem

| Package | Role |
|---------|------|
| [`@brashkie/signalis`](https://github.com/Brashkie/signalis) | The protocol: X3DH, Double Ratchet, Sender Keys, sessions |
| [`@brashkie/signalis-core`](https://github.com/Brashkie/signalis-core) | Native Rust cryptographic primitives (Curve25519, HKDF, AEAD…) |
| **`@brashkie/signalis-storage`** | **This package — the storage contract + Memory/File impls** |
| `@brashkie/signalis-storage-strenor` *(planned)* | Adapter over [Strenor](https://github.com/Brashkie/strenor), an embedded KV engine |
| `@brashkie/signalis-storage-sqlite` *(on demand)* | Adapter over `better-sqlite3` |
| `@brashkie/signalis-storage-redis` *(on demand)* | Adapter over the Redis client |

See [ROADMAP.md](./ROADMAP.md) for the storage roadmap.

---

## Versioning & stability

Semantic Versioning. Pre-1.0, minor versions may include interface refinements —
pin a caret range (`^0.x`) and read the [CHANGELOG](./CHANGELOG.md) before
upgrading. The store interfaces are the stability surface; bundled implementations
may gain diagnostics without a breaking bump.

---

## License

Apache-2.0 © Brashkie (Hepein Oficial)
