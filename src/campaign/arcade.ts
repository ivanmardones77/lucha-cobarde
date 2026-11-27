/**
 * Modo Arcade: escalera de 5 combates con dificultad creciente, rival y jefe.
 * Lógica pura (sin DOM) para poder probarla en Node.
 */
import type { AiDifficulty } from '../core/ai';
import type { CharacterId, StageId } from '../core/types';
import { ARCADE_BOSS, ARCADE_RIVAL } from './data/arcadeText';

export const ROSTER: CharacterId[] = ['KAZE', 'RYUJIN', 'TITAN', 'VALKYRIE', 'VOLT'];

export type ArcadeRank = 'S' | 'A' | 'B' | 'C';
export type StepKind = 'NORMAL' | 'MIRROR' | 'RIVAL' | 'BOSS';

export interface ArcadeStep {
  rival: CharacterId;
  stage: StageId;
  difficulty: AiDifficulty;
  kind: StepKind;
  /** Multiplicador de vida del rival */
  rivalHp: number;
}

export const ARCADE_CONTINUES = 3;
export const BOSS_HP = 1.3;

/**
 * 1-2: dos luchadores del plantel (Normal) · 3: tu sombra (espejo, Competitivo)
 * 4: tu rival (Competitivo) · 5: el jefe (Maestro, +30 % de vida, azotea)
 */
export function buildLadder(player: CharacterId): ArcadeStep[] {
  const rival = ARCADE_RIVAL[player];
  const boss = ARCADE_BOSS[player];
  const others = ROSTER.filter((id) => id !== player && id !== rival && id !== boss);
  // Si rival y jefe coinciden con el plantel justo, puede quedar uno solo: se repite
  const o1 = others[0] ?? rival;
  const o2 = others[1] ?? others[0] ?? rival;
  return [
    { rival: o1, stage: 'ALLEY', difficulty: 'NORMAL', kind: 'NORMAL', rivalHp: 1 },
    { rival: o2, stage: 'ROOFTOP', difficulty: 'NORMAL', kind: 'NORMAL', rivalHp: 1 },
    { rival: player, stage: 'ALLEY', difficulty: 'HARD', kind: 'MIRROR', rivalHp: 1 },
    { rival, stage: 'ROOFTOP', difficulty: 'HARD', kind: 'RIVAL', rivalHp: 1 },
    { rival: boss, stage: 'ROOFTOP', difficulty: 'MASTER', kind: 'BOSS', rivalHp: BOSS_HP },
  ];
}

const LEVEL: Record<AiDifficulty, number> = { NORMAL: 1, HARD: 2, MASTER: 3 };

export interface FightResult {
  difficulty: AiDifficulty;
  /** El P1 terminó el último asalto sin recibir daño */
  perfect: boolean;
  /** Segundos que quedaban en el reloj */
  secondsLeft: number;
  maxCombo: number;
}

export interface ScoreBreakdown {
  base: number;
  perfect: number;
  time: number;
  combo: number;
  total: number;
}

export function scoreFight(r: FightResult): ScoreBreakdown {
  const base = 1000 * LEVEL[r.difficulty];
  const perfect = r.perfect ? 1500 : 0;
  const time = Math.max(0, Math.floor(r.secondsLeft)) * 10;
  const combo = Math.max(0, r.maxCombo) * 100;
  return { base, perfect, time, combo, total: base + perfect + time + combo };
}

/** Rango final según la media por combate; usar continuaciones limita a A */
export function rankFor(totalScore: number, fights: number, continuesUsed: number): ArcadeRank {
  const per = totalScore / Math.max(1, fights);
  let rank: ArcadeRank = per >= 3600 ? 'S' : per >= 2800 ? 'A' : per >= 2000 ? 'B' : 'C';
  if (continuesUsed > 0 && rank === 'S') rank = 'A';
  return rank;
}

/** Cada continuación cuesta un 10 % de la puntuación acumulada */
export const applyContinuePenalty = (score: number): number => Math.floor(score * 0.9);
