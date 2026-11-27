import type { MatchState } from './types';

export const DEFAULT_MATCH_SEED = 0x5eed1234;

/**
 * PRNG determinista (mulberry32). Su estado vive en MatchState.rngState,
 * así dos partidas con la misma semilla y los mismos inputs dan lo mismo,
 * y un snapshot del estado (repeticiones, rollback) incluye el azar.
 * Devuelve un número en [0, 1), como Math.random().
 */
export function nextRandom(state: MatchState): number {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Hash FNV-1a de todo el estado de la partida, salvo `events`
 * (cola de audio/VFX que se vacía cada tick). Para tests de determinismo.
 */
export function hashState(state: MatchState): number {
  const json = JSON.stringify(state, (key, value) =>
    key === 'events' ? undefined : value
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
