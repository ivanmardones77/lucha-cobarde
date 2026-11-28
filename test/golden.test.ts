// Hashes dorados: partidas con entradas fijas cuyo hash final está guardado en test/golden/hashes.json.
//
// determinismo.test.ts compara dos corridas entre sí: detecta no determinismo, pero NO un cambio de
// datos o de comportamiento (mover los datos de los luchadores a otro sitio con un error de tecleo
// pasaría igualmente). Este test sí: cualquier cambio en CHARACTERS, en la simulación o en la IA
// cambia algún hash y falla.
//
// Ejecutar: npm test            (compara con lo guardado)
//           npx tsx test/golden.test.ts --update   (regenera; solo cuando el cambio es intencionado)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FightingAI } from '../src/core/ai';
import { InputBuffer, RawInput } from '../src/core/inputBuffer';
import { hashState } from '../src/core/rng';
import { createMatchState, resetRoundState, resetTrainingPosition, stepSimulation } from '../src/core/simulation';
import { CHARACTERS, type CharacterId, type StageId } from '../src/core/types';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'golden');
const HASHES = resolve(DIR, 'hashes.json');
const CHARS_DUMP = resolve(DIR, 'characters.json');
const UPDATE = process.argv.includes('--update');

const N: RawInput = { up: false, down: false, left: false, right: false, p: false, k: false, t: false, s: false, dash: false };
const I = (o: Partial<RawInput>): RawInput => ({ ...N, ...o });

