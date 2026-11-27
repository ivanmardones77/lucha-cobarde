import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { clamp } from '../core/collision';
import {
  AABB,
  INTRO_DURATION_FRAMES,
  MatchState,
  SparkKind,
  StageId,
  VfxEffectKind,
  getFighterAccentColor,
  getFighterMove,
} from '../core/types';
import { AlleyStage3D } from './AlleyStage3D';
import { FighterRig3D } from './FighterRig3D';
import { GLB_SPECS } from './glbSpecs';
import { CombatVfx } from '../vfx/CombatVfx';
import { GlbFighter, preloadGlb } from './GlbFighter';
import { ParticleSystem3D } from './ParticleSystem3D';
import { RooftopStage3D } from './RooftopStage3D';

const CombatLensShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uChromatic: { value: 0.0009 },
    uVignette: { value: 0.36 },
    uFlash: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uChromatic;
    uniform float uVignette;
    uniform float uFlash;
    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = length(centered);
      vec2 offset = centered * uChromatic * (0.4 + dist * 2.1);

      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      vec3 col = vec3(r, g, b);

      float vig = smoothstep(0.95, 0.25, dist);
      col *= mix(1.0 - uVignette, 1.0, vig);
      col += vec3(uFlash);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

interface OrbSlot {
  group: THREE.Group;
  spriteMesh: THREE.Mesh;
  coreFlareMesh: THREE.Mesh;
  spriteMat: THREE.MeshBasicMaterial;
  coreMat: THREE.MeshBasicMaterial;
}

interface KunaiSlot {
  group: THREE.Group;
  spriteMesh: THREE.Mesh;
  glowMesh: THREE.Mesh;
  spriteMat: THREE.MeshBasicMaterial;
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
  private envRT: THREE.WebGLRenderTarget | null = null;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private lensPass: ShaderPass | null = null;
  private isSoftwareGl = false;
  private contextLost = false;
  private hemiLight!: THREE.HemisphereLight;
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;
  private fighterLights!: [THREE.PointLight, THREE.PointLight];
  private projLights!: [THREE.PointLight, THREE.PointLight];
  private flashLight!: THREE.PointLight;
  private chromaticAmount = 0.0009;
  private impactFlashAmount = 0;

  private alleyStage: AlleyStage3D;
  private rooftopStage: RooftopStage3D | null = null;
  private currentStageId: StageId = 'ALLEY';
  private activeStage: AlleyStage3D | RooftopStage3D;
  private rigs: [FighterRig3D, FighterRig3D];
  private projGroup = new THREE.Group();
  private debugGroup = new THREE.Group();
  private particles = new ParticleSystem3D();
  /** Luchadores como modelo 3D con esqueleto (desactivar con ?sin3d) */
  private glbOn = false;
  private glbFighters = new Map<string, GlbFighter>(); // clave «hueco:personaje», se cargan al usarse
  /** Impactos y super (src/vfx/CombatVfx.ts) */
  private vfx = new CombatVfx();
  private lastRenderMs = performance.now();
  private lastStateFrame = 0;
  private projEnergyTex: THREE.CanvasTexture;
  private projKunaiTex: THREE.CanvasTexture;
  private lastTrailFrame = -1;

