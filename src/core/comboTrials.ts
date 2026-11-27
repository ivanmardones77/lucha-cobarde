import { CharacterId, MatchState, MoveId } from './types';

export interface ComboTrialStep {
  moveId: MoveId;
  label: string;
}

export interface ComboTrialDef {
  id: string;
  title: string;
  difficulty: 'Básico' | 'Intermedio' | 'Experto';
  steps: ComboTrialStep[];
}

export const COMBO_TRIALS: Record<CharacterId, ComboTrialDef[]> = {
  RYUJIN: [
    {
      id: 'ryujin_1',
      title: '1. Fundamentos Shoto',
      difficulty: 'Básico',
      steps: [
        { moveId: '5P', label: '5P (J)' },
        { moveId: '5K', label: '5K (K)' },
        { moveId: '236P', label: '236+P' },
      ],
    },
    {
      id: 'ryujin_2',
      title: '2. Cadena Anti-Aérea',
      difficulty: 'Intermedio',
      steps: [
        { moveId: '2P', label: '2P (S+J)' },
        { moveId: '5K', label: '5K (K)' },
        { moveId: '623P', label: '623+P' },
      ],
    },
    {
      id: 'ryujin_3',
      title: '3. Cancelación Overdrive',
      difficulty: 'Experto',
      steps: [
        { moveId: '5P', label: '5P (J)' },
        { moveId: '5K', label: '5K (K)' },
        { moveId: 'EX_236K', label: 'EX 236+K+T' },
        { moveId: 'SUPER', label: 'SUPER (U)' },
      ],
    },
  ],
  KAZE: [
    {
      id: 'kaze_1',
      title: '1. Ráfaga Shinobi',
      difficulty: 'Básico',
      steps: [
        { moveId: '5P', label: '5P (J)' },
        { moveId: '5K', label: '5K (K)' },
        { moveId: '236K', label: '236+K' },
      ],
    },
    {
      id: 'kaze_2',
      title: '2. Asalto Carmesí',
      difficulty: 'Intermedio',
      steps: [
        { moveId: '2P', label: '2P (S+J)' },
        { moveId: '5K', label: '5K (K)' },
        { moveId: '41236K', label: '41236+K' },
      ],
    },
    {
      id: 'kaze_3',
      title: '3. Tempestad Final',
      difficulty: 'Experto',
      steps: [
        { moveId: '5P', label: '5P (J)' },
        { moveId: '5K', label: '5K (K)' },
        { moveId: 'EX_214P', label: 'EX 214+P+K' },
        { moveId: 'SUPER', label: 'SUPER (U)' },
      ],
    },
  ],
  TITAN: [
    {
      id: 'titan_1',
      title: '1. Presión de Hierro',
      difficulty: 'Básico',
      steps: [
        { moveId: '5P', label: '5P (J)' },
        { moveId: '5K', label: '5K (K)' },
        { moveId: '214K', label: '214+K' },
      ],
    },
    {
      id: 'titan_2',
      title: '2. Terremoto Blindado',
      difficulty: 'Intermedio',
      steps: [
        { moveId: '2P', label: '2P (S+J)' },
        { moveId: '5K', label: '5K (K)' },
        { moveId: '22P', label: '22+P' },
      ],
    },
    {
      id: 'titan_3',
      title: '3. Impacto Tectónico',
      difficulty: 'Experto',
      steps: [
        { moveId: '5P', label: '5P (J)' },
        { moveId: '5K', label: '5K (K)' },
        { moveId: 'EX_236K', label: 'EX 236+K+T' },
        { moveId: 'SUPER', label: 'SUPER (U)' },
      ],
    },
  ],
};

export class ComboTrialTracker {
  public character: CharacterId = 'RYUJIN';
  public trialIndex = 0;
  public stepIndex = 0;
  public completedIds = new Set<string>();
  public justCompletedTimer = 0;

  public setCharacter(char: CharacterId): void {
    if (this.character !== char) {
      this.character = char;
      this.trialIndex = 0;
      this.stepIndex = 0;
      this.justCompletedTimer = 0;
    }
  }

  public nextTrial(): void {
    const list = COMBO_TRIALS[this.character];
    this.trialIndex = (this.trialIndex + 1) % list.length;
    this.stepIndex = 0;
    this.justCompletedTimer = 0;
  }

  public prevTrial(): void {
    const list = COMBO_TRIALS[this.character];
    this.trialIndex = (this.trialIndex - 1 + list.length) % list.length;
    this.stepIndex = 0;
    this.justCompletedTimer = 0;
  }

  public getCurrentTrial(): ComboTrialDef {
    const list = COMBO_TRIALS[this.character];
    return list[this.trialIndex % list.length];
  }

  public updateFromState(state: MatchState): boolean {
    if (state.mode !== 'TRAINING') return false;
    this.setCharacter(state.fighters[0].character);

    if (this.justCompletedTimer > 0) {
      this.justCompletedTimer--;
    }

    const trial = this.getCurrentTrial();
    const dummy = state.fighters[1];

    // Reset current progress when dummy recovers back to neutral
    if (
      this.justCompletedTimer === 0 &&
      dummy.comboCount === 0 &&
      dummy.state !== 'HITSTUN' &&
      dummy.state !== 'JUGGLE' &&
      dummy.state !== 'KNOCKDOWN' &&
      dummy.state !== 'THROWN'
    ) {
      this.stepIndex = 0;
    }

    let newlyCompleted = false;
    for (const ev of state.events) {
      if (ev.type === 'HIT_CONFIRMED' && ev.attacker === 0) {
        const expected = trial.steps[this.stepIndex];
        if (expected && ev.moveId === expected.moveId) {
          this.stepIndex++;
          if (this.stepIndex >= trial.steps.length) {
            this.completedIds.add(trial.id);
            this.justCompletedTimer = 95;
            newlyCompleted = true;
          }
        }
      }
    }

    return newlyCompleted;
  }
}