// Dos guiones del P1. El A es el de determinismo.test.ts; el B añade movimientos que el A no toca
// (dragón, bola de energía, patada giratoria, 22P, golpes fuertes y dash).
const PLAN_A: [number, RawInput][] = [
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
const PLAN_B: [number, RawInput][] = [
  [12, I({ right: true, dash: true })], [20, I({ right: true })],
  [1, I({ right: true })], [1, I({ down: true })], [1, I({ down: true, right: true, p: true })], [40, N], // 623P
  [1, I({ down: true })], [1, I({ down: true, left: true })], [1, I({ left: true, k: true })], [40, N], // 214K
  [2, I({ down: true })], [2, N], [1, I({ down: true, p: true })], [45, N], // 22P
  [1, I({ right: true, p: true })], [25, N], // 6P
  [1, I({ right: true, k: true })], [25, N], // 6K
  [1, I({ down: true })], [1, I({ down: true, right: true })], [1, I({ right: true, k: true })], [40, N], // 236K
  [1, I({ up: true })], [18, N], [1, I({ p: true })], [1, I({ k: true })], [30, N], // salto con golpes
  [20, I({ left: true })], [1, I({ down: true, p: true })], [12, N],
];

const FRAMES = 2400;
const CHECKPOINTS = [300, 1200, FRAMES];

const ROSTER: CharacterId[] = ['RYUJIN', 'KAZE', 'TITAN', 'VALKYRIE', 'VOLT'];
const STAGES: StageId[] = ['ALLEY', 'ROOFTOP'];

interface Scenario {
  label: string;
  p1: CharacterId;
  p2: CharacterId;
  stage: StageId;
  plan: [number, RawInput][];
  p1Palette: 0 | 1;
  difficulty: 'NORMAL' | 'HARD' | 'MASTER';
}

// Todos los pares ordenados (20): cada personaje juega de P1 (guion fijo) y de P2 (IA)
const SCENARIOS: Scenario[] = [];
let n = 0;
for (const p1 of ROSTER) {
  for (const p2 of ROSTER) {
    if (p1 === p2) continue;
    SCENARIOS.push({
      label: `${p1}-${p2}`,
      p1,
      p2,
      stage: STAGES[n % 2],
      plan: n % 2 === 0 ? PLAN_A : PLAN_B,
      p1Palette: n % 3 === 0 ? 1 : 0,
      difficulty: (['NORMAL', 'HARD', 'MASTER'] as const)[n % 3],
    });
    n++;
  }
}
// Espejos (mismo personaje en los dos lados: la paleta del P2 cambia sola)
for (const c of ROSTER) {
  SCENARIOS.push({ label: `${c}-${c}`, p1: c, p2: c, stage: 'ALLEY', plan: PLAN_B, p1Palette: 0, difficulty: 'HARD' });
}

function run(s: Scenario): Record<string, number> {
  const state = createMatchState('AI', s.p1, s.p2, s.stage, s.p1Palette, 0, 7);
  resetRoundState(state, true);
  const ai = new FightingAI();
  ai.setDifficulty(s.difficulty);
  const bufs: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const out: Record<string, number> = {};
  let f = 0;
  while (f < FRAMES) {
    for (const [len, input] of s.plan) {
      for (let i = 0; i < len && f < FRAMES; i++) {
        stepSimulation(state, [input, ai.getInput(state)], bufs);
        f++;
        if (CHECKPOINTS.includes(f)) out[String(f)] = hashState(state);
      }
    }
  }
  return out;
}


// ---------------------------------------------------------------------------------------------
// Barrido de movimientos: cada uno de los 26 movimientos de cada luchador, de lejos (falla el golpe)
// y a quemarropa (conecta). El guion de cada movimiento es la entrada real que lo activa; si no lo
// activa, el test falla, así que la cobertura queda comprobada y no supuesta.
// ---------------------------------------------------------------------------------------------
const f1 = (o: Partial<RawInput>, n = 1): RawInput[] => Array.from({ length: n }, () => I(o));
const SWEEP_SCRIPTS: Record<string, RawInput[]> = {
  '5P': f1({ p: true }),
  '5K': f1({ k: true }),
  '2P': [...f1({ down: true }), ...f1({ down: true, p: true })],
  '2K': [...f1({ down: true }), ...f1({ down: true, k: true })],
  '6P': [...f1({ right: true }), ...f1({ right: true, p: true })],
  '6K': [...f1({ right: true }), ...f1({ right: true, k: true })],
  jP: [...f1({ up: true }), ...f1({}, 10), ...f1({ p: true })],
  jK: [...f1({ up: true }), ...f1({}, 10), ...f1({ k: true })],
  j236P: [...f1({ up: true }), ...f1({}, 8), ...f1({ down: true }), ...f1({ down: true, right: true }), ...f1({ right: true, p: true })],
  j214K: [...f1({ up: true }), ...f1({}, 8), ...f1({ down: true }), ...f1({ down: true, left: true }), ...f1({ left: true, k: true })],
  '236P': [...f1({ down: true }), ...f1({ down: true, right: true }), ...f1({ right: true, p: true })],
  '236K': [...f1({ down: true }), ...f1({ down: true, right: true }), ...f1({ right: true, k: true })],
  '623P': [...f1({ right: true }), ...f1({ down: true }), ...f1({ down: true, right: true, p: true })],
  '214P': [...f1({ down: true }), ...f1({ down: true, left: true }), ...f1({ left: true, p: true })],
  '214K': [...f1({ down: true }), ...f1({ down: true, left: true }), ...f1({ left: true, k: true })],
  '22P': [...f1({ down: true }), ...f1({}), ...f1({ down: true }), ...f1({ down: true, p: true })],
  '41236K': [...f1({ left: true }), ...f1({ left: true, down: true }), ...f1({ down: true }), ...f1({ down: true, right: true }), ...f1({ right: true, k: true, p: true })],
  '63214T': [...f1({ right: true }), ...f1({ right: true, down: true }), ...f1({ down: true }), ...f1({ down: true, left: true }), ...f1({ left: true, t: true, p: true })],
  THROW: f1({ t: true }),
  FOCUS: f1({ p: true, k: true }),
  ROLL: f1({ p: true, t: true }),
  EX_623P: [...f1({ right: true }), ...f1({ down: true }), ...f1({ down: true, right: true, p: true, k: true })],
  EX_236K: [...f1({ down: true }), ...f1({ down: true, right: true }), ...f1({ right: true, k: true, t: true })],
  EX_236P: [...f1({ down: true }), ...f1({ down: true, right: true }), ...f1({ right: true, p: true, k: true })],
  EX_214P: [...f1({ down: true }), ...f1({ down: true, left: true }), ...f1({ left: true, p: true, k: true })],
  SUPER: f1({ s: true }),
};

const sweepMoves = Object.keys(SWEEP_SCRIPTS);
const NO_METER = new Set(['41236K']);
const sweepErrors: string[] = [];

function sweepOne(c: CharacterId, move: string, near: boolean): Record<string, number> {
  const state = createMatchState('AI', c, c === 'RYUJIN' ? 'KAZE' : 'RYUJIN', 'ALLEY', 0, 0, 11);
  resetRoundState(state, true);
  const bufs: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const step = (i1: RawInput) => stepSimulation(state, [i1, N], bufs);
  for (let i = 0; i < 140; i++) step(N); // intro
  const p1 = state.fighters[0];
  p1.superMeter = NO_METER.has(move) ? 0 : 100; // con barra, la entrada de 41236K se leería como EX
  state.fighters[1].superMeter = 0;
  if (near) state.fighters[1].x = p1.x + 0.9;
  const seen = new Set<string>();
  const out: Record<string, number> = {};
  for (const input of SWEEP_SCRIPTS[move]) {
    step(input);
    if (p1.moveId) seen.add(p1.moveId);
  }
  for (let i = 1; i <= 90; i++) {
    step(N);
    if (p1.moveId) seen.add(p1.moveId);
    if (i === 20) out.a = hashState(state);
  }
  out.b = hashState(state);
  if (!seen.has(move)) sweepErrors.push(`${c} ${move} (${near ? 'cerca' : 'lejos'}): el guion no activó el movimiento (vio: ${[...seen].join(',') || 'ninguno'})`);
  return out;
}

// Intros: hash a mitad y al final de la coreografía de entrada de cada personaje
function introHashes(c: CharacterId): Record<string, number> {
  const state = createMatchState('AI', c, c === 'RYUJIN' ? 'KAZE' : 'RYUJIN', 'ALLEY', 0, 0, 11);
  resetRoundState(state, true);
  const bufs: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const out: Record<string, number> = {};
  for (let i = 1; i <= 125; i++) {
    stepSimulation(state, [N, N], bufs);
    if ([1, 10, 20, 28, 30, 45, 60, 75, 90, 119].includes(i)) out[String(i)] = hashState(state);
  }
  return out;
}


// Entrenamiento: las tres posiciones de partida (centro y esquinas) con el modo TRAINING (sin intro,
// barra llena), el guion B del P1 y la IA del P2 (se usa de sparring).
function trainingHashes(c: CharacterId, pos: 'CENTER' | 'CORNER_L' | 'CORNER_R'): Record<string, number> {
  const state = createMatchState('TRAINING', c, c === 'TITAN' ? 'KAZE' : 'TITAN', 'ROOFTOP', 0, 0, 13);
  resetRoundState(state, true);
  resetTrainingPosition(state, pos);
  const ai = new FightingAI();
  ai.setDifficulty('HARD');
  const bufs: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const out: Record<string, number> = {};
  let f = 0;
  while (f < 900) {
    for (const [len, input] of PLAN_B) {
      for (let i = 0; i < len && f < 900; i++) {
        stepSimulation(state, [input, ai.getInput(state)], bufs);
        f++;
        if (f === 5 || f === 300 || f === 900) out[String(f)] = hashState(state);
      }
    }
  }
  return out;
}

// Los datos de los luchadores completos, en JSON legible (referencia para la extracción a packs)
const charactersJson = JSON.stringify(CHARACTERS, null, 1);
function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

type HashMap = Record<string, Record<string, number>>;
const current: { characters: number; matches: HashMap; sweep: HashMap; intro: HashMap; training: HashMap } = {
  characters: fnv(JSON.stringify(CHARACTERS)),
  matches: {},
  sweep: {},
  intro: {},
  training: {},
};
for (const s of SCENARIOS) current.matches[s.label] = run(s);
for (const c of ROSTER) {
  current.intro[c] = introHashes(c);
  for (const pos of ['CENTER', 'CORNER_L', 'CORNER_R'] as const) current.training[`${c}:${pos}`] = trainingHashes(c, pos);
  for (const mv of sweepMoves) for (const near of [false, true]) current.sweep[`${c}:${mv}:${near ? 'cerca' : 'lejos'}`] = sweepOne(c, mv, near);
}
if (sweepErrors.length) {
  console.log('Barrido de movimientos: hay guiones que no activan su movimiento');
  for (const e of sweepErrors) console.log('  FALLA ' + e);
  process.exit(1);
}

if (UPDATE) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(HASHES, JSON.stringify(current, null, 1) + '\n');
  writeFileSync(CHARS_DUMP, charactersJson + '\n');
  console.log(`Guardados ${SCENARIOS.length} escenarios en ${HASHES}`);
  process.exit(0);
}

