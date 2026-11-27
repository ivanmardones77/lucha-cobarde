import { aabbIntersects, clamp, resolvePushboxes } from './collision';
import { InputBuffer, NumpadDir } from './inputBuffer';
import {
  FighterState,
  HitLevel,
  MatchState,
  MOVES,
  MoveId,
  ProjectileState,
} from './types';

const WALK_FORWARD_SPEED = 0.085;
const WALK_BACK_SPEED = 0.068;
const PROJECTILE_SPEED = 0.22;
const PROJECTILE_MAX_LIFE = 150;

export function createInitialState(): MatchState {
  return {
    frame: 0,
    hitstop: 0,
    stageHalfWidth: 6.5,
    fighters: [createFighter(0, -2.2, 1), createFighter(1, 2.2, -1)],
    projectiles: [],
    nextProjectileId: 1,
  };
}

function createFighter(id: 0 | 1, x: number, facing: 1 | -1): FighterState {
  return {
    id,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing,
    hp: 1000,
    maxHp: 1000,
    action: 'IDLE',
    actionFrame: 0,
    currentMove: null,
    stunFrames: 0,
    hasHitCurrentMove: false,
    comboCount: 0,
    lastInputDir: 5,
    pushbox: { x, y: 0.9, w: 0.8, h: 1.8 },
    hurtbox: { x, y: 0.95, w: 0.9, h: 1.9 },
    hitbox: null,
  };
}

export function stepSimulation(
  state: MatchState,
  buffers: [InputBuffer, InputBuffer]
): void {
  state.frame++;

  // Guardar última dirección para depuración y evaluación de bloqueo
  state.fighters[0].lastInputDir = buffers[0].getCurrentDir();
  state.fighters[1].lastInputDir = buffers[1].getCurrentDir();

  // 1. Hitstop: congela la simulación de combate pero los buffers siguen registrando inputs
  if (state.hitstop > 0) {
    state.hitstop--;
    return;
  }

  // 2. Actualizar FSM y movimiento de cada luchador
  for (let i = 0; i < 2; i++) {
    updateFighter(state, state.fighters[i], buffers[i]);
  }

  // 3. Resolver Pushboxes y sincronizar cajas
  resolvePushboxes(state.fighters[0], state.fighters[1], state.stageHalfWidth);
  syncBoxes(state.fighters[0]);
  syncBoxes(state.fighters[1]);

  // 4. Evaluar Hitbox vs Hurtbox (ataques cuerpo a cuerpo)
  checkMeleeHit(state, state.fighters[0], state.fighters[1]);
  checkMeleeHit(state, state.fighters[1], state.fighters[0]);

  // 5. Actualizar proyectiles (Hadouken), choques entre proyectiles e impactos
  updateProjectiles(state);

  // 6. Actualizar facing automático en estado neutral
  const [p1, p2] = state.fighters;
  if (isNeutral(p1)) p1.facing = p1.x <= p2.x ? 1 : -1;
  if (isNeutral(p2)) p2.facing = p2.x <= p1.x ? 1 : -1;
}

function isNeutral(f: FighterState): boolean {
  return f.action === 'IDLE' || f.action === 'WALK' || f.action === 'CROUCH';
}

function startMove(f: FighterState, moveId: MoveId): void {
  f.action = 'ATTACK';
  f.currentMove = moveId;
  f.actionFrame = 0;
  f.hasHitCurrentMove = false;
  f.vx = 0;
}

