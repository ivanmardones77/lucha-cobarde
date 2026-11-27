import * as THREE from 'three';
import {
  CHARACTERS,
  getFighterMove,
  MatchState,
  SparkKind,
  VfxEffectKind,
} from '../core/types';

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

interface SlashSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
  grow: number;
  spin: number;
}

interface ShockwaveSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
  growSpeed: number;
  horizontal: boolean;
}

interface StreakSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseLen: number;
}

const MAX_PARTICLES = 450;
const _obj = new THREE.Object3D();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _col = new THREE.Color();

export class ParticleSystem3D {
  public group = new THREE.Group();

  // 1) GPU InstancedMesh para 450 chispas/motas aditivas orientadas por velocidad
  private particleGeo = new THREE.OctahedronGeometry(0.085, 0);
  private particleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private instancedParticles: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private cursor = 0;

  // 2) Pool de arcos de tajo/ráfaga (Slash Arcs)
  private slashGeo = new THREE.RingGeometry(0.58, 0.98, 28, 1, -0.95, 1.9);
  private slashPool: SlashSlot[] = [];

  // 3) Pool de ondas de choque (verticales y en el suelo)
  private ringGeo = new THREE.RingGeometry(0.28, 0.44, 32);
  private ringPool: ShockwaveSlot[] = [];

  // 4) Pool de estelas/rayos direccionales de impacto
  private streakGeo = new THREE.ConeGeometry(0.065, 0.85, 4);
  private streakPool: StreakSlot[] = [];

  constructor() {
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

    for (let i = 0; i < 16; i++) this.createSlashSlot();
    for (let i = 0; i < 14; i++) this.createRingSlot();
    for (let i = 0; i < 42; i++) this.createStreakSlot();
  }

