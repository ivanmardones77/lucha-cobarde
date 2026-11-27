import * as THREE from 'three';
import {
  CHARACTERS,
  getFighterMove,
  MatchState,
  SparkKind,
  VfxEffectKind,
} from '../core/types';
import { SpriteVfxAtlas, VfxSheetKey } from './SpriteVfxAtlas';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  drag: number;
  gravity: number;
  swirl: number;
  cx: number;
  cz: number;
  life: number;
  maxLife: number;
  size: number;
  stretch: number;
  colorStart: THREE.Color;
  colorEnd: THREE.Color;
}

interface AnimatedSpriteSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  sheet: VfxSheetKey;
  lastFrameIdx: number;
  life: number;
  maxLife: number;
  startScaleX: number;
  startScaleY: number;
  endScaleX: number;
  endScaleY: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  startOpacity: number;
  colorStart: THREE.Color;
  colorEnd: THREE.Color;
}

const MAX_PARTICLES = 450;
const _obj = new THREE.Object3D();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _col = new THREE.Color();

export class ParticleSystem3D {
  public group = new THREE.Group();
  private atlas = new SpriteVfxAtlas();

  public getProjectileTextures(): {
    energy: THREE.CanvasTexture;
    kunai: THREE.CanvasTexture;
  } {
    return {
      energy: this.atlas.projEnergyTex,
      kunai: this.atlas.projKunaiTex,
    };
  }

  // 1) GPU InstancedMesh de 450 partículas sprite luminosas orientadas por velocidad
  private particleGeo = new THREE.PlaneGeometry(0.18, 0.18);
  private particleMat: THREE.MeshBasicMaterial;
  private instancedParticles: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private cursor = 0;

  // 2) Pool unificado de sprites 2D animados por frames (2x2 sheets)
  private spriteQuadGeo = new THREE.PlaneGeometry(1, 1);
  private spritePool: AnimatedSpriteSlot[] = [];

  constructor() {
    this.particleMat = new THREE.MeshBasicMaterial({
      map: this.atlas.sparkSpriteTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    this.instancedParticles = new THREE.InstancedMesh(
      this.particleGeo,
      this.particleMat,
      MAX_PARTICLES
    );
    this.instancedParticles.frustumCulled = false;
    this.instancedParticles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    _obj.scale.set(0, 0, 0);
    _obj.updateMatrix();
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.instancedParticles.setMatrixAt(i, _obj.matrix);
      this.instancedParticles.setColorAt(i, _col.setHex(0xffffff));
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        drag: 0.94,
        gravity: 0,
        swirl: 0,
        cx: 0,
        cz: 0,
        life: 0,
        maxLife: 20,
        size: 1,
        stretch: 1,
        colorStart: new THREE.Color(0xffffff),
        colorEnd: new THREE.Color(0x38bdf8),
      });
    }
    this.instancedParticles.instanceMatrix.needsUpdate = true;
    if (this.instancedParticles.instanceColor) {
      this.instancedParticles.instanceColor.needsUpdate = true;
    }
    this.group.add(this.instancedParticles);

