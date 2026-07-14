/**
 * File-backed PreKey Store (generic).
 *
 * Layout:
 *   <rootDir>/prekeys/<id>.json
 *
 * @module file/prekey-store
 */

import * as path from 'node:path';
import type { Codec } from '../codec';
import { StorageValidationError } from '../errors';
import type { PreKeyStore } from '../types';
import {
  atomicWriteFile,
  listFiles,
  readFileOrNull,
  unlinkIfExists,
} from './atomic-write';

export class FilePreKeyStore<OPK> implements PreKeyStore<OPK> {
  private readonly preKeysDir: string;

  constructor(
    rootDir: string,
    private readonly codec: Codec<OPK>,
  ) {
    if (typeof rootDir !== 'string' || rootDir.length === 0) {
      throw new StorageValidationError(
        'FilePreKeyStore: rootDir must be a non-empty string',
      );
    }
    this.preKeysDir = path.join(rootDir, 'prekeys');
  }

  private filePath(id: number): string {
    if (!Number.isInteger(id) || id < 0) {
      throw new RangeError(`prekey id must be a non-negative integer, got ${id}`);
    }
    return path.join(this.preKeysDir, `${id}.json`);
  }

  public async savePreKey(id: number, preKey: OPK): Promise<void> {
    await atomicWriteFile(
      this.filePath(id),
      JSON.stringify({ version: 1, preKey: this.codec.serialize(preKey) }),
    );
  }

  public async getPreKey(id: number): Promise<OPK | null> {
    const data = await readFileOrNull(this.filePath(id));
    if (data === null) return null;
    const parsed = JSON.parse(data) as { version: number; preKey: unknown };
    return this.codec.deserialize(parsed.preKey);
  }

  public async containsPreKey(id: number): Promise<boolean> {
    return (await readFileOrNull(this.filePath(id))) !== null;
  }

  public async removePreKey(id: number): Promise<void> {
    await unlinkIfExists(this.filePath(id));
  }

  public async loadAllPreKeyIds(): Promise<number[]> {
    const files = await listFiles(this.preKeysDir, (n) => n.endsWith('.json'));
    return files
      .map((name) => Number.parseInt(name.slice(0, -5), 10))
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
  }
}