function updateFighter(
  state: MatchState,
  f: FighterState,
  buffer: InputBuffer
): void {
  f.vx = 0;
  f.hitbox = null;

  // Estados de aturdimiento (HITSTUN / BLOCKSTUN)
  if (f.action === 'HITSTUN' || f.action === 'BLOCKSTUN') {
    f.actionFrame++;
    f.stunFrames--;
    if (f.stunFrames <= 0) {
      f.action = 'IDLE';
      f.actionFrame = 0;
      // Al salir de hitstun se reinicia el contador de combo del atacante
      const opponent = state.fighters[f.id === 0 ? 1 : 0];
      opponent.comboCount = 0;
    }
    return;
  }

  // Estado de ataque
  if (f.action === 'ATTACK' && f.currentMove) {
    const move = MOVES[f.currentMove];
    f.actionFrame++;

    // Generar proyectil en el primer frame activo si corresponde
    if (
      move.spawnsProjectile &&
      f.actionFrame === move.startupFrames + 1 &&
      !f.hasHitCurrentMove
    ) {
      f.hasHitCurrentMove = true;
      spawnProjectile(state, f, move.id);
    }

    const total =
      move.startupFrames + move.activeFrames + move.recoveryFrames;
    if (f.actionFrame >= total) {
      f.action = 'IDLE';
      f.currentMove = null;
      f.actionFrame = 0;
    }
    return;
  }

  // Estado neutral (IDLE / WALK / CROUCH)
  const dir = buffer.getCurrentDir();

  // Prioridad 1: Motion Input 236 + Ataque (Hadouken)
  if (buffer.matchMotion([2, 3, 6])) {
    const hasActiveProj = state.projectiles.some((p) => p.ownerId === f.id);
    if (!hasActiveProj) {
      startMove(f, 'HADOUKEN');
      return;
    }
  }

  // Prioridad 2: Ataques normales (2LK si agachado, 5LP de pie)
  if (buffer.isAttackJustPressed(3)) {
    const isDown = dir === 1 || dir === 2 || dir === 3;
    startMove(f, isDown ? 'LOW_KICK' : 'JAB');
    return;
  }

  // Prioridad 3: Agacharse o caminar
  if (dir === 1 || dir === 2 || dir === 3) {
    if (f.action !== 'CROUCH') f.actionFrame = 0;
    f.action = 'CROUCH';
    f.actionFrame++;
    return;
  }

  if (dir === 6 || dir === 9) {
    if (f.action !== 'WALK') f.actionFrame = 0;
    f.action = 'WALK';
    f.actionFrame++;
    f.vx = f.facing * WALK_FORWARD_SPEED;
    f.x = clamp(f.x + f.vx, -state.stageHalfWidth, state.stageHalfWidth);
    return;
  }

  if (dir === 4 || dir === 7) {
    if (f.action !== 'WALK') f.actionFrame = 0;
    f.action = 'WALK';
    f.actionFrame++;
    f.vx = -f.facing * WALK_BACK_SPEED;
    f.x = clamp(f.x + f.vx, -state.stageHalfWidth, state.stageHalfWidth);
    return;
  }

  if (f.action !== 'IDLE') f.actionFrame = 0;
  f.action = 'IDLE';
  f.actionFrame++;
}

function syncBoxes(f: FighterState): void {
  const crouching = f.action === 'CROUCH' || f.currentMove === 'LOW_KICK';

  f.pushbox.x = f.x;
  f.pushbox.y = f.y + (crouching ? 0.6 : 0.9);
  f.pushbox.w = 0.8;
  f.pushbox.h = crouching ? 1.2 : 1.8;

  f.hurtbox.x = f.x;
  f.hurtbox.y = f.y + (crouching ? 0.65 : 0.95);
  f.hurtbox.w = 0.92;
  f.hurtbox.h = crouching ? 1.3 : 1.9;

  if (f.action === 'ATTACK' && f.currentMove) {
    const move = MOVES[f.currentMove];
    const inActive =
      move.hitboxOffset &&
      f.actionFrame > move.startupFrames &&
      f.actionFrame <= move.startupFrames + move.activeFrames;

    if (inActive && move.hitboxOffset) {
      const o = move.hitboxOffset;
      f.hitbox = {
        x: f.x + o.x * f.facing,
        y: f.y + o.y,
        w: o.w,
        h: o.h,
      };
      return;
    }
  }
  f.hitbox = null;
}

function canBlock(defender: FighterState, hitLevel: HitLevel): boolean {
  const blockableState =
    isNeutral(defender) || defender.action === 'BLOCKSTUN';
  if (!blockableState) return false;

  const dir = defender.lastInputDir as NumpadDir;
  const holdingStandingBack = dir === 4;
  const holdingCrouchBack = dir === 1;

  if (hitLevel === 'LOW') return holdingCrouchBack;
  if (hitLevel === 'OVERHEAD') return holdingStandingBack;
  return holdingStandingBack || holdingCrouchBack;
}

