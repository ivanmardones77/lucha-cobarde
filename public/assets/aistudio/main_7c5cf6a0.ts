import { InputBuffer } from './core/inputBuffer';
import { createInitialState, stepSimulation } from './core/simulation';
import { InputManager } from './input/InputManager';
import { HudOverlay } from './view/HudOverlay';
import { SceneView } from './view/SceneView';

const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 4; // Evita spiral of death

const appContainer = document.getElementById('app') ?? document.body;
let state = createInitialState();
const buffers: [InputBuffer, InputBuffer] = [
  new InputBuffer(),
  new InputBuffer(),
];

const view = new SceneView(appContainer);
const hud = new HudOverlay(appContainer);
const inputManager = new InputManager();

inputManager.onToggleDebug = () => {
  view.showDebug = !view.showDebug;
};
inputManager.onToggleFrameData = () => {
  hud.showFrameData = !hud.showFrameData;
};
inputManager.onResetMatch = () => {
  state = createInitialState();
  buffers[0].clear();
  buffers[1].clear();
};

let lastTime = performance.now() / 1000;
let accumulator = 0;

function loop(nowMs: number): void {
  requestAnimationFrame(loop);

  const now = nowMs / 1000;
  accumulator += Math.min(now - lastTime, 0.1);
  lastTime = now;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    const raw = inputManager.readRawInputs();
    buffers[0].push(raw[0], state.fighters[0].facing);
    buffers[1].push(raw[1], state.fighters[1].facing);

    stepSimulation(state, buffers);
    accumulator -= FIXED_DT;
    steps++;
  }

  view.render(state);
  hud.update(state, buffers, inputManager.getGamepadStatus());
}

requestAnimationFrame(loop);