if (!existsSync(HASHES)) {
  console.log('FALTA test/golden/hashes.json: genéralo con  npx tsx test/golden.test.ts --update');
  process.exit(1);
}
const saved = JSON.parse(readFileSync(HASHES, 'utf8')) as typeof current;

let bad = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    console.log(`  FALLA ${msg}`);
    bad++;
  }
};
console.log('Hashes dorados:');
check(saved.characters === current.characters, `los datos de CHARACTERS cambiaron (${saved.characters} → ${current.characters})`);
const compare = (name: string, exp: HashMap | undefined, got: HashMap) => {
  if (!exp) return check(false, `${name}: sin hashes guardados`);
  for (const [label, hs] of Object.entries(got)) {
    const e = exp[label];
    if (!e) {
      check(false, `${name} ${label}: sin hash guardado`);
      continue;
    }
    for (const [k, h] of Object.entries(hs)) check(e[k] === h, `${name} ${label} @${k}: ${e[k]} → ${h}`);
  }
  for (const label of Object.keys(exp)) check(label in got, `${name} ${label}: guardado pero ya no existe en el test`);
};
compare('partida', saved.matches, current.matches);
compare('barrido', saved.sweep, current.sweep);
compare('intro', saved.intro, current.intro);
compare('entrenamiento', saved.training, current.training);

if (bad) {
  console.log(`GOLDEN FALLA (${bad} diferencias). Si el cambio es intencionado: npx tsx test/golden.test.ts --update`);
  process.exit(1);
}
console.log(`  ok   ${SCENARIOS.length} partidas, ${Object.keys(current.sweep).length} movimientos del barrido (${sweepMoves.length} por luchador, cerca y lejos), ${ROSTER.length} intros, ${Object.keys(current.training).length} sesiones de entrenamiento y datos de CHARACTERS`);
console.log('GOLDEN OK');
