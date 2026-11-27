import { RawInput } from '../core/inputBuffer';

export interface GamepadStatus {
  p1Connected: boolean;
  p2Connected: boolean;
  p1Name: string;
  p2Name: string;
}

const STICK_DEADZONE = 0.35;

/**
 * Combina teclado + Web Gamepad API (Xbox, PlayStation DualSense/DualShock,
 * Nintendo Pro Controller y Arcade/Fightsticks con mapeo estándar).
 *
 * Mapeo estándar (W3C Standard Gamepad):
 * - D-Pad: 12 (Arriba), 13 (Abajo), 14 (Izquierda), 15 (Derecha)
 * - Stick Izquierdo: axes[0] (X), axes[1] (Y)
 * - Ataque: botones frontales 0 (A/Cruz), 1 (B/Círculo), 2 (X/Cuadrado), 3 (Y/Triángulo)
 * - Reiniciar combate: botón 9 (Start / Options)
 */
export class InputManager {
  private keys = new Set<string>();
  private prevStartPressed: [boolean, boolean] = [false, false];

  public onToggleDebug?: () => void;
  public onToggleFrameData?: () => void;
  public onResetMatch?: () => void;

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'F1') {
      e.preventDefault();
      this.onToggleDebug?.();
      return;
    }
    if (e.code === 'F2') {
      e.preventDefault();
      this.onToggleFrameData?.();
      return;
    }
    if (e.code === 'KeyR') {
      this.onResetMatch?.();
      return;
    }
    this.keys.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private getConnectedGamepads(): (Gamepad | null)[] {
    if (!navigator.getGamepads) return [];
    const pads = navigator.getGamepads();
    const active: Gamepad[] = [];
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (pad && pad.connected) {
        active.push(pad);
      }
    }
    return [active[0] ?? null, active[1] ?? null];
  }

  private readGamepadInput(pad: Gamepad | null, slot: 0 | 1): RawInput {
    if (!pad) {
      this.prevStartPressed[slot] = false;
      return { up: false, down: false, left: false, right: false, attack: false };
    }

    const btn = (idx: number): boolean => Boolean(pad.buttons[idx]?.pressed);
    const axisX = pad.axes[0] ?? 0;
    const axisY = pad.axes[1] ?? 0;

    // Botón Start / Options (índice 9) para reiniciar el combate en flanco de subida
    const startPressed = btn(9);
    if (startPressed && !this.prevStartPressed[slot]) {
      this.onResetMatch?.();
    }
    this.prevStartPressed[slot] = startPressed;

    return {
      up: btn(12) || axisY < -STICK_DEADZONE,
      down: btn(13) || axisY > STICK_DEADZONE,
      left: btn(14) || axisX < -STICK_DEADZONE,
      right: btn(15) || axisX > STICK_DEADZONE,
      // Acepta cualquiera de los 4 botones frontales (ideal para mando y fightstick)
      attack: btn(0) || btn(1) || btn(2) || btn(3),
    };
  }

  public readRawInputs(): [RawInput, RawInput] {
    const [pad1, pad2] = this.getConnectedGamepads();
    const gp1 = this.readGamepadInput(pad1, 0);
    const gp2 = this.readGamepadInput(pad2, 1);

    const p1: RawInput = {
      up: this.keys.has('KeyW') || gp1.up,
      down: this.keys.has('KeyS') || gp1.down,
      left: this.keys.has('KeyA') || gp1.left,
      right: this.keys.has('KeyD') || gp1.right,
      attack: this.keys.has('KeyJ') || gp1.attack,
    };

    const p2: RawInput = {
      up: this.keys.has('ArrowUp') || gp2.up,
      down: this.keys.has('ArrowDown') || gp2.down,
      left: this.keys.has('ArrowLeft') || gp2.left,
      right: this.keys.has('ArrowRight') || gp2.right,
      attack: this.keys.has('Numpad1') || this.keys.has('KeyK') || gp2.attack,
    };

    return [p1, p2];
  }

  public getGamepadStatus(): GamepadStatus {
    const [pad1, pad2] = this.getConnectedGamepads();
    return {
      p1Connected: Boolean(pad1),
      p2Connected: Boolean(pad2),
      p1Name: pad1 ? pad1.id.slice(0, 28) : 'Teclado',
      p2Name: pad2 ? pad2.id.slice(0, 28) : 'Teclado',
    };
  }
}
