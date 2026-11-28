import { CHARACTERS, type FighterState } from '../core/types';
import type { GlbSpec } from './GlbFighter';

/** Lo que necesita la elección de pose de un luchador: qué clips hay, cuánto duran y cómo fijar uno. */
export interface PoseTarget {
  has(clip: string): boolean;
  /** Duración del clip en segundos */
  duration(clip: string): number;
  /** Fija la pose: clip y segundo dentro del clip */
  play(clip: string, time: number): void;
}

/**
 * Estado de la simulación → (clip, tiempo). Es la misma lógica para el luchador 3D y el de sprites,
 * así que ambos animan igual. El tiempo sale siempre del estado (nunca del reloj): encaja con la
 * pausa por impacto, la cámara lenta y el rollback.
 */
export function selectPose(f: FighterState, globalFrame: number, spec: GlbSpec, tgt: PoseTarget): void {
  const sec = globalFrame / 60;
  const loopT = (name: string) => sec % (tgt.duration(name) || 1);
  const t = f.stateFrame / 60;
  switch (f.state) {
    case 'WALK_F':
    case 'DASH_F':
      tgt.play('WALK_F', loopT('WALK_F'));
      break;
    case 'WALK_B':
    case 'DASH_B': {
      const d = tgt.duration('WALK_F') || 1;
      tgt.play('WALK_F', d - (sec % d));
      break;
    }
    case 'BLOCK_STAND':
      if (spec.block) tgt.play(spec.block.clip, spec.block.hold / 60);
      else tgt.play('IDLE', loopT('IDLE'));
      break;
    case 'CROUCH':
      tgt.play('CROUCH', loopT('CROUCH'));
      break;
    case 'BLOCK_CROUCH':
      if (spec.block && tgt.has('CROUCH+BLOCK')) tgt.play('CROUCH+BLOCK', spec.block.hold / 60);
      else tgt.play('CROUCH', loopT('CROUCH'));
      break;
    case 'JUMP':
      tgt.play(tgt.has('JUMP_TUCK') ? 'JUMP_TUCK' : 'JUMP', t);
      break;
    case 'HITSTUN':
      // Alterna cabeza / pecho según el golpe para que dos impactos seguidos no se vean iguales
      // Reacciones hechas desde la guardia del personaje (si el GLB las trae)
      if (tgt.has('HIT_HIGH')) tgt.play(f.comboCount % 2 === 0 ? 'HIT_HIGH' : 'HIT_BODY', t);
      else tgt.play(f.comboCount % 2 === 0 ? 'HIT_CHEST' : 'HIT_HEAD', t);
      break;
    case 'JUGGLE':
    case 'KNOCKDOWN':
    case 'THROWN':
    case 'DEFEAT':
      tgt.play('KNOCKDOWN', t);
      break;
    case 'WAKEUP': {
      // Se levanta: el derribo al revés, rápido
      const d = tgt.duration('KNOCKDOWN') || 1;
      tgt.play('KNOCKDOWN', d - t * 3);
      break;
    }
    case 'ATTACK': {
      const mv = (f.moveId && spec.moves[f.moveId]) || spec.heavy;
      const clip = mv.crouch && tgt.has(`CROUCH+${mv.clip}`) ? `CROUCH+${mv.clip}` : mv.clip;
      if (mv.impact === undefined) {
        tgt.play(clip, t);
      } else {
        const startup = (f.moveId && CHARACTERS[f.character].moves[f.moveId]?.startup) || 10;
        const hit = mv.impact / 60;
        const from = (mv.start ?? 0) / 60;
        tgt.play(
          clip,
          f.stateFrame <= startup ? from + (f.stateFrame / startup) * (hit - from) : hit + (f.stateFrame - startup) / 60
        );
      }
      break;
    }
    default:
      tgt.play('IDLE', loopT('IDLE'));
  }
}
