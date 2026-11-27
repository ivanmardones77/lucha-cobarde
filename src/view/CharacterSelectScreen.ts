import './characterSelect.css';
import { sfx } from '../audio/SoundEngine';
import alleyImg from '../assets/images/alley_skyline_far_1795773803949.webp';
import dojoBackdropImg from '../assets/images/dojo_hero_backdrop_1795773106114.webp';
import kazePortraitImg from '../assets/images/portrait_kaze_1795773106772.webp';
import ryujinPortraitImg from '../assets/images/portrait_ryujin_1795773106942.webp';
import titanPortraitImg from '../assets/images/portrait_titan_1795779369938.webp';
import valkyriePortraitImg from '../assets/images/portrait_valkyrie_1795782381868.webp';
import voltPortraitImg from '../assets/images/portrait_volt_1795782380711.webp';
import rooftopImg from '../assets/images/rooftop_skyline_far_1795779368218.webp';
import {
  CHARACTERS,
  CharacterId,
  CostumePalette,
  StageId,
  getFighterHudColor,
} from '../core/types';
import { CHARACTER_SPRITES, SpriteAnimator, loadSheetImage } from './characterSprites';
import type { LaunchConfig } from './LandingScreen';

const ROSTER: CharacterId[] = ['KAZE', 'RYUJIN', 'TITAN', 'VALKYRIE', 'VOLT'];

const PORTRAITS: Record<CharacterId, string> = {
  KAZE: kazePortraitImg,
  RYUJIN: ryujinPortraitImg,
  TITAN: titanPortraitImg,
  VALKYRIE: valkyriePortraitImg,
  VOLT: voltPortraitImg,
};

const STAGES: { id: StageId; name: string; img: string }[] = [
  { id: 'ALLEY', name: 'CALLEJÓN LLUVIOSO', img: alleyImg },
  { id: 'ROOFTOP', name: 'AZOTEA HELIPUERTO', img: rooftopImg },
];

const ALT_FILTER = 'hue-rotate(155deg) saturate(1.12)';

type Action = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back' | 'palette';

/** Mando o teclado físico: 0 = WASD / mando 1, 1 = flechas / mando 2 */
type Device = 0 | 1;

interface Slot {
  cursor: number;
  locked: boolean;
  ready: boolean;
  palette: CostumePalette;
  anim: SpriteAnimator;
  shownChar: CharacterId | null;
  el: {
    side: HTMLElement;
    fighter: HTMLElement;
    fallback: HTMLImageElement;
    tag: HTMLElement;
    name: HTMLElement;
    meta: HTMLElement;
    status: HTMLElement;
    confirmBtn: HTMLButtonElement;
    paletteBtn: HTMLButtonElement;
  };
}

const KEYMAP: Record<string, [Device, Action]> = {
  KeyA: [0, 'left'],
  KeyD: [0, 'right'],
  KeyW: [0, 'up'],
  KeyS: [0, 'down'],
  KeyJ: [0, 'confirm'],
  KeyK: [0, 'confirm'],
  Enter: [0, 'confirm'],
  Space: [0, 'confirm'],
  KeyL: [0, 'back'],
  Escape: [0, 'back'],
  KeyU: [0, 'palette'],
  ArrowLeft: [1, 'left'],
  ArrowRight: [1, 'right'],
  ArrowUp: [1, 'up'],
  ArrowDown: [1, 'down'],
  Numpad1: [1, 'confirm'],
  Numpad2: [1, 'confirm'],
  NumpadEnter: [1, 'confirm'],
  Numpad3: [1, 'back'],
  Backspace: [1, 'back'],
  Numpad4: [1, 'palette'],
};

interface PadState {
  held: Record<string, boolean>;
  repeatAt: Record<string, number>;
}

export class CharacterSelectScreen {
  private root: HTMLElement;
  private tiles: HTMLButtonElement[] = [];
  private stageCards: HTMLButtonElement[] = [];
  private slots: [Slot, Slot];
  private titleSub: HTMLElement;
  private phase: 'CHAR' | 'STAGE' = 'CHAR';
  private stageCursor = 0;
  private cfg!: LaunchConfig;
  private raf = 0;
  private lastT = 0;
  private stageTimer = 0;
  private pads: [PadState, PadState] = [
    { held: {}, repeatAt: {} },
    { held: {}, repeatAt: {} },
  ];

  public onConfirm?: (cfg: LaunchConfig) => void;
  /** Modo de un solo luchador (Arcade): se llama al terminar su animación SELECT */
  private onSingle: ((id: CharacterId, palette: CostumePalette) => void) | null = null;
  private singleSubtitle = '';
  public onBack?: () => void;

