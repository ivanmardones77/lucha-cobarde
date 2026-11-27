// Campaña: escalera de Arcade, puntuación/rango, guardado y estructura de los capítulos.
// Ejecutar: npm test
import { ROSTER, applyContinuePenalty, buildLadder, rankFor, scoreFight } from '../src/campaign/arcade';
import { ARCADE_BOSS, ARCADE_RIVAL, BOSS_INTRO, ENDINGS, RIVAL_INTRO, WIN_QUOTES } from '../src/campaign/data/arcadeText';
import { CHAPTERS } from '../src/campaign/data/chapters';
import { SAVE_VERSION, SaveGame } from '../src/campaign/save';
import { backdropFor, validateChapter } from '../src/campaign/story';

let bad = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    console.log(`  FALLA ${msg}`);
    bad++;
  }
};

console.log('Escalera de Arcade:');
for (const p of ROSTER) {
  const l = buildLadder(p);
  check(l.length === 5, `${p}: 5 combates`);
  check(l[2].kind === 'MIRROR' && l[2].rival === p, `${p}: combate 3 es el espejo`);
  check(l[3].kind === 'RIVAL' && l[3].rival === ARCADE_RIVAL[p], `${p}: combate 4 es su rival`);
  check(l[4].kind === 'BOSS' && l[4].rival === ARCADE_BOSS[p] && l[4].difficulty === 'MASTER', `${p}: combate 5 es el jefe en Maestro`);
  check(l[4].rivalHp > 1 && l[4].rivalHp <= 1.5, `${p}: jefe con ventaja moderada de vida`);
  check(l.slice(0, 2).every((s) => s.difficulty === 'NORMAL'), `${p}: empieza en Normal`);
  check(l[0].rival !== p && l[1].rival !== p, `${p}: los dos primeros no son espejo`);
  check(ARCADE_RIVAL[p] !== p && ARCADE_BOSS[p] !== p && ARCADE_RIVAL[p] !== ARCADE_BOSS[p], `${p}: rival y jefe distintos`);
  check((RIVAL_INTRO[p]?.length ?? 0) > 0 && (BOSS_INTRO[p]?.length ?? 0) > 0, `${p}: intros de rival y jefe`);
  check((WIN_QUOTES[p]?.length ?? 0) >= 3 && (ENDINGS[p]?.length ?? 0) > 0, `${p}: frases de victoria y final`);
  console.log(`  ${p}: ${l.map((s) => `${s.rival}(${s.difficulty[0]})`).join(' → ')}`);
}

console.log('Puntuación y rango:');
const s = scoreFight({ difficulty: 'HARD', perfect: true, secondsLeft: 42.7, maxCombo: 5 });
check(s.base === 2000 && s.perfect === 1500 && s.time === 420 && s.combo === 500 && s.total === 4420, 'desglose de puntos');
check(rankFor(5 * 3700, 5, 0) === 'S', 'media 3700 → S');
check(rankFor(5 * 3700, 5, 1) === 'A', 'con continuaciones el máximo es A');
check(rankFor(5 * 2100, 5, 0) === 'B' && rankFor(5 * 1000, 5, 0) === 'C', 'B y C');
check(applyContinuePenalty(10000) === 9000, 'continuar resta un 10 %');
console.log('  ok');

console.log('Guardado:');
const mem = new Map<string, string>();
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
const a = new SaveGame(store);
a.setNode('cap1-lluvia', 2);
check(a.setArcadeBest('KAZE', 12000, 'A') === true, 'primer récord');
check(a.setArcadeBest('KAZE', 9000, 'B') === false, 'una puntuación peor no sustituye al récord');
const b = new SaveGame(store);
check(b.chapter('cap1-lluvia').node === 2, 'se retoma el capítulo en el nodo guardado');
check(b.arcadeBest('KAZE')?.score === 12000, 'el récord persiste');
b.finishChapter('cap1-lluvia');
check(new SaveGame(store).chapter('cap1-lluvia').done, 'capítulo completado persiste');
mem.set('cyberdojo.save', JSON.stringify({ saveVersion: SAVE_VERSION + 1, chapters: { x: { done: true, node: 0 } } }));
check(!new SaveGame(store).chapter('x').done, 'un guardado de otra versión se descarta');
mem.set('cyberdojo.save', '{roto');
check(new SaveGame(store).chapter('cap1-lluvia').node === 0, 'un guardado corrupto no rompe nada');
check(new SaveGame(null).chapter('a').node === 0, 'sin almacenamiento también funciona');
console.log('  ok');

console.log('Capítulos de historia:');
const ids = new Set<string>();
for (const ch of CHAPTERS) {
  for (const e of validateChapter(ch)) check(false, e);
  check(!ids.has(ch.id), `${ch.id}: id repetido`);
  ids.add(ch.id);
  check(backdropFor(ch, 0) !== undefined, `${ch.id}: tiene escenario de fondo`);
  console.log(`  ${ch.id}: ${ch.nodes.map((n) => n.type).join(' → ')}`);
}

if (bad) {
  console.log('CAMPAÑA FALLA');
  process.exit(1);
}
console.log('CAMPAÑA OK');
