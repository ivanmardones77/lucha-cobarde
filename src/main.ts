import './index.css';
import { sfx } from './audio/SoundEngine';
import { FightingAI } from './core/ai';
import { InputBuffer } from './core/inputBuffer';
import {
  createMatchState,
  resetRoundState,
  resetTrainingPosition,
  stepSimulation,
} from './core/simulation';
import { DummyMode, FIXED_DT, GameMode, TrainingPosition } from './core/types';
import { InputManager } from './input/InputManager';
import { TouchControls } from './input/TouchControls';
import { HudOverlay } from './view/HudOverlay';
import { SceneView3D } from './view/SceneView3D';

const MAX_STEPS = 4;

const matchState = createMatchState('AI');
const buffers: [InputBuffer, InputBuffer] = [
  new InputBuffer(),
  new InputBuffer(),
];
const aiController = new FightingAI();
const sceneView = new SceneView3D(
  document.getElementById('canvas-container')!
);
const touchControls = new TouchControls();
const inputManager = new InputManager(touchControls, aiController);
const hud = new HudOverlay();

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
}

function toggleDebugBoxes(): void {
  sceneView.showDebugBoxes = !sceneView.showDebugBoxes;
  document
    .getElementById('btn-debug-boxes')
    ?.classList.toggle('active', sceneView.showDebugBoxes);
}

function toggleDebugFrames(): void {
  const hidden = hud.framePanel.classList.toggle('hidden');
  document
    .getElementById('btn-debug-frames')
    ?.classList.toggle('active', !hidden);
}

inputManager.onToggleDebug = toggleDebugBoxes;
inputManager.onToggleFrameData = toggleDebugFrames;
inputManager.onResetMatch = () => resetRoundState(matchState, true);

function swapCharacters(): void {
  const nextP1 = matchState.p1Character === 'RYUJIN' ? 'KAZE' : 'RYUJIN';
  matchState.p1Character = nextP1;
  matchState.p2Character = nextP1 === 'RYUJIN' ? 'KAZE' : 'RYUJIN';
  aiController.reset();
  buffers[0].reset();
  buffers[1].reset();
  resetRoundState(matchState, true);
  const btn = document.getElementById('btn-swap-chars');
  if (btn) {
    btn.textContent = `⇄ P1: ${nextP1}`;
    btn.style.color = nextP1 === 'RYUJIN' ? '#67e8f9' : '#fda4af';
  }
}

document.getElementById('btn-swap-chars')?.addEventListener('click', () => {
  sfx.unlock();
  swapCharacters();
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
document.getElementById('btn-mute')?.addEventListener('click', (e) => {
  sfx.unlock();
  const muted = sfx.toggleMute();
  (e.target as HTMLElement).textContent = muted ? '🔇 Silencio' : '🔊 Audio';
});
document.getElementById('btn-controls')?.addEventListener('click', () => {
  document.getElementById('controls-modal')?.classList.remove('hidden');
});
document.getElementById('btn-close-controls')?.addEventListener('click', () => {
  document.getElementById('controls-modal')?.classList.add('hidden');
});

resetRoundState(matchState, true);

let lastTime = performance.now() / 1000;
let accumulator = 0;

function gameLoop(nowMs: number): void {
  requestAnimationFrame(gameLoop);

  const now = nowMs / 1000;
  accumulator += Math.min(now - lastTime, 0.1);
  lastTime = now;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
    const inputs = inputManager.poll(matchState);
    stepSimulation(matchState, inputs, buffers);
    hud.processEvents(matchState, sceneView);
    accumulator -= FIXED_DT;
    steps++;
  }

  sceneView.render(matchState);
  hud.update(matchState, buffers, inputManager, touchControls);
}

requestAnimationFrame(gameLoop);
