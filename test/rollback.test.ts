// Rollback: guardar, volver atrás y re-simular debe dar exactamente el mismo estado.
// Ejecutar: npm test
import { FightingAI } from '../src/core/ai';
import { InputBuffer, RawInput } from '../src/core/inputBuffer';
import { hashState } from '../src/core/rng';
import { RollbackSession, restoreSnapshot, saveSnapshot } from '../src/core/rollback';
import { createMatchState, resetRoundState, stepSimulation } from '../src/core/simulation';

const N: RawInput = { up: false, down: false, left: false, right: false, p: false, k: false, t: false, s: false, dash: false };
const I = (o: Partial<RawInput>): RawInput => ({ ...N, ...o });

/** Secuencia fija que se repite en bucle */
function scripted(plan: [number, RawInput][], frame: number): RawInput {
  const total = plan.reduce((s, [n]) => s + n, 0);
  let f = frame % total;
  for (const [n, input] of plan) {
    if (f < n) return input;
    f -= n;
  }
  return N;
}

const P1_PLAN: [number, RawInput][] = [
  [30, I({ right: true })], [1, I({ p: true })], [12, N], [1, I({ down: true, k: true })], [14, N],
  [1, I({ up: true, right: true })], [40, N], [1, I({ down: true })], [1, I({ down: true, right: true })],
  [1, I({ right: true })], [1, I({ right: true, p: true })], [25, N], [20, I({ left: true })], [1, I({ t: true })], [18, N],
];
// El P2 cambia de input a menudo: así las predicciones fallan y hay rollbacks de verdad
const P2_PLAN: [number, RawInput][] = [
  [9, I({ left: true })], [1, I({ k: true })], [6, N], [4, I({ right: true })], [1, I({ p: true })],
  [3, N], [1, I({ down: true, p: true })], [7, I({ left: true, down: true })], [1, I({ up: true })],
  [22, N], [5, I({ right: true, dash: true })], [1, I({ t: true })], [8, N],
];

let bad = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${msg}`);
  if (!ok) bad++;
};

// 1) Guardar y restaurar con la IA jugando
{
  console.log('Guardar / restaurar (P1 guionizado vs IA Maestro):');
  const state = createMatchState('AI', 'KAZE', 'TITAN', 'ALLEY', 0, 0, 99);
  resetRoundState(state, true);
  const ai = new FightingAI();
  ai.setDifficulty('MASTER');
  const bufs: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const step = () => stepSimulation(state, [scripted(P1_PLAN, state.frame), ai.getInput(state)], bufs);

  for (let i = 0; i < 1500; i++) step();
  const snap = saveSnapshot(state, bufs, ai);
  for (let i = 0; i < 1500; i++) step();
  const a = hashState(state);

  restoreSnapshot(snap, state, bufs, ai);
  check(state.frame === snap.frame, `vuelve al frame ${snap.frame}`);
  for (let i = 0; i < 1500; i++) step();
  check(hashState(state) === a, `re-simular 1500 frames da el mismo estado (${a})`);

  // Sin restaurar la memoria de la IA, la partida se separa: demuestra que hay que guardarla
  restoreSnapshot(snap, state, bufs);
  ai.reset();
  for (let i = 0; i < 1500; i++) step();
  const diverged = hashState(state) !== a;
  console.log(`  ${diverged ? 'ok   ' : 'AVISO'} sin la memoria de la IA la partida diverge`);
}

// 2) Red simulada: el input remoto llega con retraso y se predice mientras tanto
for (const delay of [2, 5, 8]) {
  console.log(`Red simulada 2P, input remoto con ${delay} frames de retraso:`);
  const FRAMES = 3000;
  const truth = (frame: number): [RawInput, RawInput] => [scripted(P1_PLAN, frame), scripted(P2_PLAN, frame)];

  // Partida de referencia: los dos inputs reales desde el principio
  const ref = createMatchState('2P', 'RYUJIN', 'VOLT', 'ROOFTOP', 0, 0, 5);
  resetRoundState(ref, true);
  const refBufs: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const refHashes: Record<number, number> = {};
  for (let f = 1; f <= FRAMES; f++) {
    stepSimulation(ref, truth(f), refBufs);
    refHashes[f] = hashState(ref);
  }

  // Partida con rollback: P2 llega tarde
  const state = createMatchState('2P', 'RYUJIN', 'VOLT', 'ROOFTOP', 0, 0, 5);
  resetRoundState(state, true);
  const bufs: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const session = new RollbackSession(state, bufs, 8);
  for (let f = 1; f <= FRAMES; f++) {
    session.advance([truth(f)[0], null]);
    const late = f - delay;
    if (late >= 1) session.confirm(1, late, truth(late)[1]);
  }
  // Confirmar los últimos frames pendientes
  for (let f = FRAMES - delay + 1; f <= FRAMES; f++) session.confirm(1, f, truth(f)[1]);
  const final = hashState(state);
  check(final === refHashes[FRAMES], `estado final igual a la referencia (${final})`);
  check(session.rollbacks > 0, `${session.rollbacks} rollbacks, ${session.resimulatedFrames} frames re-simulados`);
}

// 3) Fuera de la ventana: corregir un frame demasiado antiguo debe fallar con un error claro
{
  const state = createMatchState('2P', 'KAZE', 'VALKYRIE', 'ALLEY', 0, 0, 1);
  resetRoundState(state, true);
  const bufs: [InputBuffer, InputBuffer] = [new InputBuffer(), new InputBuffer()];
  const session = new RollbackSession(state, bufs, 8);
  for (let f = 1; f <= 30; f++) session.advance([N, null]);
  let threw = false;
  try {
    session.confirm(1, 10, I({ p: true }));
  } catch {
    threw = true;
  }
  console.log('Ventana de rollback:');
  check(threw, 'corregir un frame de hace más de 8 frames da error');
}

if (bad) {
  console.log('ROLLBACK FALLA');
  process.exit(1);
}
console.log('ROLLBACK OK');
