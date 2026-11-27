import { sfx } from '../audio/SoundEngine';
import { InputBuffer } from '../core/inputBuffer';
import {
  CHARACTERS,
  COMBO_SCALING,
  FrameMeterCode,
  MatchState,
} from '../core/types';
import { InputManager } from '../input/InputManager';
import { TouchControls } from '../input/TouchControls';
import { SceneView3D } from './SceneView3D';

const FM_COLORS: Record<FrameMeterCode, string> = {
  N: '#1e293b',
  S: '#38bdf8',
  A: '#ef4444',
  R: '#2563eb',
  H: '#facc15',
  B: '#a855f7',
  I: '#f8fafc',
  D: '#6366f1',
};

export class HudOverlay {
  private p1CharName = document.getElementById('p1-char-name')!;
  private p2CharName = document.getElementById('p2-char-name')!;
  private p1HpWrap = document.getElementById('p1-hp-wrap')!;
  private p2HpWrap = document.getElementById('p2-hp-wrap')!;
  private p1HpFill = document.getElementById('p1-hp-fill')!;
  private p1HpDel = document.getElementById('p1-hp-delayed')!;
  private p1HpText = document.getElementById('p1-hp-text')!;
  private p2HpFill = document.getElementById('p2-hp-fill')!;
  private p2HpDel = document.getElementById('p2-hp-delayed')!;
  private p2HpText = document.getElementById('p2-hp-text')!;
  private p1SuperFill = document.getElementById('p1-super-fill')!;
  private p1SuperPct = document.getElementById('p1-super-pct')!;
  private p1SuperWrap = document.getElementById('p1-super-bar-wrap')!;
  private p2SuperFill = document.getElementById('p2-super-fill')!;
  private p2SuperPct = document.getElementById('p2-super-pct')!;
  private p2SuperWrap = document.getElementById('p2-super-bar-wrap')!;
  private timer = document.getElementById('timer-display')!;
  private roundLabel = document.getElementById('round-label')!;
  private p1R1 = document.getElementById('p1-round-1')!;
  private p1R2 = document.getElementById('p1-round-2')!;
  private p2R1 = document.getElementById('p2-round-1')!;
  private p2R2 = document.getElementById('p2-round-2')!;
  private p1Badge = document.getElementById('p1-input-badge')!;
  private p2Badge = document.getElementById('p2-input-badge')!;
  private p1ComboBox = document.getElementById('p1-combo-box')!;
  private p1ComboCount = document.getElementById('p1-combo-count')!;
  private p1ComboScale = document.getElementById('p1-combo-scaling')!;
  private p2ComboBox = document.getElementById('p2-combo-box')!;
  private p2ComboCount = document.getElementById('p2-combo-count')!;
  private p2ComboScale = document.getElementById('p2-combo-scaling')!;
  private p1Callout = document.getElementById('p1-callout')!;
  private p2Callout = document.getElementById('p2-callout')!;
  private banner = document.getElementById('center-banner')!;
  private matchEndModal = document.getElementById('match-end-modal')!;
  private matchEndTitle = document.getElementById('match-end-title')!;
  private matchEndSubtitle = document.getElementById('match-end-subtitle')!;
  public framePanel = document.getElementById('frame-debug-panel')!;
  private dbgP1State = document.getElementById('dbg-p1-state')!;
  private dbgP1Frame = document.getElementById('dbg-p1-frame')!;
  private dbgP1Adv = document.getElementById('dbg-p1-adv')!;
  private dbgP1Buf = document.getElementById('dbg-p1-buffer')!;
  private dbgP2State = document.getElementById('dbg-p2-state')!;
  private dbgP2Frame = document.getElementById('dbg-p2-frame')!;
  private fmP1 = document.getElementById('frame-meter-p1')!;
  private fmP2 = document.getElementById('frame-meter-p2')!;

  private fmCells: [HTMLDivElement[], HTMLDivElement[]] = [[], []];

  constructor() {
    for (let p = 0; p < 2; p++) {
      const container = p === 0 ? this.fmP1 : this.fmP2;
      container.innerHTML = '';
      for (let i = 0; i < 60; i++) {
        const d = document.createElement('div');
        d.className = 'fm-cell bg-slate-800';
        container.appendChild(d);
        this.fmCells[p].push(d);
      }
    }
  }

  public showCenterBanner(text: string, color = '#facc15'): void {
    this.banner.textContent = text;
    this.banner.style.color = color;
    this.banner.classList.remove('hidden', 'animate-banner');
    void this.banner.offsetWidth;
    this.banner.classList.add('animate-banner');
  }

  public showCallout(side: 0 | 1, text: string, color: string): void {
    const target = side === 0 ? this.p1Callout : this.p2Callout;
    target.textContent = text;
    target.style.color = color;
    target.classList.remove('animate-callout');
    void target.offsetWidth;
    target.classList.add('animate-callout');
  }

