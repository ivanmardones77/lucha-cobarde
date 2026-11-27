import './index.css';
import { sfx } from './audio/SoundEngine';
import { FightingAI } from './core/ai';
import { ComboTrialTracker } from './core/comboTrials';
import { InputBuffer } from './core/inputBuffer';
import {
  createMatchState,
  resetRoundState,
  resetTrainingPosition,
  stepSimulation,
} from './core/simulation';
import {
  CHARACTERS,
  CharacterId,
  CostumePalette,
  DummyMode,
  FIXED_DT,
  GameMode,
  StageId,
  TrainingPosition,
} from './core/types';
import { OnlineMatch } from './net/OnlineMatch';
import type { OnlineSession } from './net/OnlineSession';
import { CampaignMatch, CampaignRunner } from './campaign/CampaignRunner';
import { CHAPTERS } from './campaign/data/chapters';
import { InputManager } from './input/InputManager';
import { TouchControls } from './input/TouchControls';
import { HudOverlay } from './view/HudOverlay';
import { CampaignUI, MenuItem } from './view/CampaignUI';
import { CharacterSelectScreen } from './view/CharacterSelectScreen';
import { OnlineScreen } from './view/OnlineScreen';
import { LandingScreen, LaunchConfig } from './view/LandingScreen';
import { SceneView3D } from './view/SceneView3D';

// Solo en desarrollo: con ?bucle-rapido los bucles siguen aunque la pestaña esté oculta
// (requestAnimationFrame se congela en segundo plano). Útil para pruebas automáticas.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('bucle-rapido')) {
  const ch = new MessageChannel();
  const queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  let last = performance.now();
  ch.port1.onmessage = () => {
    const now = performance.now();
    if (now - last >= 16) {
      last = now;
      const run = [...queue.values()];
      queue.clear();
      for (const cb of run) cb(now);
    }
    if (queue.size) ch.port2.postMessage(0);
  };
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.set(id, cb);
    if (queue.size === 1) ch.port2.postMessage(0);
    return id;
  };
  window.cancelAnimationFrame = (id) => void queue.delete(id);
}

const MAX_STEPS = 4;

const matchState = createMatchState('AI', 'RYUJIN', 'KAZE', 'ALLEY');
const buffers: [InputBuffer, InputBuffer] = [
  new InputBuffer(),
  new InputBuffer(),
];
const aiController = new FightingAI();
const trialTracker = new ComboTrialTracker();
const sceneView = new SceneView3D(
  document.getElementById('canvas-container')!
);
const touchControls = new TouchControls();
const inputManager = new InputManager(touchControls, aiController);
const hud = new HudOverlay();
const landing = new LandingScreen(touchControls.enabled);
const charSelect = new CharacterSelectScreen();

const uiLayer = document.getElementById('ui-layer')!;
const controlsModal = document.getElementById('controls-modal')!;
let inMatch = false;
let slowMoSubTick = 0;

// --- Arcade / Historia ---
/** Combate lanzado por la campaña (su final lo gestiona CampaignRunner) */
let campaignMatch = false;
/** Escenario de fondo de un diálogo: se dibuja sin simular */
let backdropActive = false;
let campaignEndReported = false;
let campaignMaxCombo = 0;

// Ocultar controles táctiles mientras el jugador está en la pantalla de inicio
touchControls.setOverlayVisible(false);

function syncMuteButtons(): void {
  landing.syncMuteLabel(sfx.muted);
}

function setGameMode(mode: GameMode): void {
  matchState.mode = mode;
  aiController.reset();
  buffers[0].reset();
  buffers[1].reset();
  resetRoundState(matchState, true);

  // En Entrenamiento se ven la vida numérica y la barra de herramientas
  document.body.classList.toggle('mode-training', mode === 'TRAINING');
  document
    .getElementById('training-controls')
    ?.classList.toggle('hidden', mode !== 'TRAINING');

  hud.updateComboTrials(trialTracker, mode);
}

