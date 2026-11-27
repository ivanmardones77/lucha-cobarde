/**
 * Encadena pantallas y combates de Arcade e Historia. No toca el núcleo:
 * pide al juego (GameHost) que prepare escenarios y lance partidas, y recibe
 * el resultado de cada una con onMatchEnd().
 */
import type { AiDifficulty } from '../core/ai';
import { CHARACTERS, CharacterId, CostumePalette, StageId, getFighterHudColor } from '../core/types';
import type { CampaignUI, CardLine, MenuItem } from '../view/CampaignUI';
import {
  ARCADE_CONTINUES,
  ArcadeStep,
  FightResult,
  ScoreBreakdown,
  applyContinuePenalty,
  buildLadder,
  rankFor,
  scoreFight,
} from './arcade';
import { BOSS_INTRO, ENDINGS, MIRROR_INTRO, RIVAL_INTRO, WIN_QUOTES } from './data/arcadeText';
import { CHAPTERS } from './data/chapters';
import { SaveGame } from './save';
import { Chapter, DialogueLine, backdropFor } from './story';

export interface CampaignMatch {
  p1: CharacterId;
  p2: CharacterId;
  p1Palette: CostumePalette;
  p2Palette: CostumePalette;
  stage: StageId;
  difficulty: AiDifficulty;
  p2Hp: number;
}

export interface GameHost {
  /** Escenario de fondo con los dos luchadores colocados, sin simular */
  showBackdrop(stage: StageId, p1: CharacterId, p2: CharacterId): void;
  startCampaignMatch(m: CampaignMatch): void;
  /** Selección de un solo luchador (Arcade) */
  pickFighter(onPick: (id: CharacterId, palette: CostumePalette) => void, onBack: () => void): void;
  exitToMenu(): void;
}

const DIFF_LABEL: Record<AiDifficulty, string> = { NORMAL: 'Normal', HARD: 'Competitivo', MASTER: 'Maestro' };
const fmt = (n: number) => n.toLocaleString('es-ES');

export class CampaignRunner {
  readonly save = new SaveGame();
  private active: { onEnd: (winner: -1 | 0 | 1, r: FightResult) => void } | null = null;
  private countdown = 0;

  constructor(private ui: CampaignUI, private host: GameHost) {}

  get isActive(): boolean {
    return this.active !== null || this.ui.isVisible();
  }

  /** Lo llama el juego cuando termina un combate de campaña */
  onMatchEnd(winner: -1 | 0 | 1, result: FightResult): void {
    const a = this.active;
    this.active = null;
    a?.onEnd(winner, result);
  }

  /** Salida desde el botón Menú del combate */
  abort(): void {
    this.active = null;
    window.clearInterval(this.countdown);
    this.ui.hide();
  }

  private exit(): void {
    this.abort();
    this.host.exitToMenu();
  }

  private fight(m: CampaignMatch, onEnd: (winner: -1 | 0 | 1, r: FightResult) => void): void {
    this.ui.hide();
    this.active = { onEnd };
    this.host.startCampaignMatch(m);
  }

  private say(id: CharacterId, side: 'LEFT' | 'RIGHT', text: string): DialogueLine {
    return { speakerId: id, side, text };
  }

  // ===================== ARCADE =====================

  startArcade(): void {
    this.host.pickFighter(
      (id, palette) => new ArcadeRun(this, id, palette).next(),
      () => this.exit()
    );
  }

  /** Acceso interno para ArcadeRun */
  arcadeApi() {
    return {
      ui: this.ui,
      host: this.host,
      save: this.save,
      fight: this.fight.bind(this),
      say: this.say.bind(this),
      exit: this.exit.bind(this),
      setCountdown: (id: number) => {
        window.clearInterval(this.countdown);
        this.countdown = id;
      },
    };
  }

  // ===================== HISTORIA =====================

  openStory(): void {
    // Fondo del primer capítulo detrás de la lista
    const first = CHAPTERS[0];
    const [p1, p2] = this.storyPair(first, 0);
    this.host.showBackdrop(backdropFor(first, 0), p1, p2);
    const items: MenuItem[] = CHAPTERS.map((c, i) => {
      const st = this.save.chapter(c.id);
      const prevDone = i === 0 || this.save.chapter(CHAPTERS[i - 1].id).done;
      const tag = st.done ? '✔ Completado' : st.node > 0 ? 'En curso' : prevDone ? 'Nuevo' : '🔒 Bloqueado';
      return {
        label: `${i + 1}. ${c.title}`,
        value: tag,
        disabled: !prevDone && !st.done,
        primary: prevDone && !st.done,
        onSelect: () => this.openChapter(c),
      };
    });
    items.push({ label: 'Volver', onSelect: () => this.exit() });
    this.ui.menu('HISTORIA', items, {
      subtitle: 'Tu progreso se guarda solo al terminar cada escena.',
      onBack: () => this.exit(),
    });
  }

