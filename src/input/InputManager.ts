import { sfx } from '../audio/SoundEngine';
import { FightingAI } from '../core/ai';
import { RawInput } from '../core/inputBuffer';
import { MatchState } from '../core/types';
import { TouchControls } from './TouchControls';

interface GamepadReadResult extends RawInput {
  connected: boolean;
  start: boolean;
}

export class InputManager {
  private keys = new Set<string>();
  private prevStart: [boolean, boolean] = [false, false];
  public gamepadConnected: [boolean, boolean] = [false, false];

  public onToggleDebug?: () => void;
  public onToggleFrameData?: () => void;
  public onResetMatch?: () => void;

  constructor(
    private touch: TouchControls,
    private ai: FightingAI
  ) {
    window.addEventListener('keydown', (e) => {
      sfx.unlock();
      this.keys.add(e.code);
      if (e.code === 'F1') {
        e.preventDefault();
        this.onToggleDebug?.();
      }
      if (e.code === 'F2') {
        e.preventDefault();
        this.onToggleFrameData?.();
      }
      if (e.code === 'KeyR') {
        this.onResetMatch?.();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  private readGamepad(index: 0 | 1): GamepadReadResult {
    const res: GamepadReadResult = {
      connected: false,
      up: false,
      down: false,
      left: false,
      right: false,
      p: false,
      k: false,
      t: false,
      s: false,
      dash: false,
      start: false,
    };
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const activePads: Gamepad[] = [];
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad && pad.connected) activePads.push(pad);
      }
      const pad = activePads[index];
      if (!pad) return res;

      res.connected = true;
      const dz = 0.35;
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      const b = (i: number) => Boolean(pad.buttons[i]?.pressed);

      res.left = ax < -dz || b(14);
      res.right = ax > dz || b(15);
      res.up = ay < -dz || b(12);
      res.down = ay > dz || b(13);

      // X/□ (2)=P, A/✕ (0)=K, B/○ (1)=T, Y/△ (3)=Super, RB/R1 (5) o LB/L1 (4)=Dash
      res.p = b(2);
      res.k = b(0);
      res.t = b(1);
      res.s = b(3);
      res.dash = b(5) || b(4);
      res.start = b(9);
    } catch {
      // Ignorar errores de Gamepad API
    }
    return res;
  }

  public poll(state: MatchState): [RawInput, RawInput] {
    const gp0 = this.readGamepad(0);
    const gp1 = this.readGamepad(1);
    this.gamepadConnected = [gp0.connected, gp1.connected];

    const startRising =
      (gp0.start && !this.prevStart[0]) || (gp1.start && !this.prevStart[1]);
    this.prevStart = [gp0.start, gp1.start];
    if (startRising) {
      sfx.unlock();
      this.onResetMatch?.();
    }

    const tc = this.touch.enabled ? this.touch.state : null;

    const p1: RawInput = {
      up: this.keys.has('KeyW') || gp0.up || Boolean(tc?.up),
      down: this.keys.has('KeyS') || gp0.down || Boolean(tc?.down),
      left: this.keys.has('KeyA') || gp0.left || Boolean(tc?.left),
      right: this.keys.has('KeyD') || gp0.right || Boolean(tc?.right),
      p: this.keys.has('KeyJ') || gp0.p || Boolean(tc?.p),
      k: this.keys.has('KeyK') || gp0.k || Boolean(tc?.k),
      t: this.keys.has('KeyL') || gp0.t || Boolean(tc?.t),
      s: this.keys.has('KeyU') || gp0.s || Boolean(tc?.s),
      dash:
        this.keys.has('ShiftLeft') ||
        this.keys.has('ShiftRight') ||
        gp0.dash ||
        Boolean(tc?.dash),
    };

    let p2: RawInput;
    if (state.mode === '2P') {
      p2 = {
        up: this.keys.has('ArrowUp') || gp1.up,
        down: this.keys.has('ArrowDown') || gp1.down,
        left: this.keys.has('ArrowLeft') || gp1.left,
        right: this.keys.has('ArrowRight') || gp1.right,
        p: this.keys.has('Numpad1') || gp1.p,
        k: this.keys.has('Numpad2') || gp1.k,
        t: this.keys.has('Numpad3') || gp1.t,
        s: this.keys.has('Numpad4') || gp1.s,
        dash: this.keys.has('Numpad0') || gp1.dash,
      };
    } else {
      p2 = this.ai.getInput(state);
    }

    return [p1, p2];
  }
}
