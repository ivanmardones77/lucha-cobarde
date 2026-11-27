import * as THREE from 'three';
import blockShieldSheetImg from '../assets/images/vfx_block_shield_sheet_1795781073207.jpg';
import energyProjImg from '../assets/images/vfx_energy_proj_sprite_1795781923667.jpg';
import hitSparkSheetImg from '../assets/images/vfx_hit_spark_sheet_1795781072829.jpg';
import impactSmokeSheetImg from '../assets/images/vfx_impact_smoke_sheet_1795781076573.jpg';
import kunaiProjImg from '../assets/images/vfx_kunai_proj_sprite_1795781924501.jpg';
import slashArcSheetImg from '../assets/images/vfx_slash_arc_sheet_1795781074527.jpg';
import superBurstSheetImg from '../assets/images/vfx_super_burst_sheet_1795781074872.jpg';

export type VfxSheetKey =
  | 'hitSpark'
  | 'slashArc'
  | 'blockShield'
  | 'superBurst'
  | 'impactSmoke';

interface SheetLoadConfig {
  url: string;
  keyMode: 'ADDITIVE_COLOR' | 'ADDITIVE_TINTABLE' | 'ALPHA_SMOKE';
  insetRatio: number;
}

const SHEET_CONFIGS: Record<VfxSheetKey, SheetLoadConfig> = {
  hitSpark: {
    url: hitSparkSheetImg,
    keyMode: 'ADDITIVE_COLOR',
    insetRatio: 0.025,
  },
  slashArc: {
    url: slashArcSheetImg,
    keyMode: 'ADDITIVE_TINTABLE',
    insetRatio: 0.025,
  },
  blockShield: {
    url: blockShieldSheetImg,
    keyMode: 'ADDITIVE_TINTABLE',
    insetRatio: 0.025,
  },
  superBurst: {
    url: superBurstSheetImg,
    keyMode: 'ADDITIVE_COLOR',
    insetRatio: 0.03,
  },
  impactSmoke: {
    url: impactSmokeSheetImg,
    keyMode: 'ALPHA_SMOKE',
    insetRatio: 0.045,
  },
};

function createPlaceholderFrame(key: VfxSheetKey): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 28);
    if (key === 'impactSmoke') {
      grad.addColorStop(0, 'rgba(226, 232, 240, 0.7)');
      grad.addColorStop(1, 'rgba(226, 232, 240, 0)');
    } else if (key === 'blockShield') {
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.5)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      grad.addColorStop(0.45, 'rgba(250, 204, 21, 0.5)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  return c;
}

