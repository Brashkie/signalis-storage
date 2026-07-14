/**
 * Codec interfaces — the decoupling mechanism.
 *
 * `@brashkie/signalis-storage` never imports the concrete crypto classes
 * (`IdentityKeyPair`, `Session`, etc.). Instead, the store implementations
 * receive *codecs* that know how to turn those objects into JSON-friendly
 * snapshots and back. `@brashkie/signalis` provides the concrete codecs and
 * thin wrapper stores, so end users never see this machinery.
 *
 * This is what keeps the dependency graph acyclic:
 *
 * ```
 *   signalis  ──depends on──▶  signalis-storage
 *      │                              ▲
 *      └── injects codecs ────────────┘   (no reverse import)
 * ```
 *
 * @module codec
 */

/**
 * A round-trip codec for an object that gets persisted to a store.
 *
 * `serialize` turns the object into a JSON-serializable *snapshot* (a plain
 * object / array / primitive — NOT a JSON string; the store handles
 * `JSON.stringify`). `deserialize` reconstructs the object from a snapshot
 * that was produced by `serialize` (already `JSON.parse`-d by the store).
 *
 * @typeParam T - the domain object (e.g. an identity key pair)
 *
 * @example
 * ```ts
 * const sessionCodec: Codec<Session> = {
 *   serialize: (s) => s.serialize(),                 // → SerializedSession POJO
 *   deserialize: (snap) => Session.deserialize(snap as SerializedSession),
 * };
 * ```
 */
export interface Codec<T> {
  /** Convert to a JSON-serializable snapshot (plain object/array/primitive). */
  serialize(value: T): unknown;
  /** Reconstruct from a snapshot previously produced by {@link Codec.serialize}. */
  deserialize(snapshot: unknown): T;
}

/**
 * A one-way fingerprint for values that only need to be *compared* and
 * *stored*, never reconstructed — e.g. a peer's public identity key used
 * for trust-on-first-use (we store its fingerprint and compare on later
 * contact, but never need to turn the stored string back into a key object).
 *
 * @typeParam T - the value type (e.g. a public identity key)
 *
 * @example
 * ```ts
 * const identityFingerprint: Fingerprint<PublicIdentityKey> = {
 *   fingerprint: (k) => k.toHex(),
 * };
 * ```
 */
export interface Fingerprint<T> {
  /** Produce a stable, comparable string for the value. */
  fingerprint(value: T): string;
}
