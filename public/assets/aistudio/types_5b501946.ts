export interface AABB {
  x: number; // Centro en X
  y: number; // Centro en Y
  w: number; // Ancho total
  h: number; // Alto total
}

export type HitLevel = 'HIGH' | 'MID' | 'LOW' | 'OVERHEAD';

export type MoveId = 'JAB' | 'LOW_KICK' | 'HADOUKEN';

export interface MoveData {
  id: MoveId;
  name: string;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  damage: number;
  chipDamage: number;
  hitstunFrames: number;
  blockstunFrames: number;
  hitstopFrames: number;
  pushbackOnHit: number;
  pushbackOnBlock: number;
  hitLevel: HitLevel;
  hitboxOffset?: { x: number; y: number; w: number; h: number };
  spawnsProjectile?: boolean;
}

export type FighterAction =
  | 'IDLE'
  | 'WALK'
  | 'CROUCH'
  | 'ATTACK'
  | 'HITSTUN'
  | 'BLOCKSTUN';

export interface FighterState {
  id: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1; // 1 = derecha, -1 = izquierda
  hp: number;
  maxHp: number;
  action: FighterAction;
  actionFrame: number;
  currentMove: MoveId | null;
  stunFrames: number;
  hasHitCurrentMove: boolean;
  comboCount: number; // Golpes consecutivos recibidos por el rival
  lastInputDir: number;
  pushbox: AABB;
  hurtbox: AABB;
  hitbox: AABB | null;
}

export interface ProjectileState {
  id: number;
  ownerId: 0 | 1;
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  damage: number;
  chipDamage: number;
  hitstunFrames: number;
  blockstunFrames: number;
  hitstopFrames: number;
  pushbackOnHit: number;
  pushbackOnBlock: number;
  hitLevel: HitLevel;
  hitbox: AABB;
  lifeFrames: number;
}

export interface MatchState {
  frame: number;
  hitstop: number;
  stageHalfWidth: number;
  fighters: [FighterState, FighterState];
  projectiles: ProjectileState[];
  nextProjectileId: number;
}

export const MOVES: Record<MoveId, MoveData> = {
  JAB: {
    id: 'JAB',
    name: '5LP (Jab)',
    startupFrames: 4,
    activeFrames: 3,
    recoveryFrames: 7,
    damage: 45,
    chipDamage: 0,
    hitstunFrames: 14,
    blockstunFrames: 10,
    hitstopFrames: 6,
    pushbackOnHit: 0.45,
    pushbackOnBlock: 0.35,
    hitLevel: 'MID',
    hitboxOffset: { x: 0.85, y: 1.25, w: 0.95, h: 0.35 },
  },
  LOW_KICK: {
    id: 'LOW_KICK',
    name: '2LK (Low Kick)',
    startupFrames: 5,
    activeFrames: 3,
    recoveryFrames: 9,
    damage: 55,
    chipDamage: 0,
    hitstunFrames: 15,
    blockstunFrames: 11,
    hitstopFrames: 7,
    pushbackOnHit: 0.5,
    pushbackOnBlock: 0.4,
    hitLevel: 'LOW',
    hitboxOffset: { x: 0.9, y: 0.35, w: 1.05, h: 0.35 },
  },
  HADOUKEN: {
    id: 'HADOUKEN',
    name: '236P (Hadouken)',
    startupFrames: 12,
    activeFrames: 2,
    recoveryFrames: 24,
    damage: 80,
    chipDamage: 15,
    hitstunFrames: 18,
    blockstunFrames: 14,
    hitstopFrames: 8,
    pushbackOnHit: 0.65,
    pushbackOnBlock: 0.5,
    hitLevel: 'MID',
    spawnsProjectile: true,
  },
};
