/**
 * Coverage closer, round 2 — targets the specific lines the report flagged:
 *   - MemorySignedPreKeyStore.getSignedPreKey (hit + miss)
 *   - FileIdentityStore.saveRegistrationId negative → RangeError
 *   - FileSignedPreKeyStore negative id → RangeError
 *   - FileSessionStore.loadAllSessions skips malformed filenames
 *   - atomicWriteFile cleanup paths (handle-close-in-catch, unlink-in-catch)
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Codec,
  FileIdentityStore,
  FileSessionStore,
  FileSignedPreKeyStore,
  type Fingerprint,
  MemorySignedPreKeyStore,
  ProtocolAddress,
  atomicWriteFile,
} from '../src';

const idCodec: Codec<{ id: number }> = {
  serialize: (v) => v,
  deserialize: (s) => s as { id: number },
};
const pkFp: Fingerprint<{ hex: string }> = { fingerprint: (k) => k.hex };

// ═══════════════════════════════════════════════════════════════════════════
// MemorySignedPreKeyStore.getSignedPreKey — direct hit + miss
// ═══════════════════════════════════════════════════════════════════════════

describe('MemorySignedPreKeyStore.getSignedPreKey', () => {
  it('returns the key when present and null when missing', async () => {
    const store = new MemorySignedPreKeyStore<{ id: number }>();
    await store.saveSignedPreKey(7, { id: 7 });
    expect((await store.getSignedPreKey(7))!.id).toBe(7);
    expect(await store.getSignedPreKey(404)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// File store id/registration validation
// ═══════════════════════════════════════════════════════════════════════════

describe('File store validation error paths', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sigstore-valid-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('FileIdentityStore.saveRegistrationId rejects negative', async () => {
    const store = new FileIdentityStore(dir, idCodec, pkFp);
    await expect(store.saveRegistrationId(-1)).rejects.toThrow(RangeError);
    await expect(store.saveRegistrationId(1.5)).rejects.toThrow(RangeError);
  });

  it('FileSignedPreKeyStore rejects negative id on save and get', async () => {
    const store = new FileSignedPreKeyStore(dir, idCodec);
    await expect(store.saveSignedPreKey(-1, { id: 1 })).rejects.toThrow(RangeError);
    await expect(store.getSignedPreKey(-5)).rejects.toThrow(RangeError);
  });

  it('FileSessionStore.loadAllSessions skips malformed filenames', async () => {
    const store = new FileSessionStore(dir, idCodec);
    // One valid session
    await store.saveSession(new ProtocolAddress('alice', 1), { id: 1 });
    // Plant a malformed file directly in the sessions dir
    const sessionsDir = path.join(dir, 'sessions');
    await fs.writeFile(path.join(sessionsDir, 'not-an-address.json'), '{}');
    await fs.writeFile(path.join(sessionsDir, 'also.bad.no-device.json'), '{}');

    const all = await store.loadAllSessions();
    // Only the valid one survives; malformed ones are skipped
    expect(all.length).toBe(1);
    expect(all[0]!.address.userId).toBe('alice');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// atomicWriteFile — cleanup paths via a faked file handle
// ═══════════════════════════════════════════════════════════════════════════

describe('atomicWriteFile cleanup paths', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sigstore-cleanup-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('closes the still-open handle during cleanup when writeFile fails', async () => {
    // Fake handle: writeFile rejects (error occurs while handle is open),
    // close resolves (so the cleanup close succeeds).
    let closed = false;
    const fakeHandle = {
      writeFile: vi.fn().mockRejectedValue(new Error('mock write failure')),
      sync: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockImplementation(async () => {
        closed = true;
      }),
    } as unknown as fs.FileHandle;

    const openSpy = vi.spyOn(fs, 'open').mockResolvedValue(fakeHandle);

    await expect(atomicWriteFile(path.join(dir, 't.txt'), 'data')).rejects.toThrow(
      /mock write failure/,
    );
    // The cleanup branch closed the still-open handle
    expect(closed).toBe(true);
    openSpy.mockRestore();
  });

  it('swallows a close() failure during cleanup (nested catch)', async () => {
    // Both writeFile AND close reject → exercises the inner try/catch around close.
    const fakeHandle = {
      writeFile: vi.fn().mockRejectedValue(new Error('mock write failure')),
      sync: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockRejectedValue(new Error('mock close failure')),
    } as unknown as fs.FileHandle;

    const openSpy = vi.spyOn(fs, 'open').mockResolvedValue(fakeHandle);

    // The original write error is what propagates, not the close error.
    await expect(atomicWriteFile(path.join(dir, 't.txt'), 'data')).rejects.toThrow(
      /mock write failure/,
    );
    openSpy.mockRestore();
  });

  it('swallows an unlink() failure during cleanup', async () => {
    // writeFile fails so we enter cleanup; unlink then also fails → inner catch.
    const fakeHandle = {
      writeFile: vi.fn().mockRejectedValue(new Error('mock write failure')),
      sync: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as fs.FileHandle;

    const openSpy = vi.spyOn(fs, 'open').mockResolvedValue(fakeHandle);
    const unlinkSpy = vi
      .spyOn(fs, 'unlink')
      .mockRejectedValue(Object.assign(new Error('gone'), { code: 'ENOENT' }));

    await expect(atomicWriteFile(path.join(dir, 't.txt'), 'data')).rejects.toThrow(
      /mock write failure/,
    );
    expect(unlinkSpy).toHaveBeenCalled();
    openSpy.mockRestore();
    unlinkSpy.mockRestore();
  });
});
