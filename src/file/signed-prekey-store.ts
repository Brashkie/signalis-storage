/**
 * File-backed SignedPreKey Store (generic).
 *
 * Layout:
 *   <rootDir>/signed-prekeys/<id>.json
 *   <rootDir>/signed-prekeys/active.json   — pointer to active id
 *
 * @module file/signed-prekey-store
 */

import * as path from 'node:path';
import type { Codec } from '../codec';
import { StorageValidationError } from '../errors';
import type { SignedPreKeyStore } from '../types';
import { atomicWriteFile, listFiles, readFileOrNull } from './atomic-write';

export class FileSignedPreKeyStore<SPK> implements SignedPreKeyStore<SPK> {
  private readonly signedPreKeysDir: string;
  private readonly activePointerFile: string;

  constructor(
    rootDir: string,
    private readonly codec: Codec<SPK>,
  ) {
    if (typeof rootDir !== 'string' || rootDir.length === 0) {
      throw new StorageValidationError(
        'FileSignedPreKeyStore: rootDir must be a non-empty string',
      );
    }
    this.signedPreKeysDir = path.join(rootDir, 'signed-prekeys');
    this.activePointerFile = path.join(this.signedPreKeysDir, 'active.json');
  }

  private filePath(id: number): string {
    if (!Number.isInteger(id) || id < 0) {
      throw new RangeError(`signed prekey id must be a non-negative integer, got ${id}`);
    }
    return path.join(this.signedPreKeysDir, `${id}.json`);
  }

  public async saveSignedPreKey(id: number, preKey: SPK): Promise<void> {
    await atomicWriteFile(
      this.filePath(id),
      JSON.stringify({ version: 1, preKey: this.codec.serialize(preKey) }),
    );
  }

  public async getSignedPreKey(id: number): Promise<SPK | null> {
    const data = await readFileOrNull(this.filePath(id));
    if (data === null) return null;
    const parsed = JSON.parse(data) as { version: number; preKey: unknown };
    return this.codec.deserialize(parsed.preKey);
  }

  public async rotateActiveSignedPreKey(newId: number, newPreKey: SPK): Promise<void> {
    await this.saveSignedPreKey(newId, newPreKey);
    await atomicWriteFile(
      this.activePointerFile,
      JSON.stringify({ version: 1, activeId: newId }),
    );
  }

  public async getActiveSignedPreKey(): Promise<SPK | null> {
    const data = await readFileOrNull(this.activePointerFile);
    if (data === null) return null;
    const parsed = JSON.parse(data) as { activeId: number };
    return this.getSignedPreKey(parsed.activeId);
  }

  public async loadAllSignedPreKeyIds(): Promise<number[]> {
    const files = await listFiles(this.signedPreKeysDir, (n) => n.endsWith('.json'));
    return files
      .filter((name) => name !== 'active.json')
      .map((name) => Number.parseInt(name.slice(0, -5), 10))
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
  }
}