  constructor() {
    this.root = document.createElement('section');
    this.root.id = 'char-select';
    this.root.className = 'hidden';
    this.root.setAttribute('aria-label', 'Selección de personaje');
    this.root.innerHTML = `
      <div class="cs-bg"><img src="${dojoBackdropImg}" alt="" /></div>
      <header class="cs-header">
        <button type="button" class="cs-btn" data-cs="back">◀ Volver</button>
        <div class="cs-title">Elige luchador<small data-cs="sub">VS IA</small></div>
        <span style="width:88px"></span>
      </header>
      <div class="cs-arena">
        ${[0, 1]
          .map(
            (i) => `
          <div class="cs-side" data-side="${i}">
            <div class="cs-fighter">
              <img class="cs-fallback" alt="" />
            </div>
            <div class="cs-info">
              <span class="cs-tag">${i === 0 ? 'P1' : 'P2'}</span>
              <div class="cs-name"></div>
              <div class="cs-meta"></div>
              <div class="cs-status"></div>
              <div class="cs-actions">
                <button type="button" class="cs-btn" data-cs="palette">Traje</button>
                <button type="button" class="cs-btn primary" data-cs="confirm">Elegir</button>
              </div>
            </div>
          </div>`
          )
          .join('')}
        <div class="cs-vs">VS</div>
      </div>
      <div>
        <div class="cs-roster" role="listbox" aria-label="Luchadores"></div>
        <div class="cs-hint">P1: WASD + J elegir · L volver · U traje &nbsp;|&nbsp; P2: flechas + Num1 · Num3 volver &nbsp;|&nbsp; Mando: cruceta + A · B volver · Y traje</div>
      </div>
      <div class="cs-stage-layer">
        <div class="cs-title">Elige escenario<small>Confirma para luchar</small></div>
        <div class="cs-stage-grid"></div>
        <div class="cs-actions">
          <button type="button" class="cs-btn" data-cs="stage-back">◀ Cambiar luchador</button>
          <button type="button" class="cs-btn primary" data-cs="stage-go" style="--accent:#f43f5e">¡A luchar!</button>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    this.titleSub = this.q('[data-cs="sub"]');

    const roster = this.q('.cs-roster');
    ROSTER.forEach((id, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cs-tile';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-label', CHARACTERS[id].name);
      b.innerHTML = `<img src="${PORTRAITS[id]}" alt="" /><span class="cs-badge b1">P1</span><span class="cs-badge b2">P2</span><span class="cs-tile-name">${CHARACTERS[id].name}</span>`;
      b.addEventListener('click', () => this.onTileTap(idx));
      roster.appendChild(b);
      this.tiles.push(b);
    });

    const stageGrid = this.q('.cs-stage-grid');
    STAGES.forEach((st, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cs-stage-card';
      b.innerHTML = `<img src="${st.img}" alt="" /><span>${st.name}</span>`;
      b.addEventListener('click', () => {
        if (this.phase !== 'STAGE') return;
        if (this.stageCursor === idx) this.confirmStage();
        else {
          this.stageCursor = idx;
          sfx.play('dash');
          this.render();
        }
      });
      stageGrid.appendChild(b);
      this.stageCards.push(b);
    });

    const sides = Array.from(this.root.querySelectorAll<HTMLElement>('.cs-side'));
    this.slots = sides.map((side, i) => {
      const anim = new SpriteAnimator();
      const fighter = side.querySelector<HTMLElement>('.cs-fighter')!;
      fighter.appendChild(anim.canvas);
      const slot: Slot = {
        cursor: i === 0 ? 0 : 1,
        locked: false,
        ready: false,
        palette: 0,
        anim,
        shownChar: null,
        el: {
          side,
          fighter,
          fallback: side.querySelector<HTMLImageElement>('.cs-fallback')!,
          tag: side.querySelector<HTMLElement>('.cs-tag')!,
          name: side.querySelector<HTMLElement>('.cs-name')!,
          meta: side.querySelector<HTMLElement>('.cs-meta')!,
          status: side.querySelector<HTMLElement>('.cs-status')!,
          confirmBtn: side.querySelector<HTMLButtonElement>('[data-cs="confirm"]')!,
          paletteBtn: side.querySelector<HTMLButtonElement>('[data-cs="palette"]')!,
        },
      };
      slot.el.confirmBtn.addEventListener('click', () => this.confirmSlot(i as 0 | 1));
      slot.el.paletteBtn.addEventListener('click', () => this.togglePalette(i as 0 | 1));
      return slot;
    }) as [Slot, Slot];

    this.q('[data-cs="back"]').addEventListener('click', () => this.back(this.activeSlotFor(0)));
    this.q('[data-cs="stage-back"]').addEventListener('click', () => this.back(0));
    this.q('[data-cs="stage-go"]').addEventListener('click', () => this.confirmStage());

    window.addEventListener('keydown', (e) => {
      if (!this.isVisible()) return;
      const m = KEYMAP[e.code];
      if (!m) return;
      e.preventDefault();
      if (e.repeat && (m[1] === 'confirm' || m[1] === 'back')) return;
      sfx.unlock();
      this.handle(m[0], m[1]);
    });

    // Precarga de hojas
    for (const set of Object.values(CHARACTER_SPRITES)) {
      if (!set) continue;
      loadSheetImage(set.idle.url);
      loadSheetImage(set.select.url);
    }
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector<T>(sel)!;
  }

  private get versus(): boolean {
    return this.cfg.mode === '2P' && !this.single;
  }

  private get single(): boolean {
    return this.onSingle !== null;
  }

  /** Elegir solo el luchador del P1 (Arcade); sin rival ni escenario */
  public showSingle(
    cfg: LaunchConfig,
    subtitle: string,
    onPick: (id: CharacterId, palette: CostumePalette) => void,
    describe?: (id: CharacterId) => string
  ): void {
    this.onSingle = onPick;
    this.singleSubtitle = subtitle;
    this.describe = describe ?? null;
    this.show(cfg, true);
  }

  private describe: ((id: CharacterId) => string) | null = null;

  /** En VS IA / entrenamiento el P1 elige también al rival tras bloquear el suyo */
  private activeSlotFor(device: Device): 0 | 1 {
    if (this.single) return 0;
    if (this.versus) return device;
    return this.slots[0].locked ? 1 : 0;
  }

  public show(cfg: LaunchConfig, keepSingle = false): void {
    if (!keepSingle) {
      this.onSingle = null;
      this.describe = null;
    }
    this.root.classList.toggle('single', this.single);
    this.cfg = { ...cfg };
    this.phase = 'CHAR';
    this.stageCursor = Math.max(0, STAGES.findIndex((s) => s.id === cfg.stageId));
    const ids = [cfg.p1Character, cfg.p2Character];
    this.slots.forEach((s, i) => {
      s.cursor = Math.max(0, ROSTER.indexOf(ids[i]));
      s.palette = i === 0 ? cfg.p1Palette : cfg.p2Palette;
      s.locked = false;
      s.ready = false;
      s.shownChar = null;
    });
    this.titleSub.textContent = this.single
      ? this.singleSubtitle
      : cfg.mode === '2P' ? '2 JUGADORES' : cfg.mode === 'AI' ? 'VS IA' : 'ENTRENAMIENTO';
    this.slots[1].el.tag.textContent =
      cfg.mode === '2P' ? 'P2' : cfg.mode === 'AI' ? 'CPU' : 'MUÑECO';
    // Hay que soltar los botones del mando antes de que cuenten (el A que abrió la pantalla)
    const allHeld = (): Record<string, boolean> =>
      Object.fromEntries(
        (['left', 'right', 'up', 'down', 'confirm', 'back', 'palette'] as Action[]).map((a) => [a, true])
      );
    this.pads = [
      { held: allHeld(), repeatAt: {} },
      { held: allHeld(), repeatAt: {} },
    ];
    this.root.classList.remove('hidden', 'stage-phase', 'fade-out');
    this.render();
    this.lastT = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  public hide(): void {
    this.root.classList.add('hidden');
    cancelAnimationFrame(this.raf);
    clearTimeout(this.stageTimer);
  }

  public isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  private loop = (t: number): void => {
    if (!this.isVisible()) return;
    const dt = Math.min((t - this.lastT) / 1000, 0.1);
    this.lastT = t;
    this.pollPads(t);
    for (const s of this.slots) s.anim.tick(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  // ---------- Entrada ----------

  private pollPads(t: number): void {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p && p.connected) : [];
    for (let d = 0 as Device; d < 2; d = (d + 1) as Device) {
      const pad = pads[d];
      if (!pad) continue;
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      const b = (i: number) => Boolean(pad.buttons[i]?.pressed);
      const now: Record<Action, boolean> = {
        left: ax < -0.5 || b(14),
        right: ax > 0.5 || b(15),
        up: ay < -0.5 || b(12),
        down: ay > 0.5 || b(13),
        confirm: b(0) || b(9),
        back: b(1),
        palette: b(3),
      };
      const st = this.pads[d];
      for (const a of Object.keys(now) as Action[]) {
        const was = st.held[a];
        if (now[a] && !was) {
          sfx.unlock();
          this.handle(d, a);
          st.repeatAt[a] = t + 320;
        } else if (now[a] && was && (a === 'left' || a === 'right') && t >= st.repeatAt[a]) {
          this.handle(d, a);
          st.repeatAt[a] = t + 120;
        }
        st.held[a] = now[a];
      }
    }
  }

  private handle(device: Device, action: Action): void {
    if (this.phase === 'STAGE') {
      if (action === 'left' || action === 'up') this.moveStage(-1);
      else if (action === 'right' || action === 'down') this.moveStage(1);
      else if (action === 'confirm') this.confirmStage();
      else if (action === 'back') this.back(0);
      return;
    }
    if (!this.versus && device === 1) return;
    const i = this.activeSlotFor(device);
    switch (action) {
      case 'left':
      case 'up':
        this.moveCursor(i, -1);
        break;
      case 'right':
      case 'down':
        this.moveCursor(i, 1);
        break;
      case 'confirm':
        this.confirmSlot(i);
        break;
      case 'back':
        this.back(i);
        break;
      case 'palette':
        this.togglePalette(i);
        break;
    }
  }

  private onTileTap(idx: number): void {
    if (this.phase !== 'CHAR') return;
    sfx.unlock();
    if (this.single && this.slots[0].locked) return;
    const i: 0 | 1 = this.single || !this.slots[0].locked ? 0 : 1;
    if (this.slots[i].locked) return;
    if (this.slots[i].cursor === idx) {
      this.confirmSlot(i);
    } else {
      this.slots[i].cursor = idx;
      sfx.play('dash');
      this.render();
    }
  }

  // ---------- Lógica ----------

  private moveCursor(i: 0 | 1, dir: number): void {
    const s = this.slots[i];
    if (s.locked) return;
    s.cursor = (s.cursor + dir + ROSTER.length) % ROSTER.length;
    sfx.play('dash');
    this.render();
  }

  private togglePalette(i: 0 | 1): void {
    const s = this.slots[i];
    if (s.locked) return;
    s.palette = s.palette === 0 ? 1 : 0;
    this.render();
  }

  private confirmSlot(i: 0 | 1): void {
    if (this.phase !== 'CHAR') return;
    if (!this.versus && i === 1 && !this.slots[0].locked) return;
    const s = this.slots[i];
    if (s.locked) return;
    const other = this.slots[i === 0 ? 1 : 0];
    // Mismo luchador y mismo traje: el segundo en bloquear usa el alternativo
    if (other.locked && other.cursor === s.cursor && other.palette === s.palette) {
      s.palette = s.palette === 0 ? 1 : 0;
    }
    s.locked = true;
    s.ready = false;
    sfx.play('superFlash');
    const id = ROSTER[s.cursor];
    const set = CHARACTER_SPRITES[id];
    if (set) {
      s.anim.play(set.select, false, () => this.onSelectAnimDone(i));
    } else {
      window.setTimeout(() => this.onSelectAnimDone(i), 900);
    }
    this.render();
  }

  private onSelectAnimDone(i: 0 | 1): void {
    const s = this.slots[i];
    if (!s.locked) return;
    s.ready = true;
    // Se queda en la pose final (último fotograma de SELECT)
    this.render();
    this.maybeAdvance();
  }

  private maybeAdvance(): void {
    if (this.single) {
      const s = this.slots[0];
      if (s.locked && s.ready) {
        clearTimeout(this.stageTimer);
        this.stageTimer = window.setTimeout(() => {
          if (!s.locked || !s.ready || !this.onSingle) return;
          const cb = this.onSingle;
          this.hide();
          cb(ROSTER[s.cursor], s.palette);
        }, 450);
      }
      return;
    }
    if (this.slots.every((s) => s.locked && s.ready)) {
      clearTimeout(this.stageTimer);
      this.stageTimer = window.setTimeout(() => {
        if (this.slots.every((s) => s.locked && s.ready) && this.phase === 'CHAR') {
          this.phase = 'STAGE';
          sfx.play('roundStart');
          this.render();
        }
      }, 450);
    }
  }

  private back(i: 0 | 1): void {
    clearTimeout(this.stageTimer);
    if (this.phase === 'STAGE') {
      this.phase = 'CHAR';
      this.unlock(1);
      sfx.play('backdash');
      this.render();
      return;
    }
    const s = this.slots[i];
    if (s.locked) {
      this.unlock(i);
    } else if (!this.versus && i === 1) {
      this.unlock(0);
    } else if (!this.slots[0].locked && !this.slots[1].locked) {
      sfx.play('backdash');
      this.hide();
      this.onBack?.();
      return;
    } else {
      return;
    }
    sfx.play('backdash');
    this.render();
  }

  private unlock(i: 0 | 1): void {
    const s = this.slots[i];
    s.locked = false;
    s.ready = false;
    s.shownChar = null; // fuerza volver al IDLE
  }

  private moveStage(dir: number): void {
    this.stageCursor = (this.stageCursor + dir + STAGES.length) % STAGES.length;
    sfx.play('dash');
    this.render();
  }

  private confirmStage(): void {
    if (this.phase !== 'STAGE') return;
    const [a, b] = this.slots;
    const cfg: LaunchConfig = {
      ...this.cfg,
      p1Character: ROSTER[a.cursor],
      p2Character: ROSTER[b.cursor],
      p1Palette: a.palette,
      p2Palette: b.palette,
      stageId: STAGES[this.stageCursor].id,
    };
    this.phase = 'CHAR';
    sfx.play('superFlash');
    this.root.classList.add('fade-out');
    window.setTimeout(() => {
      this.hide();
      this.onConfirm?.(cfg);
    }, 340);
  }

  // ---------- Pintado ----------

  private render(): void {
    const colors = this.slots.map((s) => getFighterHudColor(ROSTER[s.cursor], s.palette));
    this.root.style.setProperty('--p1', colors[0]);
    this.root.style.setProperty('--p2', colors[1]);
    this.root.style.setProperty('--p1c', colors[0] + '40');
    this.root.style.setProperty('--p2c', colors[1] + '40');
    this.root.classList.toggle('stage-phase', this.phase === 'STAGE');

    this.tiles.forEach((t, idx) => {
      t.classList.toggle('p1', this.slots[0].cursor === idx);
      t.classList.toggle(
        'p2',
        this.slots[1].cursor === idx && !this.single && (this.versus || this.slots[0].locked)
      );
      t.setAttribute('aria-selected', String(this.slots[0].cursor === idx));
    });
    this.stageCards.forEach((c, idx) => c.classList.toggle('active', idx === this.stageCursor));

    this.slots.forEach((s, i) => {
      const id = ROSTER[s.cursor];
      const spec = CHARACTERS[id];
      const set = CHARACTER_SPRITES[id];
      const accent = colors[i];
      s.el.side.style.setProperty('--accent', accent);
      s.el.side.classList.toggle('locked', s.locked);
      s.el.name.textContent = spec.name;
      s.el.meta.textContent = `${spec.archetype} · ${spec.maxHp} HP · Traje: ${s.palette === 1 ? spec.altPaletteName : 'Original'}`;
      if (i === 0 && this.describe) s.el.meta.textContent += ` · ${this.describe(id)}`;

      const waiting = !this.versus && i === 1 && !this.slots[0].locked;
      s.el.side.style.opacity = waiting ? '0.45' : '1';
      s.el.status.textContent = s.locked ? (s.ready ? '¡LISTO!' : '') : waiting ? 'ESPERANDO…' : 'ELIGIENDO';
      s.el.confirmBtn.disabled = s.locked || waiting;
      s.el.paletteBtn.disabled = s.locked || waiting;
      s.el.confirmBtn.textContent = s.locked ? 'Listo' : 'Elegir';

      const filter = s.palette === 1 ? ALT_FILTER : 'none';
      if (set) {
        s.anim.canvas.style.display = '';
        s.el.fallback.style.display = 'none';
        // P1 a la izquierda mira a la derecha; P2 a la derecha mira a la izquierda
        s.anim.flip = i === 0 ? set.facing === 'left' : set.facing === 'right';
        s.anim.filter = filter;
        if (s.shownChar !== id && !s.locked) {
          s.anim.play(set.idle, true);
        }
      } else {
        s.anim.clear();
        s.anim.canvas.style.display = 'none';
        s.el.fallback.style.display = '';
        if (s.el.fallback.getAttribute('src') !== PORTRAITS[id]) s.el.fallback.src = PORTRAITS[id];
        s.el.fallback.style.filter = filter;
      }
      s.shownChar = id;
    });
  }
}
