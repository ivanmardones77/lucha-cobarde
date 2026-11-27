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
  DummyMode,
  FIXED_DT,
  GameMode,
  TrainingPosition,
  getFighterHudColor,
} from './core/types';
import { CampaignMatch, CampaignRunner } from './campaign/CampaignRunner';
import { CHAPTERS } from './campaign/data/chapters';
import { InputManager } from './input/InputManager';
import { TouchControls } from './input/TouchControls';
import { HudOverlay } from './view/HudOverlay';
import { CampaignUI } from './view/CampaignUI';
import { CharacterSelectScreen } from './view/CharacterSelectScreen';
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
const CHAR_ORDER: CharacterId[] = ['RYUJIN', 'KAZE', 'TITAN', 'VOLT', 'VALKYRIE'];

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

function syncSwapCharButton(): void {
  const btn = document.getElementById('btn-swap-chars');
  const colBtn = document.getElementById('btn-swap-color');
  const p1Col = getFighterHudColor(matchState.p1Character, matchState.p1Palette);
  if (btn) {
    btn.textContent = `⇄ P1: ${matchState.p1Character}`;
    btn.style.color = p1Col;
  }
  if (colBtn) {
    const spec = CHARACTERS[matchState.p1Character];
    colBtn.textContent =
      matchState.p1Palette === 1 ? `🎨 ${spec.altPaletteName}` : '🎨 Original';
    colBtn.style.color = p1Col;
  }
}

function syncMuteButtons(): void {
  const btn = document.getElementById('btn-mute');
  if (btn) {
    btn.textContent = sfx.muted ? '🔇 Silencio' : '🔊 Audio';
  }
  landing.syncMuteLabel(sfx.muted);
}

