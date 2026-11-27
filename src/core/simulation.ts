import { aabbIntersects, clamp, resolvePushboxes } from './collision';
import { BufferedFrame, InputBuffer, RawInput } from './inputBuffer';
import { DEFAULT_MATCH_SEED } from './rng';
import {
  CHARACTERS,
  CharacterId,
  COMBO_SCALING,
  CostumePalette,
  FighterState,
  FrameMeterCode,
  GameMode,
  getFighterAccentColor,
  getFighterHudColor,
  getFighterMove,
  GRAVITY,
  AIR_TIME_SCALE,
  JUMP_TIME_SCALE,
  HitLevel,
  INTRO_DURATION_FRAMES,
  MatchState,
  MoveData,
  PlayableMoveId,
  STAGE_HALF_WIDTH,
  StageId,
  THROW_TECH_WINDOW,
  TrainingPosition,
} from './types';

function createFighter(
  id: 0 | 1,
  character: CharacterId,
  palette: CostumePalette,
  x: number,
  facing: 1 | -1
): FighterState {
  const spec = CHARACTERS[character];
  return {
    id,
    character,
    palette,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    delayedHp: spec.maxHp,
    superMeter: 0,
    roundsWon: 0,
    state: 'IDLE',
    stateFrame: 0,
    moveId: null,
    moveConnected: false,
    hitMask: [],
    stunFrames: 0,
    invulnFrames: 0,
    armorHits: 0,
    throwInvulnFrames: 0,
    throwTechTimer: 0,
    comboCount: 0,
    comboDamage: 0,
    lastHitDamage: 0,
    regenDelay: 0,
    pushbox: { x, y: 0.9, w: 0.8, h: 1.8 },
    hurtbox: { x, y: 0.95, w: 0.92, h: 1.9 },
    hitbox: null,
    frameMeter: new Array<FrameMeterCode>(60).fill('N'),
    lastAdvantage: 0,
  };
}

export function createMatchState(
  mode: GameMode = 'AI',
  p1Character: CharacterId = 'RYUJIN',
  p2Character: CharacterId = 'KAZE',
  stageId: StageId = 'ALLEY',
  p1Palette: CostumePalette = 0,
  p2Palette: CostumePalette = 0,
  seed: number = DEFAULT_MATCH_SEED
): MatchState {
  const effectiveP2Pal: CostumePalette =
    p1Character === p2Character && p1Palette === p2Palette
      ? p1Palette === 0
        ? 1
        : 0
      : p2Palette;
  return {
    mode,
    stageId,
    dummyMode: 'NEUTRAL',
    p1Character,
    p2Character,
    p1Palette,
    p2Palette: effectiveP2Pal,
    frame: 0,
    hitstop: 0,
    slowMoFrames: 0,
    superFlashFrames: 0,
    superFlashOwner: -1,
    screenShake: 0,
    round: 1,
    timerFrames: 99 * 60,
    phase: 'INTRO',
    phaseTimer: INTRO_DURATION_FRAMES,
    winnerId: -1,
    rngSeed: seed >>> 0,
    rngState: seed >>> 0,
    hpMult: [1, 1],
    fighters: [
      createFighter(0, p1Character, p1Palette, -2.2, 1),
      createFighter(1, p2Character, effectiveP2Pal, 2.2, -1),
    ],
    projectiles: [],
    events: [],
  };
}

export function resetRoundState(
  state: MatchState,
  fullMatchReset = false
): void {
  // Un reinicio completo repite la misma secuencia de azar desde la semilla
  if (fullMatchReset) state.rngState = state.rngSeed;
  const r0 = fullMatchReset ? 0 : state.fighters[0].roundsWon;
  const r1 = fullMatchReset ? 0 : state.fighters[1].roundsWon;
  const m0 = fullMatchReset
    ? state.mode === 'TRAINING'
      ? 100
      : 0
    : state.fighters[0].superMeter;
  const m1 = fullMatchReset
    ? state.mode === 'TRAINING'
      ? 100
      : 0
    : state.fighters[1].superMeter;

  const effectiveP2Pal: CostumePalette =
    state.p1Character === state.p2Character && state.p1Palette === state.p2Palette
      ? state.p1Palette === 0
        ? 1
        : 0
      : state.p2Palette;

  state.fighters[0] = createFighter(0, state.p1Character, state.p1Palette, -2.2, 1);
  state.fighters[1] = createFighter(1, state.p2Character, effectiveP2Pal, 2.2, -1);
  for (const i of [0, 1] as const) {
    const mult = state.hpMult[i];
    if (mult !== 1) {
      const f = state.fighters[i];
      f.maxHp = Math.round(f.maxHp * mult);
      f.hp = f.maxHp;
      f.delayedHp = f.maxHp;
    }
  }
  state.fighters[0].roundsWon = r0;
  state.fighters[1].roundsWon = r1;
  state.fighters[0].superMeter = m0;
  state.fighters[1].superMeter = m1;
  state.projectiles = [];
  state.hitstop = 0;
  state.slowMoFrames = 0;
  state.superFlashFrames = 0;
  state.superFlashOwner = -1;
  state.screenShake = 0;
  state.timerFrames = 99 * 60;

  if (fullMatchReset) {
    state.round = 1;
    state.winnerId = -1;
  }

  if (state.mode === 'TRAINING') {
    state.phase = 'FIGHT';
    state.phaseTimer = 0;
    state.fighters[0].superMeter = 100;
    state.fighters[1].superMeter = 100;
  } else {
    state.phase = 'INTRO';
    state.phaseTimer = INTRO_DURATION_FRAMES;
    for (const f of state.fighters) {
      const homeX = f.id === 0 ? -2.2 : 2.2;
      if (f.character === 'RYUJIN' || f.character === 'VOLT') {
        f.x = homeX - f.facing * 1.9;
        f.y = 0;
        f.state = 'WALK_F';
      } else if (f.character === 'TITAN') {
        f.x = homeX - f.facing * 1.75;
        f.y = 0;
        f.state = 'WALK_F';
      } else {
        f.x = homeX - f.facing * 1.1;
        f.y = 3.2;
        f.state = 'JUMP';
      }
      f.stateFrame = 0;
    }
    syncAllBoxes(state);
  }
}

export function resetTrainingPosition(
  state: MatchState,
  pos: TrainingPosition
): void {
  const [p1, p2] = state.fighters;
  state.projectiles = [];
  state.hitstop = 0;
  state.superFlashFrames = 0;
  state.superFlashOwner = -1;

  for (const f of state.fighters) {
    f.y = 0;
    f.vx = 0;
    f.vy = 0;
    f.state = 'IDLE';
    f.stateFrame = 0;
    f.moveId = null;
    f.moveConnected = false;
    f.hitMask = [];
    f.stunFrames = 0;
    f.invulnFrames = 0;
    f.armorHits = 0;
    f.throwInvulnFrames = 0;
    f.throwTechTimer = 0;
    f.comboCount = 0;
    f.comboDamage = 0;
    f.lastHitDamage = 0;
    f.hitbox = null;
    f.hp = f.maxHp;
    f.delayedHp = f.maxHp;
    f.superMeter = 100;
  }

  if (pos === 'CORNER_L') {
    p1.x = -5.5;
    p1.facing = 1;
    p2.x = -3.7;
    p2.facing = -1;
  } else if (pos === 'CORNER_R') {
    p1.x = 3.7;
    p1.facing = 1;
    p2.x = 5.5;
    p2.facing = -1;
  } else {
    p1.x = -2.2;
    p1.facing = 1;
    p2.x = 2.2;
    p2.facing = -1;
  }
  syncAllBoxes(state);
}

/** Golpes normales: suenan con un «whoosh» al salir (los especiales tienen su propio sonido). */
const NORMALS_WITH_SWING = new Set<string>(['5P', '2P', '6P', 'jP', '5K', '2K', '6K', 'jK']);

