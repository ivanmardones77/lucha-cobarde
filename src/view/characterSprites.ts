import type { CharacterId } from '../core/types';

/** Hoja de sprites en rejilla generada por tools/sprites/process_sheet.py */
export interface SpriteSheet {
  url: string;
  frameW: number;
  frameH: number;
  cols: number;
  count: number;
  /** Centro de los pies dentro de cada fotograma (px de la hoja) */
  anchorX: number;
  anchorY: number;
  fps: number;
}

export interface CharacterSpriteSet {
  idle: SpriteSheet;
  select: SpriteSheet;
  /** Hacia dónde mira el personaje en la hoja original */
  facing: 'left' | 'right';
}

type SheetMeta = Omit<SpriteSheet, 'url' | 'fps'>;

// Cada personaje aporta src/assets/sprites/<id>_idle.webp|json y <id>_select.webp|json
const SHEET_URLS = import.meta.glob<string>('../assets/sprites/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const SHEET_META = import.meta.glob<SheetMeta>('../assets/sprites/*.json', {
  eager: true,
  import: 'default',
});

const FPS = { idle: 10, select: 14 } as const;

function findSheet(id: string, anim: 'idle' | 'select'): SpriteSheet | null {
  const base = `../assets/sprites/${id}_${anim}`;
  const url = SHEET_URLS[`${base}.webp`];
  const meta = SHEET_META[`${base}.json`];
  if (!url || !meta) return null;
  return { ...meta, url, fps: FPS[anim] };
}

const IDS: CharacterId[] = ['KAZE', 'RYUJIN', 'TITAN', 'VALKYRIE', 'VOLT'];

export const CHARACTER_SPRITES: Partial<Record<CharacterId, CharacterSpriteSet>> = {};
for (const id of IDS) {
  const idle = findSheet(id.toLowerCase(), 'idle');
  const select = findSheet(id.toLowerCase(), 'select');
  // Todas las hojas se generan mirando a la izquierda
  if (idle && select) CHARACTER_SPRITES[id] = { idle, select, facing: 'left' };
}

const imageCache = new Map<string, HTMLImageElement>();

export function loadSheetImage(url: string): HTMLImageElement {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
}

/**
 * Reproduce una hoja de sprites sobre un canvas, apoyando siempre los pies
 * en el mismo punto (centro inferior) para que el cambio IDLE → SELECT no salte.
 */
export class SpriteAnimator {
  /** Tamaño lógico del lienzo, en px de la hoja */
  static readonly W = 340;
  static readonly H = 330;

  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sheet: SpriteSheet | null = null;
  private img: HTMLImageElement | null = null;
  private frame = 0;
  private acc = 0;
  private loop = true;
  private onEnd?: () => void;
  public flip = false;
  public filter = 'none';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SpriteAnimator.W;
    this.canvas.height = SpriteAnimator.H;
    this.ctx = this.canvas.getContext('2d')!;
  }

  play(sheet: SpriteSheet, loop: boolean, onEnd?: () => void): void {
    this.sheet = sheet;
    this.img = loadSheetImage(sheet.url);
    this.frame = 0;
    this.acc = 0;
    this.loop = loop;
    this.onEnd = onEnd;
    this.draw();
  }

  clear(): void {
    this.sheet = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  tick(dt: number): void {
    const s = this.sheet;
    if (!s) return;
    this.acc += dt;
    const step = 1 / s.fps;
    while (this.acc >= step) {
      this.acc -= step;
      if (this.frame < s.count - 1) {
        this.frame++;
      } else if (this.loop) {
        this.frame = 0;
      } else {
        const cb = this.onEnd;
        this.onEnd = undefined;
        cb?.();
        break;
      }
    }
    this.draw();
  }

  private draw(): void {
    const s = this.sheet;
    const img = this.img;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!s || !img || !img.complete || img.naturalWidth === 0) return;
    const sx = (this.frame % s.cols) * s.frameW;
    const sy = Math.floor(this.frame / s.cols) * s.frameH;
    // Pies en el centro inferior del lienzo
    const dx = SpriteAnimator.W / 2 - s.anchorX;
    const dy = SpriteAnimator.H - 6 - s.anchorY;
    ctx.save();
    ctx.filter = this.filter;
    if (this.flip) {
      ctx.translate(SpriteAnimator.W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, sx, sy, s.frameW, s.frameH, dx, dy, s.frameW, s.frameH);
    ctx.restore();
  }
}
