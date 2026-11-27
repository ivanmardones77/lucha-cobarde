import './campaign.css';
import { sfx } from '../audio/SoundEngine';
import kazePortraitImg from '../assets/images/portrait_kaze_1795773106772.webp';
import ryujinPortraitImg from '../assets/images/portrait_ryujin_1795773106942.webp';
import titanPortraitImg from '../assets/images/portrait_titan_1795779369938.webp';
import valkyriePortraitImg from '../assets/images/portrait_valkyrie_1795782381868.webp';
import voltPortraitImg from '../assets/images/portrait_volt_1795782380711.webp';
import type { DialogueLine } from '../campaign/story';
import { CHARACTERS, CharacterId, getFighterHudColor } from '../core/types';

const PORTRAITS: Record<CharacterId, string> = {
  KAZE: kazePortraitImg,
  RYUJIN: ryujinPortraitImg,
  TITAN: titanPortraitImg,
  VALKYRIE: valkyriePortraitImg,
  VOLT: voltPortraitImg,
};

export interface MenuItem {
  label: string;
  /** Texto a la derecha (estado, récord…) */
  value?: string;
  disabled?: boolean;
  primary?: boolean;
  onSelect: () => void;
}

export interface MenuOptions {
  subtitle?: string;
  onBack?: () => void;
  /** Número grande encima (cuenta atrás de continuar) */
  big?: string;
  /** Opción que queda seleccionada al abrir (por su texto) */
  focusLabel?: string;
}

/** Línea extra con nombre libre (tarjetas de VS, puntos, rango…) */
export interface CardLine {
  title: string;
  color: string;
  text: string;
}

type Action = 'up' | 'down' | 'confirm' | 'back' | 'skip';

const KEYS: Record<string, Action> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'confirm',
  KeyJ: 'confirm',
  KeyK: 'confirm',
  Numpad1: 'confirm',
  Escape: 'back',
  KeyL: 'back',
  Backspace: 'back',
  Numpad3: 'back',
  Tab: 'skip',
};

/**
 * Capa de pantallas de campaña sobre el escenario 3D: diálogos con retratos,
 * menús de lista y cuenta atrás. Teclado, mando y táctil.
 */
export class CampaignUI {
  private root: HTMLElement;
  private dlg: HTMLElement;
  private menuEl: HTMLElement;
  private portraitL: HTMLImageElement;
  private portraitR: HTMLImageElement;
  private nameEl: HTMLElement;
  private textEl: HTMLElement;
  private chapterEl: HTMLElement;
  private progressEl: HTMLElement;

  private mode: 'none' | 'dialogue' | 'menu' = 'none';
  private lines: (DialogueLine | CardLine)[] = [];
  private lineIdx = 0;
  private typed = 0;
  private onDialogueDone: (() => void) | null = null;
  private items: MenuItem[] = [];
  private focus = 0;
  private menuOpts: MenuOptions = {};
  private raf = 0;
  private lastT = 0;
  private padHeld: Record<Action, boolean> = { up: true, down: true, confirm: true, back: true, skip: true };

