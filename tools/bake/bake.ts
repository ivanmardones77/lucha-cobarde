/**
 * Hornea los clips 3D de un luchador a hojas de sprites (una por clip) + un manifiesto.
 *
 * Uso (con `npm run dev` en marcha):
 *   http://localhost:3000/tools/bake/bake.html?char=RYUJIN
 * Opciones: fps (20), size (512 px por fotograma), view (2.56 m que cubre el fotograma), maxFrames (64 por clip).
 *
 * Las hojas se guardan en src/assets/sprites/baked/<personaje>/ mediante el middleware
 * «bake-sink» de vite.config.ts (solo existe en desarrollo).
 */
import * as THREE from 'three';
import { CHARACTERS, type CharacterId } from '../../src/core/types';
import { GlbFighter } from '../../src/view/GlbFighter';
import { GLB_SPECS } from '../../src/view/glbSpecs';

const q = new URLSearchParams(location.search);
const CHAR = (q.get('char') ?? 'RYUJIN').toUpperCase() as CharacterId;
const FPS = Number(q.get('fps') ?? 15);
const PX_PER_M = Number(q.get('ppm') ?? 170);
const VIEW = Number(q.get('view') ?? (CHAR === 'TITAN' ? 3.8 : 3.4)); // metros que cubre el fotograma
// Desplazamiento horizontal del encuadre (m). 0 = centrado en los pies; hace falta ancho porque patadas y derribos llegan a ±1,4 m
const CAM_X = Number(q.get('camx') ?? 0);
const SIZE = Math.round(VIEW * PX_PER_M);
const MAX_SHEET = 4096; // lado máximo de una hoja (texturas de móvil)
const MAX_FRAMES = Number(q.get('maxFrames') ?? 64);
const MAX_COLS = Math.floor(MAX_SHEET / SIZE);
const FOOT_PAD = Number(q.get('pad') ?? 0.3); // metros bajo los pies
const OUTLINE_PX = Number(q.get('outline') ?? 5);
// Estilo de cómic (todo ajustable por URL): saturación, bandas de sombreado, mezcla toon, líneas interiores, luz de contorno
const SAT = Number(q.get('sat') ?? 1.35);
const BANDS = Number(q.get('bands') ?? 4);
const TOON = Number(q.get('toon') ?? 0.7);
const LINES = Number(q.get('lines') ?? 0.85); // 0 = sin líneas interiores
const LINE_T = Number(q.get('lineT') ?? 0.22); // umbral del detector de bordes sobre las normales
const RIM = Number(q.get('rim') ?? 2.5);
const QUALITY = Number(q.get('quality') ?? 0.8); // calidad del webp
const DUP_T = Number(q.get('dup') ?? 0.6); // diferencia media por canal bajo la cual un fotograma cuenta como repetido
const LIFT = Number(q.get('lift') ?? 0.8); // gamma < 1 aclara
const DARK = Number(q.get('dark') ?? 0.16); // luminancia por debajo de la cual no hay líneas y se levanta el tono
const SKIN_T = Number(q.get('skinT') ?? 2.4); // la piel necesita un cambio de normal mayor para llevar línea
const TURN_TO_CAMERA = 0.38; // igual que GlbFighter

const logEl = document.getElementById('log')!;
const log = (s: string) => {
  logEl.textContent += `\n${s}`;
};

const slug = (s: string) => s.toLowerCase().replace(/\+/g, '_plus_').replace(/[^a-z0-9_]/g, '_');

async function save(rel: string, body: Blob | string): Promise<void> {
  const r = await fetch(`/__bake/save?path=${encodeURIComponent(rel)}`, { method: 'POST', body });
  if (!r.ok) throw new Error(`no se pudo guardar ${rel}: ${r.status}`);
}

/** Posterizado suave + saturación + líneas de tinta donde cambian las normales. Opera sobre ImageData sin premultiplicar. */
function isSkin(r: number, g: number, b: number): boolean {
  return r > 90 && r > g && g > b && (r - b) / r > 0.2 && (r - b) / r < 0.75;
}

