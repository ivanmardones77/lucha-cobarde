import { sfx } from '../audio/SoundEngine';
import { RawInput } from '../core/inputBuffer';

type TouchBtnKey = 'p' | 'k' | 't' | 's' | 'dash';

export class TouchControls {
  private layer: HTMLElement;
  private dpadEl: HTMLElement;
  private thumbEl: HTMLElement;
  private dirDots: HTMLElement[];
  private superBtnEl: HTMLElement | null;

  public enabled: boolean;
  public state: RawInput = {
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

  private dpadTouchId: number | null = null;
  private dpadMouseActive = false;
  private btnTouchMap = new Map<
    number,
    { key: TouchBtnKey; el: HTMLElement }
  >();

  constructor() {
    this.layer = document.getElementById('touch-controls-layer')!;
    this.dpadEl = document.getElementById('virtual-dpad')!;
    this.thumbEl = document.getElementById('dpad-thumb')!;
    this.dirDots = Array.from(
      this.dpadEl.querySelectorAll<HTMLElement>('.dpad-dir-dot')
    );
    this.superBtnEl = document.getElementById('tbtn-super');

    this.enabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.setupDpadEvents();
    this.setupButtonEvents();
    this.applyVisibility();
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) this.clearAll();
    this.applyVisibility();
    return this.enabled;
  }

  private applyVisibility(): void {
    this.layer.classList.toggle('hidden', !this.enabled);
    const btn = document.getElementById('btn-touch-toggle');
    if (btn) btn.classList.toggle('active', this.enabled);
  }

  public clearAll(): void {
    this.state = {
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
    this.dpadTouchId = null;
    this.dpadMouseActive = false;
    this.btnTouchMap.clear();
    this.resetDpadVisual();
    document
      .querySelectorAll('.arcade-btn')
      .forEach((b) => b.classList.remove('pressed'));
  }

  private updateDpadFromPoint(clientX: number, clientY: number): void {
    const rect = this.dpadEl.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const maxR = rect.width * 0.34;
    const dist = Math.hypot(dx, dy);
    const deadzone = rect.width * 0.12;

    const clampedDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const tx = Math.cos(angle) * clampedDist;
    const ty = Math.sin(angle) * clampedDist;
    this.thumbEl.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;

    if (dist < deadzone) {
      this.state.up =
        this.state.down =
        this.state.left =
        this.state.right =
          false;
      this.highlightDirDot(5);
      return;
    }

    const deg = (angle * 180) / Math.PI;
    const right = deg > -67.5 && deg < 67.5;
    const left = deg > 112.5 || deg < -112.5;
    const down = deg > 22.5 && deg < 157.5;
    const up = deg < -22.5 && deg > -157.5;

    this.state.up = up;
    this.state.down = down;
    this.state.left = left;
    this.state.right = right;

    const numDir =
      5 + ((right ? 1 : 0) - (left ? 1 : 0)) + ((up ? 1 : 0) - (down ? 1 : 0)) * 3;
    this.highlightDirDot(numDir);
  }

  private highlightDirDot(dir: number): void {
    for (const dot of this.dirDots) {
      dot.classList.toggle('active', Number(dot.dataset.dir) === dir);
    }
  }

  private resetDpadVisual(): void {
    this.thumbEl.style.transform = 'translate(-50%, -50%)';
    this.highlightDirDot(5);
  }

  private setupDpadEvents(): void {
    this.dpadEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        sfx.unlock();
        if (this.dpadTouchId === null && e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          this.dpadTouchId = t.identifier;
          this.updateDpadFromPoint(t.clientX, t.clientY);
        }
      },
      { passive: false }
    );

    this.dpadEl.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.dpadTouchId) {
            this.updateDpadFromPoint(t.clientX, t.clientY);
            break;
          }
        }
      },
      { passive: false }
    );

    const endDpadTouch = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.dpadTouchId) {
          this.dpadTouchId = null;
          this.state.up =
            this.state.down =
            this.state.left =
            this.state.right =
              false;
          this.resetDpadVisual();
          break;
        }
      }
    };
    this.dpadEl.addEventListener('touchend', endDpadTouch, { passive: false });
    this.dpadEl.addEventListener('touchcancel', endDpadTouch, {
      passive: false,
    });

    this.dpadEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      sfx.unlock();
      this.dpadMouseActive = true;
      this.updateDpadFromPoint(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.dpadMouseActive) {
        this.updateDpadFromPoint(e.clientX, e.clientY);
      }
    });
    window.addEventListener('mouseup', () => {
      if (this.dpadMouseActive) {
        this.dpadMouseActive = false;
        this.state.up =
          this.state.down =
          this.state.left =
          this.state.right =
            false;
        this.resetDpadVisual();
      }
    });
  }

  private setupButtonEvents(): void {
    const buttons = Array.from(
      this.layer.querySelectorAll<HTMLElement>('.arcade-btn')
    );
    for (const btn of buttons) {
      const key = btn.dataset.btn as TouchBtnKey;

      btn.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          sfx.unlock();
          for (const t of Array.from(e.changedTouches)) {
            this.btnTouchMap.set(t.identifier, { key, el: btn });
          }
          this.state[key] = true;
          btn.classList.add('pressed');
        },
        { passive: false }
      );

      const releaseTouch = (e: TouchEvent) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          const entry = this.btnTouchMap.get(t.identifier);
          if (entry) {
            this.btnTouchMap.delete(t.identifier);
            const stillHeld = Array.from(this.btnTouchMap.values()).some(
              (v) => v.key === entry.key
            );
            if (!stillHeld) {
              this.state[entry.key] = false;
              entry.el.classList.remove('pressed');
            }
          }
        }
      };
      btn.addEventListener('touchend', releaseTouch, { passive: false });
      btn.addEventListener('touchcancel', releaseTouch, { passive: false });

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        sfx.unlock();
        this.state[key] = true;
        btn.classList.add('pressed');
      });
      const releaseMouse = () => {
        if (this.state[key]) {
          this.state[key] = false;
          btn.classList.remove('pressed');
        }
      };
      btn.addEventListener('mouseup', releaseMouse);
      btn.addEventListener('mouseleave', releaseMouse);
    }
  }

  public syncSuperGlow(p1SuperMeter: number): void {
    if (!this.superBtnEl) return;
    const ready = p1SuperMeter >= 100;
    this.superBtnEl.classList.toggle('super-ready', ready);
    this.superBtnEl.style.opacity = ready ? '1' : '0.58';
  }
}
