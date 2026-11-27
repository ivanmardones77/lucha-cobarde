import * as THREE from 'three';
import { clamp } from '../core/collision';
import {
  AABB,
  MatchState,
  SparkKind,
  STAGE_HALF_WIDTH,
  VfxEffectKind,
} from '../core/types';
import { FighterRig3D } from './FighterRig3D';
import { ParticleSystem3D } from './ParticleSystem3D';

interface ProjSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
}

interface DebugBoxSlot {
  line: THREE.LineSegments;
  mat: THREE.LineBasicMaterial;
}

export class SceneView3D {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;
  private rigs: [FighterRig3D, FighterRig3D];
  private projGroup = new THREE.Group();
  private debugGroup = new THREE.Group();
  private particles = new ParticleSystem3D();
  private lastTrailFrame = -1;

  // Geometrías compartidas e instanciadas una sola vez (Object Pooling)
  private orbGeo = new THREE.SphereGeometry(0.32, 14, 14);
  private kunaiGeo = new THREE.ConeGeometry(0.14, 0.72, 4);
  private debugUnitGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));

  private orbPool: ProjSlot[] = [];
  private kunaiPool: ProjSlot[] = [];
  private debugPool: DebugBoxSlot[] = [];

  public showDebugBoxes = true;

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x070a14);
    this.scene.fog = new THREE.FogExp2(0x070a14, 0.032);

    this.camera = new THREE.PerspectiveCamera(
      32,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 2.25, 13.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.setupArena();
    this.prewarmPools();

    this.rigs = [new FighterRig3D('RYUJIN'), new FighterRig3D('KAZE')];
    this.scene.add(
      this.rigs[0].root,
      this.rigs[1].root,
      this.projGroup,
      this.particles.group,
      this.debugGroup
    );

    window.addEventListener('resize', this.onResize);
  }

  private prewarmPools(): void {
    for (let i = 0; i < 6; i++) this.createProjSlot('ORB');
    for (let i = 0; i < 6; i++) this.createProjSlot('KUNAI');
    for (let i = 0; i < 16; i++) this.createDebugSlot();
  }

  private createProjSlot(kind: 'ORB' | 'KUNAI'): ProjSlot {
    const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const mesh = new THREE.Mesh(
      kind === 'KUNAI' ? this.kunaiGeo : this.orbGeo,
      mat
    );
    if (kind === 'ORB') {
      mesh.scale.set(1.25, 0.9, 0.9);
    }
    mesh.visible = false;
    this.projGroup.add(mesh);
    const slot: ProjSlot = { mesh, mat };
    if (kind === 'KUNAI') this.kunaiPool.push(slot);
    else this.orbPool.push(slot);
    return slot;
  }

  private createDebugSlot(): DebugBoxSlot {
    const mat = new THREE.LineBasicMaterial({ color: 0xfacc15 });
    const line = new THREE.LineSegments(this.debugUnitGeo, mat);
    line.visible = false;
    this.debugGroup.add(line);
    const slot: DebugBoxSlot = { line, mat };
    this.debugPool.push(slot);
    return slot;
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private setupLights(): void {
    this.ambientLight = new THREE.AmbientLight(0xcbd5e1, 0.65);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.15);
    this.dirLight.position.set(4, 12, 8);
    this.dirLight.castShadow = true;
    this.scene.add(this.dirLight);

    const rimP1 = new THREE.PointLight(0x38bdf8, 1.8, 18);
    rimP1.position.set(-6, 3.5, -2.5);
    this.scene.add(rimP1);

    const rimP2 = new THREE.PointLight(0xf43f5e, 1.8, 18);
    rimP2.position.set(6, 3.5, -2.5);
    this.scene.add(rimP2);
  }

  private setupArena(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 9),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.45,
        metalness: 0.35,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(20, 20, 0x0ea5e9, 0x1e293b);
    grid.position.y = 0.01;
    this.scene.add(grid);

    const centerLine = new THREE.Mesh(
      new THREE.PlaneGeometry(STAGE_HALF_WIDTH * 2, 0.08),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
      })
    );
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.y = 0.015;
    this.scene.add(centerLine);

    const pillarGeo = new THREE.BoxGeometry(0.45, 4.8, 0.45);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.7,
      roughness: 0.3,
    });
    const neonStripGeo = new THREE.BoxGeometry(0.12, 4.6, 0.48);

    [-STAGE_HALF_WIDTH - 0.65, STAGE_HALF_WIDTH + 0.65].forEach((px, idx) => {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, 2.4, -0.9);
      const strip = new THREE.Mesh(
        neonStripGeo,
        new THREE.MeshBasicMaterial({
          color: idx === 0 ? 0x38bdf8 : 0xf43f5e,
        })
      );
      strip.position.set(px, 2.4, -0.9);
      this.scene.add(pillar, strip);
    });

    const toriiMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.5,
      roughness: 0.4,
    });
    const topBeam = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 0.45, 0.5),
      toriiMat
    );
    topBeam.position.set(0, 5.2, -4.5);
    const subBeam = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x0284c7 })
    );
    subBeam.position.set(0, 4.4, -4.5);
    const colL = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 5.4, 0.45),
      toriiMat
    );
    colL.position.set(-3.8, 2.7, -4.5);
    const colR = colL.clone();
    colR.position.x = 3.8;
    this.scene.add(topBeam, subBeam, colL, colR);
  }

  public spawnSparks(x: number, y: number, kind: SparkKind): void {
    this.particles.spawnSparks(x, y, kind);
  }

  public spawnShockwave(
    x: number,
    y: number,
    colorHex = 0xfacc15,
    growSpeed = 0.26,
    maxLife = 18,
    horizontal = false
  ): void {
    this.particles.spawnShockwave(
      x,
      y,
      colorHex,
      growSpeed,
      maxLife,
      horizontal
    );
  }

  public spawnSlashArc(
    x: number,
    y: number,
    facing: 1 | -1,
    colorHex: number,
    angle = 0,
    scale = 1.15
  ): void {
    this.particles.spawnSlashArc(x, y, facing, colorHex, angle, scale);
  }

  public spawnSpecialBurst(
    x: number,
    y: number,
    effect: VfxEffectKind,
    facing: 1 | -1,
    colorHex: number
  ): void {
    this.particles.spawnSpecialBurst(x, y, effect, facing, colorHex);
  }

  private syncProjectiles(state: MatchState): void {
    for (let i = 0; i < this.orbPool.length; i++) {
      this.orbPool[i].mesh.visible = false;
    }
    for (let i = 0; i < this.kunaiPool.length; i++) {
      this.kunaiPool[i].mesh.visible = false;
    }

    let orbIdx = 0;
    let kunaiIdx = 0;

    for (const p of state.projectiles) {
      const col = p.isEx
        ? 0xfacc15
        : state.fighters[p.owner].character === 'RYUJIN'
          ? 0x38bdf8
          : 0xfb7185;

      if (p.kind === 'KUNAI') {
        const slot =
          kunaiIdx < this.kunaiPool.length
            ? this.kunaiPool[kunaiIdx]
            : this.createProjSlot('KUNAI');
        kunaiIdx++;
        slot.mat.color.setHex(col);
        slot.mesh.position.set(p.x, p.y, 0);
        const angle = Math.atan2(p.vy, p.vx) - Math.PI / 2;
        slot.mesh.rotation.z = angle;
        slot.mesh.visible = true;
      } else {
        const slot =
          orbIdx < this.orbPool.length
            ? this.orbPool[orbIdx]
            : this.createProjSlot('ORB');
        orbIdx++;
        slot.mat.color.setHex(col);
        slot.mesh.position.set(p.x, p.y, 0);
        slot.mesh.scale.set(
          p.isEx ? 1.48 : 1.25,
          p.isEx ? 1.12 : 0.9,
          p.isEx ? 1.12 : 0.9
        );
        slot.mesh.visible = true;
      }
    }
  }

  public render(state: MatchState): void {
    const [p1, p2] = state.fighters;

    this.rigs[0].sync(p1, state.frame);
    this.rigs[1].sync(p2, state.frame);

    this.syncProjectiles(state);
    if (
      state.frame !== this.lastTrailFrame &&
      state.hitstop === 0 &&
      state.superFlashFrames === 0 &&
      state.phase === 'FIGHT'
    ) {
      this.particles.emitContinuousTrails(state);
      this.lastTrailFrame = state.frame;
    }
    this.particles.update();

    let targetX = (p1.x + p2.x) * 0.5;
    let targetY = 2.15 + Math.max(p1.y, p2.y) * 0.25;
    const dist = Math.abs(p1.x - p2.x);
    let targetZ = clamp(8.8 + dist * 0.95, 10.2, 16.5);

    if (state.superFlashFrames > 0 && state.superFlashOwner !== -1) {
      const owner = state.fighters[state.superFlashOwner];
      targetX = owner.x;
      targetY = owner.y + 1.5;
      targetZ = 6.2;
      this.ambientLight.intensity = 0.16;
      this.dirLight.intensity = 0.25;
    } else {
      this.ambientLight.intensity = 0.65;
      this.dirLight.intensity = 1.15;
    }

    this.camera.position.x += (targetX - this.camera.position.x) * 0.14;
    this.camera.position.y += (targetY - this.camera.position.y) * 0.14;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.14;

    const shakeX =
      state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake : 0;
    const shakeY =
      state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake : 0;

    this.camera.lookAt(this.camera.position.x + shakeX, 1.35 + shakeY, 0);

    this.updateDebugBoxes(state);
    this.renderer.render(this.scene, this.camera);
  }

  private updateDebugBoxes(state: MatchState): void {
    for (let i = 0; i < this.debugPool.length; i++) {
      this.debugPool[i].line.visible = false;
    }
    if (!this.showDebugBoxes) return;

    let idx = 0;
    const placeBox = (box: AABB, color: number, z: number): void => {
      const slot =
        idx < this.debugPool.length
          ? this.debugPool[idx]
          : this.createDebugSlot();
      idx++;
      slot.mat.color.setHex(color);
      slot.line.position.set(box.x, box.y, z);
      slot.line.scale.set(box.w, box.h, 1);
      slot.line.visible = true;
    };

    for (const f of state.fighters) {
      placeBox(f.pushbox, 0xfacc15, 0.5);
      if (f.hurtbox) placeBox(f.hurtbox, 0x22c55e, 0.54);
      if (f.hitbox) placeBox(f.hitbox, 0xef4444, 0.58);
    }
    for (const p of state.projectiles) {
      placeBox({ x: p.x, y: p.y, w: p.w, h: p.h }, 0xf97316, 0.6);
    }
  }

  public dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.particles.dispose();
    this.orbGeo.dispose();
    this.kunaiGeo.dispose();
    this.debugUnitGeo.dispose();
    for (const o of this.orbPool) o.mat.dispose();
    for (const k of this.kunaiPool) k.mat.dispose();
    for (const d of this.debugPool) d.mat.dispose();
    this.renderer.dispose();
  }
}
