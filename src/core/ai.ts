import { NumpadDir, RawInput } from './inputBuffer';
import { FighterAction, getFighterMove, MatchState, MoveId } from './types';

interface DelayedSnapshot {
  dist: number;
  p1X: number;
  p1Y: number;
  p1State: FighterAction;
  p1Move: MoveId | null;
  projNear: boolean;
}

interface QueuedStep {
  dir: NumpadDir;
  p?: boolean;
  k?: boolean;
  t?: boolean;
}

export type AiDifficulty = 'NORMAL' | 'HARD' | 'MASTER';

export class FightingAI {
  private snapshotQueue: DelayedSnapshot[] = [];
  private reactionDelay = 14;
  private decisionCooldown = 0;
  private currentPlan = 'NEUTRAL';
  private planTimer = 0;
  private motionQueue: QueuedStep[] = [];
  public difficulty: AiDifficulty = 'HARD';

  public setDifficulty(diff: AiDifficulty): void {
    this.difficulty = diff;
    this.reactionDelay = diff === 'NORMAL' ? 21 : diff === 'HARD' ? 14 : 7;
    this.reset();
  }

  public reset(): void {
    this.snapshotQueue = [];
    this.decisionCooldown = 0;
    this.currentPlan = 'NEUTRAL';
    this.planTimer = 0;
    this.motionQueue = [];
  }

