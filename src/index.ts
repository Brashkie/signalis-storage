/**
 * `@brashkie/signalis-storage`
 *
 * Decoupled storage layer for the Signalis Signal-Protocol implementation.
 *
 * Contains the canonical store interfaces, the `ProtocolAddress` primitive,
 * atomic file helpers, and two bundled implementations (in-memory + on-disk),
 * all **generic** over the crypto object types and wired via injected codecs.
 *
 * This package has **zero dependency** on `@brashkie/signalis` — the crypto
 * classes are provided by the consumer via {@link Codec} / {@link Fingerprint}.
 * `@brashkie/signalis` re-exports pre-wired versions of these stores so app
 * authors never deal with codecs directly.
 *
 * @packageDocumentation
 */

// Errors
export {
  StorageError,
  StorageValidationError,
  SerializationError,
} from './errors';

// Address
export {
  ProtocolAddress,
  isProtocolAddress,
  MAX_DEVICE_ID,
  MAX_USER_ID_LENGTH,
} from './address';

// Codec interfaces (the injection mechanism)
export type { Codec, Fingerprint } from './codec';

// Store interfaces (generic)
export type {
  IdentityStore,
  PreKeyStore,
  SignedPreKeyStore,
  SessionStore,
} from './types';

// Memory implementations
export { MemoryIdentityStore } from './memory/identity-store';
export { MemoryPreKeyStore } from './memory/prekey-store';
export { MemorySignedPreKeyStore } from './memory/signed-prekey-store';
export { MemorySessionStore } from './memory/session-store';

// File implementations
export { FileIdentityStore } from './file/identity-store';
export { FilePreKeyStore } from './file/prekey-store';
export { FileSignedPreKeyStore } from './file/signed-prekey-store';
export { FileSessionStore } from './file/session-store';

// Atomic file helpers (exposed for custom file-based adapters)
export {
  atomicWriteFile,
  readFileOrNull,
  unlinkIfExists,
  listFiles,
} from './file/atomic-write';
