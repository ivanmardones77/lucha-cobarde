import type { GameLink, LinkState } from './GameLink';
import { PeerJsLink, type PeerJsError } from './PeerJsLink';
import { PeerLink } from './PeerLink';
import { LocalSignaling } from './signaling';

/** Códigos de sala: 5 caracteres sin los que se confunden (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newRoomCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

/** ?netlocal: dos pestañas del mismo navegador, sin red (para pruebas). */
export function isLocalTestMode(): boolean {
  return new URLSearchParams(location.search).has('netlocal');
}

export type SessionStatus =
  | { kind: 'idle' }
  | { kind: 'joining' }
  | { kind: 'waiting'; code: string }
  | { kind: 'connecting'; code: string }
  | { kind: 'connected'; code: string; via: 'direct' | 'relay' }
  | { kind: 'error'; message: string }
  | { kind: 'closed'; message: string };

const ERRORS: Record<PeerJsError, string> = {
  'id-taken': 'Ese código ya está en uso.',
  'no-room': 'No hay ninguna sala con ese código.',
  'room-full': 'La sala ya está llena.',
  server: 'No se pudo contactar con el servidor de salas. Comprueba tu conexión.',
  network: 'No se pudo conectar con el rival.',
};

/**
 * Una sala online: crea o se une con código y abre el enlace con el rival.
 * (Fase 1: conexión y ping. El combate con rollback irá encima de `link`.)
 */
export class OnlineSession {
  status: SessionStatus = { kind: 'idle' };
  role: 'host' | 'guest' = 'host';
  code = '';
  link: GameLink | null = null;
  readonly backend: 'peerjs' | 'local' = isLocalTestMode() ? 'local' : 'peerjs';
  onStatus: (s: SessionStatus) => void = () => undefined;

  private local: LocalSignaling | null = null;
  private readonly selfId = crypto.randomUUID();
  private started = false;
  private retries = 0;

  async create(): Promise<void> {
    this.role = 'host';
    this.code = newRoomCode();
    this.set({ kind: 'joining' });
    if (this.backend === 'local') return this.openLocal();
    const link = new PeerJsLink();
    this.attach(link);
    link.onReady = () => this.set({ kind: 'waiting', code: this.code });
    link.onError = (e) => {
      // Código ocupado por casualidad: se prueba otro
      if (e === 'id-taken' && this.retries++ < 3) {
        link.close();
        void this.create();
        return;
      }
      this.fail(ERRORS[e]);
    };
    await link.host(this.code);
  }

  async join(raw: string): Promise<void> {
    this.role = 'guest';
    this.code = normalizeCode(raw);
    if (this.code.length !== 5) {
      this.set({ kind: 'error', message: 'El código tiene 5 caracteres.' });
      return;
    }
    this.set({ kind: 'joining' });
    if (this.backend === 'local') return this.openLocal();
    const link = new PeerJsLink();
    this.attach(link);
    link.onError = (e) => this.fail(ERRORS[e]);
    await link.join(this.code);
  }

  private attach(link: GameLink): void {
    this.link = link;
    link.onState = (s) => this.onLink(s);
  }

  /** Modo prueba entre pestañas. */
  private openLocal(): void {
    const sig = new LocalSignaling();
    this.local = sig;
    sig.onPeersChange = () => this.onLocalPeers();
    sig.join(this.code, this.selfId, this.role);
    this.set({ kind: 'waiting', code: this.code });
    if (this.role === 'guest') {
      window.setTimeout(() => {
        if (!this.started) this.fail(ERRORS['no-room']);
      }, 4000);
    }
  }

  private onLocalPeers(): void {
    if (!this.local) return;
    const others = this.local.peers().filter((p) => p.id !== this.selfId);
    if (!this.started && others.length >= 1) {
      this.started = true;
      const link = new PeerLink(this.local, this.role);
      this.attach(link);
      this.set({ kind: 'connecting', code: this.code });
      if (this.role === 'guest') void link.start();
      else window.setTimeout(() => void link.start(), 300);
    } else if (this.started && others.length === 0) {
      this.onLink('closed');
    }
  }

  private onLink(s: LinkState): void {
    if (s === 'connecting') this.set({ kind: 'connecting', code: this.code });
    else if (s === 'direct' || s === 'relay') this.set({ kind: 'connected', code: this.code, via: s });
    else if (s === 'closed' && this.status.kind === 'connected') this.set({ kind: 'closed', message: 'Se ha perdido la conexión con el rival.' });
  }

  private fail(message: string): void {
    this.leave();
    this.set({ kind: 'error', message });
  }

  private set(s: SessionStatus): void {
    this.status = s;
    this.onStatus(s);
  }

  leave(): void {
    this.link?.close();
    this.link = null;
    this.local?.leave();
    this.local = null;
    this.started = false;
  }
}
