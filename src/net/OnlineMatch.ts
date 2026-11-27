import type { InputBuffer, RawInput } from '../core/inputBuffer';
import { hashState } from '../core/rng';
import { RollbackSession } from '../core/rollback';
import type { MatchState } from '../core/types';
import type { GameLink } from './GameLink';

/**
 * Combate online con rollback (GGPO simplificado):
 * - El input local se aplica con INPUT_DELAY frames de retraso y se envía repetido
 *   (los últimos frames sin confirmar) por el canal rápido: perder un paquete no importa.
 * - El input del rival que aún no ha llegado se predice (repetir el último); cuando llega
 *   y no coincide, RollbackSession vuelve atrás y re-simula.
 * - Si el rival va más de MAX_ROLLBACK frames por detrás, se espera.
 * - Sincronía de ritmo: si vamos adelantados respecto al rival, se salta algún tick.
 * - Cada 60 frames confirmados se compara un hash del estado (detecta desincronías).
 */

export const INPUT_DELAY = 2;
const MAX_ROLLBACK = 8;
const RESEND = 16;

const KEYS: (keyof RawInput)[] = ['up', 'down', 'left', 'right', 'p', 'k', 't', 's', 'dash'];
const NEUTRAL: RawInput = { up: false, down: false, left: false, right: false, p: false, k: false, t: false, s: false, dash: false };

export function encodeInput(i: RawInput): number {
  let b = 0;
  KEYS.forEach((k, n) => {
    if (i[k]) b |= 1 << n;
  });
  return b;
}

export function decodeInput(b: number): RawInput {
  const out = { ...NEUTRAL };
  KEYS.forEach((k, n) => {
    out[k] = (b & (1 << n)) !== 0;
  });
  return out;
}

type InPacket = { t: 'in'; s: number; b: number[]; a: number; f: number };
type HashPacket = { t: 'hash'; f: number; h: number };

export class OnlineMatch {
  /** Diagnóstico para el HUD */
  stats = { rollbacks: 0, stalls: 0, frameAdvantage: 0 };
  desync = false;
  onDesync: (frame: number) => void = () => undefined;

  private session: RollbackSession;
  private local = new Map<number, number>(); // frame → input codificado
  private remote = new Map<number, number>();
  /** Último frame del rival recibido de forma contigua (todo lo anterior también) */
  private remoteContig = 0;
  /** Último frame nuestro que el rival confirma tener */
  private remoteAck = 0;
  /** Frame de simulación que el rival dice ir por */
  private remoteSimFrame = 0;
  private remoteSlot: 0 | 1;
  private myHashes = new Map<number, number>();
  private theirHashes = new Map<number, number>();
  private tick = 0;

  constructor(
    private state: MatchState,
    buffers: [InputBuffer, InputBuffer],
    private link: GameLink,
    private localSlot: 0 | 1
  ) {
    this.remoteSlot = localSlot === 0 ? 1 : 0;
    this.session = new RollbackSession(state, buffers, MAX_ROLLBACK);
    // Los primeros frames (retraso de entrada) son neutros en los dos lados
    for (let f = 1; f <= INPUT_DELAY; f++) {
      this.local.set(f, 0);
      this.remote.set(f, 0);
    }
    this.remoteContig = INPUT_DELAY;
    link.onGame = (m) => this.onPacket(m as InPacket | HashPacket);
  }

  /** Frame que se simulará a continuación */
  get nextFrame(): number {
    return this.state.frame + 1;
  }

  /**
   * Un tick de 60 Hz. Devuelve true si se simuló un frame (para procesar eventos de la vista).
   */
  step(localInput: RawInput): boolean {
    this.tick++;
    const n = this.nextFrame;

    // Ritmo: si vamos más de 2 frames por delante del rival, saltar uno de cada 3 ticks
    const rttFrames = Math.round((this.link.rtt / 1000) * 60);
    const advantage = n - (this.remoteSimFrame + Math.round(rttFrames / 2));
    this.stats.frameAdvantage = advantage;
    if (advantage > 2 && this.tick % 3 === 0) {
      this.send();
      return false;
    }
    // Demasiado por delante de lo confirmado: esperar (el rollback no llega tan lejos)
    if (n - this.remoteContig > MAX_ROLLBACK) {
      this.stats.stalls++;
      this.send();
      return false;
    }

    // Input local con retraso: lo que se pulsa ahora cuenta en n + INPUT_DELAY
    if (!this.local.has(n + INPUT_DELAY)) this.local.set(n + INPUT_DELAY, encodeInput(localInput));

    const inputs: [RawInput | null, RawInput | null] = [null, null];
    inputs[this.localSlot] = decodeInput(this.local.get(n) ?? 0);
    const r = this.remote.get(n);
    inputs[this.remoteSlot] = r === undefined ? null : decodeInput(r);
    this.session.advance(inputs);

    this.recordHash();
    this.send();
    this.prune();
    return true;
  }

  private send(): void {
    const latest = this.nextFrame - 1 + INPUT_DELAY;
    const start = Math.max(this.remoteAck + 1, latest - RESEND + 1, 1);
    const b: number[] = [];
    for (let f = start; f <= latest; f++) b.push(this.local.get(f) ?? 0);
    const pkt: InPacket = { t: 'in', s: start, b, a: this.remoteContig, f: this.state.frame };
    this.link.send('game', pkt);
  }

  private onPacket(m: InPacket | HashPacket): void {
    if (m.t === 'hash') {
      this.theirHashes.set(m.f, m.h);
      this.compareHash(m.f);
      return;
    }
    if (m.t !== 'in') return;
    this.remoteAck = Math.max(this.remoteAck, m.a);
    this.remoteSimFrame = Math.max(this.remoteSimFrame, m.f);
    m.b.forEach((bits, k) => {
      const f = m.s + k;
      if (!this.remote.has(f)) this.remote.set(f, bits);
    });
    // Confirmar en orden los frames contiguos que ya llegaron
    while (this.remote.has(this.remoteContig + 1)) {
      const f = ++this.remoteContig;
      if (f <= this.state.frame) {
        try {
          const resim = this.session.confirm(this.remoteSlot, f, decodeInput(this.remote.get(f)!));
          if (resim > 0) this.stats.rollbacks++;
        } catch {
          // Fuera de la ventana: no debería pasar gracias a la espera de step()
        }
      }
    }
    this.recordHash();
  }

  /** Guarda el hash de cada frame múltiplo de 60 en cuanto está confirmado por los dos. */
  private recordHash(): void {
    const upTo = Math.min(this.remoteContig, this.state.frame);
    for (let f = upTo; f > upTo - MAX_ROLLBACK && f > 0; f--) {
      if (f % 60 !== 0 || this.myHashes.has(f)) continue;
      const h = f === this.state.frame ? hashState(this.state) : this.session.stateHashAfter(f);
      if (h === null) continue;
      this.myHashes.set(f, h);
      this.link.send('game', { t: 'hash', f, h } satisfies HashPacket);
      this.compareHash(f);
    }
  }

  private compareHash(f: number): void {
    const mine = this.myHashes.get(f);
    const theirs = this.theirHashes.get(f);
    if (mine === undefined || theirs === undefined || this.desync) return;
    if (mine !== theirs) {
      this.desync = true;
      this.onDesync(f);
    }
  }

  private prune(): void {
    const old = this.state.frame - 120;
    for (const map of [this.local, this.remote]) {
      for (const f of map.keys()) if (f < old) map.delete(f);
    }
    for (const map of [this.myHashes, this.theirHashes]) {
      for (const f of map.keys()) if (f < old - 600) map.delete(f);
    }
  }
}