  private createSlashSlot(): SlashSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.slashGeo, mat);
    mesh.visible = false;
    this.group.add(mesh);
    const slot: SlashSlot = {
      mesh,
      mat,
      active: false,
      life: 0,
      maxLife: 12,
      grow: 0.08,
      spin: 0.14,
    };
    this.slashPool.push(slot);
    return slot;
  }

  private createRingSlot(): ShockwaveSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.visible = false;
    this.group.add(mesh);
    const slot: ShockwaveSlot = {
      mesh,
      mat,
      active: false,
      life: 0,
      maxLife: 18,
      growSpeed: 0.25,
      horizontal: false,
    };
    this.ringPool.push(slot);
    return slot;
  }

  private createStreakSlot(): StreakSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.streakGeo, mat);
    mesh.visible = false;
    this.group.add(mesh);
    const slot: StreakSlot = {
      mesh,
      mat,
      active: false,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 12,
      baseLen: 1,
    };
    this.streakPool.push(slot);
    return slot;
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
    const count =
      kind === 'GOLD' ? 24 : kind === 'DASH' || kind === 'BACKDASH' ? 10 : 14;
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
          : 0.08 + Math.random() * 0.22;
      this.allocParticle({
        x,
        y,
        z: 0.22 + (Math.random() - 0.5) * 0.2,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        vz: (Math.random() - 0.5) * 0.1,
        life: 13 + Math.floor(Math.random() * 10),
        size: kind === 'GOLD' ? 1.35 : 1.0,
        stretch: kind === 'GOLD' ? 3.2 : 2.3,
        gravity: kind === 'HIT' || kind === 'GOLD' ? -0.004 : 0,
        colorStart: cStart,
        colorEnd: cEnd,
      });
    }

    if (kind === 'GOLD') {
      this.spawnShockwave(x, y, 0xfacc15, 0.25, 16, false);
      this.spawnImpactBurst(x, y, 0xfacc15, 8, 1.3);
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
    let slot = this.ringPool.find((r) => !r.active);
    if (!slot) slot = this.createRingSlot();

    slot.active = true;
    slot.life = maxLife;
    slot.maxLife = maxLife;
    slot.growSpeed = growSpeed;
    slot.horizontal = horizontal;
    slot.mat.color.setHex(colorHex);
    slot.mat.opacity = 0.95;
    slot.mesh.position.set(x, horizontal ? Math.max(0.04, y) : y, horizontal ? 0 : 0.35);
    slot.mesh.rotation.set(horizontal ? -Math.PI / 2 : 0, 0, 0);
    slot.mesh.scale.set(0.55, 0.55, 1);
    slot.mesh.visible = true;
  }

  public spawnSlashArc(
    x: number,
    y: number,
    facing: 1 | -1,
    colorHex: number,
    angle = 0,
    scale = 1.15
  ): void {
    let slot = this.slashPool.find((s) => !s.active);
    if (!slot) slot = this.createSlashSlot();

    slot.active = true;
    slot.life = 13;
    slot.maxLife = 13;
    slot.grow = 0.075 * scale;
    slot.spin = facing * 0.16;
    slot.mat.color.setHex(colorHex);
    slot.mat.opacity = 0.92;
    slot.mesh.position.set(x + facing * 0.45, y, 0.28);
    slot.mesh.rotation.set(0, facing === 1 ? 0 : Math.PI, angle);
    slot.mesh.scale.set(scale, scale, 1);
    slot.mesh.visible = true;
  }

  private spawnImpactBurst(
    x: number,
    y: number,
    colorHex: number,
    count = 8,
    scale = 1.0
  ): void {
    for (let i = 0; i < count; i++) {
      let slot = this.streakPool.find((s) => !s.active);
      if (!slot) slot = this.createStreakSlot();

      const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const spd = (0.14 + Math.random() * 0.14) * scale;
      slot.active = true;
      slot.vx = Math.cos(ang) * spd;
      slot.vy = Math.sin(ang) * spd;
      slot.vz = (Math.random() - 0.5) * 0.05;
      slot.life = 10 + Math.floor(Math.random() * 5);
      slot.maxLife = slot.life;
      slot.baseLen = (0.9 + Math.random() * 0.65) * scale;
      slot.mat.color.setHex(colorHex);
      slot.mat.opacity = 0.95;
      slot.mesh.position.set(x, y, 0.32);
      slot.mesh.rotation.set(0, 0, Math.atan2(slot.vy, slot.vx) - Math.PI / 2);
      slot.mesh.scale.set(0.85 * scale, slot.baseLen, 0.85 * scale);
      slot.mesh.visible = true;
    }
  }

  public spawnSpecialBurst(
    x: number,
    y: number,
    effect: VfxEffectKind,
    facing: 1 | -1,
    colorHex: number
  ): void {
    if (effect === 'EX_CHARGE') {
      this.spawnShockwave(x, y, 0xfacc15, 0.24, 16, false);
      this.spawnShockwave(x, 0.04, 0xfef08a, 0.22, 16, true);
      this.spawnImpactBurst(x, y, 0xfacc15, 10, 1.2);
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        this.allocParticle({
          x: x + Math.cos(ang) * 0.25,
          y: y + Math.sin(ang) * 0.25,
          z: (Math.random() - 0.5) * 0.3,
          vx: Math.cos(ang) * (0.1 + Math.random() * 0.14),
          vy: 0.04 + Math.random() * 0.16,
          vz: Math.sin(ang) * 0.08,
          life: 18 + Math.floor(Math.random() * 8),
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
      // Partículas convergiendo hacia el puño (implosión de energía)
      this.spawnShockwave(x, y, 0xfbbf24, 0.12, 14, false);
      for (let i = 0; i < 22; i++) {
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
      this.spawnShockwave(x, y, 0xfacc15, 0.3, 15, false);
      this.spawnImpactBurst(x, y, 0xffffff, 10, 1.35);
      for (let i = 0; i < 20; i++) {
        const ang = Math.random() * Math.PI * 2;
        this.allocParticle({
          x,
          y,
          z: 0.25,
          vx: Math.cos(ang) * (0.12 + Math.random() * 0.15),
          vy: Math.sin(ang) * (0.12 + Math.random() * 0.15),
          vz: (Math.random() - 0.5) * 0.1,
          life: 16,
          size: 1.45,
          stretch: 3.4,
          colorStart: 0xffffff,
          colorEnd: 0xf59e0b,
        });
      }
    } else if (effect === 'COMMAND_GRAB') {
      this.spawnShockwave(x, 0.05, colorHex, 0.34, 22, true);
      this.spawnShockwave(x, y, 0xfacc15, 0.28, 18, false);
      this.spawnImpactBurst(x, y, colorHex, 14, 1.55);
      for (let i = 0; i < 32; i++) {
        const ang = Math.random() * Math.PI * 2;
        this.allocParticle({
          x: x + Math.cos(ang) * 0.3,
          y: 0.2 + Math.random() * 0.4,
          z: Math.sin(ang) * 0.3,
          vx: Math.cos(ang) * (0.1 + Math.random() * 0.18),
          vy: 0.08 + Math.random() * 0.24,
          vz: Math.sin(ang) * 0.12,
          life: 20 + Math.floor(Math.random() * 8),
          size: 1.5,
          stretch: 3.2,
          gravity: -0.006,
          colorStart: 0xfef08a,
          colorEnd: colorHex,
        });
      }
    } else if (effect === 'TELEPORT') {
      this.spawnShockwave(x, y, colorHex, 0.2, 14, false);
      for (let i = 0; i < 26; i++) {
        this.allocParticle({
          x: x + (Math.random() - 0.5) * 0.5,
          y: 0.2 + Math.random() * 1.6,
          z: (Math.random() - 0.5) * 0.4,
          vx: -facing * (0.04 + Math.random() * 0.12),
          vy: (Math.random() - 0.3) * 0.12,
          vz: (Math.random() - 0.5) * 0.08,
          life: 16 + Math.floor(Math.random() * 6),
          size: 1.25,
          stretch: 3.6,
          colorStart: 0xffffff,
          colorEnd: colorHex,
        });
      }
    } else if (effect === 'KI_CHARGE') {
      this.spawnShockwave(x, 0.05, colorHex, 0.25, 20, true);
      for (let i = 0; i < 28; i++) {
        const ang = (i / 28) * Math.PI * 2;
        this.allocParticle({
          x: x + Math.cos(ang) * 0.55,
          y: 0.15 + Math.random() * 0.6,
          z: Math.sin(ang) * 0.55,
          vx: 0,
          vy: 0.1 + Math.random() * 0.14,
          vz: 0,
          life: 20,
          size: 1.3,
          stretch: 3.2,
          swirl: 0.22,
          cx: x,
          cz: 0,
          gravity: 0,
          colorStart: 0xffffff,
          colorEnd: colorHex,
        });
      }
    } else if (effect === 'HEAVY_IMPACT') {
      this.spawnShockwave(x, y, colorHex, 0.32, 18, false);
      this.spawnImpactBurst(x, y, colorHex, 12, 1.45);
      for (let i = 0; i < 26; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.1 + Math.random() * 0.24;
        this.allocParticle({
          x,
          y,
          z: 0.22,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          vz: (Math.random() - 0.5) * 0.12,
          life: 16 + Math.floor(Math.random() * 8),
          size: 1.4,
          stretch: 3.4,
          gravity: -0.004,
          colorStart: 0xffffff,
          colorEnd: colorHex,
        });
      }
    } else if (effect === 'SUPER_BURST') {
      this.spawnShockwave(x, y, 0xfacc15, 0.38, 24, false);
      this.spawnShockwave(x, 0.05, colorHex, 0.35, 24, true);
      this.spawnImpactBurst(x, y, 0xfacc15, 16, 1.75);
      for (let i = 0; i < 42; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.12 + Math.random() * 0.28;
        this.allocParticle({
          x,
          y,
          z: (Math.random() - 0.5) * 0.4,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          vz: (Math.random() - 0.5) * 0.14,
          life: 22 + Math.floor(Math.random() * 10),
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
    // 1) Estelas de proyectiles (Hadouken, Kunai, EX dorados, Air Hadouken)
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

    // 2) Estelas de ataques especiales activos y combinaciones avanzadas
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
      } else if (m.id === 'j214K' || m.id === 'ROLL' || (m.id === '6K' && f.character === 'KAZE')) {
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
      } else if (isActive && (m.id === '214P' || m.id === 'EX_214P' || m.id === 'FOCUS')) {
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

  public update(): void {
    // 1) Actualizar InstancedMesh de partículas
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
        _dir.set(p.vx, p.vy, p.vz).normalize();
        _quat.setFromUnitVectors(_up, _dir);
        _obj.quaternion.copy(_quat);
        const stretchFactor = Math.min(4.5, 1 + speed * 14 * p.stretch);
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

    // 2) Actualizar arcos de tajo
    for (let i = 0; i < this.slashPool.length; i++) {
      const s = this.slashPool[i];
      if (!s.active) continue;
      s.life--;
      s.mesh.scale.x += s.grow;
      s.mesh.scale.y += s.grow;
      s.mesh.rotation.z += s.spin;
      s.mat.opacity = Math.max(0, (s.life / s.maxLife) * 0.9);
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
      }
    }

    // 3) Actualizar ondas de choque
    for (let i = 0; i < this.ringPool.length; i++) {
      const r = this.ringPool[i];
      if (!r.active) continue;
      r.life--;
      r.mesh.scale.x += r.growSpeed;
      r.mesh.scale.y += r.growSpeed;
      r.mat.opacity = Math.max(0, (r.life / r.maxLife) * 0.88);
      if (r.life <= 0) {
        r.active = false;
        r.mesh.visible = false;
      }
    }

    // 4) Actualizar estelas direccionales
    for (let i = 0; i < this.streakPool.length; i++) {
      const st = this.streakPool[i];
      if (!st.active) continue;
      st.life--;
      st.mesh.position.x += st.vx;
      st.mesh.position.y += st.vy;
      st.mesh.position.z += st.vz;
      st.vx *= 0.9;
      st.vy *= 0.9;
      const ratio = Math.max(0, st.life / st.maxLife);
      st.mat.opacity = ratio;
      st.mesh.scale.y = st.baseLen * (0.4 + ratio * 0.8);
      if (st.life <= 0) {
        st.active = false;
        st.mesh.visible = false;
      }
    }
  }

  public dispose(): void {
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.slashGeo.dispose();
    this.ringGeo.dispose();
    this.streakGeo.dispose();
    for (const s of this.slashPool) s.mat.dispose();
    for (const r of this.ringPool) r.mat.dispose();
    for (const st of this.streakPool) st.mat.dispose();
  }
}
