import './hud.css';
import { sfx } from '../audio/SoundEngine';
import { ComboTrialTracker } from '../core/comboTrials';
import { InputBuffer } from '../core/inputBuffer';
import {
  CHARACTERS,
  CharacterId,
  COMBO_SCALING,
  CostumePalette,
  FrameMeterCode,
  GameMode,
  MatchState,
  getFighterHudColor,
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

function getHpBarGradient(
  charId: CharacterId,
  palette: CostumePalette,
  isLeftSide: boolean
): string {
  const dir = isLeftSide ? '270deg' : '90deg';
  if (charId === 'RYUJIN') {
    return palette === 1
      ? `linear-gradient(${dir}, #fb7185, #e11d48, #be123c)`
      : `linear-gradient(${dir}, #22d3ee, #38bdf8, #34d399)`;
  }
  if (charId === 'KAZE') {
    return palette === 1
      ? `linear-gradient(${dir}, #facc15, #a855f7, #6366f1)`
      : `linear-gradient(${dir}, #f43f5e, #ec4899, #fb923c)`;
  }
  if (charId === 'TITAN') {
    return palette === 1
      ? `linear-gradient(${dir}, #38bdf8, #3b82f6, #1d4ed8)`
      : `linear-gradient(${dir}, #f59e0b, #fbbf24, #ea580c)`;
  }
  if (charId === 'VOLT') {
    return palette === 1
      ? `linear-gradient(${dir}, #a3e635, #10b981, #0f766e)`
      : `linear-gradient(${dir}, #c084fc, #a855f7, #6366f1)`;
  }
  // VALKYRIE
  return palette === 1
    ? `linear-gradient(${dir}, #fbbf24, #f43f5e, #9f1239)`
    : `linear-gradient(${dir}, #34d399, #10b981, #059669)`;
}

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
  public framePanel = document.getElementById('frame-debug-panel')!;
  private dbgP1State = document.getElementById('dbg-p1-state')!;
  private dbgP1Frame = document.getElementById('dbg-p1-frame')!;
  private dbgP1Adv = document.getElementById('dbg-p1-adv')!;
  private dbgP1Buf = document.getElementById('dbg-p1-buffer')!;
  private dbgP2State = document.getElementById('dbg-p2-state')!;
  private dbgP2Frame = document.getElementById('dbg-p2-frame')!;
  private fmP1 = document.getElementById('frame-meter-p1')!;
  private fmP2 = document.getElementById('frame-meter-p2')!;
  private introBarTop = document.getElementById('intro-bar-top');
  private introBarBottom = document.getElementById('intro-bar-bottom');
  private speedlinesOverlay = document.getElementById('speedlines-overlay');

  private trialsPanel = document.getElementById('combo-trials-panel');
  private trialTitle = document.getElementById('trial-title');
  private trialDiff = document.getElementById('trial-diff');
  private trialSteps = document.getElementById('trial-steps');
  private trialStatus = document.getElementById('trial-status');
  private lastTrialKey = '';

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
    // Si el super conecta en este frame, su estallido sustituye al del golpe fuerte
    let superHit = false;
    if (state.superFlashFrames === 0) {
      for (const ev of state.events) {
        if (ev.type === 'VFX_BURST' && ev.effect === 'SUPER_BURST') superHit = true;
      }
    }
    for (const ev of state.events) {
      if (ev.type === 'SPARK') {
        // Dirección del golpe: del atacante (el más lejano a la chispa) a la víctima
        const [a, b] = state.fighters;
        const victim = Math.abs(a.x - ev.x) <= Math.abs(b.x - ev.x) ? a : b;
        const attacker = victim === a ? b : a;
        view.spawnSparks(ev.x, ev.y, ev.kind, victim.x >= attacker.x ? 1 : -1, !superHit);
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
        // SUPER_BURST sin congelación = el super ha conectado (la activación congela 32 frames)
        if (ev.effect === 'SUPER_BURST' && state.superFlashFrames === 0) {
          view.superImpact(ev.x, ev.y, ev.facing, ev.color);
        } else {
          view.spawnSpecialBurst(ev.x, ev.y, ev.effect, ev.facing, ev.color);
        }
      } else if (ev.type === 'STAGE_IMPACT') {
        view.triggerStageImpact(ev.x, ev.intensity, ev.ground);
      } else if (ev.type === 'SFX') {
        sfx.play(ev.name);
      } else if (ev.type === 'BANNER') {
        this.showCenterBanner(ev.text, ev.color);
        this.announceBanner(ev.text, state);
      } else if (ev.type === 'CALLOUT') {
        this.showCallout(ev.side, ev.text, ev.color);
      } else if (ev.type === 'SUPER_FLASH') {
        sfx.play('superFlash');
        this.showCenterBanner('¡SUPER ART!', '#facc15');
        this.showCallout(ev.owner, ev.superName, '#facc15');
      }
    }
  }

  /** Locutor sincronizado con los rótulos de la simulación. */
  private announceBanner(text: string, state: MatchState): void {
    const round = /^ROUND (\d+)/.exec(text);
    if (round) {
      const n = Number(round[1]);
      const deciding = state.fighters[0].roundsWon === 1 && state.fighters[1].roundsWon === 1;
      sfx.announce(n >= 3 || deciding ? 'final' : n === 2 ? 'round2' : 'round1');
    } else if (text.includes('FIGHT')) {
      sfx.announce('fight');
    } else if (text.startsWith('K.O')) {
      const winner = state.fighters.find((f) => f.state === 'VICTORY');
      const perfect = !!winner && winner.hp >= winner.maxHp;
      sfx.announce('ko');
      if (perfect) window.setTimeout(() => sfx.announce('perfect'), 1300);
    } else if (text.startsWith('TIME')) {
      sfx.announce('timeover');
    } else if (text.startsWith('¡VICTORIA')) {
      sfx.announce('youwin');
    }
  }

  public updateComboTrials(tracker: ComboTrialTracker, mode: GameMode): void {
    if (!this.trialsPanel) return;
    if (mode !== 'TRAINING') {
      this.trialsPanel.classList.add('hidden');
      return;
    }
    this.trialsPanel.classList.remove('hidden');

    const trial = tracker.getCurrentTrial();
    const isCleared = tracker.completedIds.has(trial.id);
    const key = `${trial.id}:${tracker.stepIndex}:${isCleared ? 1 : 0}:${tracker.justCompletedTimer > 0 ? 1 : 0}`;
    if (key === this.lastTrialKey) return;
    this.lastTrialKey = key;

    if (this.trialTitle) this.trialTitle.textContent = trial.title;
    if (this.trialDiff) {
      this.trialDiff.textContent = `${trial.difficulty} · ${tracker.completedIds.size} completados`;
    }

    if (this.trialSteps) {
      this.trialSteps.innerHTML = '';
      trial.steps.forEach((step, idx) => {
        const done = idx < tracker.stepIndex || tracker.justCompletedTimer > 0;
        const current = idx === tracker.stepIndex && tracker.justCompletedTimer === 0;
        const pill = document.createElement('span');
        pill.textContent = step.label;
        pill.className = done
          ? 'px-1.5 py-0.5 rounded text-[10px] font-mono-code font-bold bg-emerald-500/25 border border-emerald-400 text-emerald-200'
          : current
            ? 'px-1.5 py-0.5 rounded text-[10px] font-mono-code font-bold bg-amber-500/25 border border-amber-400 text-amber-200'
            : 'px-1.5 py-0.5 rounded text-[10px] font-mono-code bg-slate-900 border border-slate-700 text-slate-400';
        this.trialSteps!.appendChild(pill);
      });
    }

    if (this.trialStatus) {
      if (tracker.justCompletedTimer > 0) {
        this.trialStatus.textContent = '¡TRIAL COMPLETADO!';
        this.trialStatus.className = 'text-emerald-300 font-bold';
      } else if (isCleared) {
        this.trialStatus.textContent = '✓ Superado';
        this.trialStatus.className = 'text-emerald-400 font-bold';
      } else {
        this.trialStatus.textContent = `Paso ${Math.min(tracker.stepIndex + 1, trial.steps.length)}/${trial.steps.length}`;
        this.trialStatus.className = 'text-amber-300 font-bold';
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
    const p1Color = getFighterHudColor(p1.character, p1.palette);
    const p2Color = getFighterHudColor(p2.character, p2.palette);

    this.p1CharName.textContent =
      p1.palette === 1 ? `${p1Spec.name} · ALT` : p1Spec.name;
    this.p1CharName.style.color = p1Color;
    this.p2CharName.textContent =
      p2.palette === 1 ? `${p2Spec.name} · ALT` : p2Spec.name;
    this.p2CharName.style.color = p2Color;

    this.p1HpWrap.style.borderColor = p1Color;
    this.p2HpWrap.style.borderColor = p2Color;
    this.p1HpFill.style.background = getHpBarGradient(
      p1.character,
      p1.palette,
      true
    );
    this.p2HpFill.style.background = getHpBarGradient(
      p2.character,
      p2.palette,
      false
    );

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

    this.p1R1.style.borderColor = p1Color;
    this.p1R2.style.borderColor = p1Color;
    this.p2R1.style.borderColor = p2Color;
    this.p2R2.style.borderColor = p2Color;

    this.p1R1.style.backgroundColor =
      p1.roundsWon >= 1 ? p1Color : 'rgba(15,23,42,0.8)';
    this.p1R2.style.backgroundColor =
      p1.roundsWon >= 2 ? p1Color : 'rgba(15,23,42,0.8)';
    this.p2R1.style.backgroundColor =
      p2.roundsWon >= 1 ? p2Color : 'rgba(15,23,42,0.8)';
    this.p2R2.style.backgroundColor =
      p2.roundsWon >= 2 ? p2Color : 'rgba(15,23,42,0.8)';

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

    const isIntro = state.phase === 'INTRO';
    this.introBarTop?.classList.toggle('-translate-y-full', !isIntro);
    this.introBarBottom?.classList.toggle('translate-y-full', !isIntro);

    const anySpeedMove = state.fighters.some(
      (f) =>
        f.state === 'DASH_F' ||
        (f.state === 'ATTACK' &&
          f.moveId !== null &&
          (f.moveId.startsWith('EX_') ||
            f.moveId === 'SUPER' ||
            f.moveId === '63214T'))
    );
    const speedActive =
      state.superFlashFrames > 0 || state.slowMoFrames > 0 || anySpeedMove;
    if (this.speedlinesOverlay) {
      this.speedlinesOverlay.classList.toggle('opacity-100', speedActive);
      this.speedlinesOverlay.classList.toggle('opacity-0', !speedActive);
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
