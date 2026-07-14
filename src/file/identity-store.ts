/**
 * File-backed Identity Store (generic).
 *
 * Persists identity material as JSON files on disk, with atomic writes.
 *
 * Layout:
 *   <rootDir>/
 *   ├── identity.json           — own keypair (PRIVATE — chmod 600)
 *   ├── registration-id.json    — registration id
 *   └── trusted/
 *       └── <address>.json      — one file per peer
 *
 * @module file/identity-store
 */

import * as path from 'node:path';
import type { ProtocolAddress } from '../address';
import type { Codec, Fingerprint } from '../codec';
import { StorageValidationError } from '../errors';
import type { IdentityStore } from '../types';
import { atomicWriteFile, readFileOrNull, unlinkIfExists } from './atomic-write';

export class FileIdentityStore<KP, PK> implements IdentityStore<KP, PK> {
  private readonly identityFile: string;
  private readonly registrationIdFile: string;
  private readonly trustedDir: string;

  /**
   * @param rootDir - directory to store files under
   * @param keyPairCodec - serialize/deserialize for the identity key pair
   * @param pkFingerprint - stable fingerprint for public identity keys
   */
  constructor(
    rootDir: string,
    private readonly keyPairCodec: Codec<KP>,
    private readonly pkFingerprint: Fingerprint<PK>,
  ) {
    if (typeof rootDir !== 'string' || rootDir.length === 0) {
      throw new StorageValidationError(
        'FileIdentityStore: rootDir must be a non-empty string',
      );
    }
    this.identityFile = path.join(rootDir, 'identity.json');
    this.registrationIdFile = path.join(rootDir, 'registration-id.json');
    this.trustedDir = path.join(rootDir, 'trusted');
  }

  // ─── Own identity ────────────────────────────────────────────────────

  public async saveIdentityKeyPair(keyPair: KP): Promise<void> {
    const payload = JSON.stringify({
      version: 1,
      keyPair: this.keyPairCodec.serialize(keyPair),
    });
    await atomicWriteFile(this.identityFile, payload);
  }

  public async getIdentityKeyPair(): Promise<KP | null> {
    const data = await readFileOrNull(this.identityFile);
    if (data === null) return null;
    const parsed = JSON.parse(data) as { version: number; keyPair: unknown };
    return this.keyPairCodec.deserialize(parsed.keyPair);
  }

  public async saveRegistrationId(id: number): Promise<void> {
    if (!Number.isInteger(id) || id < 0) {
      throw new RangeError(`registrationId must be a non-negative integer, got ${id}`);
    }
    await atomicWriteFile(
      this.registrationIdFile,
      JSON.stringify({ version: 1, registrationId: id }),
    );
  }

  public async getRegistrationId(): Promise<number | null> {
    const data = await readFileOrNull(this.registrationIdFile);
    if (data === null) return null;
    const parsed = JSON.parse(data) as { registrationId: number };
    return parsed.registrationId;
  }

  // ─── Trusted identities ─────────────────────────────────────────────

  private trustedPath(address: ProtocolAddress): string {
    // toString() is filesystem-safe by ProtocolAddress validation
    return path.join(this.trustedDir, `${address.toString()}.json`);
  }

  public async saveTrustedIdentity(address: ProtocolAddress, key: PK): Promise<void> {
    await atomicWriteFile(
      this.trustedPath(address),
      JSON.stringify({
        version: 1,
        address: address.toJSON(),
        fingerprint: this.pkFingerprint.fingerprint(key),
      }),
    );
  }

  public async isTrustedIdentity(address: ProtocolAddress, key: PK): Promise<boolean> {
    const data = await readFileOrNull(this.trustedPath(address));
    if (data === null) return true; // TOFU
    const parsed = JSON.parse(data) as { fingerprint: string };
    return parsed.fingerprint === this.pkFingerprint.fingerprint(key);
  }

  // ─── Utilities ──────────────────────────────────────────────────────

  /** Delete the cached identity for `address`. (Useful for "reset peer".) */
  public async forgetTrustedIdentity(address: ProtocolAddress): Promise<void> {
    await unlinkIfExists(this.trustedPath(address));
  }
}
