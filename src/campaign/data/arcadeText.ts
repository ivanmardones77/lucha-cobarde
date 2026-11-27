/**
 * Textos del Modo Arcade. Editables sin tocar código.
 *
 * Trasfondo: la Torre Kurogane quiere el Núcleo Ryū, el corazón del Dojo Nocturno.
 * Titán es su campeón; Ryujin, el heredero del dojo; Kaze, una mercenaria a sueldo;
 * Volt, un hacker que quiere sacar a la luz los planes de la Torre; Valkyrie, su jefa
 * de seguridad.
 */
import type { CharacterId } from '../../core/types';

/** Rival temático (penúltimo combate) */
export const ARCADE_RIVAL: Record<CharacterId, CharacterId> = {
  RYUJIN: 'KAZE',
  KAZE: 'RYUJIN',
  VOLT: 'VALKYRIE',
  VALKYRIE: 'VOLT',
  TITAN: 'VOLT',
};

/** Jefe final */
export const ARCADE_BOSS: Record<CharacterId, CharacterId> = {
  RYUJIN: 'TITAN',
  KAZE: 'TITAN',
  VOLT: 'TITAN',
  VALKYRIE: 'TITAN',
  TITAN: 'RYUJIN',
};

/** Lo que dice el rival antes del combate 4 (clave: jugador) */
export const RIVAL_INTRO: Record<CharacterId, string[]> = {
  RYUJIN: [
    'Otra vez tú, heredero. El Núcleo sigue latiendo en tu dojo.',
    'Esta noche me lo llevo… aunque tenga que atravesarte.',
  ],
  KAZE: [
    'Kaze. Sabía que la Torre volvería a mandarte.',
    'Vete ahora y olvidaré que has pisado mi dojo.',
  ],
  VOLT: [
    'Alto. Esta azotea pertenece a la Torre Kurogane.',
    'Tus trucos eléctricos no van a pasar de aquí, Volt.',
  ],
  VALKYRIE: [
    '¡La jefa de seguridad en persona! Qué honor.',
    'Tengo los planos de tu Torre en el bolsillo. Ven a por ellos.',
  ],
  TITAN: [
    'Eres enorme, pero las máquinas también se funden.',
    'Un buen voltaje y te quedas sin campeón.',
  ],
};

/** Lo que dice el jefe antes del combate final (clave: jugador) */
export const BOSS_INTRO: Record<CharacterId, string[]> = {
  RYUJIN: [
    'Así que el último alumno del dojo ha llegado a mi cima.',
    'Tu maestro también subió aquí una vez. No volvió a bajar.',
  ],
  KAZE: [
    'La mercenaria que muerde la mano que le paga.',
    'Te contraté para robar, no para pensar.',
  ],
  VOLT: [
    'Tus filtraciones me han costado tres consejos de administración.',
    'Voy a desconectarte personalmente.',
  ],
  VALKYRIE: [
    '¿Mi propia jefa de seguridad? Decepcionante.',
    'El orden que juraste proteger soy yo.',
  ],
  TITAN: [
    'Has aplastado a todos para llegar hasta mí, Titán.',
    'El estilo del dojo no se compra. Se gana.',
  ],
};

/** Intro del combate espejo (combate 3) */
export const MIRROR_INTRO = [
  'Una copia de combate generada por la Torre con tus propios datos.',
  'Conoce cada uno de tus movimientos. ¿Tú los conoces?',
];

/** Frases de victoria (se van alternando) */
export const WIN_QUOTES: Record<CharacterId, string[]> = {
  RYUJIN: [
    'El dojo sigue en pie mientras yo siga de pie.',
    'Disciplina antes que fuerza. Siempre.',
    'Levántate cuando quieras. Te enseñaré otra vez.',
  ],
  KAZE: [
    'Ni me has visto llegar.',
    'Mi tarifa acaba de subir.',
    'La lluvia borra las huellas. Y a ti también.',
  ],
  TITAN: [
    'Doscientas toneladas de presión. Ni lo has notado.',
    'La Torre no se negocia.',
    'Siguiente.',
  ],
  VALKYRIE: [
    'El cielo es mi terreno.',
    'Orden restaurado.',
    'Mis alas no se rinden.',
  ],
  VOLT: [
    'Cortocircuito confirmado.',
    'Te he dejado sin cobertura.',
    '¿Eso era todo tu voltaje?',
  ],
};

/** Final de cada luchador al completar el Arcade */
export const ENDINGS: Record<CharacterId, string[]> = {
  RYUJIN: [
    'Con Titán derrotado, la Torre Kurogane pierde a su campeón.',
    'Ryujin vuelve al Dojo Nocturno al amanecer y enciende las lámparas una por una.',
    'Por primera vez en años, la puerta del dojo queda abierta para quien quiera aprender.',
  ],
  KAZE: [
    'Kaze cobra el contrato… a la Torre, por las molestias.',
    'Esa noche deja el Núcleo Ryū en la puerta del dojo, envuelto en su bufanda.',
    'Nadie la ve marcharse. Como siempre.',
  ],
  TITAN: [
    'Titán se queda solo en la azotea, con el heredero del dojo a sus pies.',
    'Pero la Torre no aplaude: le exige el Núcleo, y él ya no está seguro de querer dárselo.',
    'Por primera vez, el Coloso se quita el casco y mira la ciudad.',
  ],
  VALKYRIE: [
    'Valkyrie entrega su placa de seguridad y los planos de la Torre a la prensa.',
    'El orden que juró proteger no estaba en el piso 200.',
    'Sus alas se encienden sobre la Ciudad Baja, ahora de patrulla por su cuenta.',
  ],
  VOLT: [
    'La señal de Volt toma todas las pantallas de la ciudad.',
    'Los planes de la Torre Kurogane para arrasar el Dojo Nocturno salen a la luz.',
    'Volt apaga la última pantalla y sonríe: «Ahora sí que hay cobertura».',
  ],
};
