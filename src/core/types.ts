import type { SfxName } from '../audio/SoundEngine';

export const FIXED_DT = 1 / 60;
export const STAGE_HALF_WIDTH = 6.2;
export const GRAVITY = -0.022;
export const MAX_HP = 1000;
export const BUFFER_SIZE = 20;
export const THROW_TECH_WINDOW = 6;
export const COMBO_SCALING = [1.0, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25, 0.15];

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CharacterId = 'RYUJIN' | 'KAZE';

export type HitLevel = 'HIGH' | 'MID' | 'LOW' | 'OVERHEAD' | 'THROW';

export type MoveId =
  | '5P'
  | '2P'
  | '6P'
  | 'jP'
  | '236P'
  | '623P'
  | '214P'
  | '22P'
  | '5K'
  | '2K'
  | '6K'
  | 'jK'
  | '236K'
  | '214K'
  | '41236K'
  | 'THROW'
  | '63214T'
  | 'FOCUS'
  | 'ROLL'
  | 'EX_236P'
  | 'EX_623P'
  | 'EX_236K'
  | 'EX_214P'
  | 'j236P'
  | 'j214K'
  | 'SUPER'
  | 'PROJ';

export interface MoveData {
  id: MoveId;
  name?: string;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  chip: number;
  hitstun: number;
  blockstun: number;
  hitstop: number;
  pushbackHit: number;
  pushbackBlock: number;
  hitLevel: HitLevel;
  isSpecial: boolean;
  isEx?: boolean;
  isSuper: boolean;
  knockdown: boolean;
  meterCost?: number;
  cancelToSpecial?: boolean;
  cancelToSuper?: boolean;
  spawnsProjectile?: boolean;
  projectileVy?: number;
  projectileHits?: number;
  invulnUntil?: number;
  armorUntil?: number;
  multiHits?: number[];
  hitbox: AABB | null;
}

export type PlayableMoveId = Exclude<MoveId, 'PROJ'>;

export interface CharacterSpec {
  id: CharacterId;
  name: string;
  archetype: string;
  maxHp: number;
  walkForward: number;
  walkBack: number;
  jumpVx: number;
  jumpVy: number;
  dashForwardVx: number;
  dashBackVx: number;
  dpVx: number;
  dpVy: number;
  rushVx: number;
  rushType: 'TATSU' | 'BLITZ';
  projectileVx: number;
  projectileKind: 'ORB' | 'KUNAI';
  projectileSize: { w: number; h: number };
  superName: string;
  primaryColor: number;
  accentColor: number;
  hudColor: string;
  moves: Record<PlayableMoveId, MoveData>;
}

export type FighterAction =
  | 'IDLE'
  | 'WALK_F'
  | 'WALK_B'
  | 'CROUCH'
  | 'JUMP'
  | 'DASH_F'
  | 'DASH_B'
  | 'ATTACK'
  | 'HITSTUN'
  | 'JUGGLE'
  | 'BLOCK_STAND'
  | 'BLOCK_CROUCH'
  | 'KNOCKDOWN'
  | 'WAKEUP'
  | 'THROWN'
  | 'THROW_HOLD'
  | 'VICTORY'
  | 'DEFEAT';

export type FrameMeterCode = 'N' | 'S' | 'A' | 'R' | 'H' | 'B' | 'I' | 'D';

export interface FighterState {
  id: 0 | 1;
  character: CharacterId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  delayedHp: number;
  superMeter: number;
  roundsWon: number;
  state: FighterAction;
  stateFrame: number;
  moveId: PlayableMoveId | null;
  moveConnected: boolean;
  hitMask: string[];
  stunFrames: number;
  invulnFrames: number;
  armorHits: number;
  throwInvulnFrames: number;
  throwTechTimer: number;
  comboCount: number;
  comboDamage: number;
  lastHitDamage: number;
  regenDelay: number;
  pushbox: AABB;
  hurtbox: AABB | null;
  hitbox: AABB | null;
  frameMeter: FrameMeterCode[];
  lastAdvantage: number;
}

export interface ProjectileState {
  id: string;
  owner: 0 | 1;
  kind: 'ORB' | 'KUNAI';
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  damage: number;
  chip: number;
  hitstun: number;
  blockstun: number;
  hitsRemaining: number;
  hitCooldown: number;
  knockdown: boolean;
  isEx?: boolean;
  active: boolean;
}

export type SparkKind = 'HIT' | 'BLOCK' | 'GOLD' | 'DASH' | 'BACKDASH';