  private openChapter(c: Chapter): void {
    const st = this.save.chapter(c.id);
    if (st.node > 0 && !st.done) {
      this.ui.menu(
        c.title,
        [
          { label: 'Continuar donde lo dejaste', primary: true, onSelect: () => this.storyNode(c, st.node) },
          { label: 'Empezar de nuevo', onSelect: () => this.storyNode(c, 0) },
          { label: 'Volver', onSelect: () => this.openStory() },
        ],
        { subtitle: c.summary, onBack: () => this.openStory() }
      );
    } else {
      this.storyNode(c, 0);
    }
  }

  private storyNode(c: Chapter, i: number): void {
    const n = c.nodes[i];
    if (!n) {
      this.save.finishChapter(c.id);
      this.openStory();
      return;
    }
    this.save.setNode(c.id, i); // autoguardado: al volver se retoma aquí
    const next = () => this.storyNode(c, i + 1);

    if (n.type === 'DIALOGUE') {
      const [p1, p2] = this.storyPair(c, i);
      this.host.showBackdrop(backdropFor(c, i), p1, p2);
      this.ui.dialogue(n.lines, c.title, next);
      return;
    }
    if (n.type === 'UNLOCK') {
      this.save.unlock(n.reward.key);
      const card: CardLine = { title: 'RECOMPENSA', color: '#fbbf24', text: n.reward.text };
      this.ui.dialogue([card], c.title, next);
      return;
    }
    const match: CampaignMatch = {
      p1: n.playerCharacter,
      p2: n.opponentCharacter,
      p1Palette: 0,
      p2Palette: n.playerCharacter === n.opponentCharacter ? 1 : 0,
      stage: n.stageId,
      difficulty: n.aiDifficulty,
      p2Hp: n.opponentHp ?? 1,
    };
    const run = () =>
      this.fight(match, (winner) => {
        if (winner === 0) {
          next();
          return;
        }
        // Reintentar vuelve directo al combate, sin repetir el diálogo
        this.ui.menu(
          'DERROTA',
          [
            { label: 'Reintentar combate', primary: true, onSelect: run },
            { label: 'Volver a los capítulos', onSelect: () => this.openStory() },
            { label: 'Salir al menú', onSelect: () => this.exit() },
          ],
          { subtitle: `${CHARACTERS[n.opponentCharacter].name} gana el combate.`, onBack: () => this.openStory() }
        );
      });
    run();
  }

  /** Personajes del combate más cercano, para colocarlos en el fondo del diálogo */
  private storyPair(c: Chapter, i: number): [CharacterId, CharacterId] {
    const find = (from: number, step: number) => {
      for (let k = from; k >= 0 && k < c.nodes.length; k += step) {
        const m = c.nodes[k];
        if (m.type === 'MATCH') return [m.playerCharacter, m.opponentCharacter] as [CharacterId, CharacterId];
      }
      return null;
    };
    return find(i, 1) ?? find(i, -1) ?? ['RYUJIN', 'KAZE'];
  }
}

/** Una partida de Arcade en curso */
class ArcadeRun {
  private step = 0;
  private score = 0;
  private continuesLeft = ARCADE_CONTINUES;
  private continuesUsed = 0;
  private readonly steps: ArcadeStep[];
  private api: ReturnType<CampaignRunner['arcadeApi']>;

  constructor(runner: CampaignRunner, private player: CharacterId, private palette: CostumePalette) {
    this.steps = buildLadder(player);
    this.api = runner.arcadeApi();
  }

  private get name(): string {
    return CHARACTERS[this.player].name;
  }

  next(): void {
    const s = this.steps[this.step];
    const { ui, host, say } = this.api;
    host.showBackdrop(s.stage, this.player, s.rival);
    const rivalName = s.kind === 'MIRROR' ? `SOMBRA DE ${this.name}` : CHARACTERS[s.rival].name;
    const label = s.kind === 'BOSS' ? '¡Jefe final!' : s.kind === 'RIVAL' ? 'Tu rival' : s.kind === 'MIRROR' ? 'Combate espejo' : '';
    const card: CardLine = {
      title: `${this.name}  VS  ${rivalName}`,
      color: getFighterHudColor(s.rival, s.kind === 'MIRROR' ? 1 : 0),
      text: `Combate ${this.step + 1} de ${this.steps.length} · Dificultad ${DIFF_LABEL[s.difficulty]}${label ? ' · ' + label : ''}${
        s.rivalHp > 1 ? ` · Vida +${Math.round((s.rivalHp - 1) * 100)} %` : ''
      }`,
    };
    const intro: (DialogueLine | CardLine)[] =
      s.kind === 'RIVAL'
        ? RIVAL_INTRO[this.player].map((t) => say(s.rival, 'RIGHT', t))
        : s.kind === 'BOSS'
          ? BOSS_INTRO[this.player].map((t) => say(s.rival, 'RIGHT', t))
          : s.kind === 'MIRROR'
            ? MIRROR_INTRO.map((t) => ({ title: 'SISTEMA DE LA TORRE', color: '#94a3b8', text: t }))
            : [];
    ui.dialogue([card, ...intro], `ARCADE · ${this.name}`, () => this.fight());
  }