  // Geometrías compartidas e instanciadas una sola vez (Object Pooling)
  private orbPlaneGeo = new THREE.PlaneGeometry(1.68, 1.68);
  private orbCoreGeo = new THREE.PlaneGeometry(1.06, 1.06);
  private kunaiPlaneGeo = new THREE.PlaneGeometry(1.52, 0.86);
  private kunaiGlowGeo = new THREE.PlaneGeometry(1.75, 1.05);

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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '')
      : '';
    this.isSoftwareGl =
      /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);

    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.46;
    pmrem.dispose();

    const projTex = this.particles.getProjectileTextures();
    this.projEnergyTex = projTex.energy;
    this.projKunaiTex = projTex.kunai;

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
      this.vfx.group,
      this.debugGroup
    );

    {
      const q = new URLSearchParams(location.search);
      // Modelos 3D activos por defecto; ?sin3d vuelve a los muñecos de primitivas
      this.glbOn = !q.has('sin3d');
      // Precarga: al llegar al combate los modelos ya están descargados
      if (this.glbOn) for (const spec of Object.values(GLB_SPECS)) if (spec) preloadGlb(spec.url);
    }

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
      0.14,
      0.22,
      0.94
    );
    composer.addPass(bloom);

    const lensPass = new ShaderPass(CombatLensShader);
    composer.addPass(lensPass);
    composer.addPass(new OutputPass());

    this.composer = composer;
    this.bloomPass = bloom;
    this.lensPass = lensPass;
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
    const spriteMat = new THREE.MeshBasicMaterial({
      map: this.projEnergyTex,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      map: this.projEnergyTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const spriteMesh = new THREE.Mesh(this.orbPlaneGeo, spriteMat);
    const coreFlareMesh = new THREE.Mesh(this.orbCoreGeo, coreMat);
    coreFlareMesh.position.z = 0.04;

    group.add(spriteMesh, coreFlareMesh);
    group.visible = false;
    this.projGroup.add(group);

    const slot: OrbSlot = {
      group,
      spriteMesh,
      coreFlareMesh,
      spriteMat,
      coreMat,
    };
    this.orbPool.push(slot);
    return slot;
  }

  private createKunaiSlot(): KunaiSlot {
    const group = new THREE.Group();
    const spriteMat = new THREE.MeshBasicMaterial({
      map: this.projKunaiTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      map: this.projEnergyTex,
      color: 0xfb7185,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const glowMesh = new THREE.Mesh(this.kunaiGlowGeo, glowMat);
    const spriteMesh = new THREE.Mesh(this.kunaiPlaneGeo, spriteMat);
    spriteMesh.position.z = 0.03;

    group.add(glowMesh, spriteMesh);
    group.visible = false;
    this.projGroup.add(group);

    const slot: KunaiSlot = {
      group,
      spriteMesh,
      glowMesh,
      spriteMat,
      glowMat,
    };
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

    this.ambientLight = new THREE.AmbientLight(0xcbd5e1, 0.3);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
    this.dirLight.position.set(4, 11, 8);
    this.dirLight.castShadow = !this.isSoftwareGl;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.camera.left = -9;
    this.dirLight.shadow.camera.right = 9;
    this.dirLight.shadow.camera.top = 7;
    this.dirLight.shadow.camera.bottom = -2;
    this.dirLight.shadow.camera.near = 1;
    this.dirLight.shadow.camera.far = 25;
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);

    const rimP1 = new THREE.PointLight(0x38bdf8, 1.05, 16);
    rimP1.position.set(-6.5, 3.4, -2.6);
    this.scene.add(rimP1);

    const rimP2 = new THREE.PointLight(0xf43f5e, 1.05, 16);
    rimP2.position.set(6.5, 3.4, -2.6);
    this.scene.add(rimP2);

    // Subtle 3D character rim/aura lights casting onto wet puddles & metallic deck
    this.fighterLights = [
      new THREE.PointLight(0x38bdf8, 0.85, 6.5, 1.8),
      new THREE.PointLight(0xf43f5e, 0.85, 6.5, 1.8),
    ];
    this.fighterLights[0].position.set(-2.5, 1.4, 1.45);
    this.fighterLights[1].position.set(2.5, 1.4, 1.45);
    this.scene.add(this.fighterLights[0], this.fighterLights[1]);

    // Dynamic 3D projectile pool lights
    this.projLights = [
      new THREE.PointLight(0x38bdf8, 0, 5.8, 1.7),
      new THREE.PointLight(0xf43f5e, 0, 5.8, 1.7),
    ];
    this.scene.add(this.projLights[0], this.projLights[1]);

    // Controlled 3D hit / explosion flash light
    this.flashLight = new THREE.PointLight(0xfef08a, 0, 10, 1.7);
    this.flashLight.position.set(0, 1.4, 1.2);
    this.scene.add(this.flashLight);
  }

  /** dir: hacia dónde iba el golpe (+1 derecha, -1 izquierda) */
  public spawnSparks(x: number, y: number, kind: SparkKind, dir: 1 | -1 = 1, withVfx = true): void {
    this.particles.spawnSparks(x, y, kind);
    if (withVfx && (kind === 'HIT' || kind === 'GOLD')) this.vfx.hit(x, y, dir, kind === 'GOLD');
    this.flashLight.position.set(x, Math.max(0.6, y), 1.05);
    if (kind === 'GOLD') {
      this.flashLight.color.setHex(0xfde047);
      this.flashLight.intensity = 4.2;
      this.chromaticAmount = Math.max(this.chromaticAmount, 0.008);
      this.impactFlashAmount = Math.max(this.impactFlashAmount, 0.045);
    } else if (kind === 'HIT') {
      this.flashLight.color.setHex(0xfb923c);
      this.flashLight.intensity = 2.6;
      this.chromaticAmount = Math.max(this.chromaticAmount, 0.0045);
    } else {
      this.flashLight.color.setHex(0x38bdf8);
      this.flashLight.intensity = 2.0;
      this.chromaticAmount = Math.max(this.chromaticAmount, 0.0024);
    }
  }

  /** Solo para QA: 0 congela los efectos de impacto/super */
  public setVfxTimeScale(scale: number): void {
    this.vfx.timeScale = scale;
  }

  /** El super conecta: estallido grande del nuevo sistema de efectos */
  public superImpact(x: number, y: number, dir: 1 | -1, colorHex: number): void {
    this.vfx.superImpact(x, y, dir, colorHex);
    this.flashLight.position.set(x, Math.max(0.7, y), 1.2);
    this.flashLight.color.setHex(colorHex);
    this.flashLight.intensity = Math.max(this.flashLight.intensity, 6);
  }

  public triggerStageImpact(x: number, intensity: number, ground = false): void {
    this.activeStage.triggerImpact(x, intensity);
    this.particles.spawnStageImpactParticles(
      x,
      this.currentStageId === 'ALLEY',
      intensity,
      ground
    );
    this.flashLight.position.set(x, 0.7, 1.1);
    this.flashLight.color.setHex(0xfef08a);
    this.flashLight.intensity = Math.max(this.flashLight.intensity, 2.0 + intensity * 2.2);
    this.chromaticAmount = Math.max(this.chromaticAmount, 0.004 + intensity * 0.004);
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
    this.flashLight.position.set(x, Math.max(0.7, y), 1.25);
    this.flashLight.color.setHex(colorHex);
    if (
      effect === 'SUPER_BURST' ||
      effect === 'HEAVY_IMPACT' ||
      effect === 'COMMAND_GRAB'
    ) {
      this.flashLight.intensity = 4.8;
      this.chromaticAmount = Math.max(this.chromaticAmount, 0.0095);
      this.impactFlashAmount = Math.max(this.impactFlashAmount, 0.055);
    } else {
      this.flashLight.intensity = Math.max(this.flashLight.intensity, 3.0);
      this.chromaticAmount = Math.max(this.chromaticAmount, 0.004);
    }
  }

  private syncProjectiles(state: MatchState): void {
    for (let i = 0; i < this.orbPool.length; i++) {
      this.orbPool[i].group.visible = false;
    }
    for (let i = 0; i < this.kunaiPool.length; i++) {
      this.kunaiPool[i].group.visible = false;
    }
    this.projLights[0].intensity = 0;
    this.projLights[1].intensity = 0;

    let orbIdx = 0;
    let kunaiIdx = 0;

    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i];
      const owner = state.fighters[p.owner];
      const ownerChar = owner.character;
      const col = p.isEx ? 0xfacc15 : getFighterAccentColor(ownerChar, owner.palette);

      if (i < this.projLights.length) {
        const pl = this.projLights[i];
        pl.color.setHex(col);
        pl.intensity = p.isEx ? 3.8 : 2.5;
        pl.position.set(p.x, Math.max(0.45, p.y), 0.75);
      }

      if (p.kind === 'KUNAI') {
        const slot =
          kunaiIdx < this.kunaiPool.length
            ? this.kunaiPool[kunaiIdx]
            : this.createKunaiSlot();
        kunaiIdx++;
        slot.spriteMat.color.setHex(p.isEx ? 0xfef08a : 0xffffff);
        slot.glowMat.color.setHex(col);
        slot.group.position.set(p.x, p.y, 0.04);
        slot.group.rotation.z = Math.atan2(p.vy, p.vx);
        const s = p.isEx ? 1.26 : 1.0;
        slot.group.scale.set(s, p.vx < 0 ? -s : s, s);
        slot.group.visible = true;
      } else {
        const slot =
          orbIdx < this.orbPool.length
            ? this.orbPool[orbIdx]
            : this.createOrbSlot();
        orbIdx++;
        slot.spriteMat.color.setHex(col);
        slot.coreMat.color.setHex(p.isEx ? 0xfef9c3 : 0xffffff);
        slot.group.position.set(p.x, p.y, 0.04);
        const dir = p.vx >= 0 ? 1 : -1;
        const scale =
          (p.isEx ? 1.28 : ownerChar === 'TITAN' ? 1.2 : 1.0) *
          (0.95 + Math.sin(state.frame * 0.45) * 0.06);
        slot.group.scale.set(scale * dir, scale, scale);
        slot.coreFlareMesh.rotation.z = state.frame * 0.28;
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
    if (this.glbOn) {
      for (let i = 0; i < 2; i++) {
        const f = state.fighters[i];
        let use = false;
        for (const [key, g] of this.glbFighters) if (key.startsWith(`${i}:`) && key !== `${i}:${f.character}`) g.hide();
        const spec = GLB_SPECS[f.character];
        if (spec) {
          const key = `${i}:${f.character}`;
          let glb = this.glbFighters.get(key);
          if (!glb) {
            glb = new GlbFighter(spec);
            this.glbFighters.set(key, glb);
            this.scene.add(glb.root);
          }
          if (glb.ready) glb.sync(f, state.frame);
          // Mientras carga no se enseña el muñeco de primitivas (evita el «parpadeo» del modelo base)
          use = !glb.failed;
        }
        this.rigs[i].root.visible = !use;
      }
    }

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

    // Efectos de impacto y super: tiempo real de la vista (no afecta a la simulación)
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - this.lastRenderMs) / 1000);
    this.lastRenderMs = nowMs;
    if (state.frame < this.lastStateFrame) this.vfx.reset(); // revancha o combate nuevo
    this.lastStateFrame = state.frame;
    this.vfx.update(state, dt);

    if (state.phase === 'INTRO') {
      this.renderer.toneMappingExposure = 0.98;
      if (this.bloomPass) this.bloomPass.strength = 0.14;
      this.hemiLight.intensity = 0.72;
      this.ambientLight.intensity = 0.28;
      this.dirLight.intensity = 1.22;

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
        const loser = p1.hp <= p2.hp ? p1 : p2;
        targetX = loser.x * 0.75 + targetX * 0.25;
        targetY = 1.38;
        targetZ = 7.4;
        lookY = 1.05;
        const flashFactor = state.slowMoFrames > 36 ? 1.22 : 1.06;
        this.renderer.toneMappingExposure = flashFactor;
        if (this.bloomPass) {
          this.bloomPass.strength = state.slowMoFrames > 32 ? 0.26 : 0.17;
        }
        this.hemiLight.intensity = 0.56;
        this.ambientLight.intensity = 0.2;
        this.dirLight.intensity = 1.5;
      } else if (state.superFlashFrames > 0 && state.superFlashOwner !== -1) {
        const owner = state.fighters[state.superFlashOwner];
        targetX = owner.x;
        targetY = owner.y + 1.5;
        targetZ = 6.2;
        this.renderer.toneMappingExposure = 0.98;
        if (this.bloomPass) this.bloomPass.strength = 0.2;
        this.hemiLight.intensity = 0.22;
        this.ambientLight.intensity = 0.1;
        this.dirLight.intensity = 0.35;
      } else {
        this.renderer.toneMappingExposure = 0.98;
        if (this.bloomPass) this.bloomPass.strength = 0.14;
        this.hemiLight.intensity = 0.72;
        this.ambientLight.intensity = 0.28;
        this.dirLight.intensity = 1.2;
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

    // Controlled 3D fighter lights using costume accent colors
    for (let i = 0; i < 2; i++) {
      const f = state.fighters[i];
      const light = this.fighterLights[i];
      const move = getFighterMove(f);
      const isBoosted =
        f.armorHits > 0 || Boolean(move && (move.isEx || move.isSuper));
      light.color.setHex(
        isBoosted ? 0xfacc15 : getFighterAccentColor(f.character, f.palette)
      );
      light.position.set(f.x, f.y + 1.15, 1.25);
      const baseInt = f.superMeter >= 100 ? 1.25 : 0.85;
      light.intensity = isBoosted ? 1.95 : f.state === 'ATTACK' ? 1.55 : baseInt;
    }

    this.flashLight.intensity *= 0.8;
    if (this.flashLight.intensity < 0.04) this.flashLight.intensity = 0;

    if (state.slowMoFrames > 30) {
      this.chromaticAmount = Math.max(this.chromaticAmount, 0.012);
    }
    this.chromaticAmount += (0.0009 - this.chromaticAmount) * 0.16;
    this.impactFlashAmount *= 0.72;
    if (this.lensPass) {
      this.lensPass.uniforms.uChromatic.value = Math.max(this.chromaticAmount, this.vfx.lensChromatic);
      this.lensPass.uniforms.uVignette.value =
        state.slowMoFrames > 0 || state.superFlashFrames > 0 ? 0.58 : 0.34;
      this.lensPass.uniforms.uFlash.value = Math.max(this.impactFlashAmount, this.vfx.lensFlash);
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
    for (const g of this.glbFighters.values()) g.dispose();
    this.particles.dispose();
    this.vfx.dispose();
    this.orbPlaneGeo.dispose();
    this.orbCoreGeo.dispose();
    this.kunaiPlaneGeo.dispose();
    this.kunaiGlowGeo.dispose();
    this.debugUnitGeo.dispose();
    for (const o of this.orbPool) {
      o.spriteMat.dispose();
      o.coreMat.dispose();
    }
    for (const k of this.kunaiPool) {
      k.spriteMat.dispose();
      k.glowMat.dispose();
    }
    for (const d of this.debugPool) d.mat.dispose();
    if (this.envRT) this.envRT.dispose();
    if (this.bloomPass) this.bloomPass.dispose();
    if (this.lensPass) this.lensPass.dispose();
    if (this.composer) this.composer.dispose();
    this.renderer.dispose();
  }
}