export type VfxEffectKind =
  | 'EX_CHARGE'
  | 'FOCUS_CHARGE'
  | 'ARMOR_ABSORB'
  | 'COMMAND_GRAB'
  | 'TELEPORT'
  | 'KI_CHARGE'
  | 'HEAVY_IMPACT'
  | 'SUPER_BURST';

export type MatchEvent =
  | { type: 'SPARK'; x: number; y: number; kind: SparkKind }
  | {
      type: 'VFX_BURST';
      x: number;
      y: number;
      effect: VfxEffectKind;
      facing: 1 | -1;
      color: number;
    }
  | {
      type: 'VFX_SLASH';
      x: number;
      y: number;
      facing: 1 | -1;
      color: number;
      angle: number;
      scale?: number;
    }
  | { type: 'SFX'; name: SfxName }
  | { type: 'BANNER'; text: string; color: string }
  | { type: 'CALLOUT'; side: 0 | 1; text: string; color: string }
  | {
      type: 'SUPER_FLASH';
      owner: 0 | 1;
      x: number;
      y: number;
      superName: string;
    };

export type GameMode = 'AI' | '2P' | 'TRAINING';
export type DummyMode =
  | 'NEUTRAL'
  | 'BLOCK_ALL'
  | 'BLOCK_AFTER'
  | 'RANDOM_GUARD'
  | 'WAKEUP_DP'
  | 'JUMP';
export type TrainingPosition = 'CENTER' | 'CORNER_L' | 'CORNER_R';
export type MatchPhase = 'INTRO' | 'FIGHT' | 'ROUND_END' | 'MATCH_END';

export interface MatchState {
  mode: GameMode;
  dummyMode: DummyMode;
  p1Character: CharacterId;
  p2Character: CharacterId;
  frame: number;
  hitstop: number;
  superFlashFrames: number;
  superFlashOwner: -1 | 0 | 1;
  screenShake: number;
  round: number;
  timerFrames: number;
  phase: MatchPhase;
  phaseTimer: number;
  winnerId: -1 | 0 | 1;
  fighters: [FighterState, FighterState];
  projectiles: ProjectileState[];
  events: MatchEvent[];
}

