import opening from '../assets/cinematics/ciudad-baja/planos.json';
import victory from '../assets/cinematics/ciudad-baja/victoria.json';
import bridge from '../assets/cinematics/ciudad-baja/continuara.json';
import crossedCurrent from '../assets/cinematics/corriente-cruzada/planos.json';
import crossedVictory from '../assets/cinematics/corriente-cruzada/victoria.json';
import crossedBridge from '../assets/cinematics/corriente-cruzada/continuara.json';
import colossus from '../assets/cinematics/coloso-de-la-torre/planos.json';
import { sfx } from '../audio/SoundEngine';
import type { DialogueLine } from '../campaign/story';

type Mouth = 'cerrada' | 'entreabierta' | 'abierta';
interface Asset {
  png: string;
  pivote: number[];
  bocas?: Partial<Record<Mouth, string>>;
}
interface Layer {
  activo: string;
  x: number;
  y: number;
  escala: number;
  profundidad: number;
  opacidad?: number;
  pulso?: number;
  invertir?: boolean;
  desenfoque?: number;
  bajoLuz?: number;
  mosaico?: boolean;
  velocidad?: number[];
  hasta?: { x: number; y: number; escala: number; opacidad?: number };
}
interface Camera {
  x: number;
  y: number;
  zoom: number;
}
interface Shot {
  duracion: number;
  camara: { desde: Camera; hasta: Camera; suavizado: string };
  capas: Layer[];
  boca?: { t: number; estado: string }[];
  rotulo?: string;
}
interface Line {
  inicio: number;
  planos: Shot[];
}
interface Cinematic {
  directory: string;
  capitulo: string;
  nodo: number;
  fps: number;
  avanceAutomatico?: boolean;
  activos: Record<string, Asset>;
  dialogo: (Line & { texto: string; hablante: string })[];
  audio: { archivo: string };
}
interface Playback {
  sequence: Cinematic;
  line: Line;
  start: number | null;
  frame: number;
  duration: number;
}

const folder = '../assets/cinematics/';
// El arte se guarda en WebP (6 veces más ligero que PNG); los JSON siguen nombrando .png
const urls = import.meta.glob<string>('../assets/cinematics/*/{arte/**/*.webp,*.m4a}', {
  eager: true, query: '?url', import: 'default',
});
const scripts: Cinematic[] = [
  { ...opening, directory: 'ciudad-baja' },
  { ...victory, directory: 'ciudad-baja' },
  { ...bridge, directory: 'ciudad-baja' },
  { ...crossedCurrent, directory: 'corriente-cruzada' },
  { ...crossedVictory, directory: 'corriente-cruzada' },
  { ...crossedBridge, directory: 'corriente-cruzada' },
  { ...colossus, directory: 'coloso-de-la-torre' },
];
const [width, height] = opening.lienzo;
const centerX = width / 2;
const centerY = height / 2;

function assetPath(script: Cinematic, file: string): string {
  const path = folder + (file.startsWith('../') ? file.slice(3) : script.directory + '/' + file);
  return path.replace(/\.png$/, '.webp');
}

function ease(t: number, curve: string): number {
  switch (curve) {
    case 'easeOutSine': return Math.sin(t * Math.PI / 2);
    case 'easeInOutSine': return (1 - Math.cos(t * Math.PI)) / 2;
    case 'easeInOutCubic': return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    default: return t;
  }
}

function shotAt(shots: Shot[], time: number) {
  for (const shot of shots) {
    if (time < shot.duracion) return { shot, time };
    time -= shot.duracion;
  }
  const shot = shots[shots.length - 1];
  return { shot, time: shot.duracion };
}

function cameraAt(shot: Shot, time: number): Camera {
  const { desde, hasta, suavizado } = shot.camara;
  const t = ease(time / shot.duracion, suavizado);
  return {
    x: desde.x + (hasta.x - desde.x) * t,
    y: desde.y + (hasta.y - desde.y) * t,
    zoom: desde.zoom + (hasta.zoom - desde.zoom) * t,
  };
}

