import dojoBackdropImg from '../assets/images/dojo_hero_backdrop_1795773106114.webp';
import { AiDifficulty } from '../core/ai';
import {
  CHARACTERS,
  CharacterId,
  CostumePalette,
  GameMode,
  StageId,
} from '../core/types';
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

/** Orden del plantel en la portada (el mismo que en la pantalla de selección) */
const LINEUP: CharacterId[] = ['KAZE', 'RYUJIN', 'TITAN', 'VALKYRIE', 'VOLT'];

export class LandingScreen {
  private root = document.getElementById('landing-screen')!;
  private bgImg = document.getElementById('landing-bg-img') as HTMLImageElement;
  private diffRow = document.getElementById('landing-diff-row')!;
  private lineupEl = document.getElementById('landing-roster-lineup')!;
  private showcaseBtn = document.getElementById('landing-roster-showcase')!;

  private modeBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-landing-mode]')
  );
  private stageBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-landing-stage]')
  );
  private diffBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-landing-diff]')
  );

  private optBoxesBtn = document.getElementById('landing-opt-boxes')!;
  private optFramesBtn = document.getElementById('landing-opt-frames')!;
  private optTouchBtn = document.getElementById('landing-opt-touch')!;
  private optMuteBtn = document.getElementById('landing-opt-mute')!;
  private navAudioBtn = document.getElementById('landing-nav-audio')!;
  private navControlsBtn = document.getElementById('landing-nav-controls')!;
  private heroControlsBtn = document.getElementById('landing-btn-controls')!;
  private headerStartBtn = document.getElementById('landing-header-start')!;
  private mainStartBtn = document.getElementById('landing-btn-start')!;

  private lineup: SpriteAnimator[] = [];
  private raf = 0;
  private lastT = 0;
  /** Botones del mando ya pulsados al entrar (evita que el A de "volver" vuelva a entrar) */
  private padHeld = true;

  public config: LaunchConfig = {
    mode: 'AI',
    stageId: 'ALLEY',
    aiDifficulty: 'HARD',
    p1Character: 'RYUJIN',
    p2Character: 'KAZE',
    p1Palette: 0,
    p2Palette: 0,
    showBoxes: true,
    showFrames: true,
    touchEnabled: false,
  };

  public onStart?: (config: LaunchConfig) => void;
  public onOpenControls?: () => void;
  public onToggleMute?: () => boolean;

  constructor(initialTouchEnabled: boolean) {
    this.config.touchEnabled = initialTouchEnabled;

    this.setupImage(this.bgImg, dojoBackdropImg);
    this.buildLineup();
    this.syncUI();

    for (const btn of this.modeBtns) {
      btn.addEventListener('click', () => {
        this.config.mode = btn.dataset.landingMode as GameMode;
        this.syncUI();
      });
    }

    for (const btn of this.stageBtns) {
      btn.addEventListener('click', () => {
        this.config.stageId = btn.dataset.landingStage as StageId;
        this.syncUI();
      });
    }

    for (const btn of this.diffBtns) {
      btn.addEventListener('click', () => {
        if (this.config.mode !== 'AI') return;
        this.config.aiDifficulty = btn.dataset.landingDiff as AiDifficulty;
        this.syncUI();
      });
    }

    this.optBoxesBtn.addEventListener('click', () => {
      this.config.showBoxes = !this.config.showBoxes;
      this.syncUI();
    });

    this.optFramesBtn.addEventListener('click', () => {
      this.config.showFrames = !this.config.showFrames;
      this.syncUI();
    });

    this.optTouchBtn.addEventListener('click', () => {
      this.config.touchEnabled = !this.config.touchEnabled;
      this.syncUI();
    });

    const handleMute = () => {
      const muted = this.onToggleMute?.() ?? false;
      this.syncMuteLabel(muted);
    };
    this.optMuteBtn.addEventListener('click', handleMute);
    this.navAudioBtn.addEventListener('click', handleMute);

    const handleControls = () => this.onOpenControls?.();
    this.navControlsBtn.addEventListener('click', handleControls);
    this.heroControlsBtn.addEventListener('click', handleControls);

    const handleStart = () => this.onStart?.({ ...this.config });
    this.mainStartBtn.addEventListener('click', handleStart);
    this.headerStartBtn.addEventListener('click', handleStart);
    this.showcaseBtn.addEventListener('click', handleStart);

    this.startLineupLoop();
  }

  /** Los cinco luchadores en IDLE, mirando hacia el centro */
  private buildLineup(): void {
    LINEUP.forEach((id, i) => {
      const set = CHARACTER_SPRITES[id];
      if (!set) return;
      const anim = new SpriteAnimator();
      const lookRight = i < LINEUP.length / 2;
      anim.flip = lookRight ? set.facing === 'left' : set.facing === 'right';
      anim.play(set.idle, true);
      // Desfase para que no respiren todos a la vez
      anim.tick((i * 0.37) % 1.6);
      const c = anim.canvas;
      c.className = 'landing-lineup-fighter';
      c.style.zIndex = String(10 - Math.abs(i - 2));
      c.setAttribute('aria-hidden', 'true');
      c.title = CHARACTERS[id].name;
      this.lineupEl.appendChild(c);
      this.lineup.push(anim);
    });
  }

  private startLineupLoop(): void {
    cancelAnimationFrame(this.raf);
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (!this.isVisible()) return;
      const dt = Math.min((t - this.lastT) / 1000, 0.1);
      this.lastT = t;
      for (const a of this.lineup) a.tick(dt);
      this.pollPadStart();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** A o Start en cualquier mando abre la selección de personaje */
  private pollPadStart(): void {
    let pressed = false;
    try {
      for (const pad of navigator.getGamepads ? navigator.getGamepads() : []) {
        if (pad?.connected && (pad.buttons[0]?.pressed || pad.buttons[9]?.pressed)) {
          pressed = true;
        }
      }
    } catch {
      // Gamepad API no disponible
    }
    const controlsOpen = !document.getElementById('controls-modal')?.classList.contains('hidden');
    if (pressed && !this.padHeld && !controlsOpen) {
      this.onStart?.({ ...this.config });
    }
    this.padHeld = pressed;
  }

  private setupImage(img: HTMLImageElement, src: string): void {
    img.addEventListener('error', () => {
      img.classList.add('hidden');
    });
    img.src = src;
  }

  public syncMuteLabel(muted: boolean): void {
    this.optMuteBtn.textContent = muted ? 'Audio: Silencio' : 'Audio: Activo';
    this.optMuteBtn.classList.toggle('active', !muted);
    this.navAudioBtn.textContent = muted ? 'Audio (Off)' : 'Audio (On)';
  }

  public show(current: Partial<LaunchConfig>, muted: boolean): void {
    // Los personajes y trajes se recuerdan para colocar los cursores de la selección
    Object.assign(this.config, current);
    this.syncMuteLabel(muted);
    this.syncUI();
    this.root.classList.remove('hidden');
    this.padHeld = true;
    this.startLineupLoop();
  }

  public hide(): void {
    this.root.classList.add('hidden');
    cancelAnimationFrame(this.raf);
  }

  public isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  private syncUI(): void {
    for (const btn of this.modeBtns) {
      btn.classList.toggle('active', btn.dataset.landingMode === this.config.mode);
    }

    for (const btn of this.stageBtns) {
      btn.classList.toggle(
        'active',
        btn.dataset.landingStage === this.config.stageId
      );
    }

    const aiActive = this.config.mode === 'AI';
    this.diffRow.classList.toggle('opacity-45', !aiActive);
    for (const btn of this.diffBtns) {
      btn.disabled = !aiActive;
      btn.classList.toggle(
        'active',
        aiActive && btn.dataset.landingDiff === this.config.aiDifficulty
      );
    }

    this.optBoxesBtn.textContent = this.config.showBoxes
      ? 'Cajas 2D: Activas'
      : 'Cajas 2D: Ocultas';
    this.optBoxesBtn.classList.toggle('active', this.config.showBoxes);

    this.optFramesBtn.textContent = this.config.showFrames
      ? 'Frame Meter: Activo'
      : 'Frame Meter: Oculto';
    this.optFramesBtn.classList.toggle('active', this.config.showFrames);

    this.optTouchBtn.textContent = this.config.touchEnabled
      ? 'Controles Táctiles: Activos'
      : 'Controles Táctiles: Ocultos';
    this.optTouchBtn.classList.toggle('active', this.config.touchEnabled);
  }
}
