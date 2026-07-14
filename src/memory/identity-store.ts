/**
 * In-Memory Identity Store (generic)
 *
 * Holds the own key pair by reference; caches trusted-peer fingerprints as
 * strings (produced by the injected `Fingerprint`) for TOFU comparison.
 *
 * @module memory/identity-store
 */

import type { ProtocolAddress } from '../address';
import type { Fingerprint } from '../codec';
import type { IdentityStore } from '../types';

export class MemoryIdentityStore<KP, PK> implements IdentityStore<KP, PK> {
  private myIdentityKeyPair: KP | null = null;
  private myRegistrationId: number | null = null;
  /** Map<address.toString(), fingerprint-string> */
  private readonly trustedFingerprints = new Map<string, string>();

  /**
   * @param pkFingerprint - produces a stable comparable string for a public
   *   identity key (e.g. `(k) => k.toHex()`). Injected by `@brashkie/signalis`.
   */
  constructor(private readonly pkFingerprint: Fingerprint<PK>) {}

  // ─── Own identity ────────────────────────────────────────────────────

  public async saveIdentityKeyPair(keyPair: KP): Promise<void> {
    this.myIdentityKeyPair = keyPair;
  }

  public async getIdentityKeyPair(): Promise<KP | null> {
    return this.myIdentityKeyPair;
  }

  public async saveRegistrationId(id: number): Promise<void> {
    if (!Number.isInteger(id) || id < 0) {
      throw new RangeError(`registrationId must be a non-negative integer, got ${id}`);
    }
    this.myRegistrationId = id;
  }

  public async getRegistrationId(): Promise<number | null> {
    return this.myRegistrationId;
  }

  // ─── Trusted identities (TOFU cache) ────────────────────────────────

  public async saveTrustedIdentity(address: ProtocolAddress, key: PK): Promise<void> {
    this.trustedFingerprints.set(address.toString(), this.pkFingerprint.fingerprint(key));
  }

  public async isTrustedIdentity(address: ProtocolAddress, key: PK): Promise<boolean> {
    const stored = this.trustedFingerprints.get(address.toString());
    if (stored === undefined) return true; // TOFU: first contact accepted
    return stored === this.pkFingerprint.fingerprint(key);
  }

  // ─── Diagnostics (not part of interface) ────────────────────────────

  /** Number of trusted-identity records cached. */
  public trustedIdentitiesCount(): number {
    return this.trustedFingerprints.size;
  }

  /** Wipe everything. */
  public clear(): void {
    this.myIdentityKeyPair = null;
    this.myRegistrationId = null;
    this.trustedFingerprints.clear();
  }
}