const RYUJIN_MOVES: Record<PlayableMoveId, MoveData> = {
  '5P': {
    id: '5P',
    name: 'Jab (5P)',
    startup: 4,
    active: 3,
    recovery: 7,
    damage: 45,
    chip: 0,
    hitstun: 13,
    blockstun: 9,
    hitstop: 5,
    pushbackHit: 0.4,
    pushbackBlock: 0.34,
    hitLevel: 'MID',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: true,
    cancelToSuper: true,
    hitbox: { x: 0.9, y: 1.28, w: 0.95, h: 0.34 },
  },
  '2P': {
    id: '2P',
    name: 'Puño Bajo (2P)',
    startup: 5,
    active: 3,
    recovery: 8,
    damage: 45,
    chip: 0,
    hitstun: 13,
    blockstun: 9,
    hitstop: 5,
    pushbackHit: 0.42,
    pushbackBlock: 0.36,
    hitLevel: 'MID',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: true,
    cancelToSuper: true,
    hitbox: { x: 0.92, y: 0.72, w: 0.98, h: 0.32 },
  },
  '6P': {
    id: '6P',
    name: 'Rompeguardia (6P)',
    startup: 13,
    active: 4,
    recovery: 11,
    damage: 78,
    chip: 0,
    hitstun: 19,
    blockstun: 11,
    hitstop: 8,
    pushbackHit: 0.48,
    pushbackBlock: 0.4,
    hitLevel: 'OVERHEAD',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: true,
    cancelToSuper: true,
    hitbox: { x: 1.0, y: 1.18, w: 1.05, h: 0.56 },
  },
  jP: {
    id: 'jP',
    name: 'Puño Aéreo (j.P)',
    startup: 5,
    active: 8,
    recovery: 9,
    damage: 65,
    chip: 0,
    hitstun: 16,
    blockstun: 11,
    hitstop: 7,
    pushbackHit: 0.4,
    pushbackBlock: 0.35,
    hitLevel: 'OVERHEAD',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: false,
    cancelToSuper: false,
    hitbox: { x: 0.48, y: 0.62, w: 1.16, h: 0.6 },
  },
  '236P': {
    id: '236P',
    name: 'Hadouken (236P)',
    startup: 11,
    active: 4,
    recovery: 20,
    damage: 75,
    chip: 14,
    hitstun: 18,
    blockstun: 13,
    hitstop: 6,
    pushbackHit: 0.55,
    pushbackBlock: 0.48,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: false,
    cancelToSuper: true,
    spawnsProjectile: true,
    hitbox: null,
  },
  '623P': {
    id: '623P',
    name: 'Dragon Uppercut (623P)',
    startup: 4,
    active: 9,
    recovery: 22,
    damage: 115,
    chip: 18,
    hitstun: 26,
    blockstun: 15,
    hitstop: 10,
    pushbackHit: 0.85,
    pushbackBlock: 0.65,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: true,
    invulnUntil: 7,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 0.72, y: 1.45, w: 0.85, h: 1.25 },
  },
  '214P': {
    id: '214P',
    name: 'Denjin Palm (214P)',
    startup: 10,
    active: 5,
    recovery: 14,
    damage: 96,
    chip: 18,
    hitstun: 24,
    blockstun: 16,
    hitstop: 10,
    pushbackHit: 0.72,
    pushbackBlock: 0.52,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.05, y: 1.15, w: 1.25, h: 0.68 },
  },
  '22P': {
    id: '22P',
    name: 'Ki Charge Burst (22P)',
    startup: 8,
    active: 6,
    recovery: 14,
    damage: 62,
    chip: 10,
    hitstun: 20,
    blockstun: 12,
    hitstop: 7,
    pushbackHit: 0.9,
    pushbackBlock: 0.7,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 0.25, y: 1.05, w: 1.7, h: 1.3 },
  },
  '5K': {
    id: '5K',
    name: 'Patada Media (5K)',
    startup: 7,
    active: 4,
    recovery: 12,
    damage: 75,
    chip: 0,
    hitstun: 18,
    blockstun: 12,
    hitstop: 8,
    pushbackHit: 0.68,
    pushbackBlock: 0.54,
    hitLevel: 'MID',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: true,
    cancelToSuper: true,
    hitbox: { x: 1.18, y: 1.05, w: 1.28, h: 0.42 },
  },
  '2K': {
    id: '2K',
    name: 'Barrido Bajo (2K)',
    startup: 8,
    active: 4,
    recovery: 18,
    damage: 80,
    chip: 0,
    hitstun: 22,
    blockstun: 12,
    hitstop: 9,
    pushbackHit: 0.62,
    pushbackBlock: 0.55,
    hitLevel: 'LOW',
    isSpecial: false,
    isSuper: false,
    knockdown: true,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.15, y: 0.28, w: 1.25, h: 0.36 },
  },
  '6K': {
    id: '6K',
    name: 'Step Side Kick (6K)',
    startup: 9,
    active: 5,
    recovery: 13,
    damage: 84,
    chip: 0,
    hitstun: 20,
    blockstun: 13,
    hitstop: 9,
    pushbackHit: 0.78,
    pushbackBlock: 0.58,
    hitLevel: 'MID',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: true,
    cancelToSuper: true,
    hitbox: { x: 1.28, y: 1.0, w: 1.38, h: 0.46 },
  },
  jK: {
    id: 'jK',
    name: 'Patada Aérea (j.K)',
    startup: 6,
    active: 10,
    recovery: 10,
    damage: 85,
    chip: 0,
    hitstun: 19,
    blockstun: 13,
    hitstop: 8,
    pushbackHit: 0.48,
    pushbackBlock: 0.42,
    hitLevel: 'OVERHEAD',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: false,
    cancelToSuper: false,
    hitbox: { x: 0.36, y: 0.48, w: 1.46, h: 0.68 },
  },
  '236K': {
    id: '236K',
    name: 'Tornado Kick (236K)',
    startup: 8,
    active: 18,
    recovery: 16,
    damage: 48,
    chip: 9,
    hitstun: 20,
    blockstun: 12,
    hitstop: 6,
    pushbackHit: 0.42,
    pushbackBlock: 0.36,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: true,
    multiHits: [9, 15, 21],
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 0.85, y: 1.1, w: 1.35, h: 0.65 },
  },
  '214K': {
    id: '214K',
    name: 'Axe Overhead Kick (214K)',
    startup: 14,
    active: 5,
    recovery: 11,
    damage: 92,
    chip: 12,
    hitstun: 22,
    blockstun: 14,
    hitstop: 9,
    pushbackHit: 0.5,
    pushbackBlock: 0.42,
    hitLevel: 'OVERHEAD',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.05, y: 0.95, w: 1.18, h: 0.95 },
  },
  '41236K': {
    id: '41236K',
    name: 'Breaker Rush (41236K)',
    startup: 9,
    active: 16,
    recovery: 18,
    damage: 52,
    chip: 10,
    hitstun: 22,
    blockstun: 14,
    hitstop: 7,
    pushbackHit: 0.45,
    pushbackBlock: 0.38,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: true,
    multiHits: [10, 15, 20],
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.05, y: 1.05, w: 1.45, h: 0.72 },
  },
  THROW: {
    id: 'THROW',
    name: 'Agarre (Throw)',
    startup: 5,
    active: 3,
    recovery: 22,
    damage: 110,
    chip: 0,
    hitstun: 0,
    blockstun: 0,
    hitstop: 8,
    pushbackHit: 1.4,
    pushbackBlock: 0,
    hitLevel: 'THROW',
    isSpecial: false,
    isSuper: false,
    knockdown: true,
    cancelToSpecial: false,
    cancelToSuper: false,
    hitbox: { x: 0.68, y: 1.05, w: 0.78, h: 1.1 },
  },
  '63214T': {
    id: '63214T',
    name: 'Cyber Cyclone (63214T/P)',
    startup: 6,
    active: 4,
    recovery: 25,
    damage: 148,
    chip: 0,
    hitstun: 0,
    blockstun: 0,
    hitstop: 10,
    pushbackHit: 1.65,
    pushbackBlock: 0,
    hitLevel: 'THROW',
    isSpecial: true,
    isSuper: false,
    knockdown: true,
    cancelToSpecial: false,
    cancelToSuper: false,
    hitbox: { x: 0.85, y: 1.05, w: 1.05, h: 1.15 },
  },
  FOCUS: {
    id: 'FOCUS',
    name: 'Cyber Impact (P+K)',
    startup: 14,
    active: 4,
    recovery: 18,
    damage: 110,
    chip: 18,
    hitstun: 26,
    blockstun: 18,
    hitstop: 12,
    pushbackHit: 1.1,
    pushbackBlock: 0.8,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: true,
    armorUntil: 15,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.15, y: 1.1, w: 1.4, h: 0.75 },
  },
  ROLL: {
    id: 'ROLL',
    name: 'Dodge Roll (P+T)',
    startup: 2,
    active: 12,
    recovery: 6,
    damage: 0,
    chip: 0,
    hitstun: 0,
    blockstun: 0,
    hitstop: 0,
    pushbackHit: 0,
    pushbackBlock: 0,
    hitLevel: 'MID',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    invulnUntil: 14,
    hitbox: null,
  },
  EX_236P: {
    id: 'EX_236P',
    name: 'EX Shakunetsu (236+P+K)',
    startup: 9,
    active: 4,
    recovery: 16,
    damage: 62,
    chip: 16,
    hitstun: 22,
    blockstun: 16,
    hitstop: 7,
    pushbackHit: 0.7,
    pushbackBlock: 0.55,
    hitLevel: 'MID',
    isSpecial: true,
    isEx: true,
    isSuper: false,
    knockdown: true,
    meterCost: 25,
    spawnsProjectile: true,
    projectileHits: 2,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: null,
  },
  EX_623P: {
    id: 'EX_623P',
    name: 'EX Dragon Upper (623+P+K)',
    startup: 3,
    active: 11,
    recovery: 22,
    damage: 74,
    chip: 14,
    hitstun: 28,
    blockstun: 16,
    hitstop: 9,
    pushbackHit: 0.9,
    pushbackBlock: 0.7,
    hitLevel: 'MID',
    isSpecial: true,
    isEx: true,
    isSuper: false,
    knockdown: true,
    meterCost: 25,
    invulnUntil: 10,
    multiHits: [4, 9],
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 0.78, y: 1.5, w: 0.98, h: 1.38 },
  },
  EX_236K: {
    id: 'EX_236K',
    name: 'EX Tornado Hurricane (236+K+T)',
    startup: 6,
    active: 20,
    recovery: 15,
    damage: 42,
    chip: 10,
    hitstun: 22,
    blockstun: 14,
    hitstop: 6,
    pushbackHit: 0.5,
    pushbackBlock: 0.4,
    hitLevel: 'MID',
    isSpecial: true,
    isEx: true,
    isSuper: false,
    knockdown: true,
    meterCost: 25,
    multiHits: [7, 12, 17, 22],
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 0.95, y: 1.1, w: 1.55, h: 0.75 },
  },
  EX_214P: {
    id: 'EX_214P',
    name: 'EX Denjin Crusher (214+P+K)',
    startup: 8,
    active: 6,
    recovery: 12,
    damage: 132,
    chip: 26,
    hitstun: 28,
    blockstun: 20,
    hitstop: 12,
    pushbackHit: 0.85,
    pushbackBlock: 0.6,
    hitLevel: 'MID',
    isSpecial: true,
    isEx: true,
    isSuper: false,
    knockdown: true,
    meterCost: 25,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.12, y: 1.15, w: 1.42, h: 0.82 },
  },
  j236P: {
    id: 'j236P',
    name: 'Zanku Air Hadouken (j.236P)',
    startup: 7,
    active: 4,
    recovery: 14,
    damage: 65,
    chip: 12,
    hitstun: 18,
    blockstun: 12,
    hitstop: 6,
    pushbackHit: 0.45,
    pushbackBlock: 0.4,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    spawnsProjectile: true,
    projectileVy: -0.11,
    hitbox: null,
  },
  j214K: {
    id: 'j214K',
    name: 'Meteor Dive Kick (j.214K)',
    startup: 6,
    active: 14,
    recovery: 8,
    damage: 82,
    chip: 8,
    hitstun: 20,
    blockstun: 14,
    hitstop: 8,
    pushbackHit: 0.45,
    pushbackBlock: 0.38,
    hitLevel: 'OVERHEAD',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    hitbox: { x: 0.65, y: 0.42, w: 1.28, h: 0.68 },
  },
  SUPER: {
    id: 'SUPER',
    name: 'CYBER OVERDRIVE (SUPER)',
    startup: 6,
    active: 18,
    recovery: 22,
    damage: 72,
    chip: 14,
    hitstun: 28,
    blockstun: 16,
    hitstop: 7,
    pushbackHit: 0.45,
    pushbackBlock: 0.35,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: true,
    knockdown: true,
    invulnUntil: 12,
    multiHits: [7, 13, 20],
    cancelToSpecial: false,
    cancelToSuper: false,
    hitbox: { x: 1.35, y: 1.15, w: 1.9, h: 1.1 },
  },
};

