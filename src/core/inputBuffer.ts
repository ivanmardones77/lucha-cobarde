import { BUFFER_SIZE } from './types';

export type NumpadDir = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface RawInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  p: boolean;
  k: boolean;
  t: boolean;
  s: boolean;
  dash: boolean;
}

export interface BufferedFrame {
  dir: NumpadDir;
  p: boolean;
  k: boolean;
  t: boolean;
  s: boolean;
  dash: boolean;
  pPressed: boolean;
  kPressed: boolean;
  tPressed: boolean;
  sPressed: boolean;
  dashPressed: boolean;
}

export type PressedButtonKey =
  | 'pPressed'
  | 'kPressed'
  | 'tPressed'
  | 'sPressed'
  | 'dashPressed';

export class InputBuffer {
  private history: BufferedFrame[] = [];
  private prev = { p: false, k: false, t: false, s: false, dash: false };

  public reset(): void {
    this.history = [];
    this.prev = { p: false, k: false, t: false, s: false, dash: false };
  }

  public push(raw: RawInput, facing: 1 | -1): void {
    const x = (raw.right ? 1 : 0) - (raw.left ? 1 : 0);
    const y = (raw.up ? 1 : 0) - (raw.down ? 1 : 0);
    const relX = x * facing;
    const dir = (5 + relX + y * 3) as NumpadDir;

    const frame: BufferedFrame = {
      dir,
      p: raw.p,
      k: raw.k,
      t: raw.t,
      s: raw.s,
      dash: raw.dash,
      pPressed: raw.p && !this.prev.p,
      kPressed: raw.k && !this.prev.k,
      tPressed: raw.t && !this.prev.t,
      sPressed: raw.s && !this.prev.s,
      dashPressed: raw.dash && !this.prev.dash,
    };

    this.prev = {
      p: raw.p,
      k: raw.k,
      t: raw.t,
      s: raw.s,
      dash: raw.dash,
    };

    this.history.unshift(frame);
    if (this.history.length > BUFFER_SIZE) this.history.pop();
  }

  public getCurrent(): BufferedFrame {
    return (
      this.history[0] ?? {
        dir: 5,
        p: false,
        k: false,
        t: false,
        s: false,
        dash: false,
        pPressed: false,
        kPressed: false,
        tPressed: false,
        sPressed: false,
        dashPressed: false,
      }
    );
  }

  public wasPressed(btnKey: PressedButtonKey, windowFrames = 5): number {
    const lim = Math.min(windowFrames, this.history.length);
    for (let i = 0; i < lim; i++) {
      if (this.history[i][btnKey]) return i;
    }
    return -1;
  }

  public matchMotion(
    sequence: NumpadDir[],
    btnKeys: PressedButtonKey[],
    buttonWindow = 5,
    maxWindow = 18
  ): boolean {
    let pressedIndex = -1;
    const limBtn = Math.min(buttonWindow, this.history.length);
    for (let i = 0; i < limBtn; i++) {
      for (const k of btnKeys) {
        if (this.history[i][k]) {
          pressedIndex = i;
          break;
        }
      }
      if (pressedIndex !== -1) break;
    }
    if (pressedIndex === -1) return false;

    return this.hasSequenceBefore(pressedIndex, sequence, maxWindow);
  }

  private hasSequenceBefore(
    pressedIndex: number,
    sequence: NumpadDir[],
    maxWindow: number
  ): boolean {
    let seqIdx = sequence.length - 1;
    const limit = Math.min(pressedIndex + maxWindow, this.history.length);
    for (let i = pressedIndex; i < limit; i++) {
      if (this.history[i].dir === sequence[seqIdx]) {
        seqIdx--;
        if (seqIdx < 0) return true;
      }
    }
    return false;
  }

  public matchChord(
    btnA: PressedButtonKey,
    btnB: PressedButtonKey,
    windowFrames = 4
  ): number {
    const lim = Math.min(windowFrames, this.history.length);
    let idxA = -1;
    let idxB = -1;
    for (let i = 0; i < lim; i++) {
      if (idxA === -1 && this.history[i][btnA]) idxA = i;
      if (idxB === -1 && this.history[i][btnB]) idxB = i;
    }
    if (idxA === -1 || idxB === -1) return -1;
    return Math.min(idxA, idxB);
  }

  public matchMotionChord(
    sequence: NumpadDir[],
    btnA: PressedButtonKey,
    btnB: PressedButtonKey,
    windowFrames = 5,
    maxWindow = 18
  ): boolean {
    const chordIdx = this.matchChord(btnA, btnB, windowFrames);
    if (chordIdx === -1) return false;
    return this.hasSequenceBefore(chordIdx, sequence, maxWindow);
  }

  /**
   * Detecta comando Down-Down (2-5-2 + botón) evitando activación accidental al mantener agachado.
   */
  public matchDownDown(
    btnKeys: PressedButtonKey[],
    buttonWindow = 5,
    maxWindow = 18
  ): boolean {
    let pressedIndex = -1;
    const limBtn = Math.min(buttonWindow, this.history.length);
    for (let i = 0; i < limBtn; i++) {
      for (const k of btnKeys) {
        if (this.history[i][k]) {
          pressedIndex = i;
          break;
        }
      }
      if (pressedIndex !== -1) break;
    }
    if (pressedIndex === -1) return false;

    const isDown = (d: NumpadDir) => d === 1 || d === 2 || d === 3;
    let stage = 0; // 0: buscando 2do down, 1: buscando neutral/release, 2: buscando 1er down
    const limit = Math.min(pressedIndex + maxWindow, this.history.length);
    for (let i = pressedIndex; i < limit; i++) {
      const d = this.history[i].dir;
      if (stage === 0) {
        if (isDown(d)) stage = 1;
      } else if (stage === 1) {
        if (!isDown(d)) stage = 2;
      } else if (stage === 2) {
        if (isDown(d)) return true;
      }
    }
    return false;
  }

  /**
   * Detecta doble toque (6-5-6 para Forward Dash o 4-5-4 para Backdash)
   * dentro de una ventana de `maxWindow` frames (por defecto 12).
   */
  public matchDoubleTap(targetDir: NumpadDir, maxWindow = 12): boolean {
    if (this.history.length < 3) return false;
    if (this.history[0].dir !== targetDir || this.history[1].dir === targetDir) {
      return false;
    }

    let sawNeutral = false;
    const limit = Math.min(maxWindow, this.history.length);
    for (let i = 1; i < limit; i++) {
      const d = this.history[i].dir;
      if (!sawNeutral) {
        if (d === 5) sawNeutral = true;
        else if (d !== targetDir) return false;
      } else {
        if (d === targetDir) return true;
      }
    }
    return false;
  }

  public getDisplayString(count = 10): string {
    const dirs: NumpadDir[] = [];
    for (let i = Math.min(count, this.history.length) - 1; i >= 0; i--) {
      const d = this.history[i].dir;
      if (dirs.length === 0 || dirs[dirs.length - 1] !== d) {
        dirs.push(d);
      }
    }
    return dirs.join(' → ') || '5';
  }
}