  private fight(): void {
    const s = this.steps[this.step];
    this.api.fight(
      {
        p1: this.player,
        p2: s.rival,
        p1Palette: this.palette,
        p2Palette: s.kind === 'MIRROR' ? (this.palette === 0 ? 1 : 0) : 0,
        stage: s.stage,
        difficulty: s.difficulty,
        p2Hp: s.rivalHp,
      },
      (winner, r) => (winner === 0 ? this.won(r) : this.lost())
    );
  }

  private won(r: FightResult): void {
    const s = this.steps[this.step];
    const pts: ScoreBreakdown = scoreFight(r);
    this.score += pts.total;
    const quotes = WIN_QUOTES[this.player];
    const lines: (DialogueLine | CardLine)[] = [
      this.api.say(this.player, 'LEFT', quotes[this.step % quotes.length]),
      {
        title: r.perfect ? '¡PERFECT!' : 'PUNTOS',
        color: '#fde047',
        text: `+${fmt(pts.total)} (base ${fmt(pts.base)}${pts.perfect ? ` + perfect ${fmt(pts.perfect)}` : ''} + tiempo ${fmt(pts.time)} + combo ${fmt(pts.combo)}) · Total ${fmt(this.score)}`,
      },
    ];
    const last = this.step >= this.steps.length - 1;
    this.api.ui.dialogue(lines, s.kind === 'BOSS' ? '¡JEFE DERROTADO!' : 'VICTORIA', () => {
      if (last) this.finish(true);
      else {
        this.step++;
        this.next();
      }
    });
  }

  private lost(): void {
    const { ui, setCountdown } = this.api;
    if (this.continuesLeft <= 0) {
      this.finish(false);
      return;
    }
    let n = 9;
    const retry = () => {
      window.clearInterval(id);
      this.continuesLeft--;
      this.continuesUsed++;
      this.score = applyContinuePenalty(this.score);
      this.fight();
    };
    const quit = () => {
      window.clearInterval(id);
      this.finish(false);
    };
    ui.menu(
      '¿CONTINUAR?',
      [
        { label: 'Continuar', value: `quedan ${this.continuesLeft}`, primary: true, onSelect: retry },
        { label: 'Rendirse', onSelect: quit },
      ],
      { big: String(n), subtitle: 'Cada continuación resta un 10 % de la puntuación\ny el rango máximo pasa a ser A.', onBack: quit }
    );
    const id = window.setInterval(() => {
      n--;
      if (n < 0) quit();
      else ui.setBig(String(n));
    }, 1000);
    setCountdown(id);
  }

  private finish(win: boolean): void {
    const { ui, save, say, exit } = this.api;
    const lines: (DialogueLine | CardLine)[] = [];
    let summary = `Puntuación: ${fmt(this.score)}`;
    if (win) {
      for (const t of ENDINGS[this.player]) lines.push({ speakerId: 'narrator', side: 'LEFT', text: t });
      lines.push(say(this.player, 'LEFT', WIN_QUOTES[this.player][0]));
      const rank = rankFor(this.score, this.steps.length, this.continuesUsed);
      const record = save.setArcadeBest(this.player, this.score, rank);
      save.unlock(`arcade:${this.player}`);
      summary += ` · Rango ${rank}${record ? ' · ¡Nuevo récord!' : ''}`;
      lines.push({ title: `RANGO ${rank}`, color: '#fbbf24', text: summary });
    } else {
      lines.push({ title: 'FIN DEL JUEGO', color: '#94a3b8', text: `${summary} · Llegaste al combate ${this.step + 1} de ${this.steps.length}.` });
    }
    ui.dialogue(lines, win ? 'ARCADE COMPLETADO' : 'ARCADE', () => {
      ui.menu(
        win ? 'ARCADE COMPLETADO' : 'FIN DEL JUEGO',
        [{ label: 'Volver al menú', primary: true, onSelect: exit }],
        { subtitle: summary, onBack: exit }
      );
    });
  }
}
