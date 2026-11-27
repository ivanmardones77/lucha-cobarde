import type { DataConnection, Peer as PeerType } from 'peerjs';
import { PingMeter, type GameLink, type LinkState } from './GameLink';

/**
 * Enlace por PeerJS: su servidor público gratuito solo presenta a los dos navegadores;
 * el combate va por WebRTC directo.
 * - El anfitrión se registra como «cyberdojo-<CÓDIGO>»; el invitado se conecta a ese id.
 * - Canal «game» sin reenvíos (inputs repetidos, perder uno no importa) y «ctrl» fiable.
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export const peerIdFor = (code: string) => `cyberdojo-${code.toLowerCase()}`;

export type PeerJsError = 'id-taken' | 'no-room' | 'room-full' | 'server' | 'network';

export class PeerJsLink implements GameLink {
  state: LinkState = 'waiting';
  onState: (s: LinkState) => void = () => undefined;
  onGame: (data: unknown) => void = () => undefined;
  onCtrl: (data: unknown) => void = () => undefined;
  /** El anfitrión ya está registrado y esperando rival. */
  onReady: () => void = () => undefined;
  onError: (e: PeerJsError, detail?: string) => void = () => undefined;

  private peer: PeerType | null = null;
  private game: DataConnection | null = null;
  private ctrl: DataConnection | null = null;
  private remoteId = '';
  private meter = new PingMeter();
  private pingTimer = 0;

  get rtt(): number {
    return this.meter.rtt;
  }

  private async loadPeer(): Promise<typeof import('peerjs').Peer | null> {
    try {
      return (await import('peerjs')).Peer;
    } catch (err) {
      this.onError('server', (err as Error).message);
      return null;
    }
  }

  async host(code: string): Promise<void> {
    const Peer = await this.loadPeer();
    if (!Peer) return;
    const peer = new Peer(peerIdFor(code), { debug: 0, config: { iceServers: ICE_SERVERS } });
    this.peer = peer;
    peer.on('open', () => this.onReady());
    peer.on('connection', (conn) => {
      // Solo un rival por sala
      if (this.remoteId && conn.peer !== this.remoteId) {
        conn.on('open', () => {
          void conn.send({ t: 'full' });
          window.setTimeout(() => conn.close(), 300);
        });
        return;
      }
      this.remoteId = conn.peer;
      this.setState('connecting');
      this.bind(conn);
    });
    this.watchErrors(peer);
  }

  async join(code: string): Promise<void> {
    const Peer = await this.loadPeer();
    if (!Peer) return;
    const peer = new Peer({ debug: 0, config: { iceServers: ICE_SERVERS } });
    this.peer = peer;
    peer.on('open', () => {
      this.setState('connecting');
      const target = peerIdFor(code);
      this.remoteId = target;
      this.bind(peer.connect(target, { label: 'game', reliable: false, serialization: 'json' }));
      this.bind(peer.connect(target, { label: 'ctrl', reliable: true, serialization: 'json' }));
    });
    this.watchErrors(peer);
  }

  private watchErrors(peer: PeerType): void {
    peer.on('error', (err: { type?: string; message?: string }) => {
      const t = err.type ?? '';
      if (t === 'unavailable-id') this.onError('id-taken');
      else if (t === 'peer-unavailable') this.onError('no-room');
      else if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') this.onError('server', err.message);
      else if (this.state !== 'direct') this.onError('network', err.message);
    });
  }

  private bind(conn: DataConnection): void {
    if (conn.label === 'game') this.game = conn;
    else this.ctrl = conn;
    conn.on('open', () => {
      if (this.game?.open && this.ctrl?.open && this.state !== 'direct') {
        this.meter.start();
        this.setState('direct');
        window.clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => {
          this.send('game', this.meter.ping());
          if (this.meter.timedOut()) this.setState('closed');
        }, 500);
      }
    });
    conn.on('data', (data) => {
      if ((data as { t?: string })?.t === 'full') {
        this.onError('room-full');
        return;
      }
      if (this.meter.handle(data, (m) => this.send('game', m))) return;
      if (conn.label === 'game') this.onGame(data);
      else this.onCtrl(data);
    });
    conn.on('close', () => {
      if (this.state === 'direct') this.setState('closed');
    });
  }

  send(channel: 'game' | 'ctrl', data: unknown): void {
    const c = channel === 'game' ? this.game : this.ctrl;
    if (c?.open) void c.send(data);
  }

  private setState(s: LinkState): void {
    if (this.state === s) return;
    this.state = s;
    this.onState(s);
  }

  close(): void {
    window.clearInterval(this.pingTimer);
    this.game?.close();
    this.ctrl?.close();
    this.peer?.destroy();
    this.peer = null;
    this.state = 'closed';
  }
}
