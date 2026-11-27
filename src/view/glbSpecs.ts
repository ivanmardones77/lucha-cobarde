import type { CharacterId } from '../core/types';
import type { GlbSpec } from './GlbFighter';
import titanGlbUrl from '../assets/models/titan.glb?url';
import ryujinGlbUrl from '../assets/models/ryujin.glb?url';
import kazeGlbUrl from '../assets/models/kaze.glb?url';

/**
 * Luchadores con modelo 3D (prueba, se activan con ?modelos3d o ?titan3d).
 * `impact` es el frame del clip (a 60 fps) en el que el golpe llega a su máximo alcance;
 * GlbFighter lo hace coincidir con el startup del golpe.
 */
export const GLB_SPECS: Partial<Record<CharacterId, GlbSpec>> = {
  TITAN: {
    url: titanGlbUrl,
    height: 2.0, // la caja de daño de Titán mide 1,9
    moves: {
      '5P': { clip: 'PUNCH_5P' },
      '2P': { clip: 'PUNCH_5P' },
      jP: { clip: 'PUNCH_5P' },
    },
    heavy: { clip: 'PUNCH_CROSS', impact: 19 },
  },
  RYUJIN: {
    url: ryujinGlbUrl,
    height: 1.85,
    moves: {
      '5P': { clip: 'M_JAB', start: 28, impact: 40 },
      '2P': { clip: 'M_JAB', start: 28, impact: 40 },
      jP: { clip: 'M_JAB', start: 28, impact: 40 },
      '5K': { clip: 'M_KICK', start: 30, impact: 47 },
      '6K': { clip: 'M_KICK', start: 24, impact: 47 },
      jK: { clip: 'M_KICK', start: 30, impact: 47 },
      '2K': { clip: 'M_SWEEP', start: 66, impact: 82 },
      '236K': { clip: 'M_SWEEP', start: 60, impact: 82 },
      '623P': { clip: 'M_UPPERCUT', start: 27, impact: 42 },
      '236P': { clip: 'M_HADOUKEN', start: 116, impact: 146 },
      j236P: { clip: 'M_HADOUKEN', start: 116, impact: 146 },
      '22P': { clip: 'M_HADOUKEN', start: 104, impact: 146 },
      '214P': { clip: 'M_HADOUKEN', start: 120, impact: 146 },
      SUPER: { clip: 'M_HADOUKEN', start: 116, impact: 146 },
    },
    heavy: { clip: 'PUNCH_CROSS', impact: 19 },
    block: { clip: 'M_BLOCK', hold: 74 },
  },
  KAZE: {
    url: kazeGlbUrl,
    height: 1.75,
    moves: {
      '5P': { clip: 'M_JAB', start: 30, impact: 40 },
      '2P': { clip: 'M_JAB', start: 30, impact: 40 },
      jP: { clip: 'M_JAB', start: 30, impact: 40 },
      '5K': { clip: 'M_KICK', start: 26, impact: 41 },
      '6K': { clip: 'M_KICK', start: 22, impact: 41 },
      jK: { clip: 'M_KICK', start: 26, impact: 41 },
      j214K: { clip: 'M_KICK', start: 26, impact: 41 },
      '2K': { clip: 'M_LOWSWEEP', start: 1, impact: 10 },
      '623P': { clip: 'M_RISING', start: 6, impact: 22 },
      '236P': { clip: 'M_THROW', start: 40, impact: 59 },
      j236P: { clip: 'M_THROW', start: 40, impact: 59 },
      '22P': { clip: 'M_THROW', start: 40, impact: 59 },
      '236K': { clip: 'M_SWEEP', start: 18, impact: 38 },
      '41236K': { clip: 'M_SWEEP', start: 18, impact: 38 },
    },
    heavy: { clip: 'PUNCH_CROSS', impact: 19 },
    block: { clip: 'M_BLOCK', hold: 73 },
  },
};
