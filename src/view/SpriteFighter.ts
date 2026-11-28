import * as THREE from 'three';
import type { CharacterId, FighterState } from '../core/types';
import type { GlbSpec } from './GlbFighter';
import { selectPose } from './poseSelect';

/**
 * Luchador como sprite animado (plano con hoja de fotogramas), estilo juego de lucha 2D.
 * Las hojas salen de tools/bake (clips 3D horneados con contorno). Usa selectPose, la misma
 * lógica de animación que el luchador 3D, así que el tiempo de cada golpe sigue a la simulación.
 * Se activa con ?sprites y solo para los personajes que tengan hojas horneadas.
 */

interface ClipMeta {
  file: string;
  count: number;
  fps: number;
  t0: number;
  duration: number;
  rows: number;
  cols: number;
  /** Celda de la hoja y su posición dentro del fotograma completo (px): cada clip se recorta a su caja */
  cellW: number;
  cellH: number;
  offX: number;
  offY: number;
  /** Fotograma lógico → celda de la hoja (los repetidos comparten celda); sin él, es la identidad */
  map?: number[];
}

interface Manifest {
  character: string;
  frameW: number;
  frameH: number;
  anchorX: number;
  anchorY: number;
  pxPerM: number;
  clips: Record<string, ClipMeta>;
}

const MANIFESTS = import.meta.glob<Manifest>('../assets/sprites/baked/*/manifest.json', { eager: true, import: 'default' });
const SHEETS = import.meta.glob<string>('../assets/sprites/baked/*/*.webp', { eager: true, query: '?url', import: 'default' });

interface SpriteSet {
  manifest: Manifest;
  urlOf(file: string): string;
}

const SETS = new Map<CharacterId, SpriteSet>();
for (const [path, manifest] of Object.entries(MANIFESTS)) {
  const dir = path.slice(0, path.lastIndexOf('/'));
  SETS.set(manifest.character as CharacterId, { manifest, urlOf: (file) => SHEETS[`${dir}/${file}`] });
}

export function hasSprites(c: CharacterId): boolean {
  return SETS.has(c);
}

const sheetCache = new Map<string, THREE.Texture>();
function sheetTexture(url: string): THREE.Texture {
  let t = sheetCache.get(url);
  if (!t) {
    t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    sheetCache.set(url, t);
  }
  return t;
}

export function preloadSprites(c: CharacterId): void {
  const set = SETS.get(c);
  if (set) for (const m of Object.values(set.manifest.clips)) sheetTexture(set.urlOf(m.file));
}

export class SpriteFighter {
  readonly root = new THREE.Group();
  ready = true;
  failed = false;
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private set: SpriteSet;
  private shown = '';
  private facing: 1 | -1 = 1;

  constructor(private spec: GlbSpec, character: CharacterId) {
    this.set = SETS.get(character)!;
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02, toneMapped: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat); // tamaño y posición los fija place() según la celda del clip
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);

    // Sombra de contacto: el sprite no proyecta sombra en el suelo
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.scale.set(1, 0.55, 1);
    this.shadow = shadow;
    this.root.add(shadow);
    this.root.visible = false;
    preloadSprites(character);
  }

  private shadow: THREE.Mesh;

  private show(clip: string, time: number): void {
    const meta = this.set.manifest.clips[clip] ?? this.set.manifest.clips.IDLE;
    const name = this.set.manifest.clips[clip] ? clip : 'IDLE';
    const idx = Math.min(meta.count - 1, Math.max(0, Math.floor((time - meta.t0) * meta.fps)));
    this.place(meta);
    const cell = meta.map ? meta.map[idx] : idx;
    const key = `${name}:${cell}`;
    if (key === this.shown) return;
    this.shown = key;
    const base = sheetTexture(this.set.urlOf(meta.file));
    this.cropFor(name, base, meta, cell);
  }

  /** Tamaño y posición del plano para la caja recortada del clip; el punto de apoyo queda en el origen del luchador */
  private place(meta: ClipMeta): void {
    const { pxPerM, anchorX, anchorY } = this.set.manifest;
    const w = meta.cellW / pxPerM;
    const h = meta.cellH / pxPerM;
    const x = (meta.offX + meta.cellW / 2 - anchorX) / pxPerM;
    const y = (anchorY - (meta.offY + meta.cellH / 2)) / pxPerM;
    this.mesh.scale.set(this.facing * w, h, 1); // las hojas miran a la derecha: se voltea hacia la izquierda
    this.mesh.position.set(this.facing * x, y, 0);
  }

  private crops = new Map<string, THREE.Texture>();
  private cropFor(name: string, base: THREE.Texture, meta: ClipMeta, idx: number): void {
    const cols = meta.cols;
    // Un clon por clip y luchador (comparte la imagen en GPU); el desplazamiento UV se cambia por fotograma
    let t = this.crops.get(name);
    if (!t) {
      t = base.clone();
      t.needsUpdate = true;
      t.repeat.set(1 / cols, 1 / meta.rows);
      this.crops.set(name, t);
    }
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    t.offset.set(c / cols, 1 - (r + 1) / meta.rows);
    t.matrixAutoUpdate = true;
    if (this.mat.map !== t) {
      this.mat.map = t;
      this.mat.needsUpdate = true;
    }
  }

  sync(f: FighterState, globalFrame: number, _hitstop = 0): void {
    this.root.visible = true;
    this.root.position.set(f.x, f.y, 0);
    this.facing = f.facing === 1 ? 1 : -1;
    // La sombra se queda en el suelo aunque el luchador salte
    this.shadow.position.y = 0.01 - f.y;
    selectPose(f, globalFrame, this.spec, {
      has: (n) => n in this.set.manifest.clips,
      duration: (n) => this.set.manifest.clips[n]?.duration || 1,
      play: (n, t) => this.show(n, t),
    });
  }

  hide(): void {
    this.root.visible = false;
  }

  dispose(): void {
    for (const t of this.crops.values()) t.dispose();
    this.mat.dispose();
    this.root.removeFromParent();
  }
}
