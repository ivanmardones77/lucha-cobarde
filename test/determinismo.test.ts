// Determinismo: la misma partida (misma semilla, mismos inputs del P1, IA en el P2),
// ejecutada dos veces, debe dar exactamente el mismo estado frame a frame.
// Ejecutar: npm test
import { FightingAI, AiDifficulty } from '../src/core/ai';
import { InputBuffer, RawInput } from '../src/core/inputBuffer';
import { hashState } from '../src/core/rng';
import { createMatchState, resetRoundState, stepSimulation } from '../src/core/simulation';
import type { CharacterId } from '../src/core/types';

const N: RawInput = { up: false, down: false, left: false, right: false, p: false, k: false, t: false, s: false, dash: false };
const I = (o: Partial<RawInput>): RawInput => ({ ...N, ...o });

// Secuencia fija del P1 (se repite): camina, golpea, bajo, salta, 236P, agarre…
const PLAN: [number, RawInput][] = [
  [40, I({ right: true })],
  [1, I({ p: true })], [20, N],
  [1, I({ down: true, k: true })], [20, N],
  [1, I({ up: true, right: true })], [45, N],
  [1, I({ down: true })], [1, I({ down: true, right: true })],
  [1, I({ right: true })], [1, I({ right: true, p: true })], [30, N],
  [30, I({ left: true })],
  [1, I({ t: true })], [25, N],
  [1, I({ k: true })], [1, I({ p: true })], [15, I({ down: true, left: true })],
];

const CHECKPOINTS = [60, 600, 1800, 3600, 6000];
const FRAMES = 6000;

function run(seed: number, p1: CharacterId, p2: CharacterId, diff: AiDifficulty) {
  const state = createMatchState('AI', p1, p2, 'ALLEY', 0, 0, seed);
  resetRoundState(state, true);
  const ai = new FightingAI();
  ai.setDifficulty(diff);
  const bufs: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const hashes: Record<number, number> = {};
  let f = 0;
  while (f < FRAMES) {
    for (const [n, input] of PLAN) {
      for (let i = 0; i < n && f < FRAMES; i++) {
        const p2Input = ai.getInput(state);
        stepSimulation(state, [input, p2Input], bufs);
        f++;
        if (CHECKPOINTS.includes(f)) hashes[f] = hashState(state);
      }
    }
  }
  return { hashes, hp: state.fighters.map((x) => x.hp), round: state.round };
}

const MATCHUPS: [CharacterId, CharacterId, AiDifficulty][] = [
  ['RYUJIN', 'KAZE', 'HARD'],
  ['TITAN', 'VOLT', 'MASTER'],
  ['VALKYRIE', 'RYUJIN', 'NORMAL'],
];

let bad = 0;
for (const [p1, p2, diff] of MATCHUPS) {
  console.log(`${p1} vs ${p2} (IA ${diff}):`);
  const A = run(7, p1, p2, diff);
  const B = run(7, p1, p2, diff);
  for (const k of CHECKPOINTS) {
    const same = A.hashes[k] === B.hashes[k];
    console.log(`  ${same ? 'ok   ' : 'FALLA'} frame ${k}: ${A.hashes[k]} / ${B.hashes[k]}`);
    if (!same) bad++;
  }
  const C = run(8, p1, p2, diff);
  console.log(`  ${A.hashes[FRAMES] !== C.hashes[FRAMES] ? 'ok   ' : 'AVISO'} otra semilla da otra partida`);
}

if (bad) {
  console.log('DESYNC');
  process.exit(1);
}
console.log('DETERMINISTA');
