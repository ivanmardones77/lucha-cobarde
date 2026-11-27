import dojoBackdropImg from '../assets/images/dojo_hero_backdrop_1795773106114.jpg';
import kazePortraitImg from '../assets/images/portrait_kaze_1795773106772.jpg';
import ryujinPortraitImg from '../assets/images/portrait_ryujin_1795773106942.jpg';
import titanPortraitImg from '../assets/images/portrait_titan_1795779369938.jpg';
import { AiDifficulty } from '../core/ai';
import { CHARACTERS, CharacterId, GameMode, StageId } from '../core/types';

export interface LaunchConfig {
  mode: GameMode;
  stageId: StageId;
  aiDifficulty: AiDifficulty;
  p1Character: CharacterId;
  p2Character: CharacterId;
  showBoxes: boolean;
  showFrames: boolean;
  touchEnabled: boolean;
}

const PORTRAIT_MAP: Record<CharacterId, string> = {
  RYUJIN: ryujinPortraitImg,
  KAZE: kazePortraitImg,
  TITAN: titanPortraitImg,
};

export class LandingScreen {
  private root = document.getElementById('landing-screen')!;
  private bgImg = document.getElementById('landing-bg-img') as HTMLImageElement;
  private p1Img = document.getElementById(
    'landing-p1-img'
  ) as HTMLImageElement;
  private p2Img = document.getElementById(
    'landing-p2-img'
  ) as HTMLImageElement;

  private p1NameEl = document.getElementById('landing-p1-name')!;
  private p1MetaEl = document.getElementById('landing-p1-meta')!;
  private p2NameEl = document.getElementById('landing-p2-name')!;
  private p2MetaEl = document.getElementById('landing-p2-meta')!;
  private diffRow = document.getElementById('landing-diff-row')!;

  private modeBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-landing-mode]')
  );
  private stageBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-landing-stage]')
  );
  private diffBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-landing-diff]')
  );
  private p1Btns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-landing-p1]')
  );
  private p2Btns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-landing-p2]')
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

  public config: LaunchConfig = {
    mode: 'AI',
    stageId: 'ALLEY',
    aiDifficulty: 'HARD',
    p1Character: 'RYUJIN',
    p2Character: 'KAZE',
    showBoxes: true,
    showFrames: true,
    touchEnabled: false,
  };

  public onStart?: (config: LaunchConfig) => void;
  public onOpenControls?: () => void;
  public onToggleMute?: () => boolean;

  constructor(initialTouchEnabled: boolean) {
    this.config.touchEnabled = initialTouchEnabled;

    // Vincular arte generado con fallback seguro
    this.setupImage(this.bgImg, dojoBackdropImg);
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

    for (const btn of this.p1Btns) {
      btn.addEventListener('click', () => {
        this.config.p1Character = btn.dataset.landingP1 as CharacterId;
        this.syncUI();
      });
    }

    for (const btn of this.p2Btns) {
      btn.addEventListener('click', () => {
        this.config.p2Character = btn.dataset.landingP2 as CharacterId;
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
    if (current.mode !== undefined) this.config.mode = current.mode;
    if (current.stageId !== undefined) this.config.stageId = current.stageId;
    if (current.aiDifficulty !== undefined)
      this.config.aiDifficulty = current.aiDifficulty;
    if (current.p1Character !== undefined)
      this.config.p1Character = current.p1Character;
    if (current.p2Character !== undefined)
      this.config.p2Character = current.p2Character;
    if (current.showBoxes !== undefined)
      this.config.showBoxes = current.showBoxes;
    if (current.showFrames !== undefined)
      this.config.showFrames = current.showFrames;
    if (current.touchEnabled !== undefined)
      this.config.touchEnabled = current.touchEnabled;

    this.syncMuteLabel(muted);
    this.syncUI();
    this.root.classList.remove('hidden');
  }

  public hide(): void {
    this.root.classList.add('hidden');
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

    for (const btn of this.p1Btns) {
      btn.classList.toggle(
        'active',
        btn.dataset.landingP1 === this.config.p1Character
      );
    }
    for (const btn of this.p2Btns) {
      btn.classList.toggle(
        'active',
        btn.dataset.landingP2 === this.config.p2Character
      );
    }

    const p1Spec = CHARACTERS[this.config.p1Character];
    const p2Spec = CHARACTERS[this.config.p2Character];

    this.p1Img.classList.remove('hidden');
    this.p1Img.src = PORTRAIT_MAP[this.config.p1Character];
    this.p1Img.alt = `Retrato de combate de ${p1Spec.name}`;
    this.p1NameEl.textContent = p1Spec.name;
    this.p1NameEl.style.color = p1Spec.hudColor;
    this.p1MetaEl.textContent = `${p1Spec.archetype} · ${p1Spec.maxHp} HP`;

    this.p2Img.classList.remove('hidden');
    this.p2Img.src = PORTRAIT_MAP[this.config.p2Character];
    this.p2Img.alt = `Retrato de combate de ${p2Spec.name}`;
    this.p2NameEl.textContent = p2Spec.name;
    this.p2NameEl.style.color = p2Spec.hudColor;
    this.p2MetaEl.textContent = `${p2Spec.archetype} · ${p2Spec.maxHp} HP`;

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