  public processEvents(state: MatchState, view: SceneView3D): void {
    for (const ev of state.events) {
      if (ev.type === 'SPARK') {
        view.spawnSparks(ev.x, ev.y, ev.kind);
      } else if (ev.type === 'VFX_SLASH') {
        view.spawnSlashArc(
          ev.x,
          ev.y,
          ev.facing,
          ev.color,
          ev.angle,
          ev.scale ?? 1.15
        );
      } else if (ev.type === 'VFX_BURST') {
        view.spawnSpecialBurst(ev.x, ev.y, ev.effect, ev.facing, ev.color);
      } else if (ev.type === 'SFX') {
        sfx.play(ev.name);
      } else if (ev.type === 'BANNER') {
        this.showCenterBanner(ev.text, ev.color);
      } else if (ev.type === 'CALLOUT') {
        this.showCallout(ev.side, ev.text, ev.color);
      } else if (ev.type === 'SUPER_FLASH') {
        sfx.superFlash();
        this.showCenterBanner('¡SUPER ART!', '#facc15');
        this.showCallout(ev.owner, ev.superName, '#facc15');
      }
    }
  }

  public update(
    state: MatchState,
    buffers: [InputBuffer, InputBuffer],
    inputMgr: InputManager,
    touchControls: TouchControls
  ): void {
    const [p1, p2] = state.fighters;
    const p1Spec = CHARACTERS[p1.character];
    const p2Spec = CHARACTERS[p2.character];

    this.p1CharName.textContent = p1Spec.name;
    this.p1CharName.style.color = p1Spec.hudColor;
    this.p2CharName.textContent = p2Spec.name;
    this.p2CharName.style.color = p2Spec.hudColor;

    this.p1HpWrap.style.borderColor = p1Spec.hudColor;
    this.p2HpWrap.style.borderColor = p2Spec.hudColor;
    this.p1HpFill.style.background =
      p1.character === 'RYUJIN'
        ? 'linear-gradient(270deg, #22d3ee, #38bdf8, #34d399)'
        : 'linear-gradient(270deg, #f43f5e, #ec4899, #fb923c)';
    this.p2HpFill.style.background =
      p2.character === 'RYUJIN'
        ? 'linear-gradient(90deg, #22d3ee, #38bdf8, #34d399)'
        : 'linear-gradient(90deg, #f43f5e, #ec4899, #fb923c)';

    this.p1HpFill.style.width = `${(p1.hp / p1.maxHp) * 100}%`;
    this.p1HpDel.style.width = `${(p1.delayedHp / p1.maxHp) * 100}%`;
    this.p1HpText.textContent = String(Math.ceil(p1.hp));

    this.p2HpFill.style.width = `${(p2.hp / p2.maxHp) * 100}%`;
    this.p2HpDel.style.width = `${(p2.delayedHp / p2.maxHp) * 100}%`;
    this.p2HpText.textContent = String(Math.ceil(p2.hp));

    const s1 = Math.floor(p1.superMeter);
    const s2 = Math.floor(p2.superMeter);
    this.p1SuperFill.style.width = `${s1}%`;
    this.p1SuperPct.textContent = s1 >= 100 ? '¡MAX!' : `${s1}%`;
    this.p1SuperWrap.classList.toggle('super-ready', s1 >= 100);
    touchControls.syncSuperGlow(p1.superMeter);

    this.p2SuperFill.style.width = `${s2}%`;
    this.p2SuperPct.textContent = s2 >= 100 ? '¡MAX!' : `${s2}%`;
    this.p2SuperWrap.classList.toggle('super-ready', s2 >= 100);

    this.timer.textContent =
      state.mode === 'TRAINING'
        ? '∞'
        : String(Math.ceil(state.timerFrames / 60)).padStart(2, '0');
    this.roundLabel.textContent =
      state.mode === 'TRAINING' ? 'ENTRENAMIENTO' : `ROUND ${state.round}`;

    this.p1R1.style.borderColor = p1Spec.hudColor;
    this.p1R2.style.borderColor = p1Spec.hudColor;
    this.p2R1.style.borderColor = p2Spec.hudColor;
    this.p2R2.style.borderColor = p2Spec.hudColor;

    this.p1R1.style.backgroundColor =
      p1.roundsWon >= 1 ? p1Spec.hudColor : 'rgba(15,23,42,0.8)';
    this.p1R2.style.backgroundColor =
      p1.roundsWon >= 2 ? p1Spec.hudColor : 'rgba(15,23,42,0.8)';
    this.p2R1.style.backgroundColor =
      p2.roundsWon >= 1 ? p2Spec.hudColor : 'rgba(15,23,42,0.8)';
    this.p2R2.style.backgroundColor =
      p2.roundsWon >= 2 ? p2Spec.hudColor : 'rgba(15,23,42,0.8)';

    this.p1Badge.textContent = inputMgr.gamepadConnected[0]
      ? '[Mando 1]'
      : touchControls.enabled
        ? '[Touch+Teclado]'
        : '[Teclado]';
    this.p1Badge.className = inputMgr.gamepadConnected[0]
      ? 'text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-500 text-emerald-300 font-mono-code'
      : 'text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md bg-slate-800/90 border border-slate-600 text-slate-300 font-mono-code';

    if (state.mode === '2P') {
      this.p2Badge.textContent = inputMgr.gamepadConnected[1]
        ? '[Mando 2]'
        : '[Teclado]';
      this.p2Badge.className = inputMgr.gamepadConnected[1]
        ? 'text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-500 text-emerald-300 font-mono-code'
        : 'text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md bg-slate-800/90 border border-slate-600 text-slate-300 font-mono-code';
    } else {
      this.p2Badge.textContent =
        state.mode === 'TRAINING' ? '[Dummy]' : '[IA]';
      this.p2Badge.className =
        'text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md bg-slate-800/90 border border-slate-600 text-amber-300 font-mono-code';
    }

    if (p2.comboCount >= 2) {
      this.p1ComboBox.classList.remove('hidden');
      this.p1ComboCount.textContent = String(p2.comboCount);
      const sc =
        COMBO_SCALING[Math.min(p2.comboCount - 1, COMBO_SCALING.length - 1)];
      this.p1ComboScale.textContent = `${p2.comboDamage} DMG · ${Math.round(sc * 100)}%`;
    } else {
      this.p1ComboBox.classList.add('hidden');
    }

    if (p1.comboCount >= 2) {
      this.p2ComboBox.classList.remove('hidden');
      this.p2ComboCount.textContent = String(p1.comboCount);
      const sc =
        COMBO_SCALING[Math.min(p1.comboCount - 1, COMBO_SCALING.length - 1)];
      this.p2ComboScale.textContent = `${p1.comboDamage} DMG · ${Math.round(sc * 100)}%`;
    } else {
      this.p2ComboBox.classList.add('hidden');
    }

    if (state.phase === 'MATCH_END' && state.phaseTimer <= 55) {
      if (this.matchEndModal.classList.contains('hidden')) {
        if (state.winnerId !== -1) {
          const winner = state.fighters[state.winnerId];
          const spec = CHARACTERS[winner.character];
          const sideLabel = state.winnerId === 0 ? 'P1' : 'P2';
          this.matchEndTitle.textContent = `¡VICTORIA ${spec.name}!`;
          this.matchEndTitle.style.color = spec.hudColor;
          this.matchEndSubtitle.textContent = `${sideLabel} GANA (${p1.roundsWon} - ${p2.roundsWon}) · ${spec.archetype}`;
        } else {
          this.matchEndTitle.textContent = 'EMPATE TÉCNICO';
          this.matchEndTitle.style.color = '#facc15';
          this.matchEndSubtitle.textContent = `${p1.roundsWon} - ${p2.roundsWon}`;
        }
        this.matchEndModal.classList.remove('hidden');
      }
    } else if (!this.matchEndModal.classList.contains('hidden')) {
      this.matchEndModal.classList.add('hidden');
    }

    if (!this.framePanel.classList.contains('hidden')) {
      this.dbgP1State.textContent = p1.moveId
        ? `${p1.state} (${p1.moveId})`
        : p1.state;
      this.dbgP1Frame.textContent = `F:${p1.stateFrame}`;
      this.dbgP1Adv.textContent =
        p2.lastHitDamage > 0
          ? `Adv:${p1.lastAdvantage >= 0 ? '+' : ''}${p1.lastAdvantage} · Hit:${p2.lastHitDamage}`
          : `Adv: ${p1.lastAdvantage >= 0 ? '+' : ''}${p1.lastAdvantage}`;
      this.dbgP1Adv.className =
        p1.lastAdvantage >= 0
          ? 'px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300'
          : 'px-1.5 py-0.5 rounded bg-rose-950 text-rose-300';
      this.dbgP1Buf.textContent = buffers[0].getDisplayString(10);

      this.dbgP2State.textContent = p2.moveId
        ? `${p2.state} (${p2.moveId})`
        : p2.state;
      this.dbgP2Frame.textContent = `F:${p2.stateFrame}`;

      for (let p = 0; p < 2; p++) {
        const fm = state.fighters[p].frameMeter;
        for (let i = 0; i < 60; i++) {
          this.fmCells[p][i].style.backgroundColor =
            FM_COLORS[fm[i]] || FM_COLORS.N;
        }
      }
    }
  }
}