function applyShowBoxes(show: boolean): void {
  sceneView.showDebugBoxes = show;
  document
    .getElementById('btn-debug-boxes')
    ?.classList.toggle('active', show);
}

function applyShowFrames(show: boolean): void {
  hud.framePanel.classList.toggle('hidden', !show);
  document
    .getElementById('btn-debug-frames')
    ?.classList.toggle('active', show);
}

function toggleDebugBoxes(): void {
  applyShowBoxes(!sceneView.showDebugBoxes);
}

function toggleDebugFrames(): void {
  applyShowFrames(hud.framePanel.classList.contains('hidden'));
}

/** Partida libre desde la selección: sin multiplicadores ni reglas de campaña */
function startFreeMatch(cfg: LaunchConfig): void {
  campaignMatch = false;
  backdropActive = false;
  document.body.classList.remove('campaign-match');
  matchState.hpMult = [1, 1];
  startMatch(cfg);
}

function startMatch(cfg: LaunchConfig): void {
  sfx.unlock();
  // Semilla nueva por combate (fuera del núcleo); setGameMode → resetRoundState la aplica.
  // Guardarla junto a los inputs basta para reproducir la partida.
  matchState.rngSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  aiController.setDifficulty(cfg.aiDifficulty);
  matchState.p1Character = cfg.p1Character;
  matchState.p2Character = cfg.p2Character;
  matchState.p1Palette = cfg.p1Palette;
  matchState.p2Palette =
    cfg.p1Character === cfg.p2Character && cfg.p1Palette === cfg.p2Palette
      ? cfg.p1Palette === 0
        ? 1
        : 0
      : cfg.p2Palette;
  matchState.stageId = cfg.stageId;
  sceneView.setStage(cfg.stageId);

  applyShowBoxes(cfg.showBoxes);
  applyShowFrames(cfg.showFrames);
  touchControls.setEnabled(cfg.touchEnabled);

  setGameMode(cfg.mode);

  landing.hide();
  uiLayer.classList.remove('hidden');
  touchControls.setOverlayVisible(true);
  inMatch = true;
  slowMoSubTick = 0;
  sfx.startMusic();
}

function returnToMenu(): void {
  const wasCampaign = campaignMatch || backdropActive;
  campaign.abort();
  paused = false;
  controlsModal.classList.add('hidden');
  campaignMatch = false;
  backdropActive = false;
  document.body.classList.remove('campaign-match', 'mode-training');
  matchState.hpMult = [1, 1];
  refreshCampaignInfo();
  inMatch = false;
  sfx.stopMusic();
  touchControls.clearAll();
  touchControls.setOverlayVisible(false);
  uiLayer.classList.add('hidden');
  document.getElementById('intro-bar-top')?.classList.add('-translate-y-full');
  document.getElementById('intro-bar-bottom')?.classList.add('translate-y-full');
  document.getElementById('speedlines-overlay')?.classList.remove('opacity-100');
  document.getElementById('speedlines-overlay')?.classList.add('opacity-0');

  // Tras la campaña se conservan los ajustes de partida libre que tenía la portada
  if (wasCampaign) {
    landing.show({}, sfx.muted);
    return;
  }
  landing.show(
    {
      mode: matchState.mode,
      stageId: matchState.stageId,
      aiDifficulty: aiController.difficulty,
      p1Character: matchState.p1Character,
      p2Character: matchState.p2Character,
      p1Palette: matchState.p1Palette,
      p2Palette: matchState.p2Palette,
      showBoxes: false,
      showFrames: false,
      touchEnabled: touchControls.enabled,
    },
    sfx.muted
  );
}

function openCharSelect(cfg: LaunchConfig): void {
  sfx.unlock();
  landing.hide();
  charSelect.show(cfg);
}

// ===================== Arcade / Historia =====================