function stylize(col: ImageData, nor: ImageData): void {
  const w = col.width;
  const h = col.height;
  const c = col.data;
  const n = nor.data;
  const edge = new Uint8Array(w * h);
  if (LINES > 0) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (c[i * 4 + 3] < 200) continue;
        const lum = (0.299 * c[i * 4] + 0.587 * c[i * 4 + 1] + 0.114 * c[i * 4 + 2]) / 255;
        if (lum < DARK) continue; // pelo y guantes oscuros: las líneas los convierten en una mancha
        const thr = isSkin(c[i * 4], c[i * 4 + 1], c[i * 4 + 2]) ? LINE_T * SKIN_T : LINE_T;
        let m = 0;
        for (let k = 0; k < 3; k++) {
          const gx = Math.abs(n[(i + 1) * 4 + k] - n[(i - 1) * 4 + k]);
          const gy = Math.abs(n[(i + w) * 4 + k] - n[(i - w) * 4 + k]);
          m = Math.max(m, gx + gy);
        }
        // Ignora el borde de la silueta: ahí manda el contorno exterior
        if (m / 255 > thr && n[(i + 1) * 4 + 3] > 200 && n[(i - 1) * 4 + 3] > 200 && n[(i + w) * 4 + 3] > 200 && n[(i - w) * 4 + 3] > 200) edge[i] = 1;
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    const a = c[i * 4 + 3];
    if (a === 0) continue;
    let r = c[i * 4];
    let g = c[i * 4 + 1];
    let b = c[i * 4 + 2];
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    r = l * 255 + (r - l * 255) * SAT;
    g = l * 255 + (g - l * 255) * SAT;
    b = l * 255 + (b - l * 255) * SAT;
    // Bandas de luz: la luminancia se acerca al escalón más próximo (TOON = cuánto)
    const skin = isSkin(c[i * 4], c[i * 4 + 1], c[i * 4 + 2]);
    const q = Math.min(1, Math.round(l * BANDS) / BANDS + 0.04);
    const target = l + (q - l) * (skin ? TOON * 0.45 : TOON);
    const k = Math.min(1.7, Math.max(0.55, target / Math.max(l, 0.03)));
    r *= k;
    g *= k;
    b *= k;
    if (l < DARK + 0.1) {
      // Zonas casi negras (pelo, guantes): se levantan hacia un azul oscuro para que se vea el volumen
      const t = 1 - l / (DARK + 0.1);
      r += t * 14;
      g += t * 24;
      b += t * 46;
    }
    if (edge[i]) {
      const ink = 1 - LINES;
      r *= ink;
      g *= ink;
      b *= ink;
    }
    c[i * 4] = 255 * Math.pow(Math.min(1, Math.max(0, r / 255)), LIFT);
    c[i * 4 + 1] = 255 * Math.pow(Math.min(1, Math.max(0, g / 255)), LIFT);
    c[i * 4 + 2] = 255 * Math.pow(Math.min(1, Math.max(0, b / 255)), LIFT);
  }
}