function startMove(
  state: MatchState,
  f: FighterState,
  moveKey: PlayableMoveId
): void {
  const spec = CHARACTERS[f.character];
  const m = spec.moves[moveKey];
  if (!m) return;
  if (NORMALS_WITH_SWING.has(moveKey)) state.events.push({ type: 'SFX', name: 'swing' });

  if (moveKey === 'SUPER') {
    if (f.superMeter < 100) return;
    f.superMeter = 0;
    state.superFlashFrames = 32;
    state.superFlashOwner = f.id;
    state.events.push({
      type: 'SUPER_FLASH',
      owner: f.id,
      x: f.x,
      y: f.y + 1.1,
      superName: spec.superName,
    });
    state.events.push({
      type: 'VFX_BURST',
      x: f.x,
      y: f.y + 1.1,
      effect: 'SUPER_BURST',
      facing: f.facing,
      color: getFighterAccentColor(f.character, f.palette),
    });
  } else if (m.meterCost) {
    if (f.superMeter < m.meterCost) return;
    f.superMeter = Math.max(0, f.superMeter - m.meterCost);
    state.events.push({ type: 'SFX', name: 'exFlash' });
    state.events.push({
      type: 'SPARK',
      x: f.x,
      y: f.y + 1.0,
      kind: 'GOLD',
    });
    state.events.push({
      type: 'VFX_BURST',
      x: f.x,
      y: f.y + 1.0,
      effect: 'EX_CHARGE',
      facing: f.facing,
      color: 0xfacc15,
    });
    state.events.push({
      type: 'CALLOUT',
      side: f.id,
      text: 'EX OVERDRIVE!',
      color: '#facc15',
    });
  }

  if (moveKey === '623P' || moveKey === 'EX_623P') {
    f.vy = spec.dpVy * (moveKey === 'EX_623P' ? 1.12 : 1);
    f.vx = f.facing * spec.dpVx;
    state.events.push({ type: 'SFX', name: 'uppercut' });
  } else if (moveKey === '236K' || moveKey === 'EX_236K') {
    const speedMult = moveKey === 'EX_236K' ? 1.25 : 1;
    if (spec.rushType === 'TATSU') {
      f.vy = 0.08;
      f.vx = f.facing * spec.rushVx * speedMult;
      state.events.push({ type: 'SFX', name: 'tatsumaki' });
    } else {
      f.vy = 0;
      f.vx = f.facing * spec.rushVx * speedMult;
      state.events.push({ type: 'SFX', name: 'dash' });
    }
  } else if (
    moveKey === '236P' ||
    moveKey === 'EX_236P' ||
    moveKey === 'j236P'
  ) {
    if (moveKey === 'j236P') {
      f.vy = Math.max(f.vy, 0.06);
      f.vx *= 0.25;
    }
    state.events.push({ type: 'SFX', name: 'projectile' });
  } else if (moveKey === '22P') {
    if (f.character === 'RYUJIN') {
      f.superMeter = Math.min(100, f.superMeter + 18);
      state.events.push({ type: 'SFX', name: 'exFlash' });
      state.events.push({
        type: 'SPARK',
        x: f.x,
        y: f.y + 1.05,
        kind: 'GOLD',
      });
      state.events.push({
        type: 'VFX_BURST',
        x: f.x,
        y: f.y + 1.0,
        effect: 'KI_CHARGE',
        facing: f.facing,
        color: getFighterAccentColor(f.character, f.palette),
      });
      state.events.push({
        type: 'CALLOUT',
        side: f.id,
        text: 'KI CHARGE +18%',
        color: getFighterHudColor(f.character, f.palette),
      });
    } else if (f.character === 'TITAN') {
      state.events.push({ type: 'SFX', name: 'dash' });
    } else {
      state.events.push({ type: 'SFX', name: 'projectile' });
    }
  } else if (moveKey === '214P' || moveKey === 'EX_214P') {
    f.vx = f.facing * (moveKey === 'EX_214P' ? 0.16 : 0.11);
    state.events.push({ type: 'SFX', name: 'dash' });
  } else if (moveKey === '214K') {
    if (f.character === 'RYUJIN' || f.character === 'VALKYRIE') {
      f.vy = 0.16;
      f.vx = f.facing * 0.13;
      state.events.push({ type: 'SFX', name: 'dash' });
    } else if (f.character === 'TITAN') {
      f.vx = f.facing * 0.24;
      state.events.push({ type: 'SFX', name: 'dash' });
    } else {
      state.events.push({ type: 'SFX', name: 'teleport' });
      state.events.push({
        type: 'SPARK',
        x: f.x,
        y: f.y + 1.0,
        kind: 'DASH',
      });
      state.events.push({
        type: 'VFX_BURST',
        x: f.x,
        y: f.y + 1.0,
        effect: 'TELEPORT',
        facing: f.facing,
        color: getFighterAccentColor(f.character, f.palette),
      });
    }
  } else if (moveKey === '41236K') {
    f.vx = f.facing * 0.19;
    state.events.push({ type: 'SFX', name: 'dash' });
  } else if (moveKey === 'ROLL') {
    f.vx = f.facing * 0.23;
    state.events.push({ type: 'SFX', name: 'dodgeRoll' });
    state.events.push({
      type: 'SPARK',
      x: f.x,
      y: 0.7,
      kind: 'BACKDASH',
    });
  } else if (moveKey === 'FOCUS') {
    f.vx = f.facing * 0.04;
    state.events.push({ type: 'SFX', name: 'dash' });
    state.events.push({
      type: 'VFX_BURST',
      x: f.x + f.facing * 0.3,
      y: f.y + 1.1,
      effect: 'FOCUS_CHARGE',
      facing: f.facing,
      color: 0xfbbf24,
    });
  } else if (moveKey === 'j214K') {
    f.vy = -0.23;
    f.vx = f.facing * 0.22;
    state.events.push({ type: 'SFX', name: 'diveKick' });
  } else if (moveKey === '6K') {
    f.vx =
      f.facing *
      (f.character === 'KAZE'
        ? 0.24
        : f.character === 'VOLT' || f.character === 'VALKYRIE'
          ? 0.2
          : 0.14);
  } else if (moveKey === '6P' && f.character === 'RYUJIN') {
    f.vx = f.facing * 0.09;
  }

  f.state = 'ATTACK';
  f.stateFrame = 0;
  f.moveId = moveKey;
  f.moveConnected = false;
  f.hitMask = [];
  f.armorHits = m.armorUntil ? 1 : 0;
  if (m.invulnUntil) {
    f.invulnFrames = Math.max(f.invulnFrames, m.invulnUntil);
  }
}