const campaignUI = new CampaignUI();
const campaign = new CampaignRunner(campaignUI, {
  showBackdrop(stage, p1, p2) {
    inMatch = false;
    campaignMatch = false;
    backdropActive = true;
    sfx.stopMusic();
    matchState.p1Character = p1;
    matchState.p2Character = p2;
    matchState.p1Palette = 0;
    matchState.p2Palette = p1 === p2 ? 1 : 0;
    matchState.stageId = stage;
    matchState.hpMult = [1, 1];
    resetRoundState(matchState, true);
    sceneView.setStage(stage);
    landing.hide();
    charSelect.hide();
    uiLayer.classList.add('hidden');
    touchControls.clearAll();
    touchControls.setOverlayVisible(false);
  },
  startCampaignMatch(m: CampaignMatch) {
    backdropActive = false;
    campaignMatch = true;
    campaignEndReported = false;
    campaignMaxCombo = 0;
    document.body.classList.add('campaign-match');
    matchState.hpMult = [1, m.p2Hp];
    startMatch({
      mode: 'AI',
      stageId: m.stage,
      aiDifficulty: m.difficulty,
      p1Character: m.p1,
      p2Character: m.p2,
      p1Palette: m.p1Palette,
      p2Palette: m.p2Palette,
      showBoxes: false,
      showFrames: false,
      touchEnabled: landing.config.touchEnabled,
    });
  },
  pickFighter(onPick, onBack) {
    sfx.unlock();
    landing.hide();
    const prevBack = charSelect.onBack;
    charSelect.onBack = () => {
      charSelect.onBack = prevBack;
      onBack();
    };
    charSelect.showSingle(
      { ...landing.config, mode: 'AI' },
      'ARCADE · ELIGE TU LUCHADOR',
      (id, palette) => {
        charSelect.onBack = prevBack;
        onPick(id, palette);
      },
      (id) => {
        const best = campaign.save.arcadeBest(id);
        return best ? `Récord ${best.score.toLocaleString('es-ES')} (${best.rank})` : 'Sin completar';
      }
    );
  },
  exitToMenu() {
    returnToMenu();
  },
});

function refreshCampaignInfo(): void {
  const done = CHAPTERS.filter((c) => campaign.save.chapter(c.id).done).length;
  const cleared = Object.keys(campaign.save.data.arcade).length;
  landing.setCampaignInfo(
    cleared ? `Completado con ${cleared} de 5 luchadores` : '5 combates · jefe final',
    done === CHAPTERS.length ? `✔ Completada (${done} capítulos)` : `${done} de ${CHAPTERS.length} capítulos`
  );
}
refreshCampaignInfo();

landing.onArcade = () => {
  sfx.unlock();
  campaign.startArcade();
};
landing.onStory = () => {
  sfx.unlock();
  campaign.openStory();
};

landing.onStart = openCharSelect;
charSelect.onConfirm = startFreeMatch;
charSelect.onBack = () => landing.show(landing.config, sfx.muted);
const onlineScreen = new OnlineScreen();
landing.onOnline = () => {
  sfx.unlock();
  onlineScreen.show();
};

// ===================== Online (fase 2: combate con rollback) =====================
type OnlinePick = { c: CharacterId; p: CostumePalette };
type StartMsg = { t: 'start'; p1c: CharacterId; p1p: CostumePalette; p2c: CharacterId; p2p: CostumePalette; stage: StageId; seed: number };
let onlineSession: OnlineSession | null = null;
let onlineMatch: OnlineMatch | null = null;
let onlineEndShown = false;
let myPick: OnlinePick | null = null;
let rivalPick: OnlinePick | null = null;
let myRematch = false;
let rivalRematch = false;
const onlineHud = document.createElement('div');
onlineHud.id = 'online-hud';
onlineHud.className = 'hidden';
document.body.appendChild(onlineHud);

function onlineSend(msg: unknown): void {
  onlineSession?.link?.send('ctrl', msg);
}

function onlineWait(text: string): void {
  campaignUI.menu('ONLINE', [{ label: 'Abandonar', onSelect: () => leaveOnline(true) }], {
    subtitle: text,
    onBack: () => leaveOnline(true),
  });
}