function setGameMode(mode: GameMode): void {
  matchState.mode = mode;
  aiController.reset();
  buffers[0].reset();
  buffers[1].reset();
  resetRoundState(matchState, true);

  document
    .getElementById('btn-mode-ai')
    ?.classList.toggle('active', mode === 'AI');
  document
    .getElementById('btn-mode-2p')
    ?.classList.toggle('active', mode === '2P');
  document
    .getElementById('btn-mode-train')
    ?.classList.toggle('active', mode === 'TRAINING');
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
  hud.suppressMatchEndModal = false;
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
  syncSwapCharButton();

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
  const wasCampaign = campaignMatch || backdropActive || campaign.isActive;
  campaign.abort();
  campaignMatch = false;
  backdropActive = false;
  document.body.classList.remove('campaign-match');
  hud.suppressMatchEndModal = false;
  matchState.hpMult = [1, 1];
  refreshCampaignInfo();
  inMatch = false;
  sfx.stopMusic();
  touchControls.clearAll();
  touchControls.setOverlayVisible(false);
  uiLayer.classList.add('hidden');
  document.getElementById('match-end-modal')?.classList.add('hidden');
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
      showBoxes: sceneView.showDebugBoxes,
      showFrames: !hud.framePanel.classList.contains('hidden'),
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
    hud.suppressMatchEndModal = true;
  },
  startCampaignMatch(m: CampaignMatch) {
    backdropActive = false;
    campaignMatch = true;
    campaignEndReported = false;
    campaignMaxCombo = 0;
    document.body.classList.add('campaign-match');
    hud.suppressMatchEndModal = true;
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
landing.onOpenControls = () => {
  sfx.unlock();
  controlsModal.classList.remove('hidden');
};
landing.onToggleMute = () => {
  sfx.unlock();
  const muted = sfx.toggleMute();
  syncMuteButtons();
  return muted;
};

inputManager.onToggleDebug = () => {
  if (inMatch) toggleDebugBoxes();
};
inputManager.onToggleFrameData = () => {
  if (inMatch) toggleDebugFrames();
};
inputManager.onResetMatch = () => {
  // En Arcade/Historia no se puede reiniciar un combate perdido a medias
  if (inMatch && !campaignMatch) resetRoundState(matchState, true);
};

window.addEventListener('keydown', (e) => {
  if (
    !inMatch &&
    landing.isVisible() &&
    controlsModal.classList.contains('hidden') &&
    e.code === 'Enter'
  ) {
    e.preventDefault();
    openCharSelect({ ...landing.config });
  }
});

function swapCharacters(): void {
  const idx = CHAR_ORDER.indexOf(matchState.p1Character);
  const nextP1 = CHAR_ORDER[(idx + 1) % CHAR_ORDER.length];
  matchState.p1Character = nextP1;
  if (
    nextP1 === matchState.p2Character &&
    matchState.p1Palette === matchState.p2Palette
  ) {
    matchState.p2Palette = matchState.p1Palette === 0 ? 1 : 0;
  }
  aiController.reset();
  buffers[0].reset();
  buffers[1].reset();
  resetRoundState(matchState, true);
  syncSwapCharButton();
  hud.updateComboTrials(trialTracker, matchState.mode);
}

function swapP1Color(): void {
  matchState.p1Palette = matchState.p1Palette === 0 ? 1 : 0;
  if (
    matchState.p1Character === matchState.p2Character &&
    matchState.p1Palette === matchState.p2Palette
  ) {
    matchState.p2Palette = matchState.p1Palette === 0 ? 1 : 0;
  }
  matchState.fighters[0].palette = matchState.p1Palette;
  matchState.fighters[1].palette = matchState.p2Palette;
  syncSwapCharButton();
}

document.getElementById('btn-swap-chars')?.addEventListener('click', () => {
  sfx.unlock();
  swapCharacters();
});

document.getElementById('btn-swap-color')?.addEventListener('click', () => {
  sfx.unlock();
  swapP1Color();
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

document.getElementById('btn-touch-toggle')?.addEventListener('click', () => {
  sfx.unlock();
  touchControls.toggle();
});
document.getElementById('btn-mode-ai')?.addEventListener('click', () => {
  sfx.unlock();
  setGameMode('AI');
});
document.getElementById('btn-mode-2p')?.addEventListener('click', () => {
  sfx.unlock();
  setGameMode('2P');
});
document.getElementById('btn-mode-train')?.addEventListener('click', () => {
  sfx.unlock();
  setGameMode('TRAINING');
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

document.getElementById('btn-toggle-topbar')?.addEventListener('click', (e) => {
  const actions = document.getElementById('topbar-actions');
  if (!actions) return;
  const collapsed = actions.classList.toggle('hidden');
  (e.currentTarget as HTMLElement).textContent = collapsed ? '▾' : '▴';
});

document.getElementById('btn-rematch')?.addEventListener('click', () => {
  sfx.unlock();
  aiController.reset();
  resetRoundState(matchState, true);
});
document.getElementById('btn-end-swap')?.addEventListener('click', () => {
  sfx.unlock();
  swapCharacters();
});
document.getElementById('btn-end-train')?.addEventListener('click', () => {
  sfx.unlock();
  setGameMode('TRAINING');
});
document.getElementById('btn-end-menu')?.addEventListener('click', () => {
  sfx.unlock();
  returnToMenu();
});
document.getElementById('btn-return-menu')?.addEventListener('click', () => {
  sfx.unlock();
  returnToMenu();
});

document
  .getElementById('btn-debug-boxes')
  ?.addEventListener('click', toggleDebugBoxes);
document
  .getElementById('btn-debug-frames')
  ?.addEventListener('click', toggleDebugFrames);
document.getElementById('btn-reset')?.addEventListener('click', () => {
  sfx.unlock();
  resetRoundState(matchState, true);
});
document.getElementById('btn-mute')?.addEventListener('click', () => {
  sfx.unlock();
  sfx.toggleMute();
  syncMuteButtons();
});
document.getElementById('btn-controls')?.addEventListener('click', () => {
  controlsModal.classList.remove('hidden');
});
document.getElementById('btn-close-controls')?.addEventListener('click', () => {
  controlsModal.classList.add('hidden');
});

resetRoundState(matchState, true);

let lastTime = performance.now() / 1000;
let accumulator = 0;

function gameLoop(nowMs: number): void {
  requestAnimationFrame(gameLoop);

  const now = nowMs / 1000;
  accumulator += Math.min(now - lastTime, 0.1);
  lastTime = now;

  if (inMatch) {
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      let shouldStep = true;
      if (matchState.slowMoFrames > 0) {
        slowMoSubTick++;
        shouldStep = slowMoSubTick % 3 === 0;
      } else {
        slowMoSubTick = 0;
      }

      if (shouldStep) {
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
  (window as unknown as { __cyberdojo: unknown }).__cyberdojo = { matchState, campaign };
}
