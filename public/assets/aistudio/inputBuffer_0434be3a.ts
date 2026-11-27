export type NumpadDir = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface RawInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
}

export interface BufferedFrame {
  dir: NumpadDir;
  attackPressed: boolean; // Flanco de subida (just pressed)
}

const BUFFER_SIZE = 20;

export class InputBuffer {
  private history: BufferedFrame[] = [];
  private prevAttack = false;

  public push(raw: RawInput, facing: 1 | -1): void {
    const x = (raw.right ? 1 : 0) - (raw.left ? 1 : 0);
    const y = (raw.up ? 1 : 0) - (raw.down ? 1 : 0);

    // Normalizar eje X respecto hacia dónde mira el personaje (6 = adelante, 4 = atrás)
    const relX = x * facing;
    const dir = (5 + relX + y * 3) as NumpadDir;

    const attackPressed = raw.attack && !this.prevAttack;
    this.prevAttack = raw.attack;

    this.history.unshift({ dir, attackPressed });
    if (this.history.length > BUFFER_SIZE) {
      this.history.pop();
    }
  }

  public isAttackJustPressed(windowFrames = 3): boolean {
    const limit = Math.min(windowFrames, this.history.length);
    for (let i = 0; i < limit; i++) {
      if (this.history[i].attackPressed) return true;
    }
    return false;
  }

  /**
   * Comprueba si se pulsó el botón de ataque en los últimos `buttonWindow` frames
   * y si la secuencia de direcciones (ej. [2, 3, 6]) aparece en orden dentro del buffer.
   */
  public matchMotion(
    sequence: NumpadDir[],
    buttonWindow = 5,
    maxWindow = 16
  ): boolean {
    let pressedIndex = -1;
    for (let i = 0; i < Math.min(buttonWindow, this.history.length); i++) {
      if (this.history[i].attackPressed) {
        pressedIndex = i;
        break;
      }
    }
    if (pressedIndex === -1) return false;

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

  public getCurrentDir(): NumpadDir {
    return this.history[0]?.dir ?? 5;
  }

  public getRecentDirs(count = 8): NumpadDir[] {
    return this.history.slice(0, count).map((f) => f.dir);
  }

  public clear(): void {
    this.history.length = 0;
    this.prevAttack = false;
  }
}