function applyImpact(
  state: MatchState,
  attacker: FighterState,
  defender: FighterState,
  attackDir: 1 | -1,
  params: {
    damage: number;
    chipDamage: number;
    hitstunFrames: number;
    blockstunFrames: number;
    hitstopFrames: number;
    pushbackOnHit: number;
    pushbackOnBlock: number;
    hitLevel: HitLevel;
  }
): void {
  const blocked = canBlock(defender, params.hitLevel);

  if (blocked) {
    // Chip damage (no puede hacer K.O. si le queda más de 1 HP)
    if (params.chipDamage > 0 && defender.hp > 1) {
      defender.hp = Math.max(1, defender.hp - params.chipDamage);
    }
    defender.action = 'BLOCKSTUN';
    defender.actionFrame = 0;
    defender.currentMove = null;
    defender.stunFrames = params.blockstunFrames;
    defender.x = clamp(
      defender.x + attackDir * params.pushbackOnBlock,
      -state.stageHalfWidth,
      state.stageHalfWidth
    );
  } else {
    defender.hp = Math.max(0, defender.hp - params.damage);
    defender.action = 'HITSTUN';
    defender.actionFrame = 0;
    defender.currentMove = null;
    defender.stunFrames = params.hitstunFrames;
    defender.x = clamp(
      defender.x + attackDir * params.pushbackOnHit,
      -state.stageHalfWidth,
      state.stageHalfWidth
    );
    attacker.comboCount++;
  }

  state.hitstop = params.hitstopFrames;
}

function checkMeleeHit(
  state: MatchState,
  attacker: FighterState,
  defender: FighterState
): void {
  if (!attacker.hitbox || !attacker.currentMove || attacker.hasHitCurrentMove) {
    return;
  }
  if (!aabbIntersects(attacker.hitbox, defender.hurtbox)) return;

  const move = MOVES[attacker.currentMove];
  attacker.hasHitCurrentMove = true;
  applyImpact(state, attacker, defender, attacker.facing, move);
}

function spawnProjectile(
  state: MatchState,
  owner: FighterState,
  moveId: MoveId
): void {
  const move = MOVES[moveId];
  const startX = owner.x + owner.facing * 0.95;
  const startY = owner.y + 1.15;

  const proj: ProjectileState = {
    id: state.nextProjectileId++,
    ownerId: owner.id,
    x: startX,
    y: startY,
    vx: owner.facing * PROJECTILE_SPEED,
    facing: owner.facing,
    damage: move.damage,
    chipDamage: move.chipDamage,
    hitstunFrames: move.hitstunFrames,
    blockstunFrames: move.blockstunFrames,
    hitstopFrames: move.hitstopFrames,
    pushbackOnHit: move.pushbackOnHit,
    pushbackOnBlock: move.pushbackOnBlock,
    hitLevel: move.hitLevel,
    hitbox: { x: startX, y: startY, w: 0.65, h: 0.55 },
    lifeFrames: PROJECTILE_MAX_LIFE,
  };
  state.projectiles.push(proj);
}

function updateProjectiles(state: MatchState): void {
  const toRemove = new Set<number>();

  // 1. Mover proyectiles
  for (const p of state.projectiles) {
    p.x += p.vx;
    p.hitbox.x = p.x;
    p.hitbox.y = p.y;
    p.lifeFrames--;

    if (
      p.lifeFrames <= 0 ||
      Math.abs(p.x) > state.stageHalfWidth + 2.5
    ) {
      toRemove.add(p.id);
    }
  }

  // 2. Choque entre proyectiles rivales (Clash)
  for (let i = 0; i < state.projectiles.length; i++) {
    for (let j = i + 1; j < state.projectiles.length; j++) {
      const a = state.projectiles[i];
      const b = state.projectiles[j];
      if (a.ownerId === b.ownerId) continue;
      if (toRemove.has(a.id) || toRemove.has(b.id)) continue;

      if (aabbIntersects(a.hitbox, b.hitbox)) {
        toRemove.add(a.id);
        toRemove.add(b.id);
        state.hitstop = Math.max(state.hitstop, 4);
      }
    }
  }

  // 3. Impacto contra el luchador rival
  for (const p of state.projectiles) {
    if (toRemove.has(p.id)) continue;
    const attacker = state.fighters[p.ownerId];
    const defender = state.fighters[p.ownerId === 0 ? 1 : 0];

    if (aabbIntersects(p.hitbox, defender.hurtbox)) {
      applyImpact(state, attacker, defender, p.facing, p);
      toRemove.add(p.id);
    }
  }

  if (toRemove.size > 0) {
    state.projectiles = state.projectiles.filter((p) => !toRemove.has(p.id));
  }
}
