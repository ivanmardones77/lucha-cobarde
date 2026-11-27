import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { clamp } from '../core/collision';
import {
  AABB,
  CHARACTERS,
  INTRO_DURATION_FRAMES,
  MatchState,
  SparkKind,
  StageId,
  VfxEffectKind,
} from '../core/types';
import { AlleyStage3D } from './AlleyStage3D';
import { FighterRig3D } from './FighterRig3D';
import { ParticleSystem3D } from './ParticleSystem3D';
import { RooftopStage3D } from './RooftopStage3D';

interface OrbSlot {
  group: THREE.Group;
  coreMat: THREE.MeshBasicMaterial;
  shellMat: THREE.MeshBasicMaterial;
  ringMat: THREE.MeshBasicMaterial;
  ring1: THREE.Mesh;
  ring2: THREE.Mesh;
}

interface KunaiSlot {
  group: THREE.Group;
  bladeMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
}

interface DebugBoxSlot {
  line: THREE.LineSegments;
  mat: THREE.LineBasicMaterial;
}

export class SceneView3D {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private isSoftwareGl = false;
  private contextLost = false;
  private hemiLight!: THREE.HemisphereLight;
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;
  private alleyStage: AlleyStage3D;
  private rooftopStage: RooftopStage3D | null = null;
  private currentStageId: StageId = 'ALLEY';
  private activeStage: AlleyStage3D | RooftopStage3D;
  private rigs: [FighterRig3D, FighterRig3D];
  private projGroup = new THREE.Group();
  private debugGroup = new THREE.Group();
  private particles = new ParticleSystem3D();
  private lastTrailFrame = -1;

  // Geometrías compartidas e instanciadas una sola vez (Object Pooling)
  private orbCoreGeo = new THREE.SphereGeometry(0.22, 14, 14);
  private orbShellGeo = new THREE.SphereGeometry(0.36, 14, 14);
  private orbRingGeo = new THREE.TorusGeometry(0.41, 0.032, 8, 22);