onlineScreen.onReady = (session) => {
  onlineSession = session;
  myPick = rivalPick = null;
  session.link!.onCtrl = (m) => onOnlineCtrl(m as { t: string } & Record<string, unknown>);
  session.onStatus = (st) => {
    if (st.kind === 'closed' || st.kind === 'error') onlineLost(st.message);
  };
  openOnlinePick();
};

function openOnlinePick(): void {
  myPick = null;
  landing.hide();
  campaignUI.hide();
  const prevBack = charSelect.onBack;
  charSelect.onBack = () => {
    charSelect.onBack = prevBack;
    leaveOnline(true);
  };
  charSelect.showSingle(
    { ...landing.config, mode: '2P' },
    `ONLINE · ${onlineSession?.role === 'host' ? 'JUGADOR 1' : 'JUGADOR 2'} · ELIGE TU LUCHADOR`,
    (c, p) => {
      charSelect.onBack = prevBack;
      myPick = { c, p };
      onlineSend({ t: 'pick', c, p });
      if (!rivalPick) onlineWait('Esperando a que el rival elija luchador…');
      hostTryStart();
    }
  );
}

function onOnlineCtrl(m: { t: string } & Record<string, unknown>): void {
  if (m.t === 'pick') {
    rivalPick = { c: m.c as CharacterId, p: m.p as CostumePalette };
    hostTryStart();
  } else if (m.t === 'start' && onlineSession?.role === 'guest') {
    startOnlineMatch(m as unknown as StartMsg);
  } else if (m.t === 'rematch') {
    rivalRematch = true;
    hostTryStart();
  } else if (m.t === 'repick') {
    rivalPick = null;
  } else if (m.t === 'bye') {
    onlineLost('El rival ha salido de la partida.');
  }
}

/** El anfitrión decide escenario y semilla cuando los dos han elegido (o quieren revancha). */
function hostTryStart(): void {
  if (onlineSession?.role !== 'host' || !myPick || !rivalPick) return;
  if (onlineMatch && !(myRematch && rivalRematch)) return;
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  const stages: StageId[] = ['ALLEY', 'ROOFTOP'];
  const msg: StartMsg = {
    t: 'start',
    p1c: myPick.c,
    p1p: myPick.p,
    p2c: rivalPick.c,
    p2p: rivalPick.p,
    stage: stages[rnd[0] % stages.length],
    seed: rnd[1],
  };
  onlineSend(msg);
  startOnlineMatch(msg);
}

function startOnlineMatch(m: StartMsg): void {
  const link = onlineSession?.link;
  if (!link) return;
  sfx.unlock();
  campaignUI.hide();
  charSelect.hide();
  landing.hide();
  paused = false;
  campaignMatch = false;
  backdropActive = false;
  document.body.classList.remove('campaign-match', 'mode-training');
  // Estado idéntico en los dos lados: misma configuración y misma semilla desde el frame 0
  Object.assign(matchState, createMatchState('2P', m.p1c, m.p2c, m.stage, m.p1p, m.p2p, m.seed));
  resetRoundState(matchState, true);
  buffers[0].reset();
  buffers[1].reset();
  sceneView.setStage(m.stage);
  applyShowBoxes(false);
  applyShowFrames(false);
  touchControls.setEnabled(landing.config.touchEnabled);
  document.getElementById('training-controls')?.classList.add('hidden');
  hud.updateComboTrials(trialTracker, '2P');
  uiLayer.classList.remove('hidden');
  touchControls.setOverlayVisible(true);
  onlineMatch = new OnlineMatch(matchState, buffers, link, onlineSession!.role === 'host' ? 0 : 1);
  onlineMatch.onDesync = (f) => {
    console.warn(`[online] desincronización en el frame ${f}`);
    hud.showCenterBanner('DESINCRONIZACIÓN', '#f43f5e');
  };
  onlineEndShown = false;
  myRematch = rivalRematch = false;
  onlineHud.classList.remove('hidden');
  inMatch = true;
  slowMoSubTick = 0;
  sfx.startMusic();
}

