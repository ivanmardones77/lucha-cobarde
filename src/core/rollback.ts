import type { AiSnapshot, FightingAI } from './ai';
import type { InputBuffer, InputBufferSnapshot, RawInput } from './inputBuffer';
import { stepSimulation } from './simulation';
import type { MatchState } from './types';

/**
 * Todo lo que hace falta para volver a un frame y re-simular igual:
 * el estado de la partida (con el PRNG dentro), los dos buffers de input
 * y, si juega la IA, su memoria interna.
 */
export interface SimSnapshot {
  frame: number;
  state: MatchState;
  buffers: [InputBufferSnapshot, InputBufferSnapshot];
  ai: AiSnapshot | null;
}

export function saveSnapshot(
  state: MatchState,
  buffers: [InputBuffer, InputBuffer],
  ai?: FightingAI
): SimSnapshot {
  return {
    frame: state.frame,
    state: structuredClone(state),
    buffers: [buffers[0].snapshot(), buffers[1].snapshot()],
    ai: ai ? ai.snapshot() : null,
  };
}

/**
 * Restaura en el mismo objeto `state` (quien tenga una referencia a él,
 * como la vista o el HUD, sigue viendo la partida correcta).
 */
export function restoreSnapshot(
  snap: SimSnapshot,
  state: MatchState,
  buffers: [InputBuffer, InputBuffer],
  ai?: FightingAI
): void {
  const copy = structuredClone(snap.state);
  for (const key of Object.keys(state) as (keyof MatchState)[]) {
    if (!(key in copy)) delete (state as unknown as Record<string, unknown>)[key];
  }
  Object.assign(state, copy);
  buffers[0].restore(snap.buffers[0]);
  buffers[1].restore(snap.buffers[1]);
  if (ai && snap.ai) ai.restore(snap.ai);
}

const sameInput = (a: RawInput, b: RawInput): boolean =>
  a.up === b.up &&
  a.down === b.down &&
  a.left === b.left &&
  a.right === b.right &&
  a.p === b.p &&
  a.k === b.k &&
  a.t === b.t &&
  a.s === b.s &&
  a.dash === b.dash;

const NEUTRAL: RawInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  p: false,
  k: false,
  t: false,
  s: false,
  dash: false,
};

interface FrameRecord {
  /** Snapshot tomado ANTES de simular este frame */
  snap: SimSnapshot;
  inputs: [RawInput, RawInput];
  confirmed: [boolean, boolean];
}

/**
 * Bucle de rollback para 2 jugadores en red (sin IA).
 *
 * Cada frame se simula con el input local y el remoto confirmado o, si aún no
 * ha llegado, una predicción (repetir el último confirmado). Cuando llega el
 * input real de un frame pasado y no coincide con lo predicho, se vuelve al
 * snapshot de ese frame y se re-simula hasta el presente.
 *
 * Los eventos de audio/VFX (`state.events`) que salgan al re-simular deben
 * ignorarse en la vista salvo los del último frame.
 */
export class RollbackSession {
  private records = new Map<number, FrameRecord>();
  private lastConfirmed: [RawInput, RawInput] = [NEUTRAL, NEUTRAL];
  public rollbacks = 0;
  public resimulatedFrames = 0;

  constructor(
    private state: MatchState,
    private buffers: [InputBuffer, InputBuffer],
    /** Frames hacia atrás que se pueden corregir */
    public readonly maxRollback = 8
  ) {}

  /** Frame que se va a simular a continuación */
  get nextFrame(): number {
    return this.state.frame + 1;
  }

  /**
   * Simula un frame. `inputs[i] = null` significa que ese jugador aún no ha
   * confirmado este frame y se usa la predicción.
   */
  advance(inputs: [RawInput | null, RawInput | null]): void {
    const frame = this.nextFrame;
    const used: [RawInput, RawInput] = [
      inputs[0] ?? this.lastConfirmed[0],
      inputs[1] ?? this.lastConfirmed[1],
    ];
    for (const i of [0, 1] as const) {
      if (inputs[i]) this.lastConfirmed[i] = inputs[i]!;
    }
    this.records.set(frame, {
      snap: saveSnapshot(this.state, this.buffers),
      inputs: [{ ...used[0] }, { ...used[1] }],
      confirmed: [inputs[0] !== null, inputs[1] !== null],
    });
    stepSimulation(this.state, used, this.buffers);
    this.records.delete(frame - this.maxRollback - 1);
  }

  /**
   * Llega el input real del jugador `player` para `frame` (ya simulado).
   * Devuelve cuántos frames se re-simularon (0 si la predicción acertó).
   */
  confirm(player: 0 | 1, frame: number, input: RawInput): number {
    const rec = this.records.get(frame);
    if (!rec) {
      throw new Error(
        `Frame ${frame} fuera de la ventana de rollback (${this.maxRollback} frames)`
      );
    }
    rec.confirmed[player] = true;
    this.lastConfirmed[player] = input;
    if (sameInput(rec.inputs[player], input)) return 0;

    rec.inputs[player] = { ...input };
    // Las predicciones posteriores sin confirmar pasan a repetir el input corregido
    for (let f = frame + 1; f < this.nextFrame; f++) {
      const later = this.records.get(f)!;
      if (!later.confirmed[player]) later.inputs[player] = { ...input };
    }

    const current = this.state.frame;
    restoreSnapshot(rec.snap, this.state, this.buffers);
    for (let f = frame; f <= current; f++) {
      const r = this.records.get(f)!;
      r.snap = saveSnapshot(this.state, this.buffers);
      stepSimulation(this.state, r.inputs, this.buffers);
    }
    this.rollbacks++;
    this.resimulatedFrames += current - frame + 1;
    return current - frame + 1;
  }
}
