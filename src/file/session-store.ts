/**
 * File-backed Session Store (generic).
 *
 * Layout:
 *   <rootDir>/sessions/<address>.json
 *
 * @module file/session-store
 */

import * as path from 'node:path';
import { ProtocolAddress } from '../address';
import type { Codec } from '../codec';
import { StorageValidationError } from '../errors';
import type { SessionStore } from '../types';
import {
  atomicWriteFile,
  listFiles,
  readFileOrNull,
  unlinkIfExists,
} from './atomic-write';

export class FileSessionStore<S> implements SessionStore<S> {
  private readonly sessionsDir: string;

  constructor(
    rootDir: string,
    private readonly codec: Codec<S>,
  ) {
    if (typeof rootDir !== 'string' || rootDir.length === 0) {
      throw new StorageValidationError(
        'FileSessionStore: rootDir must be a non-empty string',
      );
    }
    this.sessionsDir = path.join(rootDir, 'sessions');
  }

  private filePath(address: ProtocolAddress): string {
    return path.join(this.sessionsDir, `${address.toString()}.json`);
  }

  public async saveSession(address: ProtocolAddress, session: S): Promise<void> {
    const snapshot = this.codec.serialize(session);
    await atomicWriteFile(this.filePath(address), JSON.stringify(snapshot));
  }

  public async loadSession(address: ProtocolAddress): Promise<S | null> {
    const data = await readFileOrNull(this.filePath(address));
    if (data === null) return null;
    return this.codec.deserialize(JSON.parse(data));
  }

  public async containsSession(address: ProtocolAddress): Promise<boolean> {
    return (await readFileOrNull(this.filePath(address))) !== null;
  }

  public async deleteSession(address: ProtocolAddress): Promise<void> {
    await unlinkIfExists(this.filePath(address));
  }

  public async loadAllSessions(): Promise<
    Array<{ address: ProtocolAddress; session: S }>
  > {
    const files = await listFiles(this.sessionsDir, (n) => n.endsWith('.json'));
    const result: Array<{ address: ProtocolAddress; session: S }> = [];
    for (const file of files) {
      const addrStr = file.slice(0, -5); // strip .json
      let address: ProtocolAddress;
      try {
        address = ProtocolAddress.parse(addrStr);
      } catch {
        // Skip malformed filenames silently
        continue;
      }
      const session = await this.loadSession(address);
      if (session !== null) {
        result.push({ address, session });
      }
    }
    return result;
  }
}
