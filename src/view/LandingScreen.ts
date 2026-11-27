import './landing.css';
import { sfx } from '../audio/SoundEngine';
import dojoBackdropImg from '../assets/images/dojo_hero_backdrop_1795773106114.webp';
import { AiDifficulty } from '../core/ai';
import { CHARACTERS, CharacterId, CostumePalette, GameMode, StageId } from '../core/types';
import { CHARACTER_SPRITES, SpriteAnimator } from './characterSprites';

export interface LaunchConfig {
  mode: GameMode;
  stageId: StageId;
  aiDifficulty: AiDifficulty;
  p1Character: CharacterId;
  p2Character: CharacterId;
  p1Palette: CostumePalette;
  p2Palette: CostumePalette;
  showBoxes: boolean;
  showFrames: boolean;
  touchEnabled: boolean;
}

const LINEUP: CharacterId[] = ['KAZE', 'RYUJIN', 'TITAN', 'VALKYRIE', 'VOLT'];

interface MenuEntry {
  id: string;
  label: string;
  kicker: string;
  title: string;
  text: string;
  accent: string;
  /** Texto a la derecha y en el panel (progreso, récord…) */
  progress?: () => string;
  back?: boolean;
  action: () => void;
}

type Action = 'up' | 'down' | 'confirm' | 'back' | 'start';

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
  Backspace: 'back',
  KeyL: 'back',
  Numpad3: 'back',
};

/**
 * Pantalla de título («PULSA START») y menú principal estilo arcade.
 * Teclado, mando, ratón y táctil.
 */
export class LandingScreen {
  private root = document.getElementById('landing-screen')!;
  private bgImg = document.getElementById('landing-bg-img') as HTMLImageElement;
  private lineupEl = document.getElementById('landing-roster-lineup')!;
  private menuEl = document.getElementById('ls-menu')!;
  private pressBtn = document.getElementById('ls-press')!;
  private audioBtn = document.getElementById('ls-btn-audio')!;
  private fullBtn = document.getElementById('ls-btn-fullscreen')!;
  private infoEl = document.getElementById('ls-info')!;
  private rain = document.getElementById('ls-rain') as HTMLCanvasElement;

  private lineup: SpriteAnimator[] = [];
  private raf = 0;
  private lastT = 0;
  private padHeld: Record<Action, boolean> = { up: true, down: true, confirm: true, back: true, start: true };
  private entries: MenuEntry[] = [];
  private focus = 0;
  private menuTitle = '';
  private onMenuBack: (() => void) | null = null;
  private campaignInfo = { arcade: '', story: '' };
  private drops: { x: number; y: number; v: number; l: number }[] = [];

  public config: LaunchConfig = {
    mode: 'AI',
    stageId: 'ALLEY',
    aiDifficulty: 'HARD',
    p1Character: 'RYUJIN',
    p2Character: 'KAZE',
    p1Palette: 0,
    p2Palette: 0,
    showBoxes: false,
    showFrames: false,
    touchEnabled: false,
  };

  public onStart?: (config: LaunchConfig) => void;
  public onArcade?: () => void;
  public onStory?: () => void;
  public onOpenControls?: () => void;
  public onToggleMute?: () => boolean;