async function main(): Promise<void> {
  const spec = GLB_SPECS[CHAR];
  if (!spec) throw new Error(`sin GLB para ${CHAR}`);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdbeafe, 0x334155, 1.15));
  scene.add(new THREE.AmbientLight(0xe2e8f0, 0.5));
  const sun = new THREE.DirectionalLight(0xfff7ed, 1.7);
  sun.position.set(4, 11, 8);
  scene.add(sun);
  // Luz de contorno desde atrás con el color de acento del personaje (la «rim» de los juegos de lucha 2D)
  const rim = new THREE.DirectionalLight(CHARACTERS[CHAR].accentColor, RIM);
  rim.position.set(-6, 4, -8);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffffff, RIM * 0.35);
  rim2.position.set(7, 3, -6);
  scene.add(rim2);

  const half = VIEW / 2;
  const camY = half - FOOT_PAD;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 50); // límites relativos a la cámara
  cam.position.set(CAM_X, camY, 10);
  cam.lookAt(CAM_X, camY, 0);

  const fighter = new GlbFighter(spec, CHAR, 0);
  scene.add(fighter.root);
  fighter.root.position.set(0, 0, 0);
  fighter.root.rotation.y = Math.PI / 2 - TURN_TO_CAMERA; // mirando a la derecha, girado a cámara
  fighter.root.visible = true;
  for (let i = 0; i < 400 && !fighter.ready; i++) {
    if (fighter.failed) throw new Error('el GLB no carga');
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!fighter.ready) throw new Error('timeout cargando el GLB');
  const durations = fighter.clipDurations();
  (window as unknown as Record<string, unknown>).__bake = { fighter, scene, cam, renderer, THREE };
  if (q.has('debug')) {
    fighter.play('IDLE', 0);
    fighter.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(fighter.root, true);
    log(`IDLE bbox min=${b.min.toArray().map((n) => n.toFixed(2))} max=${b.max.toArray().map((n) => n.toFixed(2))}`);
    renderer.render(scene, cam);
    return;
  }

  // Clips que usa el juego y desde qué segundo (se salta la pose relajada inicial de los golpes)
  const t0 = new Map<string, number>();
  const want = (name: string, from = 0) => {
    if (!durations.has(name)) return;
    t0.set(name, Math.min(t0.get(name) ?? Infinity, from));
  };
  for (const n of ['IDLE', 'WALK_F', 'CROUCH', 'JUMP_TUCK', 'JUMP', 'HIT_HIGH', 'HIT_BODY', 'HIT_CHEST', 'HIT_HEAD', 'KNOCKDOWN', 'CROUCH+BLOCK']) want(n);
  if (spec.block) want(spec.block.clip);
  const moves = [...Object.values(spec.moves), spec.heavy];
  for (const mv of moves) {
    if (!mv) continue;
    const from = (mv.start ?? 0) / 60;
    want(mv.clip, from);
    if (mv.crouch) want(`CROUCH+${mv.clip}`, from);
  }

  // Bloqueo: el juego congela el clip en `hold`, así que basta ese fotograma
  const single = new Set<string>();
  if (spec.block) {
    for (const n of [spec.block.clip, 'CROUCH+BLOCK']) {
      if (t0.has(n)) {
        t0.set(n, spec.block.hold / 60);
        single.add(n);
      }
    }
  }

  const pxPerM = SIZE / VIEW;
  const manifest: Record<string, unknown> = {
    character: CHAR,
    frameW: SIZE,
    frameH: SIZE,
    anchorX: SIZE / 2 - CAM_X * (SIZE / VIEW),
    anchorY: SIZE - FOOT_PAD * pxPerM,
    pxPerM,
    clips: {} as Record<string, unknown>,
  };

  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    return c;
  };
  const colorCv = mk();
  const cctx = colorCv.getContext('2d', { willReadFrequently: true })!;
  const normCv = mk();
  const nctx = normCv.getContext('2d', { willReadFrequently: true })!;
  const normalMat = new THREE.MeshNormalMaterial();
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = SIZE;
  const tctx = tmp.getContext('2d')!;
  const dirs = Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)]);

  let totalFrames = 0;
  let uniqueFrames = 0;
  let texPixels = 0;
  const clipped = new Set<string>();
  const fcv = mk(); // fotograma final (contorno + color) antes de recortar
  const fctx = fcv.getContext('2d', { willReadFrequently: true })!;

  for (const [name, from] of t0) {
    const dur = durations.get(name)!;
    const span = single.has(name) ? 1 / FPS : Math.max(dur - from, 1 / 60);
    const fps = Math.min(FPS, MAX_FRAMES / span);
    const count = single.has(name) ? 1 : Math.max(1, Math.ceil(span * fps));

    // Fase 1: renderiza todos los fotogramas; los que se repiten (poses fijas) se guardan una sola vez
    const uniq: HTMLCanvasElement[] = [];
    const map: number[] = [];
    let prev: Uint8ClampedArray | null = null;
    let bx0 = SIZE, by0 = SIZE, bx1 = 0, by1 = 0;
    for (let i = 0; i < count; i++) {
      fighter.play(name, from + i / fps);
      renderer.render(scene, cam);
      cctx.clearRect(0, 0, SIZE, SIZE);
      cctx.drawImage(renderer.domElement, 0, 0);
      const col = cctx.getImageData(0, 0, SIZE, SIZE);
      // Pasada de normales: sirve para las líneas de tinta interiores
      scene.overrideMaterial = normalMat;
      renderer.render(scene, cam);
      scene.overrideMaterial = null;
      nctx.clearRect(0, 0, SIZE, SIZE);
      nctx.drawImage(renderer.domElement, 0, 0);
      stylize(col, nctx.getImageData(0, 0, SIZE, SIZE));
      cctx.putImageData(col, 0, 0);
      // Aviso si el personaje toca el borde del fotograma (golpe más largo que el encuadre)
      for (let k = 0; k < SIZE; k++) {
        const e = [col.data[(k * SIZE) * 4 + 3], col.data[(k * SIZE + SIZE - 1) * 4 + 3], col.data[k * 4 + 3], col.data[((SIZE - 1) * SIZE + k) * 4 + 3]];
        if (e.some((a) => a > 40)) {
          clipped.add(name);
          break;
        }
      }
      // Silueta oscura del fotograma → contorno exterior (círculo de 16 desplazamientos), todo en fcv
      tctx.clearRect(0, 0, SIZE, SIZE);
      tctx.globalCompositeOperation = 'source-over';
      tctx.drawImage(colorCv, 0, 0);
      tctx.globalCompositeOperation = 'source-in';
      tctx.fillStyle = '#0a0a14';
      tctx.fillRect(0, 0, SIZE, SIZE);
      fctx.clearRect(0, 0, SIZE, SIZE);
      for (const [dx, dy] of dirs) fctx.drawImage(tmp, dx * OUTLINE_PX, dy * OUTLINE_PX);
      fctx.drawImage(colorCv, 0, 0);
      const fin = fctx.getImageData(0, 0, SIZE, SIZE).data;

      // ¿Igual que el último fotograma guardado? (diferencia media por canal bajo el umbral)
      let same = false;
      if (prev) {
        let sum = 0;
        for (let k = 0; k < fin.length; k += 4) sum += Math.abs(fin[k] - prev[k]) + Math.abs(fin[k + 1] - prev[k + 1]) + Math.abs(fin[k + 2] - prev[k + 2]) + Math.abs(fin[k + 3] - prev[k + 3]);
        same = sum / (SIZE * SIZE * 4) < DUP_T;
      }
      if (same) {
        map.push(uniq.length - 1);
        continue;
      }
      prev = new Uint8ClampedArray(fin);
      const keep = mk();
      keep.getContext('2d')!.drawImage(fcv, 0, 0);
      uniq.push(keep);
      map.push(uniq.length - 1);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          if (fin[(y * SIZE + x) * 4 + 3] > 8) {
            if (x < bx0) bx0 = x;
            if (x > bx1) bx1 = x;
            if (y < by0) by0 = y;
            if (y > by1) by1 = y;
          }
        }
      }
    }

    // Fase 2: caja común del clip (recorta el espacio vacío) y empaquetado en una hoja
    const PAD = 2;
    const offX = Math.max(0, bx0 - PAD) & ~1;
    const offY = Math.max(0, by0 - PAD) & ~1;
    const cellW = Math.min(SIZE - offX, bx1 + PAD + 1 - offX + 1) & ~1;
    const cellH = Math.min(SIZE - offY, by1 + PAD + 1 - offY + 1) & ~1;
    const n = uniq.length;
    const cols = Math.max(1, Math.min(Math.floor(MAX_SHEET / cellW), Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * cellW;
    sheet.height = rows * cellH;
    const sctx = sheet.getContext('2d')!;
    uniq.forEach((cv, i) => sctx.drawImage(cv, offX, offY, cellW, cellH, (i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH));

    const file = `${slug(name)}.webp`;
    const blob = await new Promise<Blob>((res, rej) => sheet.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/webp', QUALITY));
    await save(`${CHAR.toLowerCase()}/${file}`, blob);
    const meta: Record<string, unknown> = { file, count, fps, t0: from, duration: dur, rows, cols, cellW, cellH, offX, offY };
    if (n !== count) meta.map = map;
    (manifest.clips as Record<string, unknown>)[name] = meta;
    totalFrames += count;
    uniqueFrames += n;
    texPixels += sheet.width * sheet.height;
    log(`${name}: ${count} fotogramas (${n} únicos) a ${fps.toFixed(1)} fps, celda ${cellW}x${cellH} (${(blob.size / 1024).toFixed(0)} KB)`);
  }

  await save(`${CHAR.toLowerCase()}/manifest.json`, JSON.stringify(manifest, null, 1));
  if (clipped.size) log(`AVISO recortados por el borde: ${[...clipped].join(', ')}`);
  log(`HECHO: ${t0.size} clips, ${totalFrames} fotogramas (${uniqueFrames} únicos), textura ${(texPixels * 4 / 1e6).toFixed(0)} MB en GPU`);
  (window as unknown as { __bakeDone: boolean }).__bakeDone = true;
}

main().catch((e) => {
  log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  (window as unknown as { __bakeDone: boolean }).__bakeDone = false;
});
