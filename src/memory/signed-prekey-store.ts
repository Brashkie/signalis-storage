/**
 * In-Memory SignedPreKey Store (generic)
 *
 * Holds signed prekeys by reference. No codec needed.
 *
 * @module memory/signed-prekey-store
 */

import type { SignedPreKeyStore } from '../types';

export class MemorySignedPreKeyStore<SPK> implements SignedPreKeyStore<SPK> {
  private readonly keys = new Map<number, SPK>();
  private activeId: number | null = null;

  public async saveSignedPreKey(id: number, preKey: SPK): Promise<void> {
    this.keys.set(id, preKey);
  }

  public async getSignedPreKey(id: number): Promise<SPK | null> {
    return this.keys.get(id) ?? null;
  }

  public async rotateActiveSignedPreKey(newId: number, newPreKey: SPK): Promise<void> {
    this.keys.set(newId, newPreKey);
    this.activeId = newId;
  }

  public async getActiveSignedPreKey(): Promise<SPK | null> {
    if (this.activeId === null) return null;
    return this.keys.get(this.activeId) ?? null;
  }

  public async loadAllSignedPreKeyIds(): Promise<number[]> {
    return [...this.keys.keys()].sort((a, b) => a - b);
  }

  // ─── Diagnostics ────────────────────────────────────────────────────

  public size(): number {
    return this.keys.size;
  }

  public clear(): void {
    this.keys.clear();
    this.activeId = null;
  }
}