/** La cinemática comparte reloj con el diálogo y dibuja las capas de atrás a delante. */
export class StoryCinematic {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly images = new Map<string, HTMLImageElement | null>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly filtered = new Map<string, HTMLCanvasElement>();
  private readonly audio = new Map<string, Promise<AudioBuffer | null>>();
  private selected: Cinematic | null = null;
  private stopAudio: (() => void) | null = null;
  private current: Playback | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = width;
    canvas.height = height;
    this.ctx = canvas.getContext('2d');
  }

  select(chapterId: string, node: number, lines: readonly { text: string; speakerId?: DialogueLine['speakerId'] }[]): boolean {
    const script = this.ctx && scripts.find(scene => chapterId === scene.capitulo && node === scene.nodo);
    if (this.selected !== script) this.filtered.clear();
    this.selected = script && lines.length === script.dialogo.length
      && lines.every((line, i) => line.text === script.dialogo[i].texto
        && (line.speakerId?.toLowerCase() ?? 'reward') === script.dialogo[i].hablante) ? script : null;
    return this.selected !== null;
  }

  preload(chapterId: string, node: number): void {
    if (!this.ctx) return;
    const script = scripts.find(scene => chapterId === scene.capitulo && node === scene.nodo);
    if (script) {
      void this.prepareLine(script, 0);
      void this.prepareAudio(script);
    }
  }

  private prepareAudio(script: Cinematic): Promise<AudioBuffer | null> {
    const file = assetPath(script, script.audio.archivo);
    const cached = this.audio.get(file);
    if (cached) return cached;
    const url = urls[file];
    const pending = url ? sfx.loadCinematicAudio(url) : Promise.resolve(null);
    this.audio.set(file, pending);
    return pending;
  }

  private prepareLine(script: Cinematic, index: number): Promise<void> {
    const line = script.dialogo[index];
    if (!line) return Promise.resolve();
    const paths = new Set<string>();
    for (const shot of line.planos) {
      for (const { activo } of shot.capas) {
        const asset = script.activos[activo];
        paths.add(assetPath(script, asset.png));
        if (shot.boca) {
          for (const mouth of Object.values(asset.bocas ?? {})) paths.add(assetPath(script, script.activos[mouth].png));
        }
      }
    }
    return Promise.all([...paths].map(path => this.loadImage(path))).then(() => undefined);
  }

  private loadImage(path: string): Promise<void> {
    const pending = this.loading.get(path);
    if (pending) return pending;
    const img = new Image();
    const url = urls[path];
    const request = new Promise<void>((resolve) => {
      if (!url) {
        this.images.set(path, null);
        resolve();
        return;
      }
      img.onload = () => { this.images.set(path, img); resolve(); };
      img.onerror = () => { this.images.set(path, null); resolve(); };
      img.src = url;
    });
    this.loading.set(path, request);
    return request;
  }

  startLine(index: number, reducedMotion: boolean): void {
    this.stop();
    const script = this.selected;
    if (!script) return;
    const line = script.dialogo[index];
    const duration = line.planos.reduce((sum, shot) => sum + shot.duracion, 0);
    const state: Playback = { sequence: script, line, start: null, frame: -1, duration };
    this.current = state;
    const audio = this.prepareAudio(script);
    void this.prepareLine(script, index).then(() => {
      if (this.current !== state) return;
      const start = performance.now();
      state.start = start;
      this.animate(start, reducedMotion);
      void this.prepareLine(script, index + 1);
      void audio.then((buffer) => {
        if (!buffer || this.current !== state) return;
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed < duration) {
          this.stopAudio = sfx.playCinematicAudio(buffer, line.inicio + elapsed, duration - elapsed);
        }
      });
    });
  }

  stop(): void {
    this.current = null;
    this.stopAudio?.();
    this.stopAudio = null;
    this.ctx?.clearRect(0, 0, width, height);
  }

  animate(now: number, reducedMotion: boolean): boolean {
    const state = this.current;
    const ctx = this.ctx;
    if (!ctx || !state || state.start === null) return false;
    const { fps, avanceAutomatico } = state.sequence;
    const timeOnLine = Math.max(0, (now - state.start) / 1000);
    const nextLine = !!avanceAutomatico && timeOnLine >= state.duration;
    const frame = Math.floor(Math.min(state.duration, timeOnLine) * fps);
    if (frame === state.frame) return nextLine;
    state.frame = frame;
    const elapsed = frame / fps;
    const { shot, time } = shotAt(state.line.planos, elapsed);
    const camera = cameraAt(shot, reducedMotion ? 0 : time);
    let mouth: Mouth = 'cerrada';
    if (!reducedMotion) {
      for (const cue of shot.boca ?? []) {
        if (cue.t > time) break;
        mouth = cue.estado as Mouth;
      }
    }
    ctx.clearRect(0, 0, width, height);
    const progress = reducedMotion ? 0 : time / shot.duracion;
    for (const layer of shot.capas) {
      this.paint(ctx, state.sequence, layer, camera, reducedMotion ? 0 : state.line.inicio + elapsed, progress, mouth);
    }
    if (shot.rotulo) {
      ctx.save();
      ctx.font = 'bold 36px "Chakra Petch", system-ui, sans-serif';
      ctx.shadowColor = '#05070d';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#f1f7ff';
      ctx.fillText(shot.rotulo, 48, 112);
      ctx.restore();
    }
    return nextLine;
  }

  private filteredImage(path: string, layer: Layer, img: HTMLImageElement): CanvasImageSource {
    if (!layer.desenfoque && layer.bajoLuz === undefined) return img;
    const key = `${path}:${layer.desenfoque ?? 0}:${layer.bajoLuz ?? 1}`;
    const cached = this.filtered.get(key);
    if (cached) return cached;
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = img.width;
    layerCanvas.height = img.height;
    const ctx = layerCanvas.getContext('2d');
    if (!ctx) return img;
    ctx.filter = `blur(${layer.desenfoque ?? 0}px) brightness(${layer.bajoLuz ?? 1})`;
    ctx.drawImage(img, 0, 0);
    this.filtered.set(key, layerCanvas);
    return layerCanvas;
  }

  private paint(ctx: CanvasRenderingContext2D, script: Cinematic, layer: Layer, camera: Camera, elapsed: number, progress: number, mouth: Mouth): void {
    const asset = script.activos[layer.activo];
    const path = assetPath(script, asset.png);
    const img = this.images.get(path);
    if (!img) return;
    ctx.save();
    const opacity = layer.opacidad ?? 1;
    const transition = (from: number, to = from) => from + (to - from) * progress;
    ctx.globalAlpha = transition(opacity, layer.hasta?.opacidad) * (layer.pulso ? 0.89 + 0.11 * Math.sin(2 * Math.PI * layer.pulso * elapsed) : 1);
    if (layer.mosaico && layer.velocidad) {
      const [vx, vy] = layer.velocidad;
      const offset = (v: number, size: number) => ((v * elapsed % size) + size) % size - size;
      for (let x = offset(vx, img.width); x < width; x += img.width) {
        for (let y = offset(vy, img.height); y < height; y += img.height) ctx.drawImage(img, x, y);
      }
    } else {
      const d = layer.profundidad;
      const z = 1 + (camera.zoom - 1) * d;
      const x = centerX + (transition(layer.x, layer.hasta?.x) - centerX - (camera.x - centerX) * d) * z;
      const y = centerY + (transition(layer.y, layer.hasta?.y) - centerY - (camera.y - centerY) * d) * z;
      const scale = transition(layer.escala, layer.hasta?.escala) * z;
      const [ax, ay] = asset.pivote;
      const mouthId = asset.bocas?.[mouth];
      const overlay = mouthId && this.images.get(assetPath(script, script.activos[mouthId].png));
      const flip = layer.invertir ? -1 : 1;
      ctx.translate(x, y);
      ctx.scale(scale * flip, scale);
      ctx.drawImage(this.filteredImage(path, layer, img), -ax, -ay);
      if (overlay && !layer.desenfoque) ctx.drawImage(overlay, -ax, -ay);
    }
    ctx.restore();
  }
}
