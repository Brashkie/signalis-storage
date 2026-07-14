/**
 * Coverage closer — exercises error paths and edge cases:
 *   - atomic-write retry / cleanup / ENOENT branches
 *   - error type hierarchy
 *   - file store validation (empty rootDir, negative ids)
 *   - address edge cases (toJSON, inspect, boundaries)
 *   - memory store diagnostics
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Codec,
  FilePreKeyStore,
  FileSessionStore,
  FileSignedPreKeyStore,
  MAX_DEVICE_ID,
  MAX_USER_ID_LENGTH,
  MemorySessionStore,
  MemorySignedPreKeyStore,
  ProtocolAddress,
  SerializationError,
  StorageError,
  StorageValidationError,
  atomicWriteFile,
  listFiles,
  readFileOrNull,
  unlinkIfExists,
} from '../src';

// Minimal fake codec for stores that need one
const idCodec: Codec<{ id: number }> = {
  serialize: (v) => v,
  deserialize: (s) => s as { id: number },
};

// ═══════════════════════════════════════════════════════════════════════════
// Error hierarchy
// ═══════════════════════════════════════════════════════════════════════════

describe('Error types', () => {
  it('StorageError carries context and correct name', () => {
    const err = new StorageError('boom', { foo: 1 });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('StorageError');
    expect(err.message).toBe('boom');
    expect(err.context).toEqual({ foo: 1 });
  });

  it('StorageValidationError extends StorageError', () => {
    const err = new StorageValidationError('bad');
    expect(err).toBeInstanceOf(StorageError);
    expect(err.name).toBe('StorageValidationError');
  });

  it('SerializationError extends StorageError with context', () => {
    const err = new SerializationError('corrupt', { at: 'disk' });
    expect(err).toBeInstanceOf(StorageError);
    expect(err.name).toBe('SerializationError');
    expect(err.context).toEqual({ at: 'disk' });
  });

  it('errors are catchable by base type', () => {
    try {
      throw new SerializationError('x');
    } catch (e) {
      expect(e).toBeInstanceOf(StorageError);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ProtocolAddress edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('ProtocolAddress edge cases', () => {
  it('toJSON returns the pair', () => {
    const a = new ProtocolAddress('alice', 2);
    expect(a.toJSON()).toEqual({ userId: 'alice', deviceId: 2 });
  });

  it('custom inspect returns a readable string', () => {
    const a = new ProtocolAddress('alice', 2);
    const inspected = (a as unknown as Record<symbol, () => string>)[
      Symbol.for('nodejs.util.inspect.custom')
    ]();
    expect(inspected).toContain('ProtocolAddress');
    expect(inspected).toContain('alice.2');
  });

  it('accepts deviceId 0 and MAX_DEVICE_ID', () => {
    expect(() => new ProtocolAddress('a', 0)).not.toThrow();
    expect(() => new ProtocolAddress('a', MAX_DEVICE_ID)).not.toThrow();
  });

  it('rejects userId at the length boundary', () => {
    const okId = 'x'.repeat(MAX_USER_ID_LENGTH);
    expect(() => new ProtocolAddress(okId, 1)).not.toThrow();
    const tooLong = 'x'.repeat(MAX_USER_ID_LENGTH + 1);
    expect(() => new ProtocolAddress(tooLong, 1)).toThrow(StorageValidationError);
  });

  it('rejects non-string userId', () => {
    expect(() => new ProtocolAddress(42 as never, 1)).toThrow(StorageValidationError);
  });

  it('parse rejects non-string', () => {
    expect(() => ProtocolAddress.parse(42 as never)).toThrow(StorageValidationError);
  });

  it('equals returns false for non-address', () => {
    const a = new ProtocolAddress('a', 1);
    expect(a.equals({} as never)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// File store validation
// ═══════════════════════════════════════════════════════════════════════════

describe('File store rootDir validation', () => {
  it('FilePreKeyStore rejects empty/non-string rootDir', () => {
    expect(() => new FilePreKeyStore('', idCodec)).toThrow(StorageValidationError);
    expect(() => new FilePreKeyStore(1 as never, idCodec)).toThrow(
      StorageValidationError,
    );
  });

  it('FileSignedPreKeyStore rejects empty rootDir', () => {
    expect(() => new FileSignedPreKeyStore('', idCodec)).toThrow(StorageValidationError);
  });

  it('FileSessionStore rejects empty rootDir', () => {
    expect(() => new FileSessionStore('', idCodec)).toThrow(StorageValidationError);
  });

  it('FilePreKeyStore rejects negative id on read paths', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sigstore-neg-'));
    const store = new FilePreKeyStore(dir, idCodec);
    await expect(store.getPreKey(-1)).rejects.toThrow(RangeError);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('FileSignedPreKeyStore getSignedPreKey null for missing; active null before rotate', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sigstore-spk-'));
    const store = new FileSignedPreKeyStore(dir, idCodec);
    expect(await store.getSignedPreKey(999)).toBeNull();
    expect(await store.getActiveSignedPreKey()).toBeNull();
    expect(await store.loadAllSignedPreKeyIds()).toEqual([]);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Memory store diagnostics / orphan pointer
// ═══════════════════════════════════════════════════════════════════════════

describe('Memory store diagnostics', () => {
  it('MemorySignedPreKeyStore orphan active pointer returns null', async () => {
    const store = new MemorySignedPreKeyStore<{ id: number }>();
    await store.rotateActiveSignedPreKey(1, { id: 1 });
    expect((await store.getActiveSignedPreKey())!.id).toBe(1);
    // Wipe the underlying map but keep the pointer (simulate external mutation)
    (store as unknown as { keys: Map<number, unknown> }).keys.delete(1);
    expect(await store.getActiveSignedPreKey()).toBeNull();
  });

  it('MemorySessionStore clear empties store', async () => {
    const store = new MemorySessionStore<{ id: number }>(idCodec);
    await store.saveSession(new ProtocolAddress('a', 1), { id: 1 });
    expect(store.size()).toBe(1);
    store.clear();
    expect(store.size()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// atomic-write error paths
// ═══════════════════════════════════════════════════════════════════════════

describe('atomic-write error paths', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sigstore-atomic-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('readFileOrNull returns null on ENOENT', async () => {
    expect(await readFileOrNull(path.join(dir, 'nope.txt'))).toBeNull();
  });

  it('readFileOrNull rethrows non-ENOENT (reading a directory)', async () => {
    await fs.mkdir(path.join(dir, 'adir'));
    await expect(readFileOrNull(path.join(dir, 'adir'))).rejects.toThrow();
  });

  it('unlinkIfExists no-ops on missing, rethrows otherwise', async () => {
    await expect(unlinkIfExists(path.join(dir, 'nope.txt'))).resolves.toBeUndefined();
    await fs.mkdir(path.join(dir, 'nonempty'));
    await fs.writeFile(path.join(dir, 'nonempty', 'f.txt'), 'x');
    await expect(unlinkIfExists(path.join(dir, 'nonempty'))).rejects.toThrow();
  });

  it('listFiles returns [] on missing dir; rethrows on non-ENOENT', async () => {
    expect(await listFiles(path.join(dir, 'nope'))).toEqual([]);
    await fs.writeFile(path.join(dir, 'afile'), 'x');
    await expect(listFiles(path.join(dir, 'afile'))).rejects.toThrow();
  });

  it('atomicWriteFile writes and reads back', async () => {
    const target = path.join(dir, 'data.txt');
    await atomicWriteFile(target, 'hello');
    expect(await fs.readFile(target, 'utf-8')).toBe('hello');
  });

  it('atomicWriteFile cleans up tmp on non-retryable rename failure', async () => {
    const renameSpy = vi
      .spyOn(fs, 'rename')
      .mockRejectedValueOnce(Object.assign(new Error('mock EXDEV'), { code: 'EXDEV' }));
    await expect(atomicWriteFile(path.join(dir, 't.txt'), 'x')).rejects.toThrow();
    const leftovers = (await fs.readdir(dir)).filter((n) => n.includes('.tmp.'));
    expect(leftovers).toEqual([]);
    renameSpy.mockRestore();
  });

  it('atomicWriteFile retries on EPERM then succeeds', async () => {
    let calls = 0;
    const realRename = fs.rename.bind(fs);
    const renameSpy = vi
      .spyOn(fs, 'rename')
      .mockImplementation(async (from: fs.PathLike, to: fs.PathLike) => {
        calls++;
        if (calls <= 2) {
          throw Object.assign(new Error('mock EPERM'), { code: 'EPERM' });
        }
        return realRename(from, to);
      });
    await atomicWriteFile(path.join(dir, 'retry.txt'), 'ok');
    expect(calls).toBe(3);
    expect(await fs.readFile(path.join(dir, 'retry.txt'), 'utf-8')).toBe('ok');
    renameSpy.mockRestore();
  });

  it('atomicWriteFile gives up after max retries on persistent EPERM', async () => {
    const renameSpy = vi
      .spyOn(fs, 'rename')
      .mockRejectedValue(Object.assign(new Error('EPERM'), { code: 'EPERM' }));
    await expect(atomicWriteFile(path.join(dir, 'never.txt'), 'x')).rejects.toThrow(
      /EPERM/,
    );
    expect(renameSpy).toHaveBeenCalledTimes(5);
    renameSpy.mockRestore();
  });
});
