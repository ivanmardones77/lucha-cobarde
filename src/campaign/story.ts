/**
 * Modo Historia: capítulos como datos (DIALOGUE → MATCH → DIALOGUE → UNLOCK).
 * Mismo esquema que fighting-studio (game/story/*.json), escrito en TS para
 * que el compilador compruebe personajes y escenarios.
 */
import type { AiDifficulty } from '../core/ai';
import { CHARACTERS, CharacterId, StageId } from '../core/types';

export type Side = 'LEFT' | 'RIGHT';

export interface DialogueLine {
  /** Personaje que habla o 'narrator' */
  speakerId: CharacterId | 'narrator';
  side: Side;
  text: string;
}

export type StoryNode =
  | { type: 'DIALOGUE'; skippable: true; stageId?: StageId; lines: DialogueLine[] }
  | {
      type: 'MATCH';
      playerCharacter: CharacterId;
      opponentCharacter: CharacterId;
      stageId: StageId;
      aiDifficulty: AiDifficulty;
      /** Multiplicador de vida del rival (jefes) */
      opponentHp?: number;
      retryable: true;
    }
  | { type: 'UNLOCK'; reward: { key: string; text: string } };

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  nodes: StoryNode[];
}

const STAGES: StageId[] = ['ALLEY', 'ROOFTOP'];

/** Errores de estructura de un capítulo (vacío = válido) */
export function validateChapter(ch: Chapter): string[] {
  const errs: string[] = [];
  const types = ch.nodes.map((n) => n.type);
  if (!types.includes('MATCH')) errs.push(`${ch.id}: no tiene ningún combate`);
  if (!types.includes('UNLOCK')) errs.push(`${ch.id}: no tiene recompensa (UNLOCK)`);
  const last = types[types.length - 1];
  if (last !== 'UNLOCK' && last !== 'DIALOGUE') errs.push(`${ch.id}: debe terminar en UNLOCK o DIALOGUE`);
  ch.nodes.forEach((n, i) => {
    const w = `${ch.id} nodo ${i} (${n.type})`;
    if (n.type === 'DIALOGUE') {
      if (n.lines.length === 0) errs.push(`${w}: sin líneas`);
      for (const l of n.lines) {
        if (!l.text.trim()) errs.push(`${w}: línea vacía`);
        if (l.speakerId !== 'narrator' && !CHARACTERS[l.speakerId]) errs.push(`${w}: ${l.speakerId} no existe`);
      }
      if (n.stageId && !STAGES.includes(n.stageId)) errs.push(`${w}: escenario ${n.stageId} no existe`);
    } else if (n.type === 'MATCH') {
      if (!CHARACTERS[n.playerCharacter]) errs.push(`${w}: ${n.playerCharacter} no existe`);
      if (!CHARACTERS[n.opponentCharacter]) errs.push(`${w}: ${n.opponentCharacter} no existe`);
      if (!STAGES.includes(n.stageId)) errs.push(`${w}: escenario ${n.stageId} no existe`);
      if (n.opponentHp !== undefined && (n.opponentHp < 1 || n.opponentHp > 1.5))
        errs.push(`${w}: opponentHp fuera de 1–1,5 (jefe justo)`);
    } else if (!n.reward.text.trim()) {
      errs.push(`${w}: recompensa sin texto`);
    }
  });
  return errs;
}

/** Escenario que se ve de fondo en un nodo de diálogo: el suyo o el del próximo combate */
export function backdropFor(ch: Chapter, index: number): StageId {
  const n = ch.nodes[index];
  if (n?.type === 'DIALOGUE' && n.stageId) return n.stageId;
  for (let i = index; i < ch.nodes.length; i++) {
    const m = ch.nodes[i];
    if (m.type === 'MATCH') return m.stageId;
  }
  for (let i = index; i >= 0; i--) {
    const m = ch.nodes[i];
    if (m.type === 'MATCH') return m.stageId;
  }
  return 'ALLEY';
}
