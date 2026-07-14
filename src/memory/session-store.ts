/**
 * In-Memory Session Store (generic)
 *
 * Sessions are round-tripped through the injected codec + JSON on every
 * save/load so that stored state is an isolated snapshot (mutations to a
 * live ratchet object don't leak into the store, and vice-versa).
 *
 * @module memory/session-store
 */

import { ProtocolAddress } from '../address';
import type { Codec } from '../codec';
import type { SessionStore } from '../types';

export class MemorySessionStore<S> implements SessionStore<S> {
  /** Map<address.toString(), serialized session JSON> */
  private readonly sessions = new Map<string, string>();

  /**
   * @param codec - serialize/deserialize for the session type. Injected by
   *   `@brashkie/signalis` (e.g. `{ serialize: s => s.serialize(),
   *   deserialize: snap => Session.deserialize(snap) }`).
   */
  constructor(private readonly codec: Codec<S>) {}

  public async saveSession(address: ProtocolAddress, session: S): Promise<void> {
    const snapshot = this.codec.serialize(session);
    this.sessions.set(address.toString(), JSON.stringify(snapshot));
  }

  public async loadSession(address: ProtocolAddress): Promise<S | null> {
    const serialized = this.sessions.get(address.toString());
    if (serialized === undefined) return null;
    return this.codec.deserialize(JSON.parse(serialized));
  }

  public async containsSession(address: ProtocolAddress): Promise<boolean> {
    return this.sessions.has(address.toString());
  }

  public async deleteSession(address: ProtocolAddress): Promise<void> {
    this.sessions.delete(address.toString());
  }

  public async loadAllSessions(): Promise<
    Array<{ address: ProtocolAddress; session: S }>
  > {
    const result: Array<{ address: ProtocolAddress; session: S }> = [];
    for (const [key, serialized] of this.sessions.entries()) {
      result.push({
        address: ProtocolAddress.parse(key),
        session: this.codec.deserialize(JSON.parse(serialized)),
      });
    }
    return result;
  }

  // ─── Diagnostics ────────────────────────────────────────────────────

  public size(): number {
    return this.sessions.size;
  }

  public clear(): void {
    this.sessions.clear();
  }
}