function showOnlineEnd(): void {
  const w = matchState.winnerId;
  const [p1, p2] = matchState.fighters;
  const mySlot = onlineSession?.role === 'host' ? 0 : 1;
  uiLayer.classList.add('hidden');
  touchControls.clearAll();
  touchControls.setOverlayVisible(false);
  const title = w === -1 ? 'EMPATE' : w === mySlot ? '¡HAS GANADO!' : 'HAS PERDIDO';
  campaignUI.menu(
    title,
    [
      {
        label: 'Revancha',
        primary: true,
        onSelect: () => {
          myRematch = true;
          onlineSend({ t: 'rematch' });
          if (!rivalRematch) onlineWait('Esperando a que el rival acepte la revancha…');
          hostTryStart();
        },
      },
      {
        label: 'Cambiar luchador',
        onSelect: () => {
          onlineMatch = null;
          onlineHud.classList.add('hidden');
          leaveMatchTo(() => undefined);
          onlineSend({ t: 'repick' });
          openOnlinePick();
        },
      },
      { label: 'Salir al menú principal', onSelect: () => leaveOnline(true) },
    ],
    { subtitle: `${CHARACTERS[p1.character].name} ${p1.roundsWon} – ${p2.roundsWon} ${CHARACTERS[p2.character].name}`, onBack: () => leaveOnline(true) }
  );
}

function endOnline(): void {
  onlineMatch = null;
  onlineSession?.leave();
  onlineSession = null;
  onlineHud.classList.add('hidden');
  charSelect.hide();
}

function leaveOnline(notify: boolean): void {
  if (notify) onlineSend({ t: 'bye' });
  const wasInMatch = inMatch;
  // Dar tiempo a que salga el «bye» antes de cerrar el enlace
  window.setTimeout(endOnline, notify ? 150 : 0);
  campaignUI.hide();
  if (wasInMatch) returnToMenu();
  else {
    charSelect.hide();
    landing.show(landing.config, sfx.muted);
  }
}

function onlineLost(message: string): void {
  if (!onlineSession) return;
  endOnline();
  paused = false;
  touchControls.clearAll();
  touchControls.setOverlayVisible(false);
  campaignUI.menu('CONEXIÓN TERMINADA', [{ label: 'Volver al menú', primary: true, onSelect: () => leaveOnline(false) }], {
    subtitle: message,
    onBack: () => leaveOnline(false),
  });
}

function updateOnlineHud(): void {
  if (!onlineMatch || !onlineSession?.link) return;
  const rtt = Math.round(onlineSession.link.rtt);
  const cls = rtt < 60 ? 'good' : rtt < 120 ? 'mid' : 'bad';
  onlineHud.innerHTML = `<span class="${cls}">● ${rtt} ms</span><span>ROLLBACK ${onlineMatch.stats.rollbacks}</span>`;
}

landing.onOpenControls = () => {
  sfx.unlock();
  openControls(null);
};
landing.onToggleMute = () => {
  sfx.unlock();
  const muted = sfx.toggleMute();
  syncMuteButtons();
  return muted;
};

// F1 / F2: herramientas de depuración, solo en Entrenamiento
inputManager.onToggleDebug = () => {
  if (inMatch && matchState.mode === 'TRAINING') toggleDebugBoxes();
};
inputManager.onToggleFrameData = () => {
  if (inMatch && matchState.mode === 'TRAINING') toggleDebugFrames();
};
inputManager.onResetMatch = () => {
  // R reinicia solo en Entrenamiento (en combate se hace desde la pausa)
  if (inMatch && !paused && matchState.mode === 'TRAINING') resetRoundState(matchState, true);
};
inputManager.onPause = () => togglePause();

window.addEventListener('keydown', (e) => {
  if (!controlsModal.classList.contains('hidden')) {
    if (e.code === 'Escape' || e.code === 'Backspace' || e.code === 'Enter') {
      e.preventDefault();
      closeControls();
    }
    return;
  }
  if (inMatch && (e.code === 'Escape' || e.code === 'KeyP')) {
    e.preventDefault();
    togglePause();
  }
});

