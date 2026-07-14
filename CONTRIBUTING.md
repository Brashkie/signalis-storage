# Contributing to @brashkie/signalis-storage

Thanks for your interest! This package is small and focused, which makes it a
friendly place to contribute.

## Ground rules

- **The interface is the stability surface.** Changes to `IdentityStore`,
  `PreKeyStore`, `SignedPreKeyStore`, `SessionStore`, `Codec`, or `Fingerprint`
  ripple through every adapter and through `@brashkie/signalis`. Propose interface
  changes in an issue first.
- **Zero crypto dependency is a hard invariant.** This package must never import
  `@brashkie/signalis` or any cryptographic implementation. If your change needs a
  crypto object, take it through a codec.
- **Correctness over cleverness.** Atomic writes, TOFU semantics, and single-use
  prekey handling are security-critical. Keep them boring and well-tested.

## Development setup

```bash
git clone https://github.com/Brashkie/signalis-storage.git
cd signalis-storage
npm install
```

## Workflow

```bash
npm run typecheck     # tsc --noEmit, strict
npm run lint          # biome check
npm run lint:fix      # biome check --write
npm run format        # biome format --write
npm test              # vitest run
npm run test:coverage # coverage report (thresholds enforced)
npm run build         # tsup → dist/ (CJS + ESM + d.ts)
```

Before opening a PR, all of the following must pass:

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test` (coverage thresholds: 95% statements, 90% branches)
- [ ] `npm run build`

## Adding a store implementation

New bundled implementations are welcome if they cover a genuinely common backend
and stay thin. Please:

1. Make it generic over the crypto types and accept codecs — never import crypto.
2. Implement the full interface (including `loadAll*` and diagnostics where
   sensible).
3. Add tests using the fake-codec pattern from `__tests__/stores.test.ts`.
4. Cover error paths (missing keys, malformed input, validation).

Adapters over external engines (SQLite, Redis, Strenor, …) generally belong in
their own `@brashkie/signalis-storage-<backend>` package rather than here.

## Commit style

Conventional Commits are appreciated:

```
feat(file): add compaction helper for session store
fix(atomic-write): widen retry to EACCES on Windows
docs(readme): clarify codec injection example
test(coverage): cover listFiles ENOTDIR path
```

## Code of Conduct

Be respectful and constructive. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the
Apache-2.0 license.
