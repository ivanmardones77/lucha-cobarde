import { InputBuffer } from '../core/inputBuffer';
import { FighterState, MatchState, MOVES } from '../core/types';
import { GamepadStatus } from '../input/InputManager';

export class HudOverlay {
  private root: HTMLDivElement;
  private p1Bar!: HTMLDivElement;
  private p2Bar!: HTMLDivElement;
  private p1HpText!: HTMLSpanElement;
  private p2HpText!: HTMLSpanElement;
  private p1PadBadge!: HTMLSpanElement;
  private p2PadBadge!: HTMLSpanElement;
  private frameCounter!: HTMLDivElement;
  private p1Combo!: HTMLDivElement;
  private p2Combo!: HTMLDivElement;
  private frameDataPanel!: HTMLDivElement;
  private p1Data!: HTMLDivElement;
  private p2Data!: HTMLDivElement;
  public showFrameData = true;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:16px 24px;';

    this.root.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;margin-bottom:4px;">
            <span style="color:#60a5fa;">P1 (AZUL) <span id="p1-pad" style="font-size:11px;font-weight:600;color:#94a3b8;margin-left:6px;">[Teclado]</span></span>
            <span id="p1-hp-text">1000 / 1000</span>
          </div>
          <div style="height:20px;background:#1e293b;border:2px solid #475569;border-radius:4px;overflow:hidden;">
            <div id="p1-bar" style="height:100%;width:100%;background:linear-gradient(90deg,#2563eb,#60a5fa);transition:width 80ms linear;"></div>
          </div>
          <div id="p1-combo" style="margin-top:8px;font-size:20px;font-weight:900;color:#fbbf24;min-height:26px;text-shadow:0 2px 6px rgba(0,0,0,.8);"></div>
        </div>

        <div style="text-align:center;background:rgba(15,23,42,.85);border:1px solid #334155;border-radius:8px;padding:6px 14px;">
          <div style="font-size:10px;letter-spacing:1px;color:#94a3b8;">60 FPS TICK</div>
          <div id="frame-counter" style="font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;">0</div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;margin-bottom:4px;">
            <span id="p2-hp-text">1000 / 1000</span>
            <span style="color:#f87171;"><span id="p2-pad" style="font-size:11px;font-weight:600;color:#94a3b8;margin-right:6px;">[Teclado]</span> P2 (ROJO)</span>
          </div>
          <div style="height:20px;background:#1e293b;border:2px solid #475569;border-radius:4px;overflow:hidden;display:flex;justify-content:flex-end;">
            <div id="p2-bar" style="height:100%;width:100%;background:linear-gradient(90deg,#f87171,#dc2626);transition:width 80ms linear;"></div>
          </div>
          <div id="p2-combo" style="margin-top:8px;font-size:20px;font-weight:900;color:#fbbf24;text-align:right;min-height:26px;text-shadow:0 2px 6px rgba(0,0,0,.8);"></div>
        </div>
      </div>

      <div>
        <div id="frame-data-panel" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:10px;">
          <div id="p1-data" style="background:rgba(15,23,42,.82);border:1px solid #334155;border-radius:8px;padding:10px 12px;font-family:ui-monospace,monospace;font-size:12px;line-height:1.5;"></div>
          <div id="p2-data" style="background:rgba(15,23,42,.82);border:1px solid #334155;border-radius:8px;padding:10px 12px;font-family:ui-monospace,monospace;font-size:12px;line-height:1.5;"></div>
        </div>

        <div style="text-align:center;font-size:12px;color:#cbd5e1;background:rgba(15,23,42,.75);border-radius:6px;padding:6px 10px;">
          <b>P1:</b> A/D/S + J o Mando 1 (D-Pad/Stick + A/B/X/Y) &nbsp;|&nbsp;
          <b>P2:</b> ←/→/↓ + K/Num1 o Mando 2 &nbsp;|&nbsp;
          <b>236+Ataque:</b> Hadouken &nbsp;|&nbsp;
          <b>F1:</b> Cajas · <b>F2:</b> Frame Data · <b>R / Start:</b> Reiniciar
        </div>
      </div>
    `;

    container.appendChild(this.root);

    this.p1Bar = this.root.querySelector('#p1-bar')!;
    this.p2Bar = this.root.querySelector('#p2-bar')!;
    this.p1HpText = this.root.querySelector('#p1-hp-text')!;
    this.p2HpText = this.root.querySelector('#p2-hp-text')!;
    this.p1PadBadge = this.root.querySelector('#p1-pad')!;
    this.p2PadBadge = this.root.querySelector('#p2-pad')!;
    this.frameCounter = this.root.querySelector('#frame-counter')!;
    this.p1Combo = this.root.querySelector('#p1-combo')!;
    this.p2Combo = this.root.querySelector('#p2-combo')!;
    this.frameDataPanel = this.root.querySelector('#frame-data-panel')!;
    this.p1Data = this.root.querySelector('#p1-data')!;
    this.p2Data = this.root.querySelector('#p2-data')!;
  }

  public update(
    state: MatchState,
    buffers: [InputBuffer, InputBuffer],
    padStatus: GamepadStatus
  ): void {
    const [p1, p2] = state.fighters;

    this.p1Bar.style.width = `${(p1.hp / p1.maxHp) * 100}%`;
    this.p2Bar.style.width = `${(p2.hp / p2.maxHp) * 100}%`;
    this.p1HpText.textContent = `${p1.hp} / ${p1.maxHp}`;
    this.p2HpText.textContent = `${p2.hp} / ${p2.maxHp}`;
    this.frameCounter.textContent = String(state.frame);

    this.p1PadBadge.textContent = padStatus.p1Connected ? '[Mando 1]' : '[Teclado]';
    this.p1PadBadge.style.color = padStatus.p1Connected ? '#4ade80' : '#94a3b8';

    this.p2PadBadge.textContent = padStatus.p2Connected ? '[Mando 2]' : '[Teclado]';
    this.p2PadBadge.style.color = padStatus.p2Connected ? '#4ade80' : '#94a3b8';

    this.p1Combo.textContent =
      p1.comboCount >= 2 ? `${p1.comboCount} HIT COMBO!` : '';
    this.p2Combo.textContent =
      p2.comboCount >= 2 ? `${p2.comboCount} HIT COMBO!` : '';

    this.frameDataPanel.style.display = this.showFrameData ? 'grid' : 'none';
    if (this.showFrameData) {
      this.p1Data.innerHTML = this.formatFighterData('P1', p1, buffers[0]);
      this.p2Data.innerHTML = this.formatFighterData('P2', p2, buffers[1]);
    }
  }

  private formatFighterData(
    label: string,
    f: FighterState,
    buffer: InputBuffer
  ): string {
    const move = f.currentMove ? MOVES[f.currentMove] : null;
    const moveInfo = move
      ? `${move.name} [${move.hitLevel}] S:${move.startupFrames} A:${move.activeFrames} R:${move.recoveryFrames}`
      : '—';
    const history = buffer.getRecentDirs(8).join(' ');

    return `
      <div><b>${label}</b> | Estado: <span style="color:#38bdf8">${f.action}</span> (F:${f.actionFrame}) | Stun: ${f.stunFrames}</div>
      <div>Move: ${moveInfo}</div>
      <div>Pos: (${f.x.toFixed(2)}, ${f.y.toFixed(2)}) | Input Buffer: [${history}]</div>
    `;
  }
}