const KAZE_MOVES: Record<PlayableMoveId, MoveData> = {
  '5P': {
    id: '5P',
    name: 'Rapid Jab (5P)',
    startup: 3,
    active: 3,
    recovery: 6,
    damage: 38,
    chip: 0,
    hitstun: 12,
    blockstun: 8,
    hitstop: 4,
    pushbackHit: 0.34,
    pushbackBlock: 0.28,
    hitLevel: 'MID',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: true,
    cancelToSuper: true,
    hitbox: { x: 0.88, y: 1.26, w: 0.92, h: 0.34 },
  },
  '2P': {
    id: '2P',
    name: 'Low Palm (2P)',
    startup: 4,
    active: 3,
    recovery: 7,
    damage: 40,
    chip: 0,
    hitstun: 12,
    blockstun: 8,
    hitstop: 4,
    pushbackHit: 0.36,
    pushbackBlock: 0.3,
    hitLevel: 'MID',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: true,
    cancelToSuper: true,
    hitbox: { x: 0.9, y: 0.72, w: 0.96, h: 0.32 },
  },
  '6P': {
    id: '6P',
    name: 'Anti-Air Fang (6P)',
    startup: 6,
    active: 5,
    recovery: 11,
    damage: 66,
    chip: 0,
    hitstun: 18,
    blockstun: 10,
    hitstop: 7,
    pushbackHit: 0.45,
    pushbackBlock: 0.38,
    hitLevel: 'MID',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    invulnUntil: 4,
    cancelToSpecial: true,
    cancelToSuper: true,
    hitbox: { x: 0.82, y: 1.45, w: 0.95, h: 0.88 },
  },
  jP: {
    id: 'jP',
    name: 'Air Claw (j.P)',
    startup: 4,
    active: 8,
    recovery: 8,
    damage: 58,
    chip: 0,
    hitstun: 15,
    blockstun: 10,
    hitstop: 6,
    pushbackHit: 0.36,
    pushbackBlock: 0.3,
    hitLevel: 'OVERHEAD',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: false,
    cancelToSuper: false,
    hitbox: { x: 0.45, y: 0.6, w: 1.14, h: 0.58 },
  },
  '236P': {
    id: '236P',
    name: 'Plasma Kunai (236P)',
    startup: 8,
    active: 3,
    recovery: 18,
    damage: 55,
    chip: 10,
    hitstun: 16,
    blockstun: 11,
    hitstop: 5,
    pushbackHit: 0.42,
    pushbackBlock: 0.36,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: false,
    cancelToSuper: true,
    spawnsProjectile: true,
    hitbox: null,
  },
  '623P': {
    id: '623P',
    name: 'Rising Fang (623P)',
    startup: 4,
    active: 8,
    recovery: 21,
    damage: 105,
    chip: 16,
    hitstun: 25,
    blockstun: 14,
    hitstop: 9,
    pushbackHit: 0.8,
    pushbackBlock: 0.62,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: true,
    invulnUntil: 6,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 0.78, y: 1.4, w: 0.92, h: 1.2 },
  },
  '214P': {
    id: '214P',
    name: 'Shadow Crescent (214P)',
    startup: 7,
    active: 6,
    recovery: 13,
    damage: 86,
    chip: 14,
    hitstun: 24,
    blockstun: 13,
    hitstop: 8,
    pushbackHit: 0.48,
    pushbackBlock: 0.4,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.0, y: 1.22, w: 1.22, h: 0.96 },
  },
  '22P': {
    id: '22P',
    name: 'Kunai Barrage (22P)',
    startup: 7,
    active: 4,
    recovery: 16,
    damage: 38,
    chip: 8,
    hitstun: 15,
    blockstun: 10,
    hitstop: 5,
    pushbackHit: 0.36,
    pushbackBlock: 0.3,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    spawnsProjectile: true,
    projectileHits: 2,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: null,
  },
  '5K': {
    id: '5K',
    name: 'Snap Kick (5K)',
    startup: 6,
    active: 4,
    recovery: 11,
    damage: 68,
    chip: 0,
    hitstun: 17,
    blockstun: 11,
    hitstop: 7,
    pushbackHit: 0.58,
    pushbackBlock: 0.48,
    hitLevel: 'MID',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: true,
    cancelToSuper: true,
    hitbox: { x: 1.15, y: 1.1, w: 1.25, h: 0.42 },
  },
  '2K': {
    id: '2K',
    name: 'Shadow Sweep (2K)',
    startup: 7,
    active: 4,
    recovery: 17,
    damage: 72,
    chip: 0,
    hitstun: 22,
    blockstun: 12,
    hitstop: 8,
    pushbackHit: 0.56,
    pushbackBlock: 0.48,
    hitLevel: 'LOW',
    isSpecial: false,
    isSuper: false,
    knockdown: true,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.18, y: 0.28, w: 1.28, h: 0.36 },
  },
  '6K': {
    id: '6K',
    name: 'Shadow Slide (6K)',
    startup: 8,
    active: 7,
    recovery: 15,
    damage: 74,
    chip: 0,
    hitstun: 22,
    blockstun: 11,
    hitstop: 8,
    pushbackHit: 0.55,
    pushbackBlock: 0.44,
    hitLevel: 'LOW',
    isSpecial: false,
    isSuper: false,
    knockdown: true,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.1, y: 0.28, w: 1.38, h: 0.36 },
  },
  jK: {
    id: 'jK',
    name: 'Flying Heel (j.K)',
    startup: 5,
    active: 10,
    recovery: 9,
    damage: 78,
    chip: 0,
    hitstun: 18,
    blockstun: 12,
    hitstop: 7,
    pushbackHit: 0.44,
    pushbackBlock: 0.38,
    hitLevel: 'OVERHEAD',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    cancelToSpecial: false,
    cancelToSuper: false,
    hitbox: { x: 0.34, y: 0.48, w: 1.48, h: 0.66 },
  },
  '236K': {
    id: '236K',
    name: 'Blitz Rush (236K)',
    startup: 6,
    active: 12,
    recovery: 16,
    damage: 58,
    chip: 10,
    hitstun: 20,
    blockstun: 12,
    hitstop: 7,
    pushbackHit: 0.5,
    pushbackBlock: 0.42,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: true,
    multiHits: [7, 13],
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.0, y: 0.95, w: 1.38, h: 0.58 },
  },
  '214K': {
    id: '214K',
    name: 'Mirage Teleport (214K)',
    startup: 7,
    active: 4,
    recovery: 9,
    damage: 0,
    chip: 0,
    hitstun: 0,
    blockstun: 0,
    hitstop: 0,
    pushbackHit: 0,
    pushbackBlock: 0,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    invulnUntil: 12,
    hitbox: null,
  },
  '41236K': {
    id: '41236K',
    name: 'Phantom Flurry (41236K)',
    startup: 7,
    active: 16,
    recovery: 16,
    damage: 38,
    chip: 8,
    hitstun: 22,
    blockstun: 13,
    hitstop: 6,
    pushbackHit: 0.38,
    pushbackBlock: 0.32,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: true,
    multiHits: [8, 12, 16, 20],
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.05, y: 1.02, w: 1.48, h: 0.68 },
  },
  THROW: {
    id: 'THROW',
    name: 'Ninja Throw',
    startup: 5,
    active: 3,
    recovery: 22,
    damage: 105,
    chip: 0,
    hitstun: 0,
    blockstun: 0,
    hitstop: 8,
    pushbackHit: 1.35,
    pushbackBlock: 0,
    hitLevel: 'THROW',
    isSpecial: false,
    isSuper: false,
    knockdown: true,
    cancelToSpecial: false,
    cancelToSuper: false,
    hitbox: { x: 0.7, y: 1.05, w: 0.8, h: 1.1 },
  },
  '63214T': {
    id: '63214T',
    name: 'Shadow Izuna Drop (63214T/P)',
    startup: 6,
    active: 4,
    recovery: 24,
    damage: 142,
    chip: 0,
    hitstun: 0,
    blockstun: 0,
    hitstop: 10,
    pushbackHit: 1.6,
    pushbackBlock: 0,
    hitLevel: 'THROW',
    isSpecial: true,
    isSuper: false,
    knockdown: true,
    cancelToSpecial: false,
    cancelToSuper: false,
    hitbox: { x: 0.88, y: 1.05, w: 1.08, h: 1.15 },
  },
  FOCUS: {
    id: 'FOCUS',
    name: 'Crimson Impact (P+K)',
    startup: 13,
    active: 4,
    recovery: 17,
    damage: 104,
    chip: 16,
    hitstun: 25,
    blockstun: 17,
    hitstop: 12,
    pushbackHit: 1.05,
    pushbackBlock: 0.76,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: true,
    armorUntil: 14,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.15, y: 1.08, w: 1.38, h: 0.72 },
  },
  ROLL: {
    id: 'ROLL',
    name: 'Shadow Roll (P+T)',
    startup: 2,
    active: 12,
    recovery: 5,
    damage: 0,
    chip: 0,
    hitstun: 0,
    blockstun: 0,
    hitstop: 0,
    pushbackHit: 0,
    pushbackBlock: 0,
    hitLevel: 'MID',
    isSpecial: false,
    isSuper: false,
    knockdown: false,
    invulnUntil: 14,
    hitbox: null,
  },
  EX_236P: {
    id: 'EX_236P',
    name: 'EX Twin Kunai (236+P+K)',
    startup: 6,
    active: 4,
    recovery: 15,
    damage: 48,
    chip: 12,
    hitstun: 20,
    blockstun: 14,
    hitstop: 6,
    pushbackHit: 0.52,
    pushbackBlock: 0.44,
    hitLevel: 'MID',
    isSpecial: true,
    isEx: true,
    isSuper: false,
    knockdown: true,
    meterCost: 25,
    spawnsProjectile: true,
    projectileHits: 2,
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: null,
  },
  EX_623P: {
    id: 'EX_623P',
    name: 'EX Rising Fang (623+P+K)',
    startup: 3,
    active: 10,
    recovery: 21,
    damage: 68,
    chip: 13,
    hitstun: 27,
    blockstun: 15,
    hitstop: 9,
    pushbackHit: 0.85,
    pushbackBlock: 0.65,
    hitLevel: 'MID',
    isSpecial: true,
    isEx: true,
    isSuper: false,
    knockdown: true,
    meterCost: 25,
    invulnUntil: 10,
    multiHits: [4, 9],
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 0.8, y: 1.48, w: 1.0, h: 1.35 },
  },
  EX_236K: {
    id: 'EX_236K',
    name: 'EX Blitz Tempest (236+K+T)',
    startup: 5,
    active: 16,
    recovery: 15,
    damage: 46,
    chip: 10,
    hitstun: 22,
    blockstun: 14,
    hitstop: 6,
    pushbackHit: 0.48,
    pushbackBlock: 0.38,
    hitLevel: 'MID',
    isSpecial: true,
    isEx: true,
    isSuper: false,
    knockdown: true,
    meterCost: 25,
    multiHits: [6, 11, 16],
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.05, y: 0.98, w: 1.52, h: 0.68 },
  },
  EX_214P: {
    id: 'EX_214P',
    name: 'EX Shadow Crescent (214+P+K)',
    startup: 5,
    active: 10,
    recovery: 13,
    damage: 46,
    chip: 12,
    hitstun: 26,
    blockstun: 16,
    hitstop: 7,
    pushbackHit: 0.45,
    pushbackBlock: 0.38,
    hitLevel: 'MID',
    isSpecial: true,
    isEx: true,
    isSuper: false,
    knockdown: true,
    meterCost: 25,
    multiHits: [6, 10, 14],
    cancelToSpecial: false,
    cancelToSuper: true,
    hitbox: { x: 1.02, y: 1.25, w: 1.35, h: 1.1 },
  },
  j236P: {
    id: 'j236P',
    name: 'Air Kunai (j.236P)',
    startup: 5,
    active: 3,
    recovery: 13,
    damage: 54,
    chip: 10,
    hitstun: 17,
    blockstun: 11,
    hitstop: 5,
    pushbackHit: 0.42,
    pushbackBlock: 0.36,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    spawnsProjectile: true,
    projectileVy: -0.14,
    hitbox: null,
  },
  j214K: {
    id: 'j214K',
    name: 'Izuna Dive Kick (j.214K)',
    startup: 5,
    active: 14,
    recovery: 7,
    damage: 76,
    chip: 8,
    hitstun: 20,
    blockstun: 14,
    hitstop: 7,
    pushbackHit: 0.42,
    pushbackBlock: 0.36,
    hitLevel: 'OVERHEAD',
    isSpecial: true,
    isSuper: false,
    knockdown: false,
    hitbox: { x: 0.65, y: 0.42, w: 1.32, h: 0.68 },
  },
  SUPER: {
    id: 'SUPER',
    name: 'CRIMSON TEMPEST (SUPER)',
    startup: 5,
    active: 20,
    recovery: 21,
    damage: 56,
    chip: 11,
    hitstun: 26,
    blockstun: 15,
    hitstop: 6,
    pushbackHit: 0.4,
    pushbackBlock: 0.32,
    hitLevel: 'MID',
    isSpecial: true,
    isSuper: true,
    knockdown: true,
    invulnUntil: 12,
    multiHits: [6, 11, 16, 21],
    cancelToSpecial: false,
    cancelToSuper: false,
    hitbox: { x: 1.38, y: 1.15, w: 2.0, h: 1.15 },
  },
};

