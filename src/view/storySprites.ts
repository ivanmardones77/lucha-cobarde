import kazeSheet from '../assets/images/story/kaze_historia.webp';
import ryujinSheet from '../assets/images/story/ryujin_historia.webp';
import titanSheet from '../assets/images/story/titan_historia.webp';
import valkyrieSheet from '../assets/images/story/valkyrie_historia.webp';
import voltSheet from '../assets/images/story/volt_historia.webp';
import alleyBg from '../assets/images/story/bg_alley.webp';
import rooftopBg from '../assets/images/story/bg_rooftop.webp';
import type { CharacterId, StageId } from '../core/types';

/**
 * Hojas de sprites del modo historia: cuadrícula 4×4 de viñetas 384×512 (orden por filas),
 * con el apoyo de los pies en (192, 492). Viñetas 0–7: reposo; 8–15: hablando.
 */
export const SHEET_COLS = 4;
export const SHEET_ROWS = 4;

export type StoryClip = 'idle' | 'talk';
export const STORY_CLIPS: Record<StoryClip, { first: number; count: number; fps: number }> = {
  idle: { first: 0, count: 8, fps: 5 },
  talk: { first: 8, count: 8, fps: 7 },
};

/** Hacia dónde mira el dibujo original (se voltea para que mire al centro). */
export const STORY_SPRITES: Record<CharacterId, { sheet: string; facing: 'left' | 'right' }> = {
  RYUJIN: { sheet: ryujinSheet, facing: 'right' },
  KAZE: { sheet: kazeSheet, facing: 'left' },
  VOLT: { sheet: voltSheet, facing: 'right' },
  VALKYRIE: { sheet: valkyrieSheet, facing: 'left' },
  TITAN: { sheet: titanSheet, facing: 'left' },
};

export const STORY_BACKGROUNDS: Record<StageId, string> = {
  ALLEY: alleyBg,
  ROOFTOP: rooftopBg,
};

/** Posición CSS de una viñeta con background-size 400% 400%. */
export function framePosition(frame: number): string {
  const col = frame % SHEET_COLS;
  const row = Math.floor(frame / SHEET_COLS);
  return `${(col * 100) / (SHEET_COLS - 1)}% ${(row * 100) / (SHEET_ROWS - 1)}%`;
}

let preloaded = false;
/** Descarga las hojas antes de la primera escena para que no aparezcan a medias. */
export function preloadStorySprites(): void {
  if (preloaded) return;
  preloaded = true;
  for (const s of Object.values(STORY_SPRITES)) new Image().src = s.sheet;
  for (const url of Object.values(STORY_BACKGROUNDS)) new Image().src = url;
}
