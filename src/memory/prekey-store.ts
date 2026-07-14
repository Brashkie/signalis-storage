/**
 * In-Memory PreKey Store (generic)
 *
 * Holds one-time prekeys by reference in a `Map`. No codec needed —
 * prekeys are held as-is and never round-tripped.
 *
 * @module memory/prekey-store
 */

import type { PreKeyStore } from '../types';

export class MemoryPreKeyStore<OPK> implements PreKeyStore<OPK> {
  private readonly keys = new Map<number, OPK>();

  public async savePreKey(id: number, preKey: OPK): Promise<void> {
    this.keys.set(id, preKey);
  }

  public async getPreKey(id: number): Promise<OPK | null> {
    return this.keys.get(id) ?? null;
  }

  public async containsPreKey(id: number): Promise<boolean> {
    return this.keys.has(id);
  }

  public async removePreKey(id: number): Promise<void> {
    this.keys.delete(id);
  }

  public async loadAllPreKeyIds(): Promise<number[]> {
    return [...this.keys.keys()].sort((a, b) => a - b);
  }

  // ─── Diagnostics ────────────────────────────────────────────────────

  /** Current count of stored prekeys. */
  public size(): number {
    return this.keys.size;
  }

  /** Wipe all prekeys. */
  public clear(): void {
    this.keys.clear();
  }
}