document.getElementById('btn-trial-prev')?.addEventListener('click', () => {
  sfx.unlock();
  trialTracker.prevTrial();
  hud.updateComboTrials(trialTracker, matchState.mode);
});

document.getElementById('btn-trial-next')?.addEventListener('click', () => {
  sfx.unlock();
  trialTracker.nextTrial();
  hud.updateComboTrials(trialTracker, matchState.mode);
});

document.getElementById('select-dummy')?.addEventListener('change', (e) => {
  matchState.dummyMode = (e.target as HTMLSelectElement).value as DummyMode;
});

function setTrainingPos(pos: TrainingPosition): void {
  sfx.unlock();
  aiController.reset();
  buffers[0].reset();
  buffers[1].reset();
  resetTrainingPosition(matchState, pos);
}
document
  .getElementById('btn-pos-left')
  ?.addEventListener('click', () => setTrainingPos('CORNER_L'));
document
  .getElementById('btn-pos-center')
  ?.addEventListener('click', () => setTrainingPos('CENTER'));
document
  .getElementById('btn-pos-right')
  ?.addEventListener('click', () => setTrainingPos('CORNER_R'));

document
  .getElementById('btn-debug-boxes')
  ?.addEventListener('click', toggleDebugBoxes);
document
  .getElementById('btn-debug-frames')
  ?.addEventListener('click', toggleDebugFrames);
// ===================== Pausa, fin de combate libre y controles =====================

let paused = false;
/** Solo en desarrollo: congela la simulación sin mostrar el menú de pausa (capturas de QA) */
let devFreeze = false;
let freeEndShown = false;

function canPause(): boolean {
  return (
    inMatch &&
    matchState.phase !== 'MATCH_END' &&
    !campaignUI.isVisible() &&
    controlsModal.classList.contains('hidden')
  );
}

function togglePause(): void {
  if (onlineMatch) {
    // Online no se puede pausar: el combate sigue mientras está el menú
    if (campaignUI.isVisible()) campaignUI.hide();
    else if (canPause())
      campaignUI.menu('PARTIDA ONLINE', [
        { label: 'Seguir jugando', primary: true, onSelect: () => campaignUI.hide() },
        { label: 'Abandonar partida', onSelect: () => leaveOnline(true) },
      ], { subtitle: 'El combate no se detiene.', onBack: () => campaignUI.hide() });
    return;
  }
  if (paused) resumeGame();
  else if (canPause()) showPauseMenu();
}

function resumeGame(): void {
  paused = false;
  campaignUI.hide();
  touchControls.setOverlayVisible(true);
}

function showPauseMenu(focusLabel?: string): void {
  paused = true;
  touchControls.clearAll();
  touchControls.setOverlayVisible(false);
  const training = matchState.mode === 'TRAINING';
  const free = !campaignMatch;
  const onOff = (v: boolean) => (v ? 'Sí' : 'No');
  const items: MenuItem[] = [{ label: 'Reanudar', primary: true, onSelect: resumeGame }];
  if (free) {
    items.push({
      label: training ? 'Reiniciar posición' : 'Reiniciar combate',
      onSelect: () => {
        aiController.reset();
        buffers[0].reset();
        buffers[1].reset();
        resetRoundState(matchState, true);
        resumeGame();
      },
    });
  }
  if (training) {
    items.push(
      {
        label: 'Cajas de colisión',
        value: onOff(sceneView.showDebugBoxes),
        onSelect: () => {
          toggleDebugBoxes();
          showPauseMenu('Cajas de colisión');
        },
      },
      {
        label: 'Medidor de frames',
        value: onOff(!hud.framePanel.classList.contains('hidden')),
        onSelect: () => {
          toggleDebugFrames();
          showPauseMenu('Medidor de frames');
        },
      }
    );
  }
  if (free) {
    items.push({ label: 'Cambiar luchador', onSelect: () => leaveMatchTo(() => openCharSelect(currentConfig())) });
  }
  items.push(
    { label: 'Lista de movimientos', onSelect: () => openControls('pause') },
    {
      label: 'Sonido',
      value: sfx.muted ? 'Silenciado' : 'Activado',
      onSelect: () => {
        sfx.toggleMute();
        syncMuteButtons();
        showPauseMenu('Sonido');
      },
    },
    {
      label: campaignMatch ? 'Abandonar y salir al menú' : 'Salir al menú principal',
      onSelect: () => returnToMenu(),
    }
  );
  const sub = campaignMatch
    ? 'Si abandonas, perderás el progreso de este combate.'
    : `${CHARACTERS[matchState.p1Character].name} contra ${CHARACTERS[matchState.p2Character].name}`;
  campaignUI.menu('PAUSA', items, { subtitle: sub, onBack: resumeGame, focusLabel });
}