export function stepSimulation(
  state: MatchState,
  rawInputs: [RawInput, RawInput],
  buffers: [InputBuffer, InputBuffer]
): void {
  state.frame++;
  state.events = [];

  for (const f of state.fighters) {
    if (f.delayedHp > f.hp) {
      f.delayedHp = Math.max(f.hp, f.delayedHp - 4.5);
    } else {
      f.delayedHp = f.hp;
    }
  }

  if (state.screenShake > 0) {
    state.screenShake = Math.max(0, state.screenShake - 0.08);
  }

  buffers[0].push(rawInputs[0], state.fighters[0].facing);
  buffers[1].push(rawInputs[1], state.fighters[1].facing);

  if (state.superFlashFrames > 0) {
    state.superFlashFrames--;
    return;
  }

  if (state.phase === 'INTRO') {
    state.phaseTimer--;
    const elapsed = INTRO_DURATION_FRAMES - state.phaseTimer;

    for (const f of state.fighters) {
      const homeX = f.id === 0 ? -2.2 : 2.2;
      const accentCol = getFighterAccentColor(f.character, f.palette);
      if (f.character === 'RYUJIN' || f.character === 'VOLT') {
        if (elapsed <= 42) {
          const p = elapsed / 42;
          f.x = homeX - f.facing * 1.9 * (1 - p);
          f.y = 0;
          f.vx = f.facing * 0.045;
          f.vy = 0;
          f.state = 'WALK_F';
          f.stateFrame = elapsed;
        } else if (elapsed <= 90) {
          f.x = homeX;
          f.y = 0;
          f.vx = 0;
          f.vy = 0;
          f.state = 'INTRO_POSE';
          f.stateFrame = elapsed - 42;
          if (elapsed === 48) {
            state.events.push({ type: 'SFX', name: 'exFlash' });
            state.events.push({
              type: 'VFX_BURST',
              x: f.x,
              y: 1.05,
              effect: 'KI_CHARGE',
              facing: f.facing,
              color: accentCol,
            });
          }
        } else {
          f.x = homeX;
          f.y = 0;
          f.vx = 0;
          f.vy = 0;
          f.state = 'IDLE';
          f.stateFrame = elapsed - 90;
        }
      } else if (f.character === 'TITAN') {
        if (elapsed <= 44) {
          const p = elapsed / 44;
          f.x = homeX - f.facing * 1.75 * (1 - p);
          f.y = 0;
          f.vx = f.facing * 0.04;
          f.vy = 0;
          f.state = 'WALK_F';
          f.stateFrame = elapsed;
          if (elapsed === 16 || elapsed === 38) {
            state.screenShake = Math.max(state.screenShake, 0.16);
            state.events.push({ type: 'SFX', name: 'armorHit' });
            state.events.push({
              type: 'STAGE_IMPACT',
              x: f.x,
              intensity: 0.45,
              ground: true,
            });
          }
        } else if (elapsed <= 94) {
          f.x = homeX;
          f.y = 0;
          f.vx = 0;
          f.vy = 0;
          f.state = 'INTRO_POSE';
          f.stateFrame = elapsed - 44;
          if (elapsed === 64) {
            state.screenShake = 0.36;
            state.events.push({ type: 'SFX', name: 'slam' });
            state.events.push({
              type: 'VFX_BURST',
              x: f.x + f.facing * 0.4,
              y: 0.25,
              effect: 'HEAVY_IMPACT',
              facing: f.facing,
              color: accentCol,
            });
            state.events.push({
              type: 'STAGE_IMPACT',
              x: f.x + f.facing * 0.4,
              intensity: 0.85,
              ground: true,
            });
          }
        } else {
          f.x = homeX;
          f.y = 0;
          f.vx = 0;
          f.vy = 0;
          f.state = 'IDLE';
          f.stateFrame = elapsed - 94;
        }
      } else {
        // KAZE & VALKYRIE: Drop down from above + weapon draw pose
        if (elapsed <= 28) {
          const p = elapsed / 28;
          f.x = homeX - f.facing * 1.1 * (1 - p);
          f.y = 3.2 * (1 - p * p);
          f.vx = f.facing * 0.04;
          f.vy = -0.14;
          f.state = 'JUMP';
          f.stateFrame = elapsed;
        } else if (elapsed <= 92) {
          if (elapsed === 29) {
            state.events.push({ type: 'SFX', name: 'backdash' });
            state.events.push({
              type: 'SPARK',
              x: homeX,
              y: 0.2,
              kind: 'DASH',
            });
          }
          f.x = homeX;
          f.y = 0;
          f.vx = 0;
          f.vy = 0;
          f.state = 'INTRO_POSE';
          f.stateFrame = elapsed - 29;
          if (elapsed === 70) {
            state.events.push({ type: 'SFX', name: 'dash' });
            state.events.push({
              type: 'VFX_SLASH',
              x: f.x + f.facing * 0.35,
              y: 1.18,
              facing: f.facing,
              color: accentCol,
              angle: 0.48,
              scale: 1.15,
            });
          }
        } else {
          f.x = homeX;
          f.y = 0;
          f.vx = 0;
          f.vy = 0;
          f.state = 'IDLE';
          f.stateFrame = elapsed - 92;
        }
      }
    }

    if (elapsed === 4) {
      state.events.push({
        type: 'BANNER',
        text: `ROUND ${state.round}`,
        color: '#38bdf8',
      });
    }
    if (elapsed === 96) {
      state.events.push({ type: 'BANNER', text: '¡FIGHT!', color: '#facc15' });
      state.events.push({ type: 'SFX', name: 'roundStart' });
    }

    if (state.phaseTimer <= 0) {
      state.fighters[0].x = -2.2;
      state.fighters[1].x = 2.2;
      for (const f of state.fighters) {
        f.y = 0;
        f.vx = 0;
        f.vy = 0;
        f.state = 'IDLE';
        f.stateFrame = 0;
      }
      state.phase = 'FIGHT';
    }
    syncAllBoxes(state);
    return;
  }

  if (state.phase === 'ROUND_END') {
    if (state.slowMoFrames > 0) state.slowMoFrames--;
    for (const f of state.fighters) {
      if (f.y > 0 || f.vy !== 0) {
        applyPhysics(f);
        if (f.y === 0) {
          state.events.push({
            type: 'STAGE_IMPACT',
            x: f.x,
            intensity: 0.65,
            ground: true,
          });
        }
      } else {
        f.vx *= 0.85;
        f.x = clamp(f.x + f.vx, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
      }
    }
    state.phaseTimer--;
    if (state.phaseTimer <= 0) {
      state.round++;
      resetRoundState(state, false);
    }
    return;
  }

  if (state.phase === 'MATCH_END') {
    if (state.slowMoFrames > 0) state.slowMoFrames--;
    for (const f of state.fighters) {
      if (f.y > 0 || f.vy !== 0) {
        applyPhysics(f);
        if (f.y === 0) {
          state.events.push({
            type: 'STAGE_IMPACT',
            x: f.x,
            intensity: 0.65,
            ground: true,
          });
        }
      } else {
        f.vx *= 0.85;
        f.x = clamp(f.x + f.vx, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
      }
    }
    if (state.phaseTimer > 0) {
      state.phaseTimer--;
      if (state.phaseTimer === 107 && state.winnerId !== -1) {
        const winner = state.fighters[state.winnerId];
        const winnerSpec = CHARACTERS[winner.character];
        state.events.push({
          type: 'BANNER',
          text: `¡VICTORIA ${winnerSpec.name}!`,
          color: getFighterHudColor(winner.character, winner.palette),
        });
      }
    }
    return;
  }

  if (state.hitstop > 0) {
    state.hitstop--;
    return;
  }

  if (state.mode !== 'TRAINING') {
    if (state.timerFrames > 0) state.timerFrames--;
    if (state.timerFrames === 0) {
      resolveRoundEnd(state, true);
      return;
    }
  }

  for (let i = 0; i < 2; i++) {
    updateFighter(state, state.fighters[i], state.fighters[1 - i], buffers[i]);
  }

  resolvePushboxes(state.fighters[0], state.fighters[1], STAGE_HALF_WIDTH);
  syncAllBoxes(state);

  updateProjectiles(state, buffers);
  resolveCombatHits(state, buffers);

  const [p1, p2] = state.fighters;
  for (let i = 0; i < 2; i++) {
    const f = state.fighters[i];
    const opp = state.fighters[1 - i];
    if (
      f.y === 0 &&
      (f.state === 'IDLE' ||
        f.state === 'WALK_F' ||
        f.state === 'WALK_B' ||
        f.state === 'CROUCH')
    ) {
      if (Math.abs(f.x - opp.x) > 0.05) {
        f.facing = f.x < opp.x ? 1 : -1;
      }
    }
  }

  if (state.mode === 'TRAINING') {
    for (const f of state.fighters) {
      if (
        f.state === 'HITSTUN' ||
        f.state === 'JUGGLE' ||
        f.state === 'KNOCKDOWN' ||
        f.state === 'THROWN'
      ) {
        f.regenDelay = 85;
      } else if (f.regenDelay > 0) {
        f.regenDelay--;
      } else {
        if (f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + 18);
        if (f.superMeter < 100) f.superMeter = Math.min(100, f.superMeter + 1.5);
      }
    }
  }

  recordFrameMeter(state);

  if (state.mode !== 'TRAINING' && (p1.hp <= 0 || p2.hp <= 0)) {
    resolveRoundEnd(state, false);
  }
}

function updateFighter(
  state: MatchState,
  f: FighterState,
  opp: FighterState,
  buf: InputBuffer
): void {
  const spec = CHARACTERS[f.character];
  f.stateFrame++;
  if (f.invulnFrames > 0) f.invulnFrames--;
  if (f.throwInvulnFrames > 0) f.throwInvulnFrames--;

  const cur = buf.getCurrent();

  if (f.state === 'THROWN' && f.throwTechTimer === -1) {
    // Cinematic Command Grab (63214T) 2-stage lift & slam
    const sf = f.stateFrame;
    if (sf <= 11) {
      const p = sf / 11;
      f.x = clamp(opp.x + opp.facing * (0.78 - p * 0.22), -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
      f.y = p * 2.15;
    } else if (sf <= 14) {
      f.x = clamp(opp.x + opp.facing * 0.54, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
      f.y = 2.15;
    } else if (sf < 20) {
      const p = (sf - 14) / 6;
      f.x = clamp(opp.x + opp.facing * (0.54 + p * 0.42), -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
      f.y = 2.15 * (1 - p);
    } else {
      const grabMove = CHARACTERS[opp.character].moves['63214T'];
      const dmg = grabMove.damage;
      f.hp = Math.max(state.mode === 'TRAINING' ? 1 : 0, f.hp - dmg);
      f.comboCount++;
      f.comboDamage += dmg;
      f.lastHitDamage = dmg;
      opp.superMeter = Math.min(100, opp.superMeter + 15);
      f.superMeter = Math.min(100, f.superMeter + 10);
      f.y = 0;
      f.vy = 0.25;
      f.vx = opp.facing * 0.14;
      f.state = 'KNOCKDOWN';
      f.stateFrame = 0;
      f.throwTechTimer = 0;
      state.hitstop = 11;
      state.screenShake = 0.62;
      state.events.push({ type: 'SPARK', x: f.x, y: 0.35, kind: 'GOLD' });
      state.events.push({
        type: 'VFX_BURST',
        x: f.x,
        y: 0.25,
        effect: 'COMMAND_GRAB',
        facing: opp.facing,
        color: getFighterAccentColor(opp.character, opp.palette),
      });
      state.events.push({
        type: 'STAGE_IMPACT',
        x: f.x,
        intensity: 1.0,
        ground: true,
      });
      state.events.push({ type: 'SFX', name: 'slam' });
      state.events.push({
        type: 'HIT_CONFIRMED',
        attacker: opp.id,
        moveId: '63214T',
        comboCount: f.comboCount,
      });
    }
    return;
  }

  if (f.state === 'THROWN' && f.throwTechTimer > 0) {
    f.throwTechTimer--;
    if (buf.wasPressed('tPressed', 3) !== -1) {
      f.throwTechTimer = 0;
      f.state = 'IDLE';
      f.stateFrame = 0;
      opp.state = 'IDLE';
      opp.stateFrame = 0;
      opp.moveId = null;
      f.x = clamp(f.x - f.facing * 1.15, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
      opp.x = clamp(
        opp.x - opp.facing * 1.15,
        -STAGE_HALF_WIDTH,
        STAGE_HALF_WIDTH
      );
      state.hitstop = 10;
      state.screenShake = 0.25;
      state.events.push({
        type: 'CALLOUT',
        side: f.id,
        text: 'THROW TECH!',
        color: '#34d399',
      });
      state.events.push({
        type: 'SPARK',
        x: (f.x + opp.x) * 0.5,
        y: 1.15,
        kind: 'GOLD',
      });
      state.events.push({ type: 'SFX', name: 'throwTech' });
      return;
    }
    if (f.throwTechTimer === 0) {
      const dmg = CHARACTERS[opp.character].moves.THROW.damage;
      f.hp = Math.max(state.mode === 'TRAINING' ? 1 : 0, f.hp - dmg);
      f.comboCount++;
      f.comboDamage += dmg;
      f.lastHitDamage = dmg;
      opp.superMeter = Math.min(100, opp.superMeter + 12);
      f.superMeter = Math.min(100, f.superMeter + 8);
      f.state = 'KNOCKDOWN';
      f.stateFrame = 0;
      f.vy = 0.2;
      f.vx = opp.facing * 0.14;
      state.hitstop = 9;
      state.screenShake = 0.4;
      state.events.push({ type: 'SPARK', x: f.x, y: 1.0, kind: 'HIT' });
      state.events.push({ type: 'SFX', name: 'hitHeavy' });
      state.events.push({
        type: 'HIT_CONFIRMED',
        attacker: opp.id,
        moveId: 'THROW',
        comboCount: f.comboCount,
      });
    }
    return;
  }

  if (f.state === 'THROW_HOLD') {
    const holdLimit = f.moveId === '63214T' ? 25 : 16;
    if (f.stateFrame >= holdLimit) {
      f.state = 'IDLE';
      f.stateFrame = 0;
      f.moveId = null;
    }
    return;
  }

  if (
    f.state === 'HITSTUN' ||
    f.state === 'BLOCK_STAND' ||
    f.state === 'BLOCK_CROUCH'
  ) {
    const wasBlocking =
      f.state === 'BLOCK_STAND' || f.state === 'BLOCK_CROUCH';
    f.stunFrames--;
    applyPhysics(f);
    if (f.stunFrames <= 0 && f.y === 0) {
      f.state = 'IDLE';
      f.stateFrame = 0;
      f.comboCount = 0;
      f.comboDamage = 0;
      if (wasBlocking) {
        f.throwInvulnFrames = Math.max(f.throwInvulnFrames, 5);
      }
    }
    return;
  }

  if (f.state === 'JUGGLE') {
    if (f.stunFrames > 0) f.stunFrames--;
    const wasAir = f.y > 0;
    applyPhysics(f);
    if (f.y === 0) {
      f.state = 'KNOCKDOWN';
      f.stateFrame = 18;
      f.vx *= 0.45;
      if (wasAir) {
        state.events.push({
          type: 'STAGE_IMPACT',
          x: f.x,
          intensity: 0.55,
          ground: true,
        });
      }
    }
    return;
  }

  if (f.state === 'KNOCKDOWN') {
    const wasAir = f.y > 0;
    applyPhysics(f);
    if (f.y === 0) {
      if (wasAir) {
        state.events.push({
          type: 'STAGE_IMPACT',
          x: f.x,
          intensity: 0.65,
          ground: true,
        });
      }
      f.vx *= 0.8;
      if (f.stateFrame >= 36) {
        f.state = 'WAKEUP';
        f.stateFrame = 0;
        f.invulnFrames = 14;
        f.throwInvulnFrames = 16;
        f.comboCount = 0;
        f.comboDamage = 0;
      }
    }
    return;
  }

  if (f.state === 'WAKEUP') {
    if (f.stateFrame >= 14) {
      f.state = 'IDLE';
      f.stateFrame = 0;
    }
    return;
  }

  if (f.state === 'DASH_F') {
    f.vx = f.facing * spec.dashForwardVx;
    applyPhysics(f);

    if (f.stateFrame % 3 === 1) {
      state.events.push({
        type: 'SPARK',
        x: f.x - f.facing * 0.35,
        y: 0.75,
        kind: 'DASH',
      });
    }

    if (f.stateFrame >= 4) {
      if (tryGroundOffensiveInput(state, f, buf, cur)) return;
    }

    if (f.stateFrame >= 13) {
      f.state = 'IDLE';
      f.stateFrame = 0;
      f.vx = 0;
    }
    return;
  }

  if (f.state === 'DASH_B') {
    f.vx = -f.facing * (f.stateFrame <= 9 ? spec.dashBackVx : 0.08);
    applyPhysics(f);

    if (f.stateFrame % 3 === 1) {
      state.events.push({
        type: 'SPARK',
        x: f.x + f.facing * 0.35,
        y: 0.85,
        kind: 'BACKDASH',
      });
    }

    if (f.stateFrame >= 16) {
      f.state = 'IDLE';
      f.stateFrame = 0;
      f.vx = 0;
    }
    return;
  }

  const activeMove = getFighterMove(f);
  if (f.state === 'ATTACK' && activeMove) {
    const m = activeMove;

    if (m.armorUntil && f.stateFrame > m.armorUntil) {
      f.armorHits = 0;
    }

    if (f.moveConnected && f.y === 0) {
      if (
        trySpecialAndSuperInput(
          state,
          f,
          buf,
          Boolean(m.cancelToSuper),
          Boolean(m.cancelToSpecial)
        )
      ) {
        return;
      }
      if (
        (m.id === '5P' || m.id === '2P') &&
        buf.wasPressed('kPressed', 4) !== -1
      ) {
        const isCrouching = cur.dir === 1 || cur.dir === 2 || cur.dir === 3;
        startMove(state, f, isCrouching ? '2K' : '5K');
        return;
      }
    }

    if (
      m.id === '214K' &&
      (f.character === 'KAZE' || f.character === 'VOLT') &&
      f.stateFrame === m.startup
    ) {
      const behindX = opp.x + opp.facing * 1.15;
      const inBounds = Math.abs(behindX) <= STAGE_HALF_WIDTH;
      f.x = clamp(
        inBounds ? behindX : opp.x - opp.facing * 1.15,
        -STAGE_HALF_WIDTH,
        STAGE_HALF_WIDTH
      );
      f.facing = f.x < opp.x ? 1 : -1;
      state.events.push({
        type: 'SPARK',
        x: f.x,
        y: f.y + 1.0,
        kind: 'DASH',
      });
      state.events.push({
        type: 'VFX_BURST',
        x: f.x,
        y: f.y + 1.0,
        effect: 'TELEPORT',
        facing: f.facing,
        color: getFighterAccentColor(f.character, f.palette),
      });
    }

    const activeAccent = getFighterAccentColor(f.character, f.palette);
    const slashColor = m.isEx || m.isSuper ? 0xfacc15 : activeAccent;
    if (f.stateFrame === m.startup) {
      if (m.id === '623P' || m.id === 'EX_623P') {
        state.events.push({
          type: 'VFX_SLASH',
          x: f.x,
          y: f.y + 1.35,
          facing: f.facing,
          color: slashColor,
          angle: 1.05,
          scale: m.isEx ? 1.45 : 1.2,
        });
      } else if (m.id === '214P' || m.id === 'EX_214P' || m.id === 'FOCUS') {
        state.events.push({
          type: 'VFX_SLASH',
          x: f.x,
          y: f.y + 1.15,
          facing: f.facing,
          color: m.id === 'FOCUS' ? 0xf97316 : slashColor,
          angle: 0.1,
          scale: m.isEx || m.id === 'FOCUS' ? 1.38 : 1.12,
        });
      } else if (
        (m.id === '214K' &&
          (f.character === 'RYUJIN' || f.character === 'VALKYRIE')) ||
        m.id === '6P'
      ) {
        state.events.push({
          type: 'VFX_SLASH',
          x: f.x,
          y: f.y + 1.28,
          facing: f.facing,
          color: slashColor,
          angle: -0.65,
          scale: m.id === '214K' ? 1.25 : 1.0,
        });
      } else if (m.id === 'j214K') {
        state.events.push({
          type: 'VFX_SLASH',
          x: f.x,
          y: f.y + 0.65,
          facing: f.facing,
          color: slashColor,
          angle: -0.78,
          scale: 1.1,
        });
      }
    }

    if (
      (m.id === '236K' ||
        m.id === 'EX_236K' ||
        m.id === '41236K' ||
        m.id === 'SUPER') &&
      m.multiHits?.includes(f.stateFrame)
    ) {
      state.events.push({
        type: 'VFX_SLASH',
        x: f.x,
        y: f.y + 1.05,
        facing: f.facing,
        color: slashColor,
        angle: (f.stateFrame % 2 === 0 ? 1 : -1) * 0.45,
        scale: m.isSuper ? 1.65 : m.isEx ? 1.4 : 1.2,
      });
    }

    if (f.stateFrame === m.startup && m.id === '22P' && f.character === 'TITAN') {
      state.screenShake = Math.max(state.screenShake, 0.44);
      state.events.push({ type: 'SFX', name: 'slam' });
      state.events.push({
        type: 'VFX_BURST',
        x: f.x + f.facing * 0.75,
        y: 0.2,
        effect: 'HEAVY_IMPACT',
        facing: f.facing,
        color: getFighterAccentColor(f.character, f.palette),
      });
      state.events.push({
        type: 'STAGE_IMPACT',
        x: f.x + f.facing * 0.75,
        intensity: 0.92,
        ground: true,
      });
    }

    if (
      m.spawnsProjectile &&
      (f.stateFrame === m.startup ||
        ((f.character === 'KAZE' || f.character === 'VALKYRIE') &&
          (m.id === 'EX_236P' || m.id === '22P') &&
          f.stateFrame === m.startup + 3))
    ) {
      const isSecondBurst = f.stateFrame === m.startup + 3;
      const isMultiOrb =
        f.character !== 'KAZE' && f.character !== 'VALKYRIE' && m.id === 'EX_236P';
      const speedMult = m.isEx ? 1.32 : m.id === '22P' ? 1.18 : 1;
      state.projectiles.push({
        id: `${state.frame}_${f.id}_${isSecondBurst ? 2 : 1}`,
        owner: f.id,
        sourceMoveId: m.id,
        kind: spec.projectileKind,
        x: f.x + f.facing * 1.05,
        y: f.y + (isSecondBurst ? 1.32 : 1.15),
        vx: f.facing * spec.projectileVx * speedMult,
        vy: m.projectileVy ?? 0,
        w: spec.projectileSize.w,
        h: spec.projectileSize.h,
        damage: m.damage,
        chip: m.chip,
        hitstun: m.hitstun,
        blockstun: m.blockstun,
        hitsRemaining: isMultiOrb ? m.projectileHits ?? 2 : 1,
        hitCooldown: 0,
        knockdown: m.knockdown,
        isEx: m.isEx,
        active: true,
      });
    }

    if (
      m.id === 'SUPER' &&
      f.stateFrame >= m.startup &&
      f.stateFrame <= m.startup + 12
    ) {
      f.vx = f.facing * (f.character === 'KAZE' ? 0.18 : 0.14);
    } else if (m.id === '236K' || m.id === 'EX_236K') {
      const rushSpeed = spec.rushVx * (m.id === 'EX_236K' ? 1.25 : 1);
      if (f.stateFrame >= m.startup && f.stateFrame <= m.startup + m.active) {
        f.vx = f.facing * rushSpeed;
        if (spec.rushType === 'TATSU') {
          f.y = Math.max(0.28, f.y);
          f.vy = 0;
        }
      } else {
        f.vx *= 0.78;
      }
    } else if (m.id === '214K' && f.character === 'TITAN') {
      if (f.stateFrame >= 3 && f.stateFrame <= m.startup + m.active) {
        f.vx = f.facing * 0.24;
      } else {
        f.vx *= 0.72;
      }
    } else if (m.id === '41236K') {
      if (f.stateFrame >= m.startup && f.stateFrame <= m.startup + m.active) {
        f.vx = f.facing * (f.character === 'KAZE' ? 0.17 : 0.14);
      } else {
        f.vx *= 0.75;
      }
    } else if (m.id === 'ROLL') {
      f.vx =
        f.stateFrame <= m.startup + m.active
          ? f.facing * 0.23
          : f.vx * 0.6;
    } else if (m.id === 'FOCUS') {
      if (f.stateFrame === m.startup) {
        f.vx = f.facing * 0.18;
      } else {
        f.vx *= 0.76;
      }
    } else if (m.id === '6K') {
      f.vx *= f.character === 'KAZE' ? 0.88 : 0.78;
    } else if (
      m.id !== '623P' &&
      m.id !== 'EX_623P' &&
      m.id !== '214K' &&
      m.id !== 'j214K' &&
      m.id !== 'j236P' &&
      f.y === 0
    ) {
      f.vx *= 0.72;
    }

    applyPhysics(f);

    if (
      (m.id === 'jP' ||
        m.id === 'jK' ||
        m.id === 'j236P' ||
        m.id === 'j214K') &&
      f.y === 0 &&
      f.stateFrame > 2
    ) {
      f.state = 'IDLE';
      f.stateFrame = 0;
      f.moveId = null;
      f.armorHits = 0;
      return;
    }

    const total = m.startup + m.active + m.recovery;
    if (f.stateFrame >= total && f.y === 0) {
      f.state = 'IDLE';
      f.stateFrame = 0;
      f.moveId = null;
      f.armorHits = 0;
    }
    return;
  }

  if (f.y > 0 || f.state === 'JUMP') {
    if (buf.matchMotion([2, 3, 6], ['pPressed'])) {
      startMove(state, f, 'j236P');
      return;
    }
    if (buf.matchMotion([2, 1, 4], ['kPressed'])) {
      startMove(state, f, 'j214K');
      return;
    }
    if (buf.wasPressed('kPressed', 4) !== -1) {
      startMove(state, f, 'jK');
      return;
    }
    if (buf.wasPressed('pPressed', 4) !== -1) {
      startMove(state, f, 'jP');
      return;
    }
    applyPhysics(f);
    if (f.y === 0) {
      f.state = 'IDLE';
      f.stateFrame = 0;
      f.vx = 0;
    }
    return;
  }

  if (tryGroundOffensiveInput(state, f, buf, cur)) return;

  const quickDash = buf.wasPressed('dashPressed', 4) !== -1;
  const wantBackDash =
    buf.matchDoubleTap(4, 12) || (quickDash && (cur.dir === 4 || cur.dir === 1));
  const wantForwardDash =
    buf.matchDoubleTap(6, 12) || (quickDash && cur.dir !== 4 && cur.dir !== 1);

  if (wantBackDash) {
    f.state = 'DASH_B';
    f.stateFrame = 0;
    f.invulnFrames = 6;
    state.events.push({ type: 'SPARK', x: f.x, y: 0.9, kind: 'BACKDASH' });
    state.events.push({ type: 'SFX', name: 'backdash' });
    return;
  }
  if (wantForwardDash) {
    f.state = 'DASH_F';
    f.stateFrame = 0;
    state.events.push({ type: 'SPARK', x: f.x, y: 0.75, kind: 'DASH' });
    state.events.push({ type: 'SFX', name: 'dash' });
    return;
  }

  if (cur.dir === 7 || cur.dir === 8 || cur.dir === 9) {
    f.state = 'JUMP';
    f.stateFrame = 0;
    f.vy = spec.jumpVy;
    if (cur.dir === 9) f.vx = f.facing * spec.jumpVx;
    else if (cur.dir === 7) f.vx = -f.facing * spec.jumpVx;
    else f.vx = 0;
    applyPhysics(f);
    return;
  }

  if (cur.dir === 1 || cur.dir === 2 || cur.dir === 3) {
    f.state = 'CROUCH';
    f.vx = 0;
    return;
  }

  if (cur.dir === 6) {
    f.state = 'WALK_F';
    f.vx = f.facing * spec.walkForward;
    f.x = clamp(f.x + f.vx, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
  } else if (cur.dir === 4) {
    f.state = 'WALK_B';
    f.vx = -f.facing * spec.walkBack;
    f.x = clamp(f.x + f.vx, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
  } else {
    f.state = 'IDLE';
    f.vx = 0;
  }
}

function trySpecialAndSuperInput(
  state: MatchState,
  f: FighterState,
  buf: InputBuffer,
  allowSuper: boolean,
  allowSpecial: boolean
): boolean {
  if (
    allowSuper &&
    f.superMeter >= 100 &&
    (buf.wasPressed('sPressed', 5) !== -1 ||
      buf.matchMotion([2, 3, 6], ['sPressed']) ||
      buf.matchMotion([2, 3, 6, 2, 3, 6], ['pPressed', 'kPressed'], 5, 20))
  ) {
    startMove(state, f, 'SUPER');
    return true;
  }

  if (!allowSpecial) return false;

  // EX Specials (25% barra + combinación P+K o K+T)
  if (f.superMeter >= 25) {
    if (buf.matchMotionChord([6, 2, 3], 'pPressed', 'kPressed')) {
      startMove(state, f, 'EX_623P');
      return true;
    }
    if (buf.matchMotionChord([2, 3, 6], 'kPressed', 'tPressed')) {
      startMove(state, f, 'EX_236K');
      return true;
    }
    if (buf.matchMotionChord([2, 3, 6], 'pPressed', 'kPressed')) {
      startMove(state, f, 'EX_236P');
      return true;
    }
    if (buf.matchMotionChord([2, 1, 4], 'pPressed', 'kPressed')) {
      startMove(state, f, 'EX_214P');
      return true;
    }
  }

  // Medias Lunas clásicas (SNK / Grappler) antes que cuartos de luna
  if (
    buf.matchMotion([6, 3, 2, 1, 4], ['tPressed', 'pPressed'], 5, 20)
  ) {
    startMove(state, f, '63214T');
    return true;
  }
  if (buf.matchMotion([4, 1, 2, 3, 6], ['kPressed', 'pPressed'], 5, 20)) {
    startMove(state, f, '41236K');
    return true;
  }

  // Especiales clásicos (623, 236, 214, 22)
  if (buf.matchMotion([6, 2, 3], ['pPressed'])) {
    startMove(state, f, '623P');
    return true;
  }
  if (buf.matchMotion([2, 3, 6], ['kPressed'])) {
    startMove(state, f, '236K');
    return true;
  }
  if (buf.matchMotion([2, 3, 6], ['pPressed'])) {
    startMove(state, f, '236P');
    return true;
  }
  if (buf.matchMotion([2, 1, 4], ['kPressed'])) {
    startMove(state, f, '214K');
    return true;
  }
  if (buf.matchMotion([2, 1, 4], ['pPressed'])) {
    startMove(state, f, '214P');
    return true;
  }
  if (buf.matchDownDown(['pPressed'])) {
    startMove(state, f, '22P');
    return true;
  }

  return false;
}

function tryGroundOffensiveInput(
  state: MatchState,
  f: FighterState,
  buf: InputBuffer,
  cur: BufferedFrame
): boolean {
  if (trySpecialAndSuperInput(state, f, buf, true, true)) {
    return true;
  }

  // Acordes de botones en neutral: P+K (Cyber Impact con Armor) y P+T (Dodge Roll)
  if (buf.matchChord('pPressed', 'kPressed', 4) !== -1) {
    startMove(state, f, 'FOCUS');
    return true;
  }
  if (buf.matchChord('pPressed', 'tPressed', 4) !== -1) {
    startMove(state, f, 'ROLL');
    return true;
  }

  if (buf.wasPressed('tPressed', 4) !== -1) {
    startMove(state, f, 'THROW');
    return true;
  }

  const isCrouching = cur.dir === 1 || cur.dir === 2 || cur.dir === 3;
  const isForward = cur.dir === 6;

  if (buf.wasPressed('kPressed', 4) !== -1) {
    startMove(state, f, isCrouching ? '2K' : isForward ? '6K' : '5K');
    return true;
  }

  if (buf.wasPressed('pPressed', 4) !== -1) {
    startMove(state, f, isCrouching ? '2P' : isForward ? '6P' : '5P');
    return true;
  }

  return false;
}

function applyPhysics(f: FighterState): void {
  const airborne = f.y > 0 || f.vy !== 0;
  const jumpArc = f.state === 'JUMP' || (f.state === 'ATTACK' && !!f.moveId && f.moveId.startsWith('j'));
  const dt = airborne ? (jumpArc ? JUMP_TIME_SCALE : AIR_TIME_SCALE) : 1;
  f.x = clamp(f.x + f.vx * dt, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
  if (airborne) {
    f.y += f.vy * dt;
    f.vy += GRAVITY * dt;
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      if (f.state !== 'KNOCKDOWN') f.vx = 0;
    }
  }
}

function syncAllBoxes(state: MatchState): void {
  for (const f of state.fighters) {
    const m = getFighterMove(f);
    const isCrouch =
      f.state === 'CROUCH' ||
      f.state === 'BLOCK_CROUCH' ||
      f.moveId === '2P' ||
      f.moveId === '2K' ||
      f.moveId === 'ROLL' ||
      (f.moveId === '6K' && (f.character === 'KAZE' || f.character === 'VOLT'));
    const h = isCrouch ? 1.25 : 1.85;
    f.pushbox = { x: f.x, y: f.y + h * 0.5, w: 0.78, h: h * 0.95 };
    f.hurtbox =
      f.invulnFrames > 0 || f.state === 'KNOCKDOWN' || f.state === 'WAKEUP'
        ? null
        : { x: f.x, y: f.y + h * 0.52, w: 0.92, h };

    f.hitbox = null;
    if (f.state === 'ATTACK' && m && m.hitbox) {
      const hb = m.hitbox;
      const inActive =
        f.stateFrame > m.startup && f.stateFrame <= m.startup + m.active;
      if (inActive && hb) {
        f.hitbox = {
          x: f.x + hb.x * f.facing,
          y: f.y + hb.y,
          w: hb.w,
          h: hb.h,
        };
      }
    }
  }
}

function updateProjectiles(
  state: MatchState,
  buffers: [InputBuffer, InputBuffer]
): void {
  for (const p of state.projectiles) {
    if (!p.active) continue;
    p.x += p.vx;
    p.y += p.vy;
    if (p.hitCooldown > 0) p.hitCooldown--;
    if (Math.abs(p.x) > STAGE_HALF_WIDTH + 1.5 || p.y <= 0.12) {
      p.active = false;
      if (p.y <= 0.12) {
        state.events.push({
          type: 'SPARK',
          x: p.x,
          y: 0.18,
          kind: p.isEx ? 'GOLD' : 'HIT',
        });
      }
    }
  }

  for (let i = 0; i < state.projectiles.length; i++) {
    for (let j = i + 1; j < state.projectiles.length; j++) {
      const a = state.projectiles[i];
      const b = state.projectiles[j];
      if (!a.active || !b.active || a.owner === b.owner) continue;
      if (
        aabbIntersects(
          { x: a.x, y: a.y, w: a.w, h: a.h },
          { x: b.x, y: b.y, w: b.w, h: b.h }
        )
      ) {
        a.hitsRemaining--;
        b.hitsRemaining--;
        if (a.hitsRemaining <= 0) a.active = false;
        if (b.hitsRemaining <= 0) b.active = false;
        state.events.push({
          type: 'SPARK',
          x: (a.x + b.x) * 0.5,
          y: a.y,
          kind: 'GOLD',
        });
        state.events.push({ type: 'SFX', name: 'block' });
      }
    }
  }

  for (const p of state.projectiles) {
    if (!p.active || p.hitCooldown > 0) continue;
    const defender = state.fighters[1 - p.owner];
    const attacker = state.fighters[p.owner];
    if (
      defender.hurtbox &&
      aabbIntersects({ x: p.x, y: p.y, w: p.w, h: p.h }, defender.hurtbox)
    ) {
      p.hitsRemaining--;
      if (p.hitsRemaining <= 0) {
        p.active = false;
      } else {
        p.hitCooldown = 5;
      }
      applyHit(
        state,
        attacker,
        defender,
        {
          id: p.sourceMoveId,
          startup: 0,
          active: 1,
          recovery: 0,
          damage: p.damage,
          chip: p.chip,
          hitstun: p.hitstun,
          blockstun: p.blockstun,
          hitstop: 6,
          pushbackHit: 0.52,
          pushbackBlock: 0.44,
          hitLevel: 'MID',
          isSpecial: true,
          isEx: p.isEx,
          isSuper: false,
          knockdown: p.knockdown,
          hitbox: null,
        },
        p.x,
        p.y,
        buffers
      );
    }
  }

  state.projectiles = state.projectiles.filter((p) => p.active);
}

function resolveCombatHits(
  state: MatchState,
  buffers: [InputBuffer, InputBuffer]
): void {
  const [p1, p2] = state.fighters;
  checkMeleeHit(state, p1, p2, buffers);
  checkMeleeHit(state, p2, p1, buffers);
}

function checkMeleeHit(
  state: MatchState,
  attacker: FighterState,
  defender: FighterState,
  buffers: [InputBuffer, InputBuffer]
): void {
  const m = getFighterMove(attacker);
  if (!attacker.hitbox || !m || !defender.hurtbox) return;

  let hitKey = 'single';
  if (m.multiHits) {
    const idx = m.multiHits.findIndex(
      (f) => attacker.stateFrame >= f && attacker.stateFrame < f + 4
    );
    if (idx === -1) return;
    hitKey = `mh_${idx}`;
  }
  if (attacker.hitMask.includes(hitKey)) return;

  if (!aabbIntersects(attacker.hitbox, defender.hurtbox)) return;

  if (m.hitLevel === 'THROW') {
    if (
      defender.y > 0 ||
      defender.throwInvulnFrames > 0 ||
      defender.state === 'HITSTUN' ||
      defender.state === 'JUGGLE' ||
      defender.state === 'DASH_B' ||
      defender.state === 'BLOCK_STAND' ||
      defender.state === 'BLOCK_CROUCH'
    ) {
      return;
    }
    attacker.hitMask.push(hitKey);
    attacker.moveConnected = true;

    if (m.id === '63214T') {
      attacker.state = 'THROW_HOLD';
      attacker.stateFrame = 0;
      attacker.moveId = '63214T';
      defender.state = 'THROWN';
      defender.stateFrame = 0;
      defender.throwTechTimer = -1; // untechable cinematic lift & slam
      defender.x = clamp(
        attacker.x + attacker.facing * 0.78,
        -STAGE_HALF_WIDTH,
        STAGE_HALF_WIDTH
      );
      state.events.push({ type: 'SFX', name: 'commandGrab' });
      state.events.push({
        type: 'CALLOUT',
        side: attacker.id,
        text: attacker.character === 'TITAN' ? 'GIGA POWERBOMB!' : 'COMMAND GRAB!',
        color: '#f59e0b',
      });
      return;
    }

    attacker.state = 'THROW_HOLD';
    attacker.stateFrame = 0;
    defender.state = 'THROWN';
    defender.stateFrame = 0;
    defender.throwTechTimer = THROW_TECH_WINDOW;
    defender.x = clamp(
      attacker.x + attacker.facing * 0.9,
      -STAGE_HALF_WIDTH,
      STAGE_HALF_WIDTH
    );
    state.events.push({ type: 'SFX', name: 'throwGrab' });
    return;
  }

  attacker.hitMask.push(hitKey);
  attacker.moveConnected = true;

  const isFinalMultiHit =
    !m.multiHits || hitKey === `mh_${m.multiHits.length - 1}`;
  const effectiveMove: MoveData = m.multiHits
    ? { ...m, knockdown: isFinalMultiHit }
    : m;
  applyHit(
    state,
    attacker,
    defender,
    effectiveMove,
    attacker.hitbox.x,
    attacker.hitbox.y,
    buffers
  );
}

function canBlock(
  defender: FighterState,
  hitLevel: HitLevel,
  buf: InputBuffer
): boolean {
  if (defender.y > 0) return false;
  const blockableStates: FighterState['state'][] = [
    'IDLE',
    'WALK_B',
    'CROUCH',
    'BLOCK_STAND',
    'BLOCK_CROUCH',
  ];
  if (!blockableStates.includes(defender.state)) return false;

  const dir = buf.getCurrent().dir;
  const holdingBack = dir === 4;
  const holdingDownBack = dir === 1;

  if (hitLevel === 'OVERHEAD') return holdingBack;
  if (hitLevel === 'LOW') return holdingDownBack;
  return holdingBack || holdingDownBack;
}

function applyHit(
  state: MatchState,
  attacker: FighterState,
  defender: FighterState,
  move: MoveData,
  sparkX: number,
  sparkY: number,
  buffers: [InputBuffer, InputBuffer]
): void {
  const defBuf = buffers[defender.id];
  const blocked = canBlock(defender, move.hitLevel, defBuf);

  const attackerMove = getFighterMove(attacker);
  const remainingAttacker = attackerMove
    ? Math.max(
        0,
        attackerMove.startup +
          attackerMove.active +
          attackerMove.recovery -
          attacker.stateFrame
      )
    : 10;

  if (blocked) {
    const chipDmg = move.chip || 0;
    if (chipDmg > 0) {
      const minHp = move.isSuper ? 0 : 1;
      defender.hp = Math.max(
        state.mode === 'TRAINING' ? 1 : minHp,
        defender.hp - chipDmg
      );
    }
    defender.state =
      defBuf.getCurrent().dir === 1 ? 'BLOCK_CROUCH' : 'BLOCK_STAND';
    defender.stateFrame = 0;
    defender.stunFrames = move.blockstun;

    const pushDir =
      attacker.x === defender.x
        ? attacker.facing
        : defender.x > attacker.x
          ? 1
          : -1;
    const blockDelta = pushDir * move.pushbackBlock;
    const clampedBlockX = clamp(
      defender.x + blockDelta,
      -STAGE_HALF_WIDTH,
      STAGE_HALF_WIDTH
    );
    const blockOverflow = blockDelta - (clampedBlockX - defender.x);
    defender.x = clampedBlockX;
    if (Math.abs(blockOverflow) > 0.001 && attacker.y === 0) {
      attacker.x = clamp(
        attacker.x - blockOverflow,
        -STAGE_HALF_WIDTH,
        STAGE_HALF_WIDTH
      );
    }

    attacker.superMeter = Math.min(100, attacker.superMeter + 6);
    defender.superMeter = Math.min(100, defender.superMeter + 5);
    attacker.lastAdvantage = move.blockstun - remainingAttacker;

    state.hitstop = Math.max(4, Math.floor(move.hitstop * 0.8));
    state.screenShake = 0.14;
    state.events.push({ type: 'SPARK', x: sparkX, y: sparkY, kind: 'BLOCK' });
    state.events.push({ type: 'SFX', name: 'block' });
    return;
  }

  if (
    defender.armorHits > 0 &&
    !move.isSuper &&
    move.hitLevel !== 'THROW'
  ) {
    defender.armorHits--;
    const absorbedDmg = Math.max(4, Math.round(move.damage * 0.45));
    defender.hp = Math.max(
      state.mode === 'TRAINING' ? 1 : 1,
      defender.hp - absorbedDmg
    );
    state.hitstop = 6;
    state.screenShake = 0.22;
    state.events.push({ type: 'SPARK', x: sparkX, y: sparkY, kind: 'GOLD' });
    state.events.push({
      type: 'VFX_BURST',
      x: sparkX,
      y: sparkY,
      effect: 'ARMOR_ABSORB',
      facing: defender.facing,
      color: 0xfacc15,
    });
    state.events.push({ type: 'SFX', name: 'armorHit' });
    state.events.push({
      type: 'CALLOUT',
      side: defender.id,
      text: 'ARMOR!',
      color: '#facc15',
    });
    return;
  }

  const defenderMove = getFighterMove(defender);
  const isCounter =
    defender.state === 'ATTACK' &&
    defenderMove !== null &&
    defender.stateFrame <= defenderMove.startup + defenderMove.active;

  const isCrossUp =
    attacker.y > 0 &&
    (attacker.x - defender.x) * attacker.facing > 0.12 &&
    !move.isSpecial;

  defender.comboCount++;
  const scaleIdx = Math.min(defender.comboCount - 1, COMBO_SCALING.length - 1);
  const scale = COMBO_SCALING[scaleIdx];
  const counterBonus = isCounter ? 1.2 : 1.0;
  const finalDmg = Math.max(8, Math.round(move.damage * scale * counterBonus));
  defender.comboDamage += finalDmg;
  defender.lastHitDamage = finalDmg;

  defender.hp = Math.max(
    state.mode === 'TRAINING' ? 1 : 0,
    defender.hp - finalDmg
  );
  attacker.superMeter = Math.min(
    100,
    attacker.superMeter + (move.isSuper ? 0 : 12)
  );
  defender.superMeter = Math.min(100, defender.superMeter + 8);

  const decay = Math.max(0, defender.comboCount - 2);
  const finalHitstun = Math.max(
    6,
    move.hitstun + (isCounter ? 4 : 0) - decay
  );
  attacker.lastAdvantage = finalHitstun - remainingAttacker;

  const pushDir =
    attacker.x === defender.x
      ? attacker.facing
      : defender.x > attacker.x
        ? 1
        : -1;

  if (move.knockdown) {
    defender.state = 'KNOCKDOWN';
    defender.stateFrame = 0;
    defender.vy = defender.y > 0 ? 0.24 : 0.22;
    defender.vx = pushDir * 0.13;
  } else if (defender.y > 0) {
    defender.state = 'JUGGLE';
    defender.stateFrame = 0;
    defender.stunFrames = finalHitstun;
    defender.vy = Math.max(defender.vy, 0.17);
    defender.vx = pushDir * 0.09;
  } else {
    defender.state = 'HITSTUN';
    defender.stateFrame = 0;
    defender.stunFrames = finalHitstun;
    const hitDelta = pushDir * move.pushbackHit;
    const clampedHitX = clamp(
      defender.x + hitDelta,
      -STAGE_HALF_WIDTH,
      STAGE_HALF_WIDTH
    );
    const hitOverflow = hitDelta - (clampedHitX - defender.x);
    defender.x = clampedHitX;
    if (Math.abs(hitOverflow) > 0.001 && attacker.y === 0) {
      attacker.x = clamp(
        attacker.x - hitOverflow,
        -STAGE_HALF_WIDTH,
        STAGE_HALF_WIDTH
      );
    }
  }

  state.hitstop = move.hitstop + (isCounter ? 3 : 0);
  state.screenShake =
    move.damage >= 80 || isCounter || move.isSuper ? 0.36 : 0.18;

  const sparkKind = isCounter || move.isSuper || move.isEx ? 'GOLD' : 'HIT';
  state.events.push({ type: 'SPARK', x: sparkX, y: sparkY, kind: sparkKind });

  if (move.isSuper) {
    state.events.push({
      type: 'VFX_BURST',
      x: sparkX,
      y: sparkY,
      effect: 'SUPER_BURST',
      facing: attacker.facing,
      color: CHARACTERS[attacker.character].accentColor,
    });
  } else if (
    move.isEx ||
    move.isSpecial ||
    move.id === 'FOCUS' ||
    isCounter
  ) {
    const burstCol =
      move.isEx || isCounter
        ? 0xfacc15
        : CHARACTERS[attacker.character].accentColor;
    state.events.push({
      type: 'VFX_BURST',
      x: sparkX,
      y: sparkY,
      effect: 'HEAVY_IMPACT',
      facing: attacker.facing,
      color: burstCol,
    });
    if (!move.spawnsProjectile && move.id !== 'PROJ') {
      state.events.push({
        type: 'VFX_SLASH',
        x: sparkX - attacker.facing * 0.35,
        y: sparkY,
        facing: attacker.facing,
        color: burstCol,
        angle: (state.frame % 2 === 0 ? 1 : -1) * 0.55,
        scale: move.isEx ? 1.45 : 1.2,
      });
    }
  }

  state.events.push({
    type: 'SFX',
    name: move.damage >= 80 || move.isSuper ? 'hitHeavy' : 'hitLight',
  });

  state.events.push({
    type: 'HIT_CONFIRMED',
    attacker: attacker.id,
    moveId: move.id,
    comboCount: defender.comboCount,
  });

  if (
    move.damage >= 80 ||
    move.isSuper ||
    isCounter ||
    Math.abs(defender.x) >= STAGE_HALF_WIDTH - 0.15
  ) {
    state.events.push({
      type: 'STAGE_IMPACT',
      x: defender.x,
      intensity: move.isSuper ? 1.0 : 0.62,
      ground: move.id === '22P' || move.id === '2K',
    });
  }

  if (isCounter) {
    state.events.push({
      type: 'CALLOUT',
      side: attacker.id,
      text: 'COUNTER HIT!',
      color: '#facc15',
    });
  } else if (isCrossUp) {
    state.events.push({
      type: 'CALLOUT',
      side: attacker.id,
      text: 'CROSS-UP!',
      color: '#38bdf8',
    });
  }
}

function resolveRoundEnd(state: MatchState, timeOver: boolean): void {
  const [p1, p2] = state.fighters;
  const p1Pct = p1.hp / p1.maxHp;
  const p2Pct = p2.hp / p2.maxHp;
  let roundWinner: -1 | 0 | 1 = -1;
  if (p1Pct > p2Pct) roundWinner = 0;
  else if (p2Pct > p1Pct) roundWinner = 1;

  if (roundWinner === 0) {
    p1.roundsWon++;
    p1.state = 'VICTORY';
    p2.state = 'DEFEAT';
    p2.vy = 0.2;
    p2.vx = -p2.facing * 0.12;
  } else if (roundWinner === 1) {
    p2.roundsWon++;
    p2.state = 'VICTORY';
    p1.state = 'DEFEAT';
    p1.vy = 0.2;
    p1.vx = -p1.facing * 0.12;
  }

  if (!timeOver) {
    const loser = roundWinner === 0 ? p2 : p1;
    state.slowMoFrames = 22;
    state.screenShake = 0.55;
    state.events.push({
      type: 'KO_SLOWMO',
      loserX: loser.x,
      loserY: loser.y + 1.0,
    });
    state.events.push({
      type: 'STAGE_IMPACT',
      x: loser.x,
      intensity: 1.0,
      ground: true,
    });
  }

  state.events.push({ type: 'SFX', name: 'ko' });
  state.events.push({
    type: 'BANNER',
    text: timeOver ? 'TIME OVER' : 'K.O.!',
    color: '#f43f5e',
  });

  if (p1.roundsWon >= 2 || p2.roundsWon >= 2) {
    state.phase = 'MATCH_END';
    state.phaseTimer = 175;
    state.winnerId = p1.roundsWon >= 2 ? 0 : 1;
  } else {
    state.phase = 'ROUND_END';
    state.phaseTimer = 120;
  }
}

function recordFrameMeter(state: MatchState): void {
  for (const f of state.fighters) {
    let code: FrameMeterCode = 'N';
    if (f.invulnFrames > 0) code = 'I';
    else if (f.state === 'DASH_F' || f.state === 'DASH_B') code = 'D';
    else if (
      f.state === 'HITSTUN' ||
      f.state === 'JUGGLE' ||
      f.state === 'KNOCKDOWN' ||
      f.state === 'THROWN'
    )
      code = 'H';
    else if (f.state === 'BLOCK_STAND' || f.state === 'BLOCK_CROUCH') code = 'B';
    else if (f.state === 'ATTACK') {
      const m = getFighterMove(f);
      if (m) {
        if (f.stateFrame <= m.startup) code = 'S';
        else if (f.stateFrame <= m.startup + m.active) code = 'A';
        else code = 'R';
      }
    }
    f.frameMeter.push(code);
    if (f.frameMeter.length > 60) f.frameMeter.shift();
  }
}
