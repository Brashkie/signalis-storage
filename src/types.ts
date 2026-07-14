/**
 * Storage Layer Interfaces (generic)
 *
 * The four canonical Signal-style storage interfaces. Any production app
 * implements these for its preferred database (SQLite, IndexedDB, Redis,
 * Postgres, Strenor, etc.) and plugs them into a `StoreBundle`.
 *
 * These interfaces are **generic** over the crypto object types so that
 * this package stays decoupled from `@brashkie/signalis`. When consumed
 * through `@brashkie/signalis`, the generics are already bound to the
 * concrete types (`IdentityKeyPair`, `Session`, etc.), so app authors see
 * fully-typed stores without any generic noise.
 *
 * Bundled implementations:
 *   - `MemoryIdentityStore`, etc. — in-process Map (testing, ephemeral)
 *   - `FileIdentityStore`, etc.   — JSON files on disk (Node.js apps)
 *
 * @module types
 */

import type { ProtocolAddress } from './address';

// ═══════════════════════════════════════════════════════════════════════════
// IdentityStore — long-term identity + trusted-peers fingerprint cache
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stores the user's own identity keypair, registration id, and tracks the
 * trusted public-identity-keys of remote peers (for TOFU / change detection
 * à la WhatsApp's "security number changed").
 *
 * @typeParam KP - the identity key pair type
 * @typeParam PK - the public identity key type (used for trust)
 */
export interface IdentityStore<KP, PK> {
  /**
   * Save the user's own long-term identity key pair. Should be called
   * exactly once per registration.
   */
  saveIdentityKeyPair(keyPair: KP): Promise<void>;

  /** Load the user's own identity key pair, or null if not registered. */
  getIdentityKeyPair(): Promise<KP | null>;

  /** Save the user's registration id. */
  saveRegistrationId(id: number): Promise<void>;

  /** Load the registration id, or null if not registered. */
  getRegistrationId(): Promise<number | null>;

  /**
   * Save a remote peer's public identity key. On first contact this is
   * trust-on-first-use (TOFU).
   */
  saveTrustedIdentity(address: ProtocolAddress, key: PK): Promise<void>;

  /**
   * Check whether the given key matches the one previously stored for the
   * address. Returns `true` if no record exists yet (first contact) or the
   * key matches; `false` if it differs (security warning).
   */
  isTrustedIdentity(address: ProtocolAddress, key: PK): Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PreKeyStore — one-time prekeys
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stores the user's batch of one-time prekeys. After a peer consumes one,
 * it must be deleted (Signal one-shot semantics — never reuse).
 *
 * @typeParam OPK - the one-time prekey type
 */
export interface PreKeyStore<OPK> {
  /** Save (or overwrite) a one-time prekey by id. */
  savePreKey(id: number, preKey: OPK): Promise<void>;

  /** Load a prekey by id, or null if not present. */
  getPreKey(id: number): Promise<OPK | null>;

  /** Cheap existence check. */
  containsPreKey(id: number): Promise<boolean>;

  /**
   * Permanently delete a prekey. MUST be called after a successful X3DH
   * receive — reusing a prekey breaks forward secrecy.
   */
  removePreKey(id: number): Promise<void>;

  /** Return all currently-stored prekey ids, sorted ascending. */
  loadAllPreKeyIds(): Promise<number[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SignedPreKeyStore — medium-term signed prekey (rotates ~weekly)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stores signed prekeys. Typically one active at a time, with older ones
 * kept briefly for in-flight messages.
 *
 * @typeParam SPK - the signed prekey type
 */
export interface SignedPreKeyStore<SPK> {
  /** Save a signed prekey by id. */
  saveSignedPreKey(id: number, preKey: SPK): Promise<void>;

  /** Load a signed prekey by id (even non-active ones). */
  getSignedPreKey(id: number): Promise<SPK | null>;

  /** Mark `newId` as the active signed prekey (older ones are kept). */
  rotateActiveSignedPreKey(newId: number, newPreKey: SPK): Promise<void>;

  /** Return the currently-active signed prekey, or null if none. */
  getActiveSignedPreKey(): Promise<SPK | null>;

  /** Return all stored signed-prekey ids (for GC monitoring). */
  loadAllSignedPreKeyIds(): Promise<number[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SessionStore — per-peer Double Ratchet state
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stores per-peer session objects, keyed by `ProtocolAddress` so multiple
 * devices of the same user are tracked independently.
 *
 * @typeParam S - the session type
 */
export interface SessionStore<S> {
  /** Save (or overwrite) the session for the given peer address. */
  saveSession(address: ProtocolAddress, session: S): Promise<void>;

  /** Load the session for the peer, or null if none exists yet. */
  loadSession(address: ProtocolAddress): Promise<S | null>;

  /** Cheap existence check. */
  containsSession(address: ProtocolAddress): Promise<boolean>;

  /** Permanently delete the session. */
  deleteSession(address: ProtocolAddress): Promise<void>;

  /** Load every stored session. */
  loadAllSessions(): Promise<Array<{ address: ProtocolAddress; session: S }>>;
}