  constructor() {
    this.root = document.createElement('section');
    this.root.id = 'campaign-ui';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="cg-dialogue">
        <img class="cg-portrait left" alt="" />
        <img class="cg-portrait right" alt="" />
        <div class="cg-chapter"></div>
        <div class="cg-box" role="button" tabindex="0" aria-label="Siguiente">
          <div class="cg-name"></div>
          <div class="cg-text" aria-live="polite"></div>
          <div class="cg-foot">
            <span class="cg-progress"></span>
            <span class="cg-buttons">
              <button type="button" class="cg-btn" data-cg="skip">Saltar ⏭</button>
              <button type="button" class="cg-btn primary" data-cg="next">Siguiente ▶</button>
            </span>
          </div>
        </div>
      </div>
      <div class="cg-menu" role="dialog">
        <div class="cg-menu-card">
          <div class="cg-big"></div>
          <h2 class="cg-menu-title"></h2>
          <p class="cg-menu-sub"></p>
          <div class="cg-menu-list" role="listbox"></div>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    this.dlg = this.root.querySelector('.cg-dialogue')!;
    this.menuEl = this.root.querySelector('.cg-menu')!;
    this.portraitL = this.root.querySelector('.cg-portrait.left')!;
    this.portraitR = this.root.querySelector('.cg-portrait.right')!;
    this.nameEl = this.root.querySelector('.cg-name')!;
    this.textEl = this.root.querySelector('.cg-text')!;
    this.chapterEl = this.root.querySelector('.cg-chapter')!;
    this.progressEl = this.root.querySelector('.cg-progress')!;

    this.root.querySelector('[data-cg="skip"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.finishDialogue();
    });
    this.root.querySelector('[data-cg="next"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.advance();
    });
    this.root.querySelector('.cg-box')!.addEventListener('click', () => this.advance());

    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isVisible()) return;
        const a = KEYS[e.code];
        if (!a) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat && a !== 'up' && a !== 'down') return;
        this.handle(a);
      },
      true
    );
  }

  isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  hide(): void {
    this.mode = 'none';
    this.root.classList.add('hidden');
    cancelAnimationFrame(this.raf);
  }

  private showRoot(): void {
    const wasHidden = !this.isVisible();
    this.root.classList.remove('hidden');
    if (wasHidden) {
      // Hay que soltar los botones del mando antes de que cuenten
      this.padHeld = { up: true, down: true, confirm: true, back: true, skip: true };
      this.lastT = performance.now();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  // ---------- Diálogo ----------

  dialogue(lines: (DialogueLine | CardLine)[], chapter: string, onDone: () => void): void {
    this.lines = lines;
    this.lineIdx = 0;
    this.onDialogueDone = onDone;
    this.chapterEl.textContent = chapter;
    this.mode = 'dialogue';
    this.dlg.classList.remove('hidden');
    this.menuEl.classList.add('hidden');
    this.showRoot();
    this.portraitL.classList.remove('shown');
    this.portraitR.classList.remove('shown');
    if (lines.length === 0) {
      this.finishDialogue();
      return;
    }
    this.renderLine();
  }

  private renderLine(): void {
    const l = this.lines[this.lineIdx];
    this.typed = 0;
    this.textEl.textContent = '';
    this.progressEl.textContent = `${this.lineIdx + 1} / ${this.lines.length}`;
    if ('speakerId' in l) {
      const isNarr = l.speakerId === 'narrator';
      const img = l.side === 'LEFT' ? this.portraitL : this.portraitR;
      const other = l.side === 'LEFT' ? this.portraitR : this.portraitL;
      if (!isNarr) {
        const id = l.speakerId as CharacterId;
        if (img.getAttribute('src') !== PORTRAITS[id]) img.src = PORTRAITS[id];
        img.alt = CHARACTERS[id].name;
        img.classList.add('shown');
        img.classList.add('active');
        other.classList.remove('active');
        this.nameEl.textContent = CHARACTERS[id].name;
        this.nameEl.style.color = getFighterHudColor(id, 0);
      } else {
        this.portraitL.classList.remove('active');
        this.portraitR.classList.remove('active');
        this.nameEl.textContent = '';
      }
      this.textEl.classList.toggle('narrator', isNarr);
      this.dlg.classList.toggle('right', l.side === 'RIGHT' && !isNarr);
    } else {
      this.nameEl.textContent = l.title;
      this.nameEl.style.color = l.color;
      this.textEl.classList.remove('narrator');
      this.dlg.classList.remove('right');
      this.portraitL.classList.remove('active');
      this.portraitR.classList.remove('active');
    }
  }

  private currentText(): string {
    return this.lines[this.lineIdx]?.text ?? '';
  }

  private advance(): void {
    if (this.mode !== 'dialogue') return;
    const full = this.currentText();
    if (this.typed < full.length) {
      // Primer toque: muestra la frase entera
      this.typed = full.length;
      this.textEl.textContent = full;
      return;
    }
    sfx.play('uiMove');
    this.lineIdx++;
    if (this.lineIdx >= this.lines.length) this.finishDialogue();
    else this.renderLine();
  }

  private finishDialogue(): void {
    if (this.mode !== 'dialogue') return;
    const cb = this.onDialogueDone;
    this.onDialogueDone = null;
    this.mode = 'none';
    cb?.();
  }

  // ---------- Menú ----------

  menu(title: string, items: MenuItem[], opts: MenuOptions = {}): void {
    this.items = items;
    this.menuOpts = opts;
    const wanted = opts.focusLabel ? items.findIndex((i) => i.label === opts.focusLabel && !i.disabled) : -1;
    this.focus = wanted >= 0 ? wanted : Math.max(0, items.findIndex((i) => !i.disabled));
    this.mode = 'menu';
    this.dlg.classList.add('hidden');
    this.menuEl.classList.remove('hidden');
    this.root.querySelector('.cg-menu-title')!.textContent = title;
    this.root.querySelector('.cg-menu-sub')!.textContent = opts.subtitle ?? '';
    this.setBig(opts.big);
    this.renderItems();
    this.showRoot();
  }

  /** Cambia el número grande sin rehacer el menú (cuenta atrás) */
  setBig(text?: string): void {
    const big = this.root.querySelector<HTMLElement>('.cg-big')!;
    big.textContent = text ?? '';
    big.style.display = text ? '' : 'none';
  }

  private renderItems(): void {
    const list = this.root.querySelector('.cg-menu-list')!;
    list.innerHTML = '';
    this.items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cg-item' + (it.primary ? ' primary' : '') + (i === this.focus ? ' focus' : '');
      b.disabled = !!it.disabled;
      b.setAttribute('role', 'option');
      b.innerHTML = `<span></span><small></small>`;
      b.querySelector('span')!.textContent = it.label;
      b.querySelector('small')!.textContent = it.value ?? '';
      b.addEventListener('click', () => {
        if (it.disabled) return;
        this.focus = i;
        this.select();
      });
      b.addEventListener('mouseenter', () => {
        if (it.disabled) return;
        this.focus = i;
        this.syncFocus();
      });
      list.appendChild(b);
    });
  }

  private syncFocus(): void {
    this.root.querySelectorAll('.cg-item').forEach((el, i) => el.classList.toggle('focus', i === this.focus));
  }

  private moveFocus(dir: number): void {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const j = (this.focus + dir * k + n * 2) % n;
      if (!this.items[j].disabled) {
        this.focus = j;
        break;
      }
    }
    sfx.play('uiMove');
    this.syncFocus();
  }

  private select(): void {
    const it = this.items[this.focus];
    if (!it || it.disabled) return;
    sfx.play('uiConfirm');
    it.onSelect();
  }

  // ---------- Entrada ----------

  private handle(a: Action): void {
    sfx.unlock();
    if (this.mode === 'dialogue') {
      if (a === 'confirm') this.advance();
      else if (a === 'skip' || a === 'back') this.finishDialogue();
    } else if (this.mode === 'menu') {
      if (a === 'up') this.moveFocus(-1);
      else if (a === 'down') this.moveFocus(1);
      else if (a === 'confirm') this.select();
      else if (a === 'back') this.menuOpts.onBack?.();
    }
  }

  private loop = (t: number): void => {
    if (!this.isVisible()) return;
    const dt = Math.min((t - this.lastT) / 1000, 0.1);
    this.lastT = t;
    // Efecto máquina de escribir
    if (this.mode === 'dialogue') {
      const full = this.currentText();
      if (this.typed < full.length) {
        this.typed = Math.min(full.length, this.typed + dt * 55);
        this.textEl.textContent = full.slice(0, Math.floor(this.typed));
      }
    }
    this.pollPads();
    this.raf = requestAnimationFrame(this.loop);
  };

  private pollPads(): void {
    let pads: (Gamepad | null)[] = [];
    try {
      pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    } catch {
      return;
    }
    const now: Record<Action, boolean> = { up: false, down: false, confirm: false, back: false, skip: false };
    for (const pad of pads) {
      if (!pad?.connected) continue;
      const b = (i: number) => Boolean(pad.buttons[i]?.pressed);
      const ay = pad.axes[1] || 0;
      now.up ||= b(12) || ay < -0.5;
      now.down ||= b(13) || ay > 0.5;
      now.confirm ||= b(0);
      now.back ||= b(1);
      now.skip ||= b(9);
    }
    for (const a of Object.keys(now) as Action[]) {
      if (now[a] && !this.padHeld[a]) this.handle(a);
      this.padHeld[a] = now[a];
    }
  }
}
