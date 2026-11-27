import type { GameLink, LinkState } from './GameLink';
import type { LocalSignaling } from './signaling';

/**
 * Enlace del modo prueba (?netlocal): WebRTC entre dos pestañas usando BroadcastChannel
 * como señalización y, si WebRTC no abre, como relé.
 * - WebRTC directo: canal «game» sin orden ni reenvíos (los inputs viajan repetidos,
 *   uno perdido no importa) y canal «ctrl» fiable (elecciones, revancha…).
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export class PeerLink implements GameLink {
  state: LinkState = 'waiting';
  /** Ida y vuelta medido (ms), suavizado. */
  rtt = 0;
  onState: (s: LinkState) => void = () => undefined;
  onGame: (data: unknown) => void = () => undefined;
  onCtrl: (data: unknown) => void = () => undefined;

  private pc: RTCPeerConnection | null = null;
  private game: RTCDataChannel | null = null;
  private ctrl: RTCDataChannel | null = null;
  private pingTimer = 0;
  private fallbackTimer = 0;
  private lastPong = 0;

  constructor(private sig: LocalSignaling, private role: 'host' | 'guest') {
    sig.onMessage = (m) => this.onSignal(m.kind, m.data);
  }

  /** El anfitrión inicia la conexión cuando ve llegar al invitado. */
  async start(): Promise<void> {
    this.setState('connecting');
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.sig.send('ice', e.candidate.toJSON());
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc?.connectionState;
      if ((s === 'failed' || s === 'disconnected') && this.state === 'direct') this.useRelay();
    };
    if (this.role === 'host') {
      this.bind(this.pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }));
      this.bind(this.pc.createDataChannel('ctrl', { ordered: true }));
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.sig.send('offer', offer);
    } else {
      this.pc.ondatachannel = (e) => this.bind(e.channel);
    }
    this.fallbackTimer = window.setTimeout(() => {
      if (this.state === 'connecting') this.useRelay();
    }, 8000);
    this.pingTimer = window.setInterval(() => this.ping(), 500);
  }

  private bind(ch: RTCDataChannel): void {
    if (ch.label === 'game') this.game = ch;
    else this.ctrl = ch;
    ch.onopen = () => {
      if (this.game?.readyState === 'open' && this.ctrl?.readyState === 'open') {
        window.clearTimeout(this.fallbackTimer);
        this.setState('direct');
      }
    };
    ch.onmessage = (e) => this.receive(ch.label as 'game' | 'ctrl', JSON.parse(e.data as string));
  }

  private async onSignal(kind: string, data: unknown): Promise<void> {
    try {
      if (kind === 'offer' && this.pc && this.role === 'guest') {
        await this.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sig.send('answer', answer);
      } else if (kind === 'answer' && this.pc && this.role === 'host') {
        await this.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
      } else if (kind === 'ice' && this.pc) {
        await this.pc.addIceCandidate(data as RTCIceCandidateInit);
      } else if (kind === 'relay-game') {
        this.receive('game', data);
      } else if (kind === 'relay-ctrl') {
        this.receive('ctrl', data);
      }
    } catch (err) {
      console.warn('[PeerLink] señal', kind, err);
    }
  }

  private receive(channel: 'game' | 'ctrl', msg: unknown): void {
    const m = msg as { t?: string; ts?: number };
    if (m.t === 'ping') {
      this.send('game', { t: 'pong', ts: m.ts });
      return;
    }
    if (m.t === 'pong' && typeof m.ts === 'number') {
      const sample = performance.now() - m.ts;
      this.rtt = this.rtt === 0 ? sample : this.rtt * 0.8 + sample * 0.2;
      this.lastPong = performance.now();
      return;
    }
    if (channel === 'game') this.onGame(msg);
    else this.onCtrl(msg);
  }

  private ping(): void {
    if (this.state !== 'direct' && this.state !== 'relay') return;
    this.send('game', { t: 'ping', ts: performance.now() });
    // Sin respuesta en 5 s: rival desconectado
    if (this.lastPong && performance.now() - this.lastPong > 5000) this.setState('closed');
  }

  private useRelay(): void {
    if (this.state === 'closed') return;
    this.setState('relay');
  }

  send(channel: 'game' | 'ctrl', data: unknown): void {
    const ch = channel === 'game' ? this.game : this.ctrl;
    if (this.state === 'direct' && ch?.readyState === 'open') ch.send(JSON.stringify(data));
    else if (this.state === 'relay' || this.state === 'connecting') this.sig.send(channel === 'game' ? 'relay-game' : 'relay-ctrl', data);
  }

  private setState(s: LinkState): void {
    if (this.state === s) return;
    this.state = s;
    if (s === 'direct' || s === 'relay') this.lastPong = performance.now();
    this.onState(s);
  }

  close(): void {
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.fallbackTimer);
    this.game?.close();
    this.ctrl?.close();
    this.pc?.close();
    this.pc = null;
    this.state = 'closed';
  }
}
