# 🗺️ Roadmap — @brashkie/signalis-storage

The mission: a **thin, decoupled, correct** storage contract for Signalis, plus
first-party implementations that cover the common cases — while heavy lifting
(compaction, concurrency, native engines) is delegated to purpose-built backends,
never reimplemented here.

**Legend:** ✅ done · 🟡 in progress · 🔴 planned · 💭 under consideration

---

## ✅ Phase 1 — Foundation (v0.1.0)

- [x] Generic store interfaces (Identity / PreKey / SignedPreKey / Session)
- [x] `Codec<T>` + `Fingerprint<T>` injection contracts
- [x] `ProtocolAddress` primitive (filesystem-hardened)
- [x] In-memory implementations (4 stores)
- [x] On-disk implementations (4 stores) with atomic writes
- [x] Windows `EPERM`/`EBUSY`/`EACCES` retry
- [x] Error hierarchy with structured context
- [x] Dual CJS + ESM build
- [x] ~97% test coverage

## 🟡 Phase 2 — Ergonomics & integration

- [ ] `@brashkie/signalis@0.7.1` consumes this package and re-exports pre-wired
      stores (no user-facing API change)
- [ ] `StoreBundle` convenience façade (bundle the four stores + codecs)
- [ ] Contract test-kit: a reusable suite any adapter can run to prove conformance
      (`runSessionStoreContract(factory)`, etc.)
- [ ] Cookbook: at-rest encryption via a wrapping codec

## 🔴 Phase 3 — Official adapters (demand-driven)

Adapters are thin translators over an existing engine — never a reimplementation.

- [ ] `@brashkie/signalis-storage-strenor` — over [Strenor](https://github.com/Brashkie/strenor)
      (waits for Strenor transactions/batch, ~v0.4)
- [ ] `@brashkie/signalis-storage-sqlite` — over `better-sqlite3`
- [ ] `@brashkie/signalis-storage-redis` — over the official Redis client
- [ ] `@brashkie/signalis-storage-indexeddb` — for browser targets (via `idb`)

## 🔴 Phase 4 — Hardening & operations

- [ ] Crash-recovery pass helper (`recover()`) for adapters without transactions
- [ ] Bulk export / import (encrypted backup format)
- [ ] Multi-device sync helpers
- [ ] Property-based tests (fast-check) across all bundled stores
- [ ] Benchmarks (memory vs file vs adapters)

## 🔴 Phase 5 — Enterprise readiness

- [ ] Stable-API guarantee + `1.0.0`
- [ ] Documented migration guides between storage format versions
- [ ] SBOM + signed release artifacts
- [ ] Security policy & CVE process (see SECURITY.md)

---

## Non-goals

These are **explicitly out of scope** — they belong in a backend engine, not in a
storage contract:

- ❌ A bespoke on-disk B-tree / LSM engine (use SQLite, RocksDB, LMDB, or Strenor)
- ❌ Compaction, WAL/AOF, MVCC, locking (backend responsibility)
- ❌ A native Rust core inside this package — the native performance path is
      **inherited** from the chosen backend (Strenor, better-sqlite3), not duplicated
      here. (See the ecosystem discussion in the main repo.)

---

## Design principles

1. **The interface is the product.** Implementations are conveniences; the contract
   is what everything else depends on.
2. **Decoupled by construction.** No crypto import, ever. Codecs at the boundary.
3. **Correct before fast.** Atomic writes, TOFU semantics, single-use prekeys —
   correctness is non-negotiable; performance is delegated.
4. **Delegate native work.** Rust/native belongs in `signalis-core` (crypto) and in
   backend engines (Strenor), not in this glue layer.

---

🔐 + ❤️ Hepein Oficial