  constructor(initialTouchEnabled: boolean) {
    this.config.touchEnabled = initialTouchEnabled;
    this.bgImg.src = dojoBackdropImg;
    this.buildLineup();

    this.pressBtn.addEventListener('click', () => this.enterMenu());
    this.root.addEventListener('click', (e) => {
      if (this.state === 'attract' && !(e.target as HTMLElement).closest('.ls-top-actions')) this.enterMenu();
    });
    this.audioBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const muted = this.onToggleMute?.() ?? false;
      this.syncMuteLabel(muted);
    });
    this.fullBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isVisible() || this.overlayOpen()) return;
      if (this.state === 'attract') {
        if (/^F\d+$/.test(e.code)) return; // F1–F12 del navegador
        e.preventDefault();
        sfx.unlock();
        this.enterMenu();
        return;
      }
      const a = KEYS[e.code];
      if (!a) return;
      e.preventDefault();
      if (e.repeat && a !== 'up' && a !== 'down') return;
      sfx.unlock();
      this.handle(a);
    });

    window.addEventListener('resize', () => this.sizeRain());
    this.sizeRain();
    this.showMain();
    this.startLoop();
  }

  private get state(): 'attract' | 'menu' {
    return this.root.dataset.state === 'menu' ? 'menu' : 'attract';
  }

  /** Ventana de controles abierta encima: el menú no debe reaccionar */
  private overlayOpen(): boolean {
    return !document.getElementById('controls-modal')?.classList.contains('hidden');
  }

  private enterMenu(): void {
    if (this.state === 'menu') return;
    sfx.unlock();
    sfx.play('uiStart');
    this.root.dataset.state = 'menu';
    this.showMain();
  }

  private toAttract(): void {
    sfx.play('uiBack');
    this.root.dataset.state = 'attract';
  }

  // ---------- Menús ----------

  private showMain(focusId?: string): void {
    const start = (mode: GameMode) => () => {
      this.config.mode = mode;
      this.onStart?.({ ...this.config });
    };
    this.setMenu(
      '',
      [
        {
          id: 'arcade',
          label: 'ARCADE',
          kicker: 'UN JUGADOR',
          title: 'Modo Arcade',
          text: 'Cinco combates seguidos: tu sombra, tu rival y el campeón de la Torre. Consigue el rango S.',
          accent: '#f43f5e',
          progress: () => this.campaignInfo.arcade,
          action: () => this.onArcade?.(),
        },
        {
          id: 'story',
          label: 'HISTORIA',
          kicker: 'UN JUGADOR',
          title: 'Modo Historia',
          text: 'La Torre Kurogane quiere el Núcleo del Dojo Nocturno. Tres capítulos con diálogos y jefe final.',
          accent: '#fbbf24',
          progress: () => this.campaignInfo.story,
          action: () => this.onStory?.(),
        },
        {
          id: 'versus',
          label: 'VERSUS CPU',
          kicker: 'COMBATE LIBRE',
          title: 'Contra la máquina',
          text: 'Elige luchador, rival y escenario. Tres niveles de IA, de Normal a Maestro.',
          accent: '#22d3ee',
          action: () => this.showVersus(),
        },
        {
          id: '2p',
          label: '2 JUGADORES',
          kicker: 'COMBATE LOCAL',
          title: 'Cara a cara',
          text: 'Dos jugadores en el mismo equipo: teclado compartido o dos mandos.',
          accent: '#a78bfa',
          action: start('2P'),
        },
        {
          id: 'training',
          label: 'ENTRENAMIENTO',
          kicker: 'PRÁCTICA',
          title: 'Sala de entrenamiento',
          text: 'Dummy configurable, desafíos de combos, cajas de colisión y medidor de frames.',
          accent: '#34d399',
          action: start('TRAINING'),
        },
        {
          id: 'controls',
          label: 'CONTROLES',
          kicker: 'AYUDA',
          title: 'Lista de movimientos',
          text: 'Teclado, mando y todos los especiales de cada luchador.',
          accent: '#94a3b8',
          action: () => this.onOpenControls?.(),
        },
      ],
      () => this.toAttract(),
      focusId
    );
  }

  private showVersus(): void {
    const go = (d: AiDifficulty) => () => {
      this.config.mode = 'AI';
      this.config.aiDifficulty = d;
      this.onStart?.({ ...this.config });
    };
    const last = (d: AiDifficulty) => (this.config.aiDifficulty === d ? 'Último usado' : '');
    this.setMenu(
      'VERSUS CPU · DIFICULTAD',
      [
        {
          id: 'NORMAL',
          label: 'NORMAL',
          kicker: 'NIVEL 1',
          title: 'Normal',
          text: 'Reacciona despacio y bloquea a veces. Ideal para aprender los especiales.',
          accent: '#34d399',
          progress: () => last('NORMAL'),
          action: go('NORMAL'),
        },
        {
          id: 'HARD',
          label: 'COMPETITIVO',
          kicker: 'NIVEL 2',
          title: 'Competitivo',
          text: 'Castiga errores, usa antiaéreos y cancela a especiales.',
          accent: '#fbbf24',
          progress: () => last('HARD'),
          action: go('HARD'),
        },
        {
          id: 'MASTER',
          label: 'MAESTRO',
          kicker: 'NIVEL 3',
          title: 'Maestro',
          text: 'Reacción de élite. Sin trampas, pero sin piedad.',
          accent: '#f43f5e',
          progress: () => last('MASTER'),
          action: go('MASTER'),
        },
        {
          id: 'back',
          label: 'VOLVER',
          kicker: '',
          title: 'Volver',
          text: 'Regresa al menú principal.',
          accent: '#64748b',
          back: true,
          action: () => this.showMain('versus'),
        },
      ],
      () => this.showMain('versus'),
      this.config.aiDifficulty
    );
  }

  private setMenu(title: string, entries: MenuEntry[], onBack: () => void, focusId?: string): void {
    this.entries = entries;
    this.menuTitle = title;
    this.onMenuBack = onBack;
    const idx = focusId ? entries.findIndex((e) => e.id === focusId) : -1;
    this.focus = idx >= 0 ? idx : 0;
    this.renderMenu();
  }

  private renderMenu(): void {
    this.menuEl.innerHTML = '';
    if (this.menuTitle) {
      const t = document.createElement('div');
      t.className = 'ls-menu-title';
      t.textContent = this.menuTitle;
      this.menuEl.appendChild(t);
    }
    this.entries.forEach((e, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ls-item' + (i === this.focus ? ' focus' : '') + (e.back ? ' back' : '');
      b.style.setProperty('--accent', e.accent);
      b.innerHTML = '<span></span><small></small>';
      b.querySelector('span')!.textContent = e.label;
      b.querySelector('small')!.textContent = e.progress?.() ?? '';
      b.addEventListener('mouseenter', () => this.setFocus(i, false));
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.setFocus(i, false);
        this.select();
      });
      this.menuEl.appendChild(b);
    });
    this.syncInfo();
  }

  private setFocus(i: number, sound = true): void {
    if (i === this.focus) return;
    this.focus = i;
    if (sound) sfx.play('uiMove');
    this.menuEl.querySelectorAll('.ls-item').forEach((el, k) => el.classList.toggle('focus', k === i));
    this.syncInfo();
  }

  private syncInfo(): void {
    const e = this.entries[this.focus];
    if (!e) return;
    this.infoEl.style.setProperty('--accent', e.accent);
    document.getElementById('ls-info-kicker')!.textContent = e.kicker;
    document.getElementById('ls-info-title')!.textContent = e.title;
    document.getElementById('ls-info-text')!.textContent = e.text;
    document.getElementById('ls-info-progress')!.textContent = e.progress?.() ?? '';
  }

  private select(): void {
    const e = this.entries[this.focus];
    if (!e) return;
    sfx.play(e.back ? 'uiBack' : 'uiConfirm');
    e.action();
  }

  private handle(a: Action): void {
    if (this.state === 'attract') {
      if (a === 'confirm' || a === 'start') this.enterMenu();
      return;
    }
    const n = this.entries.length;
    if (a === 'up') this.setFocus((this.focus - 1 + n) % n);
    else if (a === 'down') this.setFocus((this.focus + 1) % n);
    else if (a === 'confirm' || a === 'start') this.select();
    else if (a === 'back') this.onMenuBack?.();
  }

  // ---------- Plantel y lluvia ----------

  private buildLineup(): void {
    LINEUP.forEach((id, i) => {
      const set = CHARACTER_SPRITES[id];
      if (!set) return;
      const anim = new SpriteAnimator();
      const lookRight = i < LINEUP.length / 2;
      anim.flip = lookRight ? set.facing === 'left' : set.facing === 'right';
      anim.play(set.idle, true);
      anim.tick((i * 0.37) % 1.6);
      const c = anim.canvas;
      c.className = 'landing-lineup-fighter';
      c.style.zIndex = String(10 - Math.abs(i - 2));
      c.title = CHARACTERS[id].name;
      this.lineupEl.appendChild(c);
      this.lineup.push(anim);
    });
  }

  private sizeRain(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.rain.width = Math.floor(window.innerWidth * dpr);
    this.rain.height = Math.floor(window.innerHeight * dpr);
    const count = Math.floor((window.innerWidth * window.innerHeight) / 9000);
    // Lluvia decorativa: no forma parte de la simulación, puede usar Math.random
    this.drops = Array.from({ length: count }, () => ({
      x: Math.random() * this.rain.width,
      y: Math.random() * this.rain.height,
      v: (700 + Math.random() * 600) * dpr,
      l: (10 + Math.random() * 18) * dpr,
    }));
  }

  private drawRain(dt: number): void {
    const ctx = this.rain.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = this.rain;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x -= d.v * dt * 0.12;
      if (d.y > h) {
        d.y = -d.l;
        d.x = Math.random() * w * 1.1;
      }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.l * 0.12, d.y - d.l);
    }
    ctx.stroke();
  }

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.lastT = performance.now();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const loop = (t: number) => {
      if (!this.isVisible()) return;
      const dt = Math.min((t - this.lastT) / 1000, 0.1);
      this.lastT = t;
      for (const a of this.lineup) a.tick(dt);
      if (!reduce) this.drawRain(dt);
      this.pollPads();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private pollPads(): void {
    if (this.overlayOpen()) return;
    let pads: (Gamepad | null)[] = [];
    try {
      pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    } catch {
      return;
    }
    const now: Record<Action, boolean> = { up: false, down: false, confirm: false, back: false, start: false };
    for (const pad of pads) {
      if (!pad?.connected) continue;
      const b = (i: number) => Boolean(pad.buttons[i]?.pressed);
      const ay = pad.axes[1] || 0;
      now.up ||= b(12) || ay < -0.5;
      now.down ||= b(13) || ay > 0.5;
      now.confirm ||= b(0);
      now.back ||= b(1);
      now.start ||= b(9);
    }
    for (const a of Object.keys(now) as Action[]) {
      if (now[a] && !this.padHeld[a]) {
        sfx.unlock();
        this.handle(a);
      }
      this.padHeld[a] = now[a];
    }
  }

  private toggleFullscreen(): void {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      // no disponible (Safari en iPhone): se ignora
    }
  }

  // ---------- API usada por main.ts ----------

  /** Texto de progreso de Arcade e Historia */
  public setCampaignInfo(arcade: string, story: string): void {
    this.campaignInfo = { arcade, story };
    if (this.isVisible()) this.renderMenu();
  }

  public syncMuteLabel(muted: boolean): void {
    this.audioBtn.textContent = muted ? '🔇' : '🔊';
    this.audioBtn.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
  }

  public show(current: Partial<LaunchConfig>, muted: boolean): void {
    // Personajes y trajes se recuerdan para colocar los cursores de la selección
    Object.assign(this.config, current, { showBoxes: false, showFrames: false });
    this.syncMuteLabel(muted);
    this.root.classList.remove('hidden');
    // Al volver de una partida se entra directamente al menú, no al título
    this.root.dataset.state = 'menu';
    this.padHeld = { up: true, down: true, confirm: true, back: true, start: true };
    this.showMain();
    this.startLoop();
  }

  public hide(): void {
    this.root.classList.add('hidden');
    cancelAnimationFrame(this.raf);
  }

  public isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }
}