/** Configuración actual de la partida libre (para revancha o cambiar luchador) */
function currentConfig(): LaunchConfig {
  return {
    ...landing.config,
    mode: matchState.mode,
    stageId: matchState.stageId,
    aiDifficulty: aiController.difficulty,
    p1Character: matchState.p1Character,
    p2Character: matchState.p2Character,
    p1Palette: matchState.p1Palette,
    p2Palette: matchState.p2Palette,
    showBoxes: false,
    showFrames: false,
  };
}

/** Sale del combate sin pasar por la portada (p. ej. a la selección) */
function leaveMatchTo(next: () => void): void {
  paused = false;
  campaignUI.hide();
  inMatch = false;
  sfx.stopMusic();
  touchControls.clearAll();
  touchControls.setOverlayVisible(false);
  uiLayer.classList.add('hidden');
  document.body.classList.remove('mode-training');
  next();
}

function showFreeMatchEnd(): void {
  const w = matchState.winnerId;
  const [p1, p2] = matchState.fighters;
  const winner = w === -1 ? null : matchState.fighters[w];
  uiLayer.classList.add('hidden');
  touchControls.clearAll();
  touchControls.setOverlayVisible(false);
  const title = winner ? `¡VICTORIA DE ${CHARACTERS[winner.character].name}!` : 'EMPATE';
  const side = w === 0 ? 'Jugador 1' : matchState.mode === 'AI' ? 'CPU' : 'Jugador 2';
  campaignUI.menu(
    title,
    [
      {
        label: 'Revancha',
        primary: true,
        onSelect: () => {
          campaignUI.hide();
          startFreeMatch(currentConfig());
        },
      },
      { label: 'Cambiar luchador', onSelect: () => leaveMatchTo(() => openCharSelect(currentConfig())) },
      { label: 'Salir al menú principal', onSelect: () => returnToMenu() },
    ],
    {
      subtitle: winner ? `${side} gana ${p1.roundsWon} – ${p2.roundsWon}` : `${p1.roundsWon} – ${p2.roundsWon}`,
      onBack: () => returnToMenu(),
    }
  );
}

let controlsFrom: 'pause' | null = null;
function openControls(from: 'pause' | null): void {
  controlsFrom = from;
  if (from === 'pause') campaignUI.hide();
  controlsModal.classList.remove('hidden');
}
function closeControls(): void {
  controlsModal.classList.add('hidden');
  if (controlsFrom === 'pause' && inMatch) showPauseMenu('Lista de movimientos');
  controlsFrom = null;
}
document.getElementById('btn-close-controls')?.addEventListener('click', closeControls);
document.getElementById('btn-pause')?.addEventListener('click', () => {
  sfx.unlock();
  togglePause();
});

resetRoundState(matchState, true);

let lastTime = performance.now() / 1000;
let accumulator = 0;

