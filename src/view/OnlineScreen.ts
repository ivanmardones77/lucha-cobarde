import './online.css';
import { sfx } from '../audio/SoundEngine';
import { OnlineSession, isLocalTestMode, type SessionStatus } from '../net/OnlineSession';

/**
 * Pantalla ONLINE (fase 1): crear sala con código o unirse, y ver el estado de la
 * conexión con el rival y su ping.
 */
export class OnlineScreen {
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private session: OnlineSession | null = null;
  private pingTimer = 0;
  onClose: () => void = () => undefined;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'online-screen';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="ol-panel" role="dialog" aria-label="Juego online">
        <div class="ol-kicker">MULTIJUGADOR</div>
        <h2 class="ol-title">ONLINE</h2>
        <div class="ol-backend"></div>
        <div class="ol-body"></div>
        <button class="ol-back" type="button">◀ VOLVER</button>
      </div>`;
    document.body.appendChild(this.root);
    this.body = this.root.querySelector('.ol-body') as HTMLDivElement;
    (this.root.querySelector('.ol-back') as HTMLButtonElement).addEventListener('click', () => this.back());
    window.addEventListener('keydown', (e) => {
      if (this.root.classList.contains('hidden')) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.back();
      }
    }, true);
  }

  show(): void {
    this.root.classList.remove('hidden');
    const backend = this.root.querySelector('.ol-backend') as HTMLDivElement;
    const local = isLocalTestMode();
    backend.textContent = local
      ? 'Modo prueba: conecta dos pestañas de este navegador'
      : 'Conexión directa entre jugadores (PeerJS)';
    backend.classList.toggle('warn', local);
    this.renderHome();
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.stopPing();
  }

  private back(): void {
    sfx.play('uiBack');
    if (this.session) {
      this.session.leave();
      this.session = null;
      this.stopPing();
      this.renderHome();
      return;
    }
    this.hide();
    this.onClose();
  }

  private renderHome(): void {
    this.body.innerHTML = `
      <p class="ol-text">Juega contra un amigo: uno crea la sala y le pasa el código al otro.</p>
      <div class="ol-actions">
        <button class="ol-btn primary" data-a="create" type="button">CREAR SALA</button>
        <button class="ol-btn" data-a="join" type="button">UNIRSE CON CÓDIGO</button>
      </div>`;
    this.body.querySelector('[data-a="create"]')!.addEventListener('click', () => {
      sfx.play('uiConfirm');
      void this.start((s) => s.create());
    });
    this.body.querySelector('[data-a="join"]')!.addEventListener('click', () => {
      sfx.play('uiConfirm');
      this.renderJoin();
    });
    (this.body.querySelector('[data-a="create"]') as HTMLButtonElement).focus();
  }

  private renderJoin(): void {
    this.body.innerHTML = `
      <p class="ol-text">Escribe el código de 5 caracteres que te ha pasado tu rival.</p>
      <form class="ol-join">
        <input class="ol-code-input" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2X" aria-label="Código de sala" />
        <button class="ol-btn primary" type="submit">ENTRAR</button>
      </form>`;
    const input = this.body.querySelector('input') as HTMLInputElement;
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (input.value.length) sfx.play('uiMove');
    });
    this.body.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      sfx.play('uiConfirm');
      const code = input.value;
      void this.start((s) => s.join(code));
    });
    input.focus();
  }

  private async start(go: (s: OnlineSession) => Promise<void>): Promise<void> {
    this.session?.leave();
    const s = new OnlineSession();
    this.session = s;
    s.onStatus = (st) => {
      if (this.session === s) this.renderStatus(st);
    };
    await go(s);
  }

  private renderStatus(st: SessionStatus): void {
    this.stopPing();
    if (st.kind === 'joining') {
      this.body.innerHTML = `<p class="ol-status"><span class="ol-dot busy"></span>Conectando con el servidor…</p>`;
    } else if (st.kind === 'waiting' || st.kind === 'connecting') {
      const host = this.session?.role === 'host';
      this.body.innerHTML = `
        ${host ? `<p class="ol-text">Comparte este código con tu rival:</p>` : `<p class="ol-text">Sala</p>`}
        <div class="ol-code-row">
          <div class="ol-code">${st.code}</div>
          ${host ? `<button class="ol-btn small" data-a="copy" type="button">COPIAR</button>` : ''}
        </div>
        <p class="ol-status"><span class="ol-dot busy"></span>${st.kind === 'waiting' ? (host ? 'Esperando rival…' : 'Buscando la sala…') : 'Rival encontrado. Conectando…'}</p>`;
      this.body.querySelector('[data-a="copy"]')?.addEventListener('click', (e) => {
        void navigator.clipboard?.writeText(st.code);
        (e.currentTarget as HTMLButtonElement).textContent = '¡COPIADO!';
        sfx.play('uiConfirm');
      });
    } else if (st.kind === 'connected') {
      sfx.play('uiStart');
      this.body.innerHTML = `
        <div class="ol-code-row"><div class="ol-code small">${st.code}</div></div>
        <p class="ol-status ok"><span class="ol-dot ok"></span>¡Rival conectado!</p>
        <div class="ol-stats">
          <div><span>PING</span><b class="ol-ping">—</b></div>
          <div><span>CONEXIÓN</span><b>${st.via === 'direct' ? 'Directa' : 'Por relé'}</b></div>
          <div><span>TÚ ERES</span><b>${this.session?.role === 'host' ? 'Jugador 1' : 'Jugador 2'}</b></div>
        </div>
        <p class="ol-note">El combate online llega en la siguiente fase. De momento ya podéis comprobar la conexión y el ping.</p>`;
      const pingEl = this.body.querySelector('.ol-ping') as HTMLElement;
      this.pingTimer = window.setInterval(() => {
        const rtt = this.session?.link?.rtt ?? 0;
        if (!rtt) return;
        pingEl.textContent = `${Math.round(rtt)} ms`;
        pingEl.className = `ol-ping ${rtt < 60 ? 'good' : rtt < 120 ? 'mid' : 'bad'}`;
      }, 250);
    } else if (st.kind === 'error' || st.kind === 'closed') {
      sfx.play('uiBack');
      this.session?.leave();
      this.session = null;
      this.body.innerHTML = `
        <p class="ol-status bad"><span class="ol-dot bad"></span>${st.message}</p>
        <div class="ol-actions"><button class="ol-btn primary" data-a="home" type="button">ENTENDIDO</button></div>`;
      this.body.querySelector('[data-a="home"]')!.addEventListener('click', () => {
        sfx.play('uiConfirm');
        this.renderHome();
      });
    }
  }

  private stopPing(): void {
    window.clearInterval(this.pingTimer);
  }
}