  public getInput(state: MatchState): RawInput {
    const ai = state.fighters[1];
    const p1 = state.fighters[0];

    this.snapshotQueue.push({
      dist: Math.abs(p1.x - ai.x),
      p1X: p1.x,
      p1Y: p1.y,
      p1State: p1.state,
      p1Move: p1.moveId,
      projNear: state.projectiles.some(
        (pr) => pr.owner === 0 && Math.abs(pr.x - ai.x) < 2.6
      ),
    });
    if (this.snapshotQueue.length > this.reactionDelay + 2) {
      this.snapshotQueue.shift();
    }

    const delayed = this.snapshotQueue[0];
    const out: RawInput = {
      up: false,
      down: false,
      left: false,
      right: false,
      p: false,
      k: false,
      t: false,
      s: false,
      dash: false,
    };

    if (state.phase !== 'FIGHT') return out;

    // Modo Entrenamiento: comportamiento del Dummy
    if (state.mode === 'TRAINING') {
      if (this.motionQueue.length > 0) {
        const step = this.motionQueue.shift()!;
        return this.dirToRaw(step.dir, ai.facing, step);
      }

      const backLeft = ai.facing === 1;
      const p1AttackingNear =
        p1.state === 'ATTACK' && Math.abs(p1.x - ai.x) < 2.8;

      if (state.dummyMode === 'BLOCK_ALL') {
        out.left = backLeft;
        out.right = !backLeft;
        if (p1.moveId === '2K') out.down = true;
      } else if (state.dummyMode === 'BLOCK_AFTER') {
        if (
          ai.comboCount >= 1 ||
          ai.state === 'HITSTUN' ||
          ai.state === 'BLOCK_STAND' ||
          ai.state === 'BLOCK_CROUCH'
        ) {
          out.left = backLeft;
          out.right = !backLeft;
          if (p1.moveId === '2K') out.down = true;
        }
      } else if (state.dummyMode === 'RANDOM_GUARD') {
        if (
          p1AttackingNear &&
          (Math.floor(state.frame / 18) % 2 === 0 ||
            ai.state === 'BLOCK_STAND' ||
            ai.state === 'BLOCK_CROUCH')
        ) {
          out.left = backLeft;
          out.right = !backLeft;
          if (p1.moveId === '2K') out.down = true;
        }
      } else if (state.dummyMode === 'WAKEUP_DP') {
        if (ai.state === 'WAKEUP' && ai.stateFrame === 10) {
          this.queueMotion([6, 2, 3], 'p');
          return this.dirToRaw(6, ai.facing);
        }
      } else if (state.dummyMode === 'JUMP') {
        if (ai.y === 0 && ai.state === 'IDLE' && state.frame % 64 < 6) {
          out.up = true;
        }
      }
      return out;
    }

    // Cola de motion input (236P, 236K, 623P)
    if (this.motionQueue.length > 0) {
      const step = this.motionQueue.shift()!;
      return this.dirToRaw(step.dir, ai.facing, step);
    }

    const techProb =
      this.difficulty === 'NORMAL'
        ? 0.16
        : this.difficulty === 'HARD'
          ? 0.35
          : 0.62;
    const blockProb =
      this.difficulty === 'NORMAL'
        ? 0.42
        : this.difficulty === 'HARD'
          ? 0.65
          : 0.86;
    const cancelProb =
      this.difficulty === 'NORMAL'
        ? 0.45
        : this.difficulty === 'HARD'
          ? 0.78
          : 0.96;

    // Reacción defensiva a agarre (Throw Tech humano)
    if (
      ai.throwTechTimer > 0 &&
      ai.throwTechTimer <= 4 &&
      Math.random() < techProb
    ) {
      out.t = true;
      return out;
    }

    // Bloqueo reactivo o Backdash defensivo
    if ((delayed.p1State === 'ATTACK' && delayed.dist < 2.7) || delayed.projNear) {
      const rDef = Math.random();
      if (rDef < blockProb) {
        const holdLow = delayed.p1Move === '2K';
        return this.dirToRaw(holdLow ? 1 : 4, ai.facing);
      } else if (rDef < blockProb + 0.12 && ai.y === 0 && !delayed.projNear) {
        return this.dirToRaw(4, ai.facing, { dash: true });
      }
    }

    // Cancelación a especial, EX o Super si el ataque de la IA conectó
    const aiMove = getFighterMove(ai);
    if (
      ai.state === 'ATTACK' &&
      ai.moveConnected &&
      aiMove &&
      aiMove.cancelToSpecial &&
      Math.random() < cancelProb
    ) {
      if (ai.superMeter >= 100 && Math.random() < 0.38) {
        out.s = true;
        return out;
      }
      const rCancel = Math.random();
      if (ai.superMeter >= 25 && rCancel < 0.25) {
        this.queueMotion([2, 3, 6], 'pk');
        return this.dirToRaw(2, ai.facing);
      } else if (rCancel < 0.48) {
        this.queueMotion([2, 3, 6], 'p');
        return this.dirToRaw(2, ai.facing);
      } else if (rCancel < 0.72) {
        this.queueMotion([2, 1, 4], 'p');
        return this.dirToRaw(2, ai.facing);
      } else {
        this.queueMotion([2, 3, 6], 'k');
        return this.dirToRaw(2, ai.facing);
      }
    }

    // Antiaéreo si el jugador salta cerca
    if (
      delayed.p1Y > 0.65 &&
      delayed.dist < 2.2 &&
      ai.y === 0 &&
      this.decisionCooldown <= 0
    ) {
      this.decisionCooldown = 28;
      this.queueMotion([6, 2, 3], 'p');
      return this.dirToRaw(6, ai.facing);
    }

    if (this.decisionCooldown > 0) this.decisionCooldown--;
    if (this.planTimer > 0) this.planTimer--;

    if (this.planTimer <= 0) {
      const r = Math.random();
      const isKaze = ai.character === 'KAZE' || ai.character === 'VALKYRIE';
      const isTitan = ai.character === 'TITAN';
      const isVolt = ai.character === 'VOLT';
      if (delayed.dist > 4.2) {
        if (isTitan) {
          if (r < 0.25) {
            this.queueMotion([2, 3, 6], 'p');
            this.planTimer = 32;
          } else if (r < 0.56) {
            this.queueMotion([2, 1, 4], 'k');
            this.planTimer = 26;
          } else if (r < 0.85) {
            this.currentPlan = 'APPROACH';
            this.planTimer = 24;
          } else {
            this.currentPlan = 'DASH_IN';
            this.planTimer = 16;
          }
        } else if (isVolt) {
          if (r < 0.44) {
            this.queueMotion([2, 3, 6], 'p');
            this.planTimer = 26;
          } else if (r < 0.68) {
            this.queueMotion([2, 5, 2], 'p');
            this.planTimer = 24;
          } else if (r < 0.84) {
            this.queueMotion([2, 1, 4], 'k');
            this.planTimer = 20;
          } else {
            this.currentPlan = 'APPROACH';
            this.planTimer = 20;
          }
        } else if (r < (isKaze ? 0.34 : 0.3)) {
          this.queueMotion([2, 3, 6], 'p');
          this.planTimer = isKaze ? 24 : 30;
        } else if (r < 0.5 && isKaze) {
          this.queueMotion([2, 1, 4], 'k');
          this.planTimer = 20;
        } else if (r < (isKaze ? 0.72 : 0.58)) {
          this.currentPlan = 'DASH_IN';
          this.planTimer = 14;
        } else if (r < 0.86) {
          this.currentPlan = 'APPROACH';
          this.planTimer = 22;
        } else {
          this.currentPlan = 'JUMP_IN';
          this.planTimer = 18;
        }
      } else if (delayed.dist > 1.85) {
        if (isTitan && r < 0.28) {
          this.queueMotion([2, 5, 2], 'p');
          this.planTimer = 26;
        } else if (isTitan && r < 0.52) {
          this.queueMotion([2, 3, 6], 'k');
          this.planTimer = 26;
        } else if (isVolt && r < 0.32) {
          this.queueMotion([2, 3, 6], 'p');
          this.planTimer = 24;
        } else if (r < 0.18) {
          this.currentPlan = 'APPROACH';
          this.planTimer = 14;
        } else if (r < 0.3) {
          this.currentPlan = 'FOOTSIE_BACK';
          this.planTimer = 14;
        } else if (r < 0.46) {
          this.currentPlan = 'POKE_5K';
          this.planTimer = 10;
        } else if (r < 0.62) {
          this.queueMotion([2, 3, 6], 'k');
          this.planTimer = isKaze ? 22 : 26;
        } else if (r < 0.76) {
          this.queueMotion([4, 1, 2, 3, 6], 'k');
          this.planTimer = 28;
        } else if (r < 0.88) {
          this.queueMotion([2, 1, 4], isKaze ? 'p' : 'k');
          this.planTimer = 22;
        } else {
          this.currentPlan = 'JUMP_IN';
          this.planTimer = 22;
        }
      } else {
        if (ai.superMeter >= 100 && r < 0.2) {
          this.currentPlan = 'SUPER';
          this.planTimer = 10;
        } else if (isTitan && r < 0.42) {
          this.queueMotion([6, 3, 2, 1, 4], 't');
          this.planTimer = 22;
        } else if (r < 0.34) {
          this.currentPlan = 'JAB';
          this.planTimer = 10;
        } else if (r < 0.5) {
          this.currentPlan = 'SWEEP_2K';
          this.planTimer = 14;
        } else if (r < 0.64) {
          this.currentPlan = 'FOCUS';
          this.planTimer = 20;
        } else if (r < 0.76) {
          this.currentPlan = 'THROW';
          this.planTimer = 12;
        } else if (r < 0.88) {
          this.currentPlan = 'BACKDASH';
          this.planTimer = 14;
        } else {
          this.currentPlan = 'BLOCK';
          this.planTimer = 16;
        }
      }
    }

    switch (this.currentPlan) {
      case 'APPROACH':
        return this.dirToRaw(6, ai.facing);
      case 'FOOTSIE_BACK':
        return this.dirToRaw(4, ai.facing);
      case 'BLOCK':
        return this.dirToRaw(4, ai.facing);
      case 'DASH_IN':
        this.currentPlan = 'POKE_5K';
        return this.dirToRaw(6, ai.facing, { dash: true });
      case 'BACKDASH':
        this.currentPlan = 'NEUTRAL';
        return this.dirToRaw(4, ai.facing, { dash: true });
      case 'JAB':
        this.currentPlan = 'NEUTRAL';
        return this.dirToRaw(5, ai.facing, { p: true });
      case 'SWEEP_2K':
        this.currentPlan = 'NEUTRAL';
        return this.dirToRaw(2, ai.facing, { k: true });
      case 'POKE_5K':
        this.currentPlan = 'NEUTRAL';
        return this.dirToRaw(5, ai.facing, { k: true });
      case 'FOCUS':
        this.currentPlan = 'NEUTRAL';
        return this.dirToRaw(5, ai.facing, { p: true, k: true });
      case 'THROW':
        this.currentPlan = 'NEUTRAL';
        return this.dirToRaw(5, ai.facing, { t: true });
      case 'SUPER':
        this.currentPlan = 'NEUTRAL';
        return this.dirToRaw(5, ai.facing, { s: true });
      case 'JUMP_IN':
        if (ai.y === 0) return this.dirToRaw(9, ai.facing);
        if (ai.vy < 0.04 && delayed.dist < 2.4) {
          return this.dirToRaw(5, ai.facing, { k: true });
        }
        return out;
      default:
        return out;
    }
  }

  private queueMotion(seq: NumpadDir[], btn: 'p' | 'k' | 'pk' | 't'): void {
    this.motionQueue = seq.map((d, idx) => ({
      dir: d,
      p: idx === seq.length - 1 && (btn === 'p' || btn === 'pk'),
      k: idx === seq.length - 1 && (btn === 'k' || btn === 'pk'),
      t: idx === seq.length - 1 && btn === 't',
    }));
  }

  private dirToRaw(
    numpad: NumpadDir,
    facing: 1 | -1,
    btns: Partial<Pick<RawInput, 'p' | 'k' | 't' | 's' | 'dash'>> = {}
  ): RawInput {
    const relX = ((numpad - 1) % 3) - 1;
    const y = Math.floor((numpad - 1) / 3) - 1;
    const worldX = relX * facing;
    return {
      left: worldX < 0,
      right: worldX > 0,
      up: y > 0,
      down: y < 0,
      p: Boolean(btns.p),
      k: Boolean(btns.k),
      t: Boolean(btns.t),
      s: Boolean(btns.s),
      dash: Boolean(btns.dash),
    };
  }
}
