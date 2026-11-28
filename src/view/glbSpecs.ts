import type { CharacterId } from '../core/types';
import type { GlbSpec } from './GlbFighter';
import titanGlbUrl from '../assets/models/titan.glb?url';
import ryujinGlbUrl from '../assets/models/ryujin.glb?url';
import kazeGlbUrl from '../assets/models/kaze.glb?url';
import valkyrieGlbUrl from '../assets/models/valkyrie.glb?url';
import voltGlbUrl from '../assets/models/volt.glb?url';

/**
 * Luchadores con modelo 3D (activos por defecto; ?sin3d los desactiva).
 * `impact` es el frame del clip (a 60 fps) en el que el golpe llega a su máximo alcance;
 * GlbFighter lo hace coincidir con el startup del golpe.
 */
/** Ataques aéreos hechos desde la guardia de cada personaje (mismos nombres de clip en todos los GLB). */
const AIR_PUNCH = { clip: 'M_AIRPUNCH', start: 1, impact: 9 };
const AIR_KICK = { clip: 'M_AIRKICK', start: 1, impact: 10 };

export const GLB_SPECS: Partial<Record<CharacterId, GlbSpec>> = {
  TITAN: {
    url: titanGlbUrl,
    height: 2.0, // la caja de daño de Titán mide 1,9
    moves: {
      '5P': { clip: 'PUNCH_5P' },
      '2P': { clip: 'PUNCH_5P', crouch: true },
      jP: AIR_PUNCH,
      jK: AIR_KICK,
      j214K: AIR_KICK,
    },
    heavy: { clip: 'PUNCH_CROSS', impact: 19 },
  },
  RYUJIN: {
    url: ryujinGlbUrl,
    height: 1.85,
    moves: {
      '5P': { clip: 'M_JAB', start: 28, impact: 40 },
      '2P': { clip: 'M_JAB', start: 28, impact: 40, crouch: true },
      jP: AIR_PUNCH,
      '5K': { clip: 'M_KICK', start: 30, impact: 47 },
      '6K': { clip: 'M_KICK', start: 24, impact: 47 },
      jK: AIR_KICK,
      j214K: AIR_KICK,
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
      '2P': { clip: 'M_JAB', start: 30, impact: 40, crouch: true },
      jP: AIR_PUNCH,
      '5K': { clip: 'M_KICK', start: 26, impact: 41 },
      '6K': { clip: 'M_KICK', start: 22, impact: 41 },
      jK: AIR_KICK,
      j214K: AIR_KICK,
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
    // Coleta de pinchos: cadena de 3 huesos añadida en Blender (kaze_poc.blend)
    springs: [{ bones: ['Hair_01', 'Hair_02', 'Hair_03'], stiffness: 0.28, damping: 0.24, gravity: 1.5, maxAngle: 0.4 }],
  },
  VALKYRIE: {
    url: valkyrieGlbUrl,
    height: 1.8,
    moves: {
      '5P': { clip: 'M_JAB', start: 30, impact: 40 },
      '2P': { clip: 'M_JAB', start: 30, impact: 40, crouch: true },
      jP: AIR_PUNCH,
      '5K': { clip: 'M_KICK', start: 26, impact: 41 },
      '6K': { clip: 'M_KICK', start: 22, impact: 41 },
      jK: AIR_KICK,
      j214K: AIR_KICK,
      '2K': { clip: 'M_LOWSWEEP', start: 1, impact: 10 },
      '6P': { clip: 'M_SLAM', start: 79, impact: 116 },
      '214P': { clip: 'M_SLAM', start: 79, impact: 116 },
      '623P': { clip: 'M_UPPERCUT', start: 28, impact: 46 },
      EX_623P: { clip: 'M_UPPERCUT', start: 28, impact: 46 },
      '236P': { clip: 'M_CAST', start: 118, impact: 148 },
      EX_236P: { clip: 'M_CAST', start: 118, impact: 148 },
      j236P: { clip: 'M_CAST', start: 118, impact: 148 },
      '22P': { clip: 'M_CAST', start: 106, impact: 148 },
      SUPER: { clip: 'M_CAST', start: 118, impact: 148 },
    },
    heavy: { clip: 'PUNCH_CROSS', impact: 19 },
    block: { clip: 'M_BLOCK', hold: 69 },
  },
  VOLT: {
    url: voltGlbUrl,
    height: 1.85,
    moves: {
      '5P': { clip: 'M_JAB', start: 30, impact: 40 },
      '2P': { clip: 'M_JAB', start: 30, impact: 40, crouch: true },
      jP: AIR_PUNCH,
      '5K': { clip: 'M_KICK', start: 26, impact: 41 },
      '6K': { clip: 'M_KICK', start: 22, impact: 41 },
      jK: AIR_KICK,
      j214K: AIR_KICK,
      '2K': { clip: 'M_LOWSWEEP', start: 1, impact: 10 },
      '6P': { clip: 'M_SLAM', start: 82, impact: 116 },
      '214P': { clip: 'M_SLAM', start: 82, impact: 116 },
      EX_214P: { clip: 'M_SLAM', start: 82, impact: 116 },
      '623P': { clip: 'M_UPPERCUT', start: 28, impact: 46 },
      EX_623P: { clip: 'M_UPPERCUT', start: 28, impact: 46 },
      '236P': { clip: 'M_CAST', start: 118, impact: 148 },
      EX_236P: { clip: 'M_CAST', start: 118, impact: 148 },
      j236P: { clip: 'M_CAST', start: 118, impact: 148 },
      '22P': { clip: 'M_CAST', start: 106, impact: 148 },
      SUPER: { clip: 'M_CAST', start: 118, impact: 148 },
    },
    heavy: { clip: 'PUNCH_CROSS', impact: 19 },
    block: { clip: 'M_BLOCK', hold: 73 },
  },
};