export function createSparkParticleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.ellipse(32, 32, 26, 2.5, 0, 0, Math.PI * 2);
  ctx.ellipse(32, 32, 2.5, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function keyImageRegionToCanvas(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  tileW: number,
  tileH: number,
  keyMode: 'ADDITIVE_COLOR' | 'ADDITIVE_TINTABLE' | 'ALPHA_SMOKE'
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = tileW;
  canvas.height = tileH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, tileW, tileH);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tileW, tileH);

  const imageData = ctx.getImageData(0, 0, tileW, tileH);
  const data = imageData.data;

  for (let py = 0; py < tileH; py++) {
    const ny = Math.min(py, tileH - 1 - py) / (tileH * 0.075);
    const edgeY = ny >= 1 ? 1 : ny * ny * (3 - 2 * ny);

    for (let px = 0; px < tileW; px++) {
      const nx = Math.min(px, tileW - 1 - px) / (tileW * 0.075);
      const edgeX = nx >= 1 ? 1 : nx * nx * (3 - 2 * nx);
      const edgeMask = edgeX * edgeY;

      const i = (py * tileW + px) * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const peak = Math.max(r, g, b);
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const signal = Math.max(peak, luma);

      const low = keyMode === 'ALPHA_SMOKE' ? 16 : 12;
      const high = keyMode === 'ALPHA_SMOKE' ? 72 : 58;
      const t = Math.max(0, Math.min(1, (signal - low) / (high - low)));
      const alphaNorm = t * t * (3 - 2 * t) * edgeMask;

      if (keyMode === 'ADDITIVE_TINTABLE') {
        // Keep saturation slightly lifted for bright highlights, grayscale-shifted so
        // EX gold / character accent tints render cleanly without muddying channels
        const v = Math.min(255, Math.round(peak * 0.72 + luma * 0.38));
        r = v;
        g = v;
        b = v;
      } else if (keyMode === 'ALPHA_SMOKE' && alphaNorm > 0.02) {
        const boost = 1 / Math.max(0.32, Math.sqrt(alphaNorm));
        r = Math.min(255, Math.round(r * boost));
        g = Math.min(255, Math.round(g * boost));
        b = Math.min(255, Math.round(b * boost));
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.round(alphaNorm * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export class SpriteVfxAtlas {
  public sheets: Record<VfxSheetKey, THREE.CanvasTexture[]>;
  public sparkSpriteTex: THREE.CanvasTexture;
  public projEnergyTex: THREE.CanvasTexture;
  public projKunaiTex: THREE.CanvasTexture;

  constructor() {
    this.sparkSpriteTex = createSparkParticleTexture();
    this.sheets = {
      hitSpark: this.initSheet('hitSpark'),
      slashArc: this.initSheet('slashArc'),
      blockShield: this.initSheet('blockShield'),
      superBurst: this.initSheet('superBurst'),
      impactSmoke: this.initSheet('impactSmoke'),
    };
    this.projEnergyTex = this.initSingleSprite(
      energyProjImg,
      'ADDITIVE_TINTABLE'
    );
    this.projKunaiTex = this.initSingleSprite(
      kunaiProjImg,
      'ADDITIVE_COLOR'
    );
  }

  private initSingleSprite(
    url: string,
    keyMode: 'ADDITIVE_COLOR' | 'ADDITIVE_TINTABLE'
  ): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(createPlaceholderFrame('superBurst'));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const padX = img.width * 0.03;
      const padY = img.height * 0.03;
      tex.image = keyImageRegionToCanvas(
        img,
        padX,
        padY,
        img.width - padX * 2,
        img.height - padY * 2,
        320,
        320,
        keyMode
      );
      tex.needsUpdate = true;
    };
    img.src = url;
    return tex;
  }

  private initSheet(key: VfxSheetKey): THREE.CanvasTexture[] {
    const frames: THREE.CanvasTexture[] = [];
    for (let i = 0; i < 4; i++) {
      const tex = new THREE.CanvasTexture(createPlaceholderFrame(key));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      frames.push(tex);
    }

    const cfg = SHEET_CONFIGS[key];
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.processLoadedSheet(img, frames, cfg);
    };
    img.src = cfg.url;
    return frames;
  }

  private processLoadedSheet(
    img: HTMLImageElement,
    frames: THREE.CanvasTexture[],
    cfg: SheetLoadConfig
  ): void {
    const tileSize = 256;
    const halfW = img.width * 0.5;
    const halfH = img.height * 0.5;
    const cropX = halfW * cfg.insetRatio;
    const cropY = halfH * cfg.insetRatio;
    const srcW = halfW - cropX * 2;
    const srcH = halfH - cropY * 2;

    for (let idx = 0; idx < 4; idx++) {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const sx = col * halfW + cropX;
      const sy = row * halfH + cropY;

      frames[idx].image = keyImageRegionToCanvas(
        img,
        sx,
        sy,
        srcW,
        srcH,
        tileSize,
        tileSize,
        cfg.keyMode
      );
      frames[idx].needsUpdate = true;
    }
  }

  public dispose(): void {
    this.sparkSpriteTex.dispose();
    this.projEnergyTex.dispose();
    this.projKunaiTex.dispose();
    for (const key of Object.keys(this.sheets) as VfxSheetKey[]) {
      for (const tex of this.sheets[key]) {
        tex.dispose();
      }
    }
  }
}
