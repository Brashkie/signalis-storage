/**
 * Tests for @brashkie/signalis-storage.
 *
 * These use FAKE crypto objects + codecs to exercise the storage layer in
 * isolation (the real crypto types live in @brashkie/signalis). The goal is
 * to prove the generic + codec-injection design works end-to-end without
 * pulling in the crypto core.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Codec,
  FileIdentityStore,
  FilePreKeyStore,
  FileSessionStore,
  FileSignedPreKeyStore,
  type Fingerprint,
  MemoryIdentityStore,
  MemoryPreKeyStore,
  MemorySessionStore,
  MemorySignedPreKeyStore,
  ProtocolAddress,
  StorageValidationError,
  isProtocolAddress,
} from '../src';

// ─── Fake crypto objects + codecs (what signalis injects for real) ─────────

class FakeKeyPair {
  constructor(public id: number) {}
  serialize(): { id: number } {
    return { id: this.id };
  }
  static from(s: { id: number }): FakeKeyPair {
    return new FakeKeyPair(s.id);
  }
}

class FakeSession {
  constructor(public value: string) {}
  serialize(): { value: string } {
    return { value: this.value };
  }
  static from(s: { value: string }): FakeSession {
    return new FakeSession(s.value);
  }
}

class FakePublicKey {
  constructor(public hex: string) {}
  toHex(): string {
    return this.hex;
  }
}

const kpCodec: Codec<FakeKeyPair> = {
  serialize: (k) => k.serialize(),
  deserialize: (s) => FakeKeyPair.from(s as { id: number }),
};
const sessCodec: Codec<FakeSession> = {
  serialize: (s) => s.serialize(),
  deserialize: (s) => FakeSession.from(s as { value: string }),
};
const pkFingerprint: Fingerprint<FakePublicKey> = {
  fingerprint: (k) => k.toHex(),
};

// ═══════════════════════════════════════════════════════════════════════════
// ProtocolAddress
// ═══════════════════════════════════════════════════════════════════════════

describe('ProtocolAddress', () => {
  it('builds and stringifies', () => {
    const a = new ProtocolAddress('alice@example.com', 1);
    expect(a.userId).toBe('alice@example.com');
    expect(a.deviceId).toBe(1);
    expect(a.toString()).toBe('alice@example.com.1');
  });

  it('round-trips through parse', () => {
    const a = new ProtocolAddress('bob', 3);
    const b = ProtocolAddress.parse(a.toString());
    expect(b.equals(a)).toBe(true);
  });

  it('rejects empty userId', () => {
    expect(() => new ProtocolAddress('', 1)).toThrow(StorageValidationError);
  });

  it('rejects forbidden characters', () => {
    expect(() => new ProtocolAddress('a/b', 1)).toThrow(StorageValidationError);
    expect(() => new ProtocolAddress('a\\b', 1)).toThrow(StorageValidationError);
  });

  it('rejects negative/huge deviceId', () => {
    expect(() => new ProtocolAddress('a', -1)).toThrow(StorageValidationError);
    expect(() => new ProtocolAddress('a', 2 ** 32)).toThrow(StorageValidationError);
  });

  it('parse rejects malformed', () => {
    expect(() => ProtocolAddress.parse('nodot')).toThrow(StorageValidationError);
    expect(() => ProtocolAddress.parse('a.')).toThrow(StorageValidationError);
    expect(() => ProtocolAddress.parse('a.x')).toThrow(StorageValidationError);
  });

  it('isProtocolAddress type guard', () => {
    expect(isProtocolAddress(new ProtocolAddress('a', 1))).toBe(true);
    expect(isProtocolAddress({})).toBe(false);
    expect(isProtocolAddress(null)).toBe(false);
  });

  it('handles userId containing dots (uses lastIndexOf)', () => {
    const a = new ProtocolAddress('a.b.c@example.com', 5);
    const b = ProtocolAddress.parse(a.toString());
    expect(b.userId).toBe('a.b.c@example.com');
    expect(b.deviceId).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Memory stores
// ═══════════════════════════════════════════════════════════════════════════

describe('MemoryIdentityStore', () => {
  it('stores own keypair + registration id', async () => {
    const store = new MemoryIdentityStore<FakeKeyPair, FakePublicKey>(pkFingerprint);
    expect(await store.getIdentityKeyPair()).toBeNull();
    await store.saveIdentityKeyPair(new FakeKeyPair(7));
    expect((await store.getIdentityKeyPair())!.id).toBe(7);

    expect(await store.getRegistrationId()).toBeNull();
    await store.saveRegistrationId(42);
    expect(await store.getRegistrationId()).toBe(42);
  });

  it('rejects negative registration id', async () => {
    const store = new MemoryIdentityStore<FakeKeyPair, FakePublicKey>(pkFingerprint);
    await expect(store.saveRegistrationId(-1)).rejects.toThrow(RangeError);
  });

  it('TOFU: accepts first contact, matches same, rejects different', async () => {
    const store = new MemoryIdentityStore<FakeKeyPair, FakePublicKey>(pkFingerprint);
    const addr = new ProtocolAddress('alice', 1);
    expect(await store.isTrustedIdentity(addr, new FakePublicKey('abc'))).toBe(true);
    await store.saveTrustedIdentity(addr, new FakePublicKey('abc'));
    expect(await store.isTrustedIdentity(addr, new FakePublicKey('abc'))).toBe(true);
    expect(await store.isTrustedIdentity(addr, new FakePublicKey('xyz'))).toBe(false);
    expect(store.trustedIdentitiesCount()).toBe(1);
  });

  it('clear wipes everything', async () => {
    const store = new MemoryIdentityStore<FakeKeyPair, FakePublicKey>(pkFingerprint);
    await store.saveIdentityKeyPair(new FakeKeyPair(1));
    await store.saveRegistrationId(9);
    await store.saveTrustedIdentity(new ProtocolAddress('a', 1), new FakePublicKey('h'));
    store.clear();
    expect(await store.getIdentityKeyPair()).toBeNull();
    expect(await store.getRegistrationId()).toBeNull();
    expect(store.trustedIdentitiesCount()).toBe(0);
  });
});

describe('MemoryPreKeyStore', () => {
  it('save/get/contains/remove/loadAll', async () => {
    const store = new MemoryPreKeyStore<FakeKeyPair>();
    await store.savePreKey(3, new FakeKeyPair(3));
    await store.savePreKey(1, new FakeKeyPair(1));
    expect((await store.getPreKey(3))!.id).toBe(3);
    expect(await store.getPreKey(99)).toBeNull();
    expect(await store.containsPreKey(1)).toBe(true);
    expect(await store.loadAllPreKeyIds()).toEqual([1, 3]);
    await store.removePreKey(1);
    expect(await store.containsPreKey(1)).toBe(false);
    expect(store.size()).toBe(1);
    store.clear();
    expect(store.size()).toBe(0);
  });
});

describe('MemorySignedPreKeyStore', () => {
  it('rotate + active + loadAll', async () => {
    const store = new MemorySignedPreKeyStore<FakeKeyPair>();
    expect(await store.getActiveSignedPreKey()).toBeNull();
    await store.saveSignedPreKey(1, new FakeKeyPair(1));
    await store.rotateActiveSignedPreKey(2, new FakeKeyPair(2));
    expect((await store.getActiveSignedPreKey())!.id).toBe(2);
    expect(await store.loadAllSignedPreKeyIds()).toEqual([1, 2]);
    expect(store.size()).toBe(2);
    store.clear();
    expect(await store.getActiveSignedPreKey()).toBeNull();
  });
});

describe('MemorySessionStore', () => {
  it('save/load/contains/delete/loadAll with snapshot isolation', async () => {
    const store = new MemorySessionStore<FakeSession>(sessCodec);
    const addr = new ProtocolAddress('alice', 1);
    const session = new FakeSession('hello');
    await store.saveSession(addr, session);

    // Snapshot isolation: mutating the original does not change stored copy
    session.value = 'MUTATED';
    expect((await store.loadSession(addr))!.value).toBe('hello');

    expect(await store.loadSession(new ProtocolAddress('bob', 1))).toBeNull();
    expect(await store.containsSession(addr)).toBe(true);

    await store.saveSession(new ProtocolAddress('carol', 2), new FakeSession('hi'));
    const all = await store.loadAllSessions();
    expect(all.length).toBe(2);

    await store.deleteSession(addr);
    expect(await store.containsSession(addr)).toBe(false);
    expect(store.size()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// File stores
// ═══════════════════════════════════════════════════════════════════════════

describe('File stores', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'signalis-storage-test-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('FileIdentityStore: persists + reloads + TOFU', async () => {
    const store = new FileIdentityStore<FakeKeyPair, FakePublicKey>(
      dir,
      kpCodec,
      pkFingerprint,
    );
    expect(await store.getIdentityKeyPair()).toBeNull();
    await store.saveIdentityKeyPair(new FakeKeyPair(99));
    expect((await store.getIdentityKeyPair())!.id).toBe(99);

    await store.saveRegistrationId(11);
    expect(await store.getRegistrationId()).toBe(11);

    const addr = new ProtocolAddress('alice', 1);
    expect(await store.isTrustedIdentity(addr, new FakePublicKey('fp1'))).toBe(true);
    await store.saveTrustedIdentity(addr, new FakePublicKey('fp1'));
    expect(await store.isTrustedIdentity(addr, new FakePublicKey('fp1'))).toBe(true);
    expect(await store.isTrustedIdentity(addr, new FakePublicKey('fp2'))).toBe(false);

    await store.forgetTrustedIdentity(addr);
    // After forget → TOFU again
    expect(await store.isTrustedIdentity(addr, new FakePublicKey('fp2'))).toBe(true);
  });

  it('FileIdentityStore rejects empty rootDir', () => {
    expect(() => new FileIdentityStore('', kpCodec, pkFingerprint)).toThrow(
      StorageValidationError,
    );
  });

  it('survives a fresh store instance (real persistence)', async () => {
    const s1 = new FileIdentityStore<FakeKeyPair, FakePublicKey>(
      dir,
      kpCodec,
      pkFingerprint,
    );
    await s1.saveIdentityKeyPair(new FakeKeyPair(55));
    // New instance, same dir → should read from disk
    const s2 = new FileIdentityStore<FakeKeyPair, FakePublicKey>(
      dir,
      kpCodec,
      pkFingerprint,
    );
    expect((await s2.getIdentityKeyPair())!.id).toBe(55);
  });

  it('FilePreKeyStore: full lifecycle', async () => {
    const store = new FilePreKeyStore<FakeKeyPair>(dir, kpCodec);
    await store.savePreKey(2, new FakeKeyPair(2));
    await store.savePreKey(1, new FakeKeyPair(1));
    expect((await store.getPreKey(2))!.id).toBe(2);
    expect(await store.getPreKey(99)).toBeNull();
    expect(await store.containsPreKey(1)).toBe(true);
    expect(await store.loadAllPreKeyIds()).toEqual([1, 2]);
    await store.removePreKey(1);
    expect(await store.containsPreKey(1)).toBe(false);
  });

  it('FilePreKeyStore rejects negative id', async () => {
    const store = new FilePreKeyStore<FakeKeyPair>(dir, kpCodec);
    await expect(store.savePreKey(-1, new FakeKeyPair(1))).rejects.toThrow(RangeError);
  });

  it('FileSignedPreKeyStore: rotate + active persists', async () => {
    const store = new FileSignedPreKeyStore<FakeKeyPair>(dir, kpCodec);
    expect(await store.getActiveSignedPreKey()).toBeNull();
    await store.rotateActiveSignedPreKey(5, new FakeKeyPair(5));
    expect((await store.getActiveSignedPreKey())!.id).toBe(5);
    // active.json excluded from ids
    expect(await store.loadAllSignedPreKeyIds()).toEqual([5]);
  });

  it('FileSessionStore: persist + loadAll + skip malformed', async () => {
    const store = new FileSessionStore<FakeSession>(dir, sessCodec);
    const addr = new ProtocolAddress('alice', 1);
    await store.saveSession(addr, new FakeSession('disk'));
    expect((await store.loadSession(addr))!.value).toBe('disk');

    await store.saveSession(new ProtocolAddress('bob', 2), new FakeSession('x'));
    const all = await store.loadAllSessions();
    expect(all.length).toBe(2);

    await store.deleteSession(addr);
    expect(await store.containsSession(addr)).toBe(false);
    expect((await store.loadAllSessions()).length).toBe(1);
  });
});