export const CHARACTERS: Record<CharacterId, CharacterSpec> = {
  RYUJIN: {
    id: 'RYUJIN',
    name: 'RYUJIN',
    archetype: 'Shoto Equilibrado',
    maxHp: 1000,
    walkForward: 0.088,
    walkBack: 0.068,
    jumpVx: 0.105,
    jumpVy: 0.34,
    dashForwardVx: 0.23,
    dashBackVx: 0.22,
    dpVx: 0.085,
    dpVy: 0.25,
    rushVx: 0.145,
    rushType: 'TATSU',
    projectileVx: 0.19,
    projectileKind: 'ORB',
    projectileSize: { w: 0.65, h: 0.55 },
    superName: 'CYBER OVERDRIVE!',
    primaryColor: 0x0284c7,
    accentColor: 0x38bdf8,
    hudColor: '#38bdf8',
    moves: RYUJIN_MOVES,
  },
  KAZE: {
    id: 'KAZE',
    name: 'KAZE',
    archetype: 'Ninja Rushdown',
    maxHp: 920,
    walkForward: 0.108,
    walkBack: 0.084,
    jumpVx: 0.125,
    jumpVy: 0.355,
    dashForwardVx: 0.28,
    dashBackVx: 0.25,
    dpVx: 0.115,
    dpVy: 0.23,
    rushVx: 0.21,
    rushType: 'BLITZ',
    projectileVx: 0.29,
    projectileKind: 'KUNAI',
    projectileSize: { w: 0.78, h: 0.3 },
    superName: 'CRIMSON TEMPEST!',
    primaryColor: 0xbe123c,
    accentColor: 0xfb7185,
    hudColor: '#fb7185',
    moves: KAZE_MOVES,
  },
};

export const MOVES = RYUJIN_MOVES;

export function getFighterMove(f: FighterState): MoveData | null {
  return f.moveId ? CHARACTERS[f.character].moves[f.moveId] : null;
}