    for (let i = 0; i < 40; i++) this.createSpriteSlot();
  }

  private createSpriteSlot(): AnimatedSpriteSlot {
    const mat = new THREE.MeshBasicMaterial({
      map: this.atlas.sheets.hitSpark[0],
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.spriteQuadGeo, mat);
    mesh.visible = false;
    mesh.renderOrder = 12;
    this.group.add(mesh);

    const slot: AnimatedSpriteSlot = {
      mesh,
      mat,
      active: false,
      sheet: 'hitSpark',
      lastFrameIdx: -1,
      life: 0,
      maxLife: 14,
      startScaleX: 1,
      startScaleY: 1,
      endScaleX: 1.5,
      endScaleY: 1.5,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      startOpacity: 1,
      colorStart: new THREE.Color(0xffffff),
      colorEnd: new THREE.Color(0xffffff),
    };
    this.spritePool.push(slot);
    return slot;
  }

  private spawnAnimatedSprite(opts: {
    sheet: VfxSheetKey;
    x: number;
    y: number;
    z?: number;
    life: number;
    startScale: number;
    endScale: number;
    flipX?: boolean;
    rotX?: number;
    rotY?: number;
    rotZ?: number;
    spin?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    colorStart?: number;
    colorEnd?: number;
    opacity?: number;
    additive?: boolean;
    renderOrder?: number;
  }): void {
    let slot = this.spritePool.find((s) => !s.active);
    if (!slot) slot = this.createSpriteSlot();

    const additive = opts.additive ?? opts.sheet !== 'impactSmoke';
    slot.active = true;
    slot.sheet = opts.sheet;
    slot.lastFrameIdx = 0;
    slot.life = opts.life;
    slot.maxLife = opts.life;
    const signX = opts.flipX ? -1 : 1;
    slot.startScaleX = opts.startScale * signX;
    slot.startScaleY = opts.startScale;
    slot.endScaleX = opts.endScale * signX;
    slot.endScaleY = opts.endScale;
    slot.vx = opts.vx ?? 0;
    slot.vy = opts.vy ?? 0;
    slot.vz = opts.vz ?? 0;
    slot.spin = opts.spin ?? 0;
    slot.startOpacity = opts.opacity ?? 1;
    slot.colorStart.setHex(opts.colorStart ?? 0xffffff);
    slot.colorEnd.setHex(opts.colorEnd ?? opts.colorStart ?? 0xffffff);

    slot.mat.map = this.atlas.sheets[opts.sheet][0];
    slot.mat.blending = additive
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;
    slot.mat.color.copy(slot.colorStart);
    slot.mat.opacity = slot.startOpacity;

    slot.mesh.renderOrder = opts.renderOrder ?? (additive ? 14 : 10);
    slot.mesh.position.set(opts.x, opts.y, opts.z ?? 0.34);
    slot.mesh.rotation.set(opts.rotX ?? 0, opts.rotY ?? 0, opts.rotZ ?? 0);
    slot.mesh.scale.set(slot.startScaleX, slot.startScaleY, 1);
    slot.mesh.visible = true;
  }

  private allocParticle(opts: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    size?: number;
    stretch?: number;
    drag?: number;
    gravity?: number;
    swirl?: number;
    cx?: number;
    cz?: number;
    colorStart: number;
    colorEnd: number;
  }): void {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;

    p.active = true;
    p.x = opts.x;
    p.y = opts.y;
    p.z = opts.z;
    p.vx = opts.vx;
    p.vy = opts.vy;
    p.vz = opts.vz;
    p.drag = opts.drag ?? 0.93;
    p.gravity = opts.gravity ?? -0.002;
    p.swirl = opts.swirl ?? 0;
    p.cx = opts.cx ?? opts.x;
    p.cz = opts.cz ?? opts.z;
    p.life = opts.life;
    p.maxLife = opts.life;
    p.size = opts.size ?? 1.0;
    p.stretch = opts.stretch ?? 1.8;
    p.colorStart.setHex(opts.colorStart);
    p.colorEnd.setHex(opts.colorEnd);
  }

  public spawnSparks(x: number, y: number, kind: SparkKind): void {
    if (kind === 'HIT') {
      this.spawnAnimatedSprite({
        sheet: 'impactSmoke',
        x,
        y,
        z: 0.24,
        life: 14,
        startScale: 0.95,
        endScale: 1.95,
        rotZ: Math.random() * Math.PI * 2,
        colorStart: 0xfef3c7,
        colorEnd: 0x94a3b8,
        opacity: 0.78,
        additive: false,
      });
      this.spawnAnimatedSprite({
        sheet: 'hitSpark',
        x,
        y,
        z: 0.36,
        life: 14,
        startScale: 1.45,
        endScale: 2.35,
        rotZ: (Math.random() - 0.5) * 0.9,
        spin: (Math.random() - 0.5) * 0.03,
        colorStart: 0xffffff,
        colorEnd: 0xffedd5,
        opacity: 1,
      });
    } else if (kind === 'GOLD') {
      this.spawnAnimatedSprite({
        sheet: 'impactSmoke',
        x,
        y,
        z: 0.24,
        life: 17,
        startScale: 1.3,
        endScale: 2.6,
        rotZ: Math.random() * Math.PI * 2,
        colorStart: 0xfef08a,
        colorEnd: 0x64748b,
        opacity: 0.85,
        additive: false,
      });
      this.spawnAnimatedSprite({
        sheet: 'superBurst',
        x,
        y,
        z: 0.35,
        life: 18,
        startScale: 1.75,
        endScale: 3.15,
        rotZ: Math.random() * Math.PI * 2,
        spin: 0.04,
        colorStart: 0xffffff,
        colorEnd: 0xfacc15,
        opacity: 1,
      });
      this.spawnAnimatedSprite({
        sheet: 'hitSpark',
        x,
        y,
        z: 0.4,
        life: 15,
        startScale: 1.65,
        endScale: 2.65,
        rotZ: (Math.random() - 0.5) * 1.2,
        colorStart: 0xffffff,
        colorEnd: 0xfde047,
        opacity: 1,
      });
    } else if (kind === 'BLOCK') {
      this.spawnAnimatedSprite({
        sheet: 'impactSmoke',
        x,
        y,
        z: 0.24,
        life: 13,
        startScale: 0.85,
        endScale: 1.7,
        rotZ: Math.random() * Math.PI * 2,
        colorStart: 0xe0f2fe,
        colorEnd: 0x64748b,
        opacity: 0.65,
        additive: false,
      });
      this.spawnAnimatedSprite({
        sheet: 'blockShield',
        x,
        y,
        z: 0.38,
        life: 16,
        startScale: 1.35,
        endScale: 2.3,
        rotZ: (Math.random() - 0.5) * 0.4,
        colorStart: 0xe0f2fe,
        colorEnd: 0x0284c7,
        opacity: 1,
      });
    } else if (kind === 'DASH' || kind === 'BACKDASH') {
      this.spawnAnimatedSprite({
        sheet: 'impactSmoke',
        x,
        y: Math.max(0.32, y * 0.35),
        z: 0.2,
        life: 14,
        startScale: 0.75,
        endScale: 1.55,
        rotZ: Math.random() * Math.PI,
        vx: kind === 'DASH' ? -0.025 : 0.025,
        vy: 0.015,
        colorStart: 0xe0f2fe,
        colorEnd: 0x475569,
        opacity: 0.72,
        additive: false,
      });
    }

    const count =
      kind === 'GOLD' ? 22 : kind === 'DASH' || kind === 'BACKDASH' ? 8 : 12;
    const palette: Record<SparkKind, [number, number]> = {
      HIT: [0xfffbeb, 0xf97316],
      BLOCK: [0xe0f2fe, 0x0284c7],
      GOLD: [0xffffff, 0xfacc15],
      DASH: [0xbae6fd, 0x6366f1],
      BACKDASH: [0xffffff, 0x38bdf8],
    };
    const [cStart, cEnd] = palette[kind] ?? [0xffffff, 0x38bdf8];

    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd =
        kind === 'DASH' || kind === 'BACKDASH'
          ? 0.05 + Math.random() * 0.09
          : 0.09 + Math.random() * 0.22;
      this.allocParticle({
        x,
        y,
        z: 0.28 + (Math.random() - 0.5) * 0.16,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        vz: (Math.random() - 0.5) * 0.08,
        life: 12 + Math.floor(Math.random() * 9),
        size: kind === 'GOLD' ? 1.45 : 1.1,
        stretch: kind === 'GOLD' ? 3.2 : 2.3,
        gravity: kind === 'HIT' || kind === 'GOLD' ? -0.004 : 0,
        colorStart: cStart,
        colorEnd: cEnd,
      });
    }
  }

  public spawnShockwave(
    x: number,
    y: number,
    colorHex = 0xfacc15,
    growSpeed = 0.26,
    maxLife = 18,
    horizontal = false
  ): void {
    const endSize = 1.6 + growSpeed * 5.2;
    this.spawnAnimatedSprite({
      sheet: horizontal ? 'impactSmoke' : 'superBurst',
      x,
      y: horizontal ? Math.max(0.05, y) : y,
      z: horizontal ? 0 : 0.34,
      life: maxLife,
      startScale: 0.85,
      endScale: endSize,
      rotX: horizontal ? -Math.PI / 2 : 0,
      rotZ: Math.random() * Math.PI * 2,
      colorStart: 0xffffff,
      colorEnd: colorHex,
      opacity: horizontal ? 0.85 : 0.95,
      additive: !horizontal,
    });
  }

  public spawnSlashArc(
    x: number,
    y: number,
    facing: 1 | -1,
    colorHex: number,
    angle = 0,
    scale = 1.15
  ): void {
    this.spawnAnimatedSprite({
      sheet: 'slashArc',
      x: x + facing * 0.52,
      y,
      z: 0.38,
      life: 13,
      startScale: 1.65 * scale,
      endScale: 2.35 * scale,
      flipX: facing === -1,
      rotZ: facing * angle,
      spin: facing * 0.045,
      colorStart: 0xffffff,
      colorEnd: colorHex,
      opacity: 1,
      additive: true,
    });
  }

  public spawnSpecialBurst(
    x: number,
    y: number,
    effect: VfxEffectKind,
    facing: 1 | -1,
    colorHex: number
  ): void {
    if (effect === 'EX_CHARGE') {
      this.spawnAnimatedSprite({
        sheet: 'superBurst',
        x,
        y,
        z: 0.36,
        life: 18,
        startScale: 1.6,
        endScale: 3.1,
        spin: 0.05 * facing,
        colorStart: 0xffffff,
        colorEnd: 0xfacc15,
      });
      this.spawnShockwave(x, 0.05, 0xfef08a, 0.24, 16, true);
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2;
        this.allocParticle({
          x: x + Math.cos(ang) * 0.25,
          y: y + Math.sin(ang) * 0.25,
          z: (Math.random() - 0.5) * 0.3,
          vx: Math.cos(ang) * (0.1 + Math.random() * 0.14),
          vy: 0.04 + Math.random() * 0.16,
          vz: Math.sin(ang) * 0.08,
          life: 16 + Math.floor(Math.random() * 8),
          size: 1.4,
          stretch: 3.0,
          swirl: 0.14 * facing,
          cx: x,
          cz: 0,
          colorStart: 0xffffff,
          colorEnd: 0xfacc15,
        });
      }
    } else if (effect === 'FOCUS_CHARGE') {
      this.spawnAnimatedSprite({
        sheet: 'superBurst',
        x,
        y,
        z: 0.34,
        life: 14,
        startScale: 2.1,
        endScale: 0.75,
        spin: -0.08 * facing,
        colorStart: 0xfef08a,
        colorEnd: 0xf97316,
      });
      for (let i = 0; i < 18; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 1.15 + Math.random() * 0.5;
        this.allocParticle({
          x: x + Math.cos(ang) * r,
          y: y + Math.sin(ang) * r,
          z: (Math.random() - 0.5) * 0.4,
          vx: -Math.cos(ang) * 0.085,
          vy: -Math.sin(ang) * 0.085,
          vz: 0,
          life: 13,
          size: 1.25,
          stretch: 2.6,
          drag: 0.99,
          gravity: 0,
          colorStart: 0xfef08a,
          colorEnd: 0xf97316,
        });
      }
    } else if (effect === 'ARMOR_ABSORB') {
      this.spawnAnimatedSprite({
        sheet: 'blockShield',
        x,
        y,
        z: 0.38,
        life: 16,
        startScale: 1.5,
        endScale: 2.55,
        colorStart: 0xffffff,
        colorEnd: 0xfacc15,
      });
      this.spawnAnimatedSprite({
        sheet: 'hitSpark',
        x,
        y,
        z: 0.42,
        life: 14,
        startScale: 1.35,
        endScale: 2.25,
        colorStart: 0xffffff,
        colorEnd: 0xf59e0b,
      });
    } else if (effect === 'COMMAND_GRAB') {
      this.spawnShockwave(x, 0.05, colorHex, 0.36, 22, true);
      this.spawnAnimatedSprite({
        sheet: 'superBurst',
        x,
        y,
        z: 0.38,
        life: 20,
        startScale: 1.9,
        endScale: 3.6,
        spin: 0.04,
        colorStart: 0xffffff,
        colorEnd: colorHex,
      });
      this.spawnAnimatedSprite({
        sheet: 'hitSpark',
        x,
        y,
        z: 0.42,
        life: 16,
        startScale: 1.8,
        endScale: 3.0,
        colorStart: 0xffffff,
        colorEnd: 0xfacc15,
      });
    } else if (effect === 'TELEPORT') {
      this.spawnAnimatedSprite({
        sheet: 'impactSmoke',
        x,
        y,
        z: 0.25,
        life: 16,
        startScale: 1.15,
        endScale: 2.25,
        colorStart: colorHex,
        colorEnd: 0x1e293b,
        opacity: 0.85,
        additive: false,
      });
      this.spawnSlashArc(x, y, facing, colorHex, 0.35, 1.05);
    } else if (effect === 'KI_CHARGE') {
      this.spawnShockwave(x, 0.05, colorHex, 0.25, 20, true);
      this.spawnAnimatedSprite({
        sheet: 'superBurst',
        x,
        y: y + 0.2,
        z: 0.32,
        life: 18,
        startScale: 1.1,
        endScale: 2.4,
        vy: 0.025,
        spin: 0.06,
        colorStart: 0xffffff,
        colorEnd: colorHex,
      });
    } else if (effect === 'HEAVY_IMPACT') {
      this.spawnAnimatedSprite({
        sheet: 'impactSmoke',
        x,
        y,
        z: 0.26,
        life: 16,
        startScale: 1.25,
        endScale: 2.55,
        rotZ: Math.random() * Math.PI * 2,
        colorStart: 0xf8fafc,
        colorEnd: 0x64748b,
        opacity: 0.85,
        additive: false,
      });
      this.spawnAnimatedSprite({
        sheet: 'hitSpark',
        x,
        y,
        z: 0.38,
        life: 16,
        startScale: 1.85,
        endScale: 3.15,
        rotZ: (Math.random() - 0.5) * 0.8,
        colorStart: 0xffffff,
        colorEnd: colorHex,
      });
      this.spawnAnimatedSprite({
        sheet: 'superBurst',
        x,
        y,
        z: 0.34,
        life: 16,
        startScale: 1.35,
        endScale: 2.6,
        rotZ: Math.random() * Math.PI,
        colorStart: 0xffffff,
        colorEnd: colorHex,
        opacity: 0.85,
      });
    } else if (effect === 'SUPER_BURST') {
      this.spawnShockwave(x, 0.05, colorHex, 0.38, 22, true);
      this.spawnAnimatedSprite({
        sheet: 'superBurst',
        x,
        y,
        z: 0.38,
        life: 24,
        startScale: 2.2,
        endScale: 4.5,
        spin: 0.05,
        colorStart: 0xffffff,
        colorEnd: 0xfacc15,
      });
      this.spawnAnimatedSprite({
        sheet: 'hitSpark',
        x,
        y,
        z: 0.43,
        life: 20,
        startScale: 2.1,
        endScale: 3.8,
        rotZ: 0.45,
        spin: -0.04,
        colorStart: 0xffffff,
        colorEnd: colorHex,
      });
      for (let i = 0; i < 32; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.12 + Math.random() * 0.28;
        this.allocParticle({
          x,
          y,
          z: (Math.random() - 0.5) * 0.4,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          vz: (Math.random() - 0.5) * 0.14,
          life: 20 + Math.floor(Math.random() * 10),
          size: 1.65,
          stretch: 3.8,
          swirl: 0.08 * facing,
          cx: x,
          cz: 0,
          colorStart: 0xffffff,
          colorEnd: i % 2 === 0 ? 0xfacc15 : colorHex,
        });
      }
    }
  }

  public emitContinuousTrails(state: MatchState): void {
    // 1) Estelas de proyectiles
    for (const p of state.projectiles) {
      if (!p.active) continue;
      const spec = CHARACTERS[state.fighters[p.owner].character];
      const baseCol = p.isEx ? 0xfacc15 : spec.accentColor;
      const trailCount = p.isEx ? 3 : 2;
      for (let i = 0; i < trailCount; i++) {
        this.allocParticle({
          x: p.x - Math.sign(p.vx || 1) * (0.18 + Math.random() * 0.22),
          y: p.y + (Math.random() - 0.5) * 0.26,
          z: (Math.random() - 0.5) * 0.18,
          vx: -p.vx * 0.22 + (Math.random() - 0.5) * 0.02,
          vy: -p.vy * 0.22 + (Math.random() - 0.5) * 0.03,
          vz: (Math.random() - 0.5) * 0.03,
          life: p.isEx ? 14 : 10,
          size: p.isEx ? 1.3 : 0.9,
          stretch: 2.8,
          gravity: 0,
          colorStart: p.isEx ? 0xffffff : 0xe0f2fe,
          colorEnd: baseCol,
        });
      }
    }

    // 2) Estelas de ataques especiales activos
    for (const f of state.fighters) {
      const spec = CHARACTERS[f.character];
      if (f.state === 'DASH_F' || f.state === 'DASH_B') {
        this.allocParticle({
          x: f.x - f.facing * 0.25,
          y: 0.45 + Math.random() * 0.85,
          z: (Math.random() - 0.5) * 0.25,
          vx: -f.vx * 0.25,
          vy: 0.015,
          vz: 0,
          life: 10,
          size: 0.85,
          stretch: 2.8,
          gravity: 0,
          colorStart: 0xffffff,
          colorEnd: spec.accentColor,
        });
        continue;
      }

      if (f.state !== 'ATTACK') continue;
      const m = getFighterMove(f);
      if (!m) continue;

      const isActive =
        f.stateFrame >= m.startup && f.stateFrame <= m.startup + m.active;
      const color = m.isEx || m.isSuper ? 0xfacc15 : spec.accentColor;

      if (
        m.id === '236K' ||
        m.id === 'EX_236K' ||
        m.id === '41236K' ||
        m.id === 'SUPER'
      ) {
        for (let i = 0; i < (m.isSuper || m.isEx ? 3 : 2); i++) {
          const ang = state.frame * 0.45 + i * 2.1;
          this.allocParticle({
            x: f.x + Math.cos(ang) * 0.55,
            y: f.y + 0.75 + Math.random() * 0.7,
            z: Math.sin(ang) * 0.55,
            vx: -f.facing * 0.06,
            vy: 0.02 + Math.random() * 0.04,
            vz: 0,
            life: 12,
            size: m.isSuper || m.isEx ? 1.35 : 1.0,
            stretch: 3.0,
            swirl: 0.18 * f.facing,
            cx: f.x,
            cz: 0,
            gravity: 0,
            colorStart: 0xffffff,
            colorEnd: color,
          });
        }
      } else if (
        (m.id === '623P' || m.id === 'EX_623P') &&
        f.stateFrame <= m.startup + m.active
      ) {
        this.allocParticle({
          x: f.x + f.facing * 0.45 + (Math.random() - 0.5) * 0.25,
          y: f.y + 1.45,
          z: (Math.random() - 0.5) * 0.25,
          vx: -f.vx * 0.2,
          vy: -0.05,
          vz: 0,
          life: 13,
          size: m.isEx ? 1.4 : 1.05,
          stretch: 3.2,
          gravity: 0,
          colorStart: 0xffffff,
          colorEnd: color,
        });
      } else if (
        m.id === 'j214K' ||
        m.id === 'ROLL' ||
        (m.id === '6K' && f.character === 'KAZE')
      ) {
        this.allocParticle({
          x: f.x - f.facing * 0.2,
          y: f.y + (m.id === 'j214K' ? 0.55 : 0.28),
          z: (Math.random() - 0.5) * 0.2,
          vx: -f.vx * 0.3,
          vy: m.id === 'j214K' ? 0.06 : 0.02,
          vz: 0,
          life: 11,
          size: 0.95,
          stretch: 3.2,
          gravity: 0,
          colorStart: 0xffffff,
          colorEnd: spec.accentColor,
        });
      } else if (
        isActive &&
        (m.id === '214P' || m.id === 'EX_214P' || m.id === 'FOCUS')
      ) {
        this.allocParticle({
          x: f.x + f.facing * 0.9,
          y: f.y + 1.1 + (Math.random() - 0.5) * 0.35,
          z: 0.15,
          vx: f.facing * 0.12,
          vy: (Math.random() - 0.5) * 0.05,
          vz: 0,
          life: 10,
          size: 1.25,
          stretch: 3.0,
          gravity: 0,
          colorStart: 0xffffff,
          colorEnd: m.id === 'FOCUS' ? 0xf97316 : color,
        });
      }
    }
  }

  public spawnStageImpactParticles(
    x: number,
    isWaterStage: boolean,
    intensity: number,
    ground = false
  ): void {
    const count = Math.round(10 + intensity * 12);
    const startCol = isWaterStage ? 0xe0f2fe : 0xfef3c7;
    const endCol = isWaterStage ? 0x38bdf8 : 0xf59e0b;

    if (ground) {
      this.spawnAnimatedSprite({
        sheet: 'impactSmoke',
        x,
        y: 0.08,
        z: 0.05,
        life: 18,
        startScale: 1.0,
        endScale: 2.5 + intensity * 1.4,
        rotX: -Math.PI / 2,
        rotZ: Math.random() * Math.PI * 2,
        colorStart: startCol,
        colorEnd: endCol,
        opacity: 0.88,
        additive: false,
      });
      if (intensity >= 0.75) {
        this.spawnAnimatedSprite({
          sheet: 'hitSpark',
          x,
          y: 0.35,
          z: 0.35,
          life: 14,
          startScale: 1.25,
          endScale: 2.4,
          colorStart: 0xffffff,
          colorEnd: endCol,
        });
      }
    }

    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.allocParticle({
        x: x + (Math.random() - 0.5) * 0.7,
        y: 0.08 + Math.random() * 0.15,
        z: (Math.random() - 0.5) * 0.5,
        vx: side * (0.04 + Math.random() * 0.16 * intensity),
        vy: 0.08 + Math.random() * 0.18 * intensity,
        vz: (Math.random() - 0.5) * 0.12,
        life: 14 + Math.floor(Math.random() * 10),
        size: isWaterStage ? 1.0 : 1.2,
        stretch: isWaterStage ? 2.4 : 1.9,
        gravity: -0.012,
        colorStart: startCol,
        colorEnd: endCol,
      });
    }
  }

  public update(): void {
    // 1) Actualizar InstancedMesh de micro-partículas sprite
    let hasMatrixUpdates = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      hasMatrixUpdates = true;
      p.life--;
      if (p.life <= 0) {
        p.active = false;
        _obj.scale.set(0, 0, 0);
        _obj.updateMatrix();
        this.instancedParticles.setMatrixAt(i, _obj.matrix);
        continue;
      }

      if (p.swirl !== 0) {
        const dx = p.x - p.cx;
        const dz = p.z - p.cz;
        const cos = Math.cos(p.swirl);
        const sin = Math.sin(p.swirl);
        p.x = p.cx + dx * cos - dz * sin;
        p.z = p.cz + dx * sin + dz * cos;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;
      p.vz *= p.drag;

      const t = 1 - p.life / p.maxLife;
      const alphaScale = Math.max(0.05, (1 - t) * p.size);
      const speed = Math.hypot(p.vx, p.vy, p.vz);

      _obj.position.set(p.x, p.y, p.z);
      if (speed > 0.002) {
        _dir.set(p.vx, p.vy, 0).normalize();
        if (_dir.lengthSq() > 0.01) {
          _quat.setFromUnitVectors(_up, _dir);
          _obj.quaternion.copy(_quat);
        } else {
          _obj.quaternion.identity();
        }
        const stretchFactor = Math.min(4.2, 1 + speed * 14 * p.stretch);
        _obj.scale.set(alphaScale, alphaScale * stretchFactor, alphaScale);
      } else {
        _obj.quaternion.identity();
        _obj.scale.set(alphaScale, alphaScale, alphaScale);
      }
      _obj.updateMatrix();
      this.instancedParticles.setMatrixAt(i, _obj.matrix);

      _col.copy(p.colorStart).lerp(p.colorEnd, t);
      this.instancedParticles.setColorAt(i, _col);
    }

    if (hasMatrixUpdates) {
      this.instancedParticles.instanceMatrix.needsUpdate = true;
      if (this.instancedParticles.instanceColor) {
        this.instancedParticles.instanceColor.needsUpdate = true;
      }
    }

    // 2) Actualizar sprites 2D animados frame-por-frame (4 frames por sheet)
    for (let i = 0; i < this.spritePool.length; i++) {
      const s = this.spritePool[i];
      if (!s.active) continue;

      s.life--;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }

      const t = 1 - s.life / s.maxLife;
      const frameIdx = Math.min(3, Math.floor(t * 4));
      if (frameIdx !== s.lastFrameIdx) {
        s.lastFrameIdx = frameIdx;
        s.mat.map = this.atlas.sheets[s.sheet][frameIdx];
      }

      s.mesh.position.x += s.vx;
      s.mesh.position.y += s.vy;
      s.mesh.position.z += s.vz;
      s.mesh.rotation.z += s.spin;

      const easeOut = 1 - Math.pow(1 - t, 2);
      const sx = s.startScaleX + (s.endScaleX - s.startScaleX) * easeOut;
      const sy = s.startScaleY + (s.endScaleY - s.startScaleY) * easeOut;
      s.mesh.scale.set(sx, sy, 1);

      s.mat.color.copy(s.colorStart).lerp(s.colorEnd, t);
      const fadeOut = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;
      s.mat.opacity = Math.max(0, s.startOpacity * fadeOut);
    }
  }

  public dispose(): void {
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.spriteQuadGeo.dispose();
    for (const s of this.spritePool) s.mat.dispose();
    this.atlas.dispose();
  }
}
