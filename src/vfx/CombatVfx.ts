import * as THREE from 'three';
import { MatchState, getFighterAccentColor } from '../core/types';

/**
 * Efectos de impacto y de super con formas propias (no círculos girando):
 *
 *  · Golpe:        estrella de cómic con contorno de tinta + núcleo HDR, abanico
 *                  de esquirlas de 60° en la dirección del golpe y un corte transversal.
 *  · Golpe fuerte: estrella de más puntas, corte en X, abanico de 110°, oro y ascuas.
 *  · Super (activación, 32 frames congelados): fondo de líneas radiales del color
 *                  del luchador, absorción de energía hacia el pecho, picos de aura
 *                  verticales y destello de clímax.
 *  · Super (impacto): estrella gigante, esquirlas en elipse horizontal, fotograma
 *                  de impacto y ascuas que se enfrían despacio.
 *
 * Todo se reserva al crear (sin new en update), con RNG con semilla y shaders
 * protegidos contra NaN (pow(max(1e-4, x), p)).
 */

// ---------- RNG con semilla (la vista no usa Math.random en trayectorias) ----------
let seed = 0x9e3779b9;
function rand(): number {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const range = (a: number, b: number) => a + (b - a) * rand();

// ---------- Esquirlas (InstancedMesh con forma de púa) ----------
const MAX_SHARDS = 220;

const SHARD_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vUv = uv;
    vColor = aColor;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const SHARD_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // Púa: ancha detrás de la punta, afilada en ambos extremos
    float along = vUv.x;
    float taper = pow(max(0.0001, sin(3.14159 * pow(max(0.0001, along), 0.65))), 0.9);
    float across = abs(vUv.y - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(taper * 0.82, taper, across);
    if (edge <= 0.001) discard;
    float core = 1.0 - smoothstep(0.0, taper * 0.55 + 0.0001, across);
    vec3 col = vColor * (0.55 + core * 1.6);
    gl_FragColor = vec4(col, edge * vAlpha);
  }
`;

interface Shard {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  drag: number;
  gravity: number;
  life: number;
  maxLife: number;
  length: number;
  width: number;
  /** Orientación fija (si no, sigue la velocidad) */
  fixedAngle: number | null;
  hot: THREE.Color;
  cool: THREE.Color;
  grow: number;
}

// ---------- Estrella de cómic (SDF polar) ----------
const STAR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STAR_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uAlpha;
  uniform float uPoints;
  uniform float uInner;
  uniform float uSeed;
  uniform float uInk;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float seg = 6.28318 / uPoints;
    float idx = floor((a + 3.14159) / seg);
    float jitter = 0.72 + 0.28 * hash(idx * 7.13 + uSeed);
    float t = abs(fract((a + 3.14159) / seg) - 0.5) * 2.0;   // 0 en la punta, 1 en el valle
    float radius = mix(jitter, uInner, pow(max(0.0001, t), 0.55));
    float shape = 1.0 - smoothstep(radius - 0.03, radius, r);
    if (shape <= 0.001) discard;
    if (uInk > 0.5) {
      gl_FragColor = vec4(uColor, shape * uAlpha);
    } else {
      float heat = 1.0 - smoothstep(0.0, radius * 0.75 + 0.0001, r);
      vec3 col = mix(uColor, uHot, heat);
      gl_FragColor = vec4(col, shape * uAlpha);
    }
  }
`;

interface Star {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  active: boolean;
  life: number;
  maxLife: number;
  size: number;
  punch: number;
  ink: boolean;
}

// ---------- Fondo radial del super ----------
const BACK_FRAG = /* glsl */ `
  uniform vec3 uAccent;
  uniform vec2 uCenter;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vWorld;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vec2 d = vWorld - uCenter;
    float a = atan(d.y, d.x);
    float r = length(d);
    float rays = 40.0;
    float k = (a + 3.14159) / 6.28318 * rays;
    float id = floor(k);
    float f = abs(fract(k) - 0.5) * 2.0;
    float w = 0.08 + 0.22 * hash(id * 3.7);
    float speed = 0.6 + hash(id * 1.3);
    float flicker = step(0.35, fract(hash(id) + uTime * speed));
    float line = (1.0 - smoothstep(w * 0.6, w, 1.0 - f)) * flicker;
    float inner = smoothstep(0.6, 2.6, r);
    vec3 dark = vec3(0.012, 0.016, 0.035);
    vec3 col = mix(dark, uAccent * 0.95, line * inner * 0.6);
    // Se desvanece hacia el suelo para no cortarlo en seco
    float ground = smoothstep(-0.2, 0.9, vWorld.y);
    gl_FragColor = vec4(col, uOpacity * (0.88 * ground + 0.04));
  }
`;
const BACK_VERT = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xy;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _c = new THREE.Color();

export class CombatVfx {
  readonly group = new THREE.Group();

  private shardMesh: THREE.InstancedMesh;
  private shardColor: THREE.InstancedBufferAttribute;
  private shardAlpha: THREE.InstancedBufferAttribute;
  private shards: Shard[] = [];
  private shardCursor = 0;

  private stars: Star[] = [];
  private starGeo = new THREE.PlaneGeometry(1, 1);

  private backdrop: THREE.Mesh;
  private backMat: THREE.ShaderMaterial;
  private backOpacity = 0;
  private time = 0;
  private lastSuperFrames = 0;

  /** Destello y aberración que SceneView aplica al pase de lente */
  public lensFlash = 0;
  public lensChromatic = 0;

  constructor() {
    // Esquirlas
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0.5, 0, 0); // el origen es la cola: crece hacia la punta
    this.shardColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHARDS * 3), 3);
    this.shardAlpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHARDS), 1);
    this.shardColor.setUsage(THREE.DynamicDrawUsage);
    this.shardAlpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', this.shardColor);
    geo.setAttribute('aAlpha', this.shardAlpha);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SHARD_VERT,
      fragmentShader: SHARD_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.shardMesh = new THREE.InstancedMesh(geo, mat, MAX_SHARDS);
    this.shardMesh.frustumCulled = false;
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shardMesh.renderOrder = 12;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.shardMesh.setMatrixAt(i, _m);
      this.shards.push({
        active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, drag: 0.9, gravity: 0,
        life: 0, maxLife: 1, length: 1, width: 0.1, fixedAngle: null,
        hot: new THREE.Color(), cool: new THREE.Color(), grow: 0,
      });
    }
    this.group.add(this.shardMesh);

    // Estrellas (tinta + núcleo)
    for (let i = 0; i < 14; i++) {
      const smat = new THREE.ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uHot: { value: new THREE.Color() },
          uAlpha: { value: 0 },
          uPoints: { value: 8 },
          uInner: { value: 0.35 },
          uSeed: { value: 0 },
          uInk: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.starGeo, smat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.stars.push({ mesh, mat: smat, active: false, life: 0, maxLife: 1, size: 1, punch: 1, ink: false });
    }

    // Fondo del super (detrás de los luchadores, delante del escenario)
    this.backMat = new THREE.ShaderMaterial({
      vertexShader: BACK_VERT,
      fragmentShader: BACK_FRAG,
      uniforms: {
        uAccent: { value: new THREE.Color(0x22d3ee) },
        uCenter: { value: new THREE.Vector2() },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(46, 26), this.backMat);
    this.backdrop.position.set(0, 5, -2.2);
    this.backdrop.renderOrder = 2;
    this.backdrop.visible = false;
    this.group.add(this.backdrop);
  }

  // ===================== Disparadores =====================

  /** Golpe conectado. dir = hacia dónde va el golpe (+1 derecha, -1 izquierda) */
  hit(x: number, y: number, dir: 1 | -1, heavy: boolean): void {
    const z = 0.55;
    const ink = heavy ? 0x0a0612 : 0x0b0f1a;
    const body = heavy ? 0xfbbf24 : 0xf97316;
    const hot = heavy ? 0xfff7d6 : 0xfff1dc;
    // 1) Contorno de tinta y núcleo: dan forma con o sin bloom
    this.spawnStar(x, y, z - 0.01, heavy ? 2.5 : 1.75, heavy ? 10 : 8, heavy ? 0.3 : 0.36, ink, ink, true, heavy ? 0.16 : 0.12, 1.15);
    this.spawnStar(x, y, z, heavy ? 2.05 : 1.4, heavy ? 10 : 8, heavy ? 0.34 : 0.4, body, hot, false, heavy ? 0.2 : 0.14, 1.25);
    // 2) Corte transversal (en X si es fuerte)
    const cut = heavy ? [0.6, -0.6] : [dir > 0 ? 0.42 : -0.42];
    for (const a of cut) {
      const ang = Math.PI / 2 + a;
      const len = heavy ? 3.4 : 2.4;
      this.spawnShard(x, y, z + 0.02, 0, 0, {
        length: len, width: heavy ? 0.16 : 0.11, life: heavy ? 0.12 : 0.09, angle: ang,
        hot: 0xffffff, cool: body, intensity: 2.4,
      });
    }
    // 3) Abanico de esquirlas en la dirección del golpe
    const n = heavy ? 18 : 10;
    const spread = heavy ? 1.9 : 1.05; // 110° / 60°
    const base = dir > 0 ? 0 : Math.PI;
    for (let i = 0; i < n; i++) {
      const ang = base + (rand() - 0.5) * spread + (rand() < 0.18 ? Math.PI : 0) * 0.85;
      const spd = range(heavy ? 8 : 6, heavy ? 16 : 12);
      // Nacen en el borde de la estrella para verse desde el primer frame
      const r0 = heavy ? 0.45 : 0.32;
      this.spawnShard(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0, z + range(-0.05, 0.05), Math.cos(ang) * spd, Math.sin(ang) * spd, {
        length: range(0.6, heavy ? 1.5 : 1.15), width: range(0.09, heavy ? 0.19 : 0.15),
        life: range(0.24, heavy ? 0.46 : 0.36), drag: 0.92, gravity: -4,
        hot: hot, cool: heavy ? 0xf59e0b : 0xf97316, intensity: heavy ? 2.4 : 1.75, grow: 0.5,
      });
    }
    // 4) Ascuas (solo fuerte)
    if (heavy) this.embers(x, y, 7, 0xfbbf24);
    this.lensFlash = Math.max(this.lensFlash, heavy ? 0.06 : 0.02);
    this.lensChromatic = Math.max(this.lensChromatic, heavy ? 0.008 : 0.004);
  }

  /** El super conecta: clímax grande + enfriado largo */
  superImpact(x: number, y: number, dir: 1 | -1, accent: number): void {
    const z = 0.6;
    this.spawnStar(x, y, z - 0.01, 4.4, 12, 0.24, 0x05030a, 0x05030a, true, 0.22, 1.3);
    this.spawnStar(x, y, z, 3.4, 12, 0.28, accent, 0xffffff, false, 0.28, 1.3);
    for (const a of [0.35, -0.35, Math.PI / 2]) {
      const len = 6;
      const ang = a;
      this.spawnShard(x, y, z + 0.02, 0, 0, {
        length: len, width: 0.16, life: 0.12, angle: ang, hot: 0xffffff, cool: accent, intensity: 2.1,
      });
    }
    // Elipse horizontal: el estallido se abre a lo ancho del escenario
    for (let i = 0; i < 30; i++) {
      const ang = rand() * Math.PI * 2;
      const spd = range(10, 24);
      const bias = dir * range(0, 5);
      // Nacen en un anillo: el centro no se satura y la forma se lee desde el primer frame
      const r0 = range(0.6, 1.1);
      this.spawnShard(x + Math.cos(ang) * r0 * 1.4, y + Math.sin(ang) * r0 * 0.6, z + range(-0.1, 0.1), Math.cos(ang) * spd * 1.5 + bias, Math.sin(ang) * spd * 0.6, {
        length: range(0.6, 1.8), width: range(0.08, 0.2), life: range(0.25, 0.5), drag: 0.88, gravity: -5,
        hot: 0xffffff, cool: i % 3 === 0 ? 0xfbbf24 : accent, intensity: 1.8, grow: 0.8,
      });
    }
    this.embers(x, y, 18, accent);
    this.lensFlash = Math.max(this.lensFlash, 0.14);
    this.lensChromatic = Math.max(this.lensChromatic, 0.014);
  }

  private embers(x: number, y: number, n: number, color: number): void {
    for (let i = 0; i < n; i++) {
      this.spawnShard(x + range(-0.8, 0.8), y + range(-0.5, 0.5), 0.4, range(-1.2, 1.2), range(0.8, 2.6), {
        length: range(0.08, 0.16), width: range(0.05, 0.09), life: range(0.7, 1.4), drag: 0.985, gravity: 0.6,
        hot: 0xfff7d6, cool: color, intensity: 1.6, angle: Math.PI / 2,
      });
    }
  }

  // ===================== Actualización =====================

  /** 0 congela los efectos (capturas de QA), 1 = normal */
  public timeScale = 1;

  update(state: MatchState, dtReal: number): void {
    const dt = dtReal * this.timeScale;
    if (dt <= 0) return;
    this.time += dt;
    this.updateSuper(state, dt);
    this.updateShards(dt);
    this.updateStars(dt);
    this.lensFlash *= Math.pow(0.0005, dt);
    this.lensChromatic *= Math.pow(0.004, dt);
  }

  private updateSuper(state: MatchState, dt: number): void {
    const frames = state.superFlashFrames;
    const ownerId = state.superFlashOwner;
    const active = frames > 0 && ownerId !== -1;
    const target = active ? 1 : 0;
    // Entra rápido, sale algo más despacio
    this.backOpacity += (target - this.backOpacity) * (1 - Math.pow(active ? 0.0001 : 0.002, dt));
    this.backdrop.visible = this.backOpacity > 0.01;
    this.backMat.uniforms.uOpacity.value = this.backOpacity;
    this.backMat.uniforms.uTime.value = this.time;

    if (active) {
      const owner = state.fighters[ownerId];
      const cx = owner.x;
      const cy = owner.y + 1.25;
      (this.backMat.uniforms.uCenter.value as THREE.Vector2).set(cx, cy);
      this.backdrop.position.x = cx;
      const accent = getFighterAccentColor(owner.character, owner.palette);
      (this.backMat.uniforms.uAccent.value as THREE.Color).setHex(accent);

      // Se emite una vez por frame de simulación, no por frame de pantalla
      // (igual en 60 Hz que en 120 Hz, y nada se acumula si la partida se congela)
      const newSimFrame = frames !== this.lastSuperFrames;
      // Anticipación: absorción hacia el pecho (primeros ~22 frames)
      if (newSimFrame && frames > 10) {
        for (let k = 0; k < 2; k++) {
          const ang = rand() * Math.PI * 2;
          const r = range(2.2, 3.6);
          const sx = cx + Math.cos(ang) * r;
          const sy = cy + Math.sin(ang) * r * 0.8;
          const spd = range(7, 11);
          this.spawnShard(sx, sy, 0.7, (cx - sx) / r * spd, (cy - sy) / r * spd, {
            length: range(0.5, 1.1), width: range(0.05, 0.1), life: r / spd, drag: 1,
            hot: 0xffffff, cool: accent, intensity: 1.8,
          });
        }
      }
      // Telegrafía: picos de aura que suben desde los pies
      if (newSimFrame && frames < 28 && frames % 2 === 0) {
        const sx = owner.x + range(-0.55, 0.55);
        this.spawnShard(sx, owner.y + 0.05, 0.3 + range(-0.2, 0.2), 0, range(5, 9), {
          length: range(0.8, 1.7), width: range(0.12, 0.24), life: range(0.3, 0.5), drag: 0.97,
          hot: 0xffffff, cool: accent, intensity: 1.6, angle: Math.PI / 2, grow: 0.5,
        });
      }
      // Clímax: destello justo antes de soltar el golpe
      if (this.lastSuperFrames > 6 && frames <= 6) {
        this.spawnStar(cx, cy, 0.7, 2.6, 6, 0.42, accent, 0xffffff, false, 0.16, 1.4);
        this.lensFlash = Math.max(this.lensFlash, 0.18);
      }
    }
    this.lastSuperFrames = frames;
  }

  private updateShards(dt: number): void {
    const colArr = this.shardColor.array as Float32Array;
    const alphaArr = this.shardAlpha.array as Float32Array;
    for (let i = 0; i < MAX_SHARDS; i++) {
      const s = this.shards[i];
      if (!s.active) continue;
      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        _m.makeScale(0, 0, 0);
        this.shardMesh.setMatrixAt(i, _m);
        alphaArr[i] = 0;
        continue;
      }
      const t = s.life / s.maxLife;
      const dragK = Math.pow(s.drag, dt * 60);
      s.vx *= dragK;
      s.vy = s.vy * dragK + s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const speed = Math.hypot(s.vx, s.vy);
      const ang = s.fixedAngle ?? (speed > 0.001 ? Math.atan2(s.vy, s.vx) : 0);
      // Se estira con la velocidad y se afina al morir
      const len = s.length * (1 + s.grow * (1 - t)) * (0.6 + 0.4 * Math.min(1, speed / 6 + (s.fixedAngle !== null ? 1 : 0)));
      const wid = s.width * (1 - t * 0.6);
      _q.setFromAxisAngle(_z, ang);
      _s.set(Math.max(0.001, len), Math.max(0.001, wid), 1);
      _p.set(s.x - Math.cos(ang) * len * 0.5, s.y - Math.sin(ang) * len * 0.5, s.z);
      _m.compose(_p, _q, _s);
      this.shardMesh.setMatrixAt(i, _m);
      _c.copy(s.hot).lerp(s.cool, Math.min(1, t * 1.6));
      colArr[i * 3] = _c.r;
      colArr[i * 3 + 1] = _c.g;
      colArr[i * 3 + 2] = _c.b;
      alphaArr[i] = t < 0.08 ? t / 0.08 : 1 - Math.pow(Math.max(0.0001, (t - 0.08) / 0.92), 1.6);
    }
    this.shardMesh.instanceMatrix.needsUpdate = true;
    this.shardColor.needsUpdate = true;
    this.shardAlpha.needsUpdate = true;
  }

  private updateStars(dt: number): void {
    for (const st of this.stars) {
      if (!st.active) continue;
      st.life += dt;
      const t = st.life / st.maxLife;
      if (t >= 1) {
        st.active = false;
        st.mesh.visible = false;
        continue;
      }
      // Golpe de 1–2 frames grande, luego encoge y se apaga
      const punch = t < 0.18 ? st.punch : 1 - (t - 0.18) * 0.55;
      st.mesh.scale.setScalar(st.size * punch);
      st.mat.uniforms.uAlpha.value = st.ink ? (t < 0.35 ? 0.92 : 0.92 * (1 - (t - 0.35) / 0.65)) : 1 - Math.pow(t, 1.4);
    }
  }

  // ===================== Pools =====================

  private spawnShard(
    x: number, y: number, z: number, vx: number, vy: number,
    o: { length: number; width: number; life: number; drag?: number; gravity?: number; angle?: number;
         hot: number; cool: number; intensity: number; grow?: number }
  ): void {
    const s = this.shards[this.shardCursor];
    this.shardCursor = (this.shardCursor + 1) % MAX_SHARDS;
    s.active = true;
    s.x = x; s.y = y; s.z = z; s.vx = vx; s.vy = vy;
    s.drag = o.drag ?? 0.9;
    s.gravity = o.gravity ?? 0;
    s.life = 0;
    s.maxLife = Math.max(0.03, o.life);
    s.length = o.length;
    s.width = o.width;
    s.fixedAngle = o.angle ?? null;
    s.grow = o.grow ?? 0;
    // Núcleo por encima de 1.0: solo lo caliente pasa el umbral del bloom
    s.hot.setHex(o.hot).multiplyScalar(o.intensity);
    s.cool.setHex(o.cool).multiplyScalar(o.intensity * 0.55);
  }

  private spawnStar(
    x: number, y: number, z: number, size: number, points: number, inner: number,
    color: number, hot: number, ink: boolean, life: number, punch: number
  ): void {
    const st = this.stars.find((s) => !s.active) ?? this.stars[0];
    st.active = true;
    st.life = 0;
    st.maxLife = life;
    st.size = size;
    st.punch = punch;
    st.ink = ink;
    st.mesh.visible = true;
    st.mesh.position.set(x, y, z);
    st.mesh.rotation.z = rand() * Math.PI * 2;
    st.mesh.scale.setScalar(size * punch);
    st.mesh.renderOrder = ink ? 10 : 11;
    const u = st.mat.uniforms;
    (u.uColor.value as THREE.Color).setHex(color);
    // Solo el centro pasa de 1.0 (bloom); el borde conserva el color y la forma
    (u.uHot.value as THREE.Color).setHex(hot).multiplyScalar(ink ? 1 : 1.8);
    if (!ink) (u.uColor.value as THREE.Color).multiplyScalar(1.15);
    u.uPoints.value = points;
    u.uInner.value = inner;
    u.uSeed.value = rand() * 100;
    u.uInk.value = ink ? 1 : 0;
    u.uAlpha.value = ink ? 0.92 : 1;
    st.mat.blending = ink ? THREE.NormalBlending : THREE.AdditiveBlending;
  }

  /** Vacía todo (al reiniciar o salir del combate) */
  reset(): void {
    for (let i = 0; i < MAX_SHARDS; i++) this.shards[i].active = false;
    for (const st of this.stars) {
      st.active = false;
      st.mesh.visible = false;
    }
    this.backOpacity = 0;
    this.backdrop.visible = false;
    this.lensFlash = 0;
    this.lensChromatic = 0;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_SHARDS; i++) this.shardMesh.setMatrixAt(i, _m);
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.shardMesh.geometry.dispose();
    (this.shardMesh.material as THREE.Material).dispose();
    this.starGeo.dispose();
    for (const st of this.stars) st.mat.dispose();
    this.backdrop.geometry.dispose();
    this.backMat.dispose();
  }
}