  private kunaiBladeGeo = new THREE.ConeGeometry(0.11, 0.56, 4);
  private kunaiEdgeGeo = new THREE.ConeGeometry(0.135, 0.62, 4);
  private kunaiHiltGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.24, 6);
  private kunaiRingGeo = new THREE.TorusGeometry(0.065, 0.016, 6, 14);
  private kunaiTrailGeo = new THREE.ConeGeometry(0.12, 0.65, 8);

  private debugUnitGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));

  private orbPool: OrbSlot[] = [];
  private kunaiPool: KunaiSlot[] = [];
  private debugPool: DebugBoxSlot[] = [];

  public showDebugBoxes = true;

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x050811);
    this.scene.fog = new THREE.FogExp2(0x060a14, 0.024);

    this.camera = new THREE.PerspectiveCamera(
      32,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 2.25, 13.5);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '')
      : '';
    this.isSoftwareGl =
      /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);

    this.setupLights();
    this.alleyStage = new AlleyStage3D();
    this.activeStage = this.alleyStage;
    this.prewarmPools();

    this.rigs = [new FighterRig3D('RYUJIN'), new FighterRig3D('KAZE')];
    this.scene.add(
      this.activeStage.group,
      this.rigs[0].root,
      this.rigs[1].root,
      this.rigs[0].trailGroup,
      this.rigs[1].trailGroup,
      this.projGroup,
      this.particles.group,
      this.debugGroup
    );

    if (!this.isSoftwareGl) {
      this.setupPostProcessing();
    }

    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.onContextLost
    );
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.onContextRestored
    );
    window.addEventListener('resize', this.onResize);
  }

  public setStage(stageId: StageId): void {
    if (this.currentStageId === stageId) return;
    this.scene.remove(this.activeStage.group);
    this.currentStageId = stageId;

    if (stageId === 'ROOFTOP') {
      if (!this.rooftopStage) {
        this.rooftopStage = new RooftopStage3D();
      }
      this.activeStage = this.rooftopStage;
      this.scene.background = new THREE.Color(0x0b0818);
      this.scene.fog = new THREE.FogExp2(0x100b22, 0.018);
    } else {
      this.activeStage = this.alleyStage;
      this.scene.background = new THREE.Color(0x050811);
      this.scene.fog = new THREE.FogExp2(0x060a14, 0.024);
    }
    this.scene.add(this.activeStage.group);
  }

  private setupPostProcessing(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(w, h);
    composer.addPass(new RenderPass(this.scene, this.camera));

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.42,
      0.38,
      0.84
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    this.composer = composer;
    this.bloomPass = bloom;
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
  };

  private prewarmPools(): void {
    for (let i = 0; i < 6; i++) this.createOrbSlot();
    for (let i = 0; i < 6; i++) this.createKunaiSlot();
    for (let i = 0; i < 16; i++) this.createDebugSlot();
  }

  private createOrbSlot(): OrbSlot {
    const group = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const core = new THREE.Mesh(this.orbCoreGeo, coreMat);
    const shell = new THREE.Mesh(this.orbShellGeo, shellMat);
    const ring1 = new THREE.Mesh(this.orbRingGeo, ringMat);
    ring1.rotation.x = 0.65;
    const ring2 = new THREE.Mesh(this.orbRingGeo, ringMat);
    ring2.rotation.y = 0.75;
    ring2.rotation.x = -0.55;

    group.add(core, shell, ring1, ring2);
    group.visible = false;
    this.projGroup.add(group);

    const slot: OrbSlot = { group, coreMat, shellMat, ringMat, ring1, ring2 };
    this.orbPool.push(slot);
    return slot;
  }

  private createKunaiSlot(): KunaiSlot {
    const group = new THREE.Group();
    const bladeMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xfb7185,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const blade = new THREE.Mesh(this.kunaiBladeGeo, bladeMat);
    blade.position.y = 0.14;
    const edge = new THREE.Mesh(this.kunaiEdgeGeo, glowMat);
    edge.position.y = 0.14;
    const hilt = new THREE.Mesh(this.kunaiHiltGeo, bladeMat);
    hilt.position.y = -0.2;
    const ring = new THREE.Mesh(this.kunaiRingGeo, glowMat);
    ring.position.y = -0.35;
    const trail = new THREE.Mesh(this.kunaiTrailGeo, glowMat);
    trail.position.y = -0.5;
    trail.rotation.z = Math.PI;

    group.add(blade, edge, hilt, ring, trail);
    group.visible = false;
    this.projGroup.add(group);

    const slot: KunaiSlot = { group, bladeMat, glowMat };
    this.kunaiPool.push(slot);
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
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.setSize(w, h);
    }
  };

  private setupLights(): void {
    this.hemiLight = new THREE.HemisphereLight(0xbfe8ff, 0x0f172a, 0.85);
    this.scene.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight(0xcbd5e1, 0.35);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
    this.dirLight.position.set(4, 11, 8);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.left = -9;
    this.dirLight.shadow.camera.right = 9;
    this.dirLight.shadow.camera.top = 7;
    this.dirLight.shadow.camera.bottom = -2;
    this.dirLight.shadow.camera.near = 1;
    this.dirLight.shadow.camera.far = 25;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    const rimP1 = new THREE.PointLight(0x38bdf8, 2.4, 20);
    rimP1.position.set(-6.5, 3.4, -2.6);
    this.scene.add(rimP1);

    const rimP2 = new THREE.PointLight(0xf43f5e, 2.4, 20);
    rimP2.position.set(6.5, 3.4, -2.6);
    this.scene.add(rimP2);
  }

  public spawnSparks(x: number, y: number, kind: SparkKind): void {
    this.particles.spawnSparks(x, y, kind);
  }

  public triggerStageImpact(x: number, intensity: number, ground = false): void {
    this.activeStage.triggerImpact(x, intensity);
    this.particles.spawnStageImpactParticles(
      x,
      this.currentStageId === 'ALLEY',
      intensity,
      ground
    );
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
      this.orbPool[i].group.visible = false;
    }
    for (let i = 0; i < this.kunaiPool.length; i++) {
      this.kunaiPool[i].group.visible = false;
    }

    let orbIdx = 0;
    let kunaiIdx = 0;

    for (const p of state.projectiles) {
      const ownerChar = state.fighters[p.owner].character;
      const col = p.isEx ? 0xfacc15 : CHARACTERS[ownerChar].accentColor;

      if (p.kind === 'KUNAI') {
        const slot =
          kunaiIdx < this.kunaiPool.length
            ? this.kunaiPool[kunaiIdx]
            : this.createKunaiSlot();
        kunaiIdx++;
        slot.glowMat.color.setHex(col);
        slot.group.position.set(p.x, p.y, 0);
        const angle = Math.atan2(p.vy, p.vx) - Math.PI / 2;
        slot.group.rotation.z = angle;
        slot.group.rotation.x = state.frame * 0.4;
        slot.group.scale.setScalar(p.isEx ? 1.25 : 1.0);
        slot.group.visible = true;
      } else {
        const slot =
          orbIdx < this.orbPool.length
            ? this.orbPool[orbIdx]
            : this.createOrbSlot();
        orbIdx++;
        slot.shellMat.color.setHex(col);
        slot.ringMat.color.setHex(col);
        slot.group.position.set(p.x, p.y, 0);
        const scale = p.isEx ? 1.26 : ownerChar === 'TITAN' ? 1.18 : 1.0;
        slot.group.scale.setScalar(scale);
        slot.ring1.rotation.z = state.frame * 0.34;
        slot.ring2.rotation.z = -state.frame * 0.42;
        slot.group.visible = true;
      }
    }
  }

  public render(state: MatchState): void {
    if (this.contextLost) return;

    this.setStage(state.stageId);
    const [p1, p2] = state.fighters;

    this.rigs[0].sync(p1, state.frame, state.hitstop);
    this.rigs[1].sync(p2, state.frame, state.hitstop);

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

    if (state.phase === 'INTRO') {
      this.renderer.toneMappingExposure = 1.06;
      this.hemiLight.intensity = 0.88;
      this.ambientLight.intensity = 0.38;
      this.dirLight.intensity = 1.4;

      const t = clamp(
        (INTRO_DURATION_FRAMES - state.phaseTimer) / INTRO_DURATION_FRAMES,
        0,
        1
      );
      const smooth = (u: number): number => {
        const c = clamp(u, 0, 1);
        return c * c * (3 - 2 * c);
      };
      const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

      let camX = 0;
      let camY = 2.15;
      let camZ = 12.98;
      let lookX = 0;
      let lookY = 1.35;

      if (t < 0.4) {
        const u = smooth(t / 0.4);
        camX = lerp(-4.35, -2.05, u);
        camY = lerp(1.12, 1.44, u);
        camZ = lerp(6.1, 5.25, u);
        lookX = lerp(p1.x - 0.15, p1.x + 0.15, u);
        lookY = lerp(1.05, 1.22, u);
      } else if (t < 0.76) {
        const u = smooth((t - 0.4) / 0.36);
        camX = lerp(-2.05, 2.35, u);
        camY = lerp(1.44, 1.52, u);
        camZ = lerp(5.25, 5.65, u);
        lookX = lerp(p1.x + 0.15, p2.x - 0.1, u);
        lookY = lerp(1.22, 1.24, u);
      } else {
        const u = smooth((t - 0.76) / 0.24);
        camX = lerp(2.35, 0, u);
        camY = lerp(1.52, 2.15, u);
        camZ = lerp(5.65, 12.98, u);
        lookX = lerp(p2.x - 0.1, 0, u);
        lookY = lerp(1.24, 1.35, u);
      }

      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(lookX, lookY, 0);
    } else {
      let targetX = (p1.x + p2.x) * 0.5;
      let targetY = 2.15 + Math.max(p1.y, p2.y) * 0.25;
      const dist = Math.abs(p1.x - p2.x);
      let targetZ = clamp(8.8 + dist * 0.95, 10.2, 16.5);
      let lookY = 1.35;

      if (state.slowMoFrames > 0) {
        // Dramatic low-angle K.O. zoom & high-contrast flash
        const loser = p1.hp <= p2.hp ? p1 : p2;
        targetX = loser.x * 0.75 + targetX * 0.25;
        targetY = 1.38;
        targetZ = 7.4;
        lookY = 1.05;
        const flashFactor = state.slowMoFrames > 36 ? 1.55 : 1.18;
        this.renderer.toneMappingExposure = flashFactor;
        if (this.bloomPass) {
          this.bloomPass.strength = state.slowMoFrames > 32 ? 0.85 : 0.48;
        }
        this.hemiLight.intensity = 0.65;
        this.ambientLight.intensity = 0.25;
        this.dirLight.intensity = 1.85;
      } else if (state.superFlashFrames > 0 && state.superFlashOwner !== -1) {
        const owner = state.fighters[state.superFlashOwner];
        targetX = owner.x;
        targetY = owner.y + 1.5;
        targetZ = 6.2;
        this.renderer.toneMappingExposure = 1.06;
        if (this.bloomPass) this.bloomPass.strength = 0.58;
        this.hemiLight.intensity = 0.2;
        this.ambientLight.intensity = 0.1;
        this.dirLight.intensity = 0.3;
      } else {
        this.renderer.toneMappingExposure = 1.06;
        if (this.bloomPass) this.bloomPass.strength = 0.42;
        this.hemiLight.intensity = 0.85;
        this.ambientLight.intensity = 0.35;
        this.dirLight.intensity = 1.35;
      }

      this.camera.position.x += (targetX - this.camera.position.x) * 0.14;
      this.camera.position.y += (targetY - this.camera.position.y) * 0.14;
      this.camera.position.z += (targetZ - this.camera.position.z) * 0.14;

      const shakeX =
        state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake : 0;
      const shakeY =
        state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake : 0;

      this.camera.lookAt(this.camera.position.x + shakeX, lookY + shakeY, 0);
    }

    this.activeStage.update(
      this.camera.position.x,
      state.frame,
      state.superFlashFrames > 0
    );

    this.updateDebugBoxes(state);
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private updateDebugBoxes(state: MatchState): void {
    for (let i = 0; i < this.debugPool.length; i++) {
      this.debugPool[i].line.visible = false;
    }
    if (!this.showDebugBoxes || state.phase === 'INTRO') return;

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
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.onContextLost
    );
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.onContextRestored
    );
    window.removeEventListener('resize', this.onResize);
    this.alleyStage.dispose();
    this.rooftopStage?.dispose();
    this.rigs[0].dispose();
    this.rigs[1].dispose();
    this.particles.dispose();
    this.orbCoreGeo.dispose();
    this.orbShellGeo.dispose();
    this.orbRingGeo.dispose();
    this.kunaiBladeGeo.dispose();
    this.kunaiEdgeGeo.dispose();
    this.kunaiHiltGeo.dispose();
    this.kunaiRingGeo.dispose();
    this.kunaiTrailGeo.dispose();
    this.debugUnitGeo.dispose();
    for (const o of this.orbPool) {
      o.coreMat.dispose();
      o.shellMat.dispose();
      o.ringMat.dispose();
    }
    for (const k of this.kunaiPool) {
      k.bladeMat.dispose();
      k.glowMat.dispose();
    }
    for (const d of this.debugPool) d.mat.dispose();
    if (this.bloomPass) this.bloomPass.dispose();
    if (this.composer) this.composer.dispose();
    this.renderer.dispose();
  }
}
