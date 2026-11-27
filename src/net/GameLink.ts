/** Enlace con el rival, sea cual sea el transporte (PeerJS o pestañas locales). */
export type LinkState = 'waiting' | 'connecting' | 'direct' | 'relay' | 'closed';

export interface GameLink {
  state: LinkState;
  /** Ida y vuelta medido (ms), suavizado. */
  rtt: number;
  onState: (s: LinkState) => void;
  /** Canal rápido sin reenvíos: inputs del combate. */
  onGame: (data: unknown) => void;
  /** Canal fiable: elecciones, revancha, avisos. */
  onCtrl: (data: unknown) => void;
  send(channel: 'game' | 'ctrl', data: unknown): void;
  close(): void;
}

/** Ping/pong común: mide el ida y vuelta y detecta al rival desconectado. */
export class PingMeter {
  rtt = 0;
  private lastPong = 0;

  /** Devuelve true si el mensaje era de ping/pong (ya gestionado). */
  handle(msg: unknown, reply: (m: unknown) => void): boolean {
    const m = msg as { t?: string; ts?: number };
    if (m?.t === 'ping') {
      reply({ t: 'pong', ts: m.ts });
      return true;
    }
    if (m?.t === 'pong' && typeof m.ts === 'number') {
      const sample = performance.now() - m.ts;
      this.rtt = this.rtt === 0 ? sample : this.rtt * 0.8 + sample * 0.2;
      this.lastPong = performance.now();
      return true;
    }
    return false;
  }

  start(): void {
    this.lastPong = performance.now();
  }

  ping(): unknown {
    return { t: 'ping', ts: performance.now() };
  }

  /** Sin respuesta en 5 s: rival perdido. */
  timedOut(): boolean {
    return this.lastPong > 0 && performance.now() - this.lastPong > 5000;
  }
}
