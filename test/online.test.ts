// Netcode online: dos partidas con rollback unidas por un enlace simulado (retraso,
// variación y pérdida de paquetes) deben acabar exactamente en el mismo estado.
// Ejecutar: npm test
import { InputBuffer, RawInput } from '../src/core/inputBuffer';
import { hashState } from '../src/core/rng';
import { createMatchState, resetRoundState } from '../src/core/simulation';
import type { GameLink, LinkState } from '../src/net/GameLink';
import { OnlineMatch } from '../src/net/OnlineMatch';

// performance.now no existe igual en todos los entornos de test: el enlace falso no lo usa
class FakeLink implements GameLink {
  state: LinkState = 'direct';
  rtt: number;
  onState: (s: LinkState) => void = () => undefined;
  onGame: (d: unknown) => void = () => undefined;
  onCtrl: (d: unknown) => void = () => undefined;
  other!: FakeLink;
  private queue: { at: number; data: unknown }[] = [];
  tick = 0;
  constructor(private delayTicks: number, private jitter: number, private loss: number, private rand: () => number) {
    this.rtt = (delayTicks * 2 * 1000) / 60;
  }
  send(channel: 'game' | 'ctrl', data: unknown): void {
    if (channel === 'game' && this.rand() < this.loss) return; // paquete perdido
    const at = this.tick + this.delayTicks + Math.floor(this.rand() * (this.jitter + 1));
    this.other.queue.push({ at, data: structuredClone(data) });
  }
  deliver(): void {
    this.tick++;
    const ready = this.queue.filter((m) => m.at <= this.tick);
    this.queue = this.queue.filter((m) => m.at > this.tick);
    for (const m of ready) this.onGame(m.data);
  }
  close(): void {}
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomInput(r: () => number): RawInput {
  const dir = Math.floor(r() * 9);
  return {
    up: dir === 0 || dir === 1, down: dir === 2 || dir === 3, left: dir === 1 || dir === 3 || dir === 4, right: dir === 0 || dir === 2 || dir === 5,
    p: r() < 0.12, k: r() < 0.1, t: r() < 0.02, s: r() < 0.01, dash: r() < 0.03,
  };
}

function run(name: string, delay: number, jitter: number, loss: number, frames: number): boolean {
  const netRand = lcg(7);
  const a = new FakeLink(delay, jitter, loss, netRand);
  const b = new FakeLink(delay, jitter, loss, netRand);
  a.other = b;
  b.other = a;
  const mk = () => {
    const s = createMatchState('2P', 'RYUJIN', 'KAZE', 'ALLEY', 0, 0, 12345);
    resetRoundState(s, true);
    return s;
  };
  const sa = mk();
  const sb = mk();
  const ba: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const bb: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const ma = new OnlineMatch(sa, ba, a, 0);
  const mb = new OnlineMatch(sb, bb, b, 1);
  const ra = lcg(1);
  const rb = lcg(2);
  let desync = false;
  ma.onDesync = mb.onDesync = () => (desync = true);
  let ticks = 0;
  while ((sa.frame < frames || sb.frame < frames) && ticks < frames * 3) {
    ticks++;
    a.deliver();
    b.deliver();
    if (sa.frame < frames) ma.step(randomInput(ra));
    if (sb.frame < frames) mb.step(randomInput(rb));
  }
  // Terminar de entregar lo pendiente para que se confirmen los últimos frames
  for (let i = 0; i < delay + jitter + 4; i++) {
    a.deliver();
    b.deliver();
  }
  const ha = hashState(sa);
  const hb = hashState(sb);
  const ok = sa.frame === sb.frame && ha === hb && !desync;
  console.log(
    `  ${name}: frames ${sa.frame}/${sb.frame}, rollbacks ${ma.stats.rollbacks}/${mb.stats.rollbacks}, esperas ${ma.stats.stalls}/${mb.stats.stalls} → ${ok ? 'iguales' : 'DISTINTOS'}`
  );
  return ok;
}

console.log('Online (rollback por red simulada):');
const results = [
  run('red local (0 ms)', 0, 0, 0, 1800),
  run('100 ms ida y vuelta', 3, 0, 0, 1800),
  run('150 ms, variación y 10 % de pérdida', 4, 2, 0.1, 1800),
];
if (results.every(Boolean)) console.log('ONLINE OK');
else {
  console.log('ONLINE FALLA');
  process.exit(1);
}
