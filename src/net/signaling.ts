/**
 * Señalización entre pestañas del mismo navegador (BroadcastChannel), para probar el
 * online sin red: se activa con ?netlocal. Las partidas reales usan PeerJS (PeerJsLink).
 */

export type SignalMsg = { from: string; kind: string; data?: unknown };

export class LocalSignaling {
  onMessage: (msg: SignalMsg) => void = () => undefined;
  onPeersChange: () => void = () => undefined;
  private bc: BroadcastChannel | null = null;
  private selfId = '';
  private role: 'host' | 'guest' = 'guest';
  private seen = new Map<string, { role: 'host' | 'guest'; at: number }>();
  private beat = 0;

  join(room: string, selfId: string, role: 'host' | 'guest'): void {
    this.selfId = selfId;
    this.role = role;
    this.bc = new BroadcastChannel(`cyberdojo-room-${room}`);
    this.seen.set(selfId, { role, at: Date.now() });
    this.bc.onmessage = (e) => {
      const msg = e.data as SignalMsg;
      if (msg.from === this.selfId) return;
      if (msg.kind === '__hello' || msg.kind === '__bye') {
        const had = this.seen.has(msg.from);
        if (msg.kind === '__bye') this.seen.delete(msg.from);
        else this.seen.set(msg.from, { role: (msg.data as 'host' | 'guest') ?? 'guest', at: Date.now() });
        if (!had || msg.kind === '__bye') this.onPeersChange();
        // Responde al recién llegado para que nos vea enseguida
        if (!had && msg.kind === '__hello') this.post('__hello', this.role);
        return;
      }
      this.onMessage(msg);
    };
    this.post('__hello', role);
    this.beat = window.setInterval(() => {
      this.post('__hello', this.role);
      const now = Date.now();
      let changed = false;
      for (const [id, v] of this.seen) {
        if (id !== this.selfId && now - v.at > 3500) {
          this.seen.delete(id);
          changed = true;
        }
      }
      if (changed) this.onPeersChange();
    }, 1000);
  }

  private post(kind: string, data?: unknown): void {
    this.bc?.postMessage({ from: this.selfId, kind, data } satisfies SignalMsg);
  }

  send(kind: string, data?: unknown): void {
    this.post(kind, data);
  }

  peers() {
    return [...this.seen.entries()].map(([id, v]) => ({ id, role: v.role }));
  }

  leave(): void {
    this.post('__bye');
    window.clearInterval(this.beat);
    this.bc?.close();
    this.bc = null;
    this.seen.clear();
  }
}