function gameLoop(nowMs: number): void {
  requestAnimationFrame(gameLoop);

  const now = nowMs / 1000;
  accumulator += Math.min(now - lastTime, 0.1);
  lastTime = now;

  if (inMatch && (paused || devFreeze)) {
    // En pausa: la escena se sigue dibujando, la simulación no avanza
    accumulator = 0;
    sceneView.render(matchState);
  } else if (inMatch) {
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      let shouldStep = true;
      if (matchState.slowMoFrames > 0) {
        slowMoSubTick++;
        shouldStep = slowMoSubTick % 3 === 0;
      } else {
        slowMoSubTick = 0;
      }

      if (shouldStep && onlineMatch) {
        // Online: el jugador local usa siempre los controles del P1
        if (onlineMatch.step(inputManager.poll(matchState)[0])) hud.processEvents(matchState, sceneView);
      } else if (shouldStep) {
        const inputs = inputManager.poll(matchState);
        stepSimulation(matchState, inputs, buffers);
        hud.processEvents(matchState, sceneView);
        if (trialTracker.updateFromState(matchState)) {
          sfx.play('trialClear');
        }
      }
      accumulator -= FIXED_DT;
      steps++;
    }

    const [p1, p2] = matchState.fighters;
    const lowHp = p1.hp / p1.maxHp < 0.28 || p2.hp / p2.maxHp < 0.28;
    const lowTime =
      matchState.mode !== 'TRAINING' &&
      matchState.phase === 'FIGHT' &&
      matchState.timerFrames <= 20 * 60;
    sfx.setMusicIntensity(lowHp || lowTime);

    if (campaignMatch) {
      const [p1, p2] = matchState.fighters;
      // comboCount cuenta los golpes recibidos: el combo del P1 está en el rival
      if (p2.comboCount > campaignMaxCombo) campaignMaxCombo = p2.comboCount;
      if (!campaignEndReported && matchState.phase === 'MATCH_END' && matchState.phaseTimer <= 55) {
        campaignEndReported = true;
        uiLayer.classList.add('hidden');
        touchControls.clearAll();
        touchControls.setOverlayVisible(false);
        const w = matchState.winnerId;
        campaign.onMatchEnd(w, {
          difficulty: aiController.difficulty,
          perfect: w === 0 && p1.hp === p1.maxHp,
          secondsLeft: matchState.timerFrames / 60,
          maxCombo: campaignMaxCombo,
        });
      }
    }

    if (onlineMatch) {
      updateOnlineHud();
      if (!onlineEndShown && matchState.phase === 'MATCH_END' && matchState.phaseTimer <= 55) {
        onlineEndShown = true;
        showOnlineEnd();
      }
    } else if (!campaignMatch && matchState.mode !== 'TRAINING') {
      if (matchState.phase !== 'MATCH_END') freeEndShown = false;
      else if (!freeEndShown && matchState.phaseTimer <= 55) {
        freeEndShown = true;
        showFreeMatchEnd();
      }
    }

    sceneView.render(matchState);
    hud.update(matchState, buffers, inputManager, touchControls);
    hud.updateComboTrials(trialTracker, matchState.mode);
  } else {
    accumulator = 0;
    if (backdropActive) sceneView.render(matchState);
  }
}

requestAnimationFrame(gameLoop);

// Solo en desarrollo: acceso al estado para depurar desde la consola (no va en el build)
if (import.meta.env.DEV) {
  (window as unknown as { __cyberdojo: unknown }).__cyberdojo = {
    matchState,
    campaign,
    /** Congela simulación y efectos para capturar un instante */
    freeze(on: boolean) {
      devFreeze = on;
      sceneView.setVfxTimeScale(on ? 0 : 1);
    },
    /** Avanza la simulación n frames y deja todo congelado */
    stepFrames(n: number) {
      for (let i = 0; i < n; i++) {
        const inputs = inputManager.poll(matchState);
        stepSimulation(matchState, inputs, buffers);
        hud.processEvents(matchState, sceneView);
      }
    },
    sceneView,
    /** Combate online en curso (diagnóstico) */
    get onlineMatch() {
      return onlineMatch;
    },
  };
}
