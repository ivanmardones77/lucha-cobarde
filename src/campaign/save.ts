/**
 * Guardado local versionado (localStorage). Si cambia la estructura, sube
 * SAVE_VERSION: los datos antiguos se descartan en vez de romper el juego.
 */
import type { CharacterId } from '../core/types';
import type { ArcadeRank } from './arcade';

const KEY = 'cyberdojo.save';
export const SAVE_VERSION = 1;

export interface ChapterProgress {
  done: boolean;
  /** Nodo en el que se quedó (autoguardado) */
  node: number;
}

export interface SaveData {
  saveVersion: number;
  chapters: Record<string, ChapterProgress>;
  arcade: Partial<Record<CharacterId, { score: number; rank: ArcadeRank }>>;
  unlocked: string[];
}

/** Almacén mínimo (localStorage en el navegador, un Map en los tests) */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const fresh = (): SaveData => ({
  saveVersion: SAVE_VERSION,
  chapters: {},
  arcade: {},
  unlocked: [],
});

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // modo privado o almacenamiento bloqueado
  }
}

export class SaveGame {
  data: SaveData = fresh();

  constructor(private store: KeyValueStore | null = defaultStore()) {
    try {
      const raw = this.store?.getItem(KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (d && d.saveVersion === SAVE_VERSION) this.data = { ...fresh(), ...d };
    } catch {
      // dato corrupto: se empieza de cero
    }
  }

  private flush(): void {
    try {
      this.store?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // sin espacio o bloqueado: el juego sigue sin guardar
    }
  }

  chapter(id: string): ChapterProgress {
    return this.data.chapters[id] ?? { done: false, node: 0 };
  }

  setNode(id: string, node: number): void {
    const c = this.chapter(id);
    this.data.chapters[id] = { ...c, node };
    this.flush();
  }

  finishChapter(id: string): void {
    this.data.chapters[id] = { done: true, node: 0 };
    this.flush();
  }

  arcadeBest(id: CharacterId): { score: number; rank: ArcadeRank } | undefined {
    return this.data.arcade[id];
  }

  /** Devuelve true si es récord */
  setArcadeBest(id: CharacterId, score: number, rank: ArcadeRank): boolean {
    const cur = this.data.arcade[id];
    if (cur && cur.score >= score) return false;
    this.data.arcade[id] = { score, rank };
    this.flush();
    return true;
  }

  unlock(key: string): boolean {
    if (this.data.unlocked.includes(key)) return false;
    this.data.unlocked.push(key);
    this.flush();
    return true;
  }

  isUnlocked(key: string): boolean {
    return this.data.unlocked.includes(key);
  }

  reset(): void {
    this.data = fresh();
    this.flush();
  }
}
