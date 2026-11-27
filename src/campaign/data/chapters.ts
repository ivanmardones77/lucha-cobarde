/**
 * Capítulos del Modo Historia. Se juegan en orden; cada uno desbloquea el siguiente.
 * Para añadir uno: copia un bloque, cambia el id y npm test comprobará la estructura.
 */
import type { Chapter } from '../story';

export const CHAPTERS: Chapter[] = [
  {
    id: 'cap1-lluvia',
    title: 'Lluvia en la Ciudad Baja',
    summary: 'Ryujin protege el Núcleo del dojo de una ladrona enmascarada.',
    nodes: [
      {
        type: 'DIALOGUE',
        skippable: true,
        stageId: 'ALLEY',
        lines: [
          { speakerId: 'narrator', side: 'LEFT', text: 'Ciudad Baja, 3:12 de la madrugada. Lleva once días sin parar de llover.' },
          { speakerId: 'narrator', side: 'LEFT', text: 'Bajo el neón del callejón late el Núcleo Ryū: el estilo entero del Dojo Nocturno, guardado en un cristal.' },
          { speakerId: 'RYUJIN', side: 'LEFT', text: 'Sé que estás ahí. La lluvia no cae igual sobre alguien que no quiere ser visto.' },
          { speakerId: 'KAZE', side: 'RIGHT', text: 'Buen oído, heredero. Entonces sabrás también a qué he venido.' },
          { speakerId: 'RYUJIN', side: 'LEFT', text: 'El Núcleo no sale de este dojo. Ni por las buenas ni por las malas.' },
          { speakerId: 'KAZE', side: 'RIGHT', text: 'Prefiero las malas. Son más rápidas.' },
        ],
      },
      { type: 'MATCH', playerCharacter: 'RYUJIN', opponentCharacter: 'KAZE', stageId: 'ALLEY', aiDifficulty: 'NORMAL', retryable: true },
      {
        type: 'DIALOGUE',
        skippable: true,
        lines: [
          { speakerId: 'KAZE', side: 'RIGHT', text: 'Tch… Pegas como tu maestro. Me habían dicho que estaba muerto.' },
          { speakerId: 'RYUJIN', side: 'LEFT', text: '¿Quién te ha enviado?' },
          { speakerId: 'KAZE', side: 'RIGHT', text: 'La Torre Kurogane. Y no soy la única: su campeón ya está en camino.' },
          { speakerId: 'KAZE', side: 'RIGHT', text: 'Un consejo gratis, heredero: no esperes a que llamen a tu puerta.' },
        ],
      },
      { type: 'UNLOCK', reward: { key: 'story:cap1', text: 'Capítulo 2 desbloqueado: «Corriente cruzada».' } },
    ],
  },
  {
    id: 'cap2-corriente',
    title: 'Corriente cruzada',
    summary: 'Volt asalta la azotea de la Torre para sacar a la luz sus planes.',
    nodes: [
      {
        type: 'DIALOGUE',
        skippable: true,
        stageId: 'ROOFTOP',
        lines: [
          { speakerId: 'narrator', side: 'LEFT', text: 'Torre Kurogane, helipuerto del piso 200. La antena de emergencia apunta a toda la ciudad.' },
          { speakerId: 'VOLT', side: 'LEFT', text: 'Tres minutos de señal y todo el mundo sabrá lo que planeáis hacer con el dojo.' },
          { speakerId: 'VALKYRIE', side: 'RIGHT', text: 'No tendrás ni treinta segundos. Aléjate de la antena.' },
          { speakerId: 'VOLT', side: 'LEFT', text: 'La jefa de seguridad en persona. ¿Sabes siquiera a quién proteges?' },
          { speakerId: 'VALKYRIE', side: 'RIGHT', text: 'Protejo el orden. Y ahora mismo, el desorden eres tú.' },
        ],
      },
      { type: 'MATCH', playerCharacter: 'VOLT', opponentCharacter: 'VALKYRIE', stageId: 'ROOFTOP', aiDifficulty: 'HARD', retryable: true },
      {
        type: 'DIALOGUE',
        skippable: true,
        lines: [
          { speakerId: 'VOLT', side: 'LEFT', text: 'Toma. Míralo tú misma antes de llamar a nadie.' },
          { speakerId: 'narrator', side: 'LEFT', text: 'En la pantalla: órdenes de derribo del Dojo Nocturno, firmadas para esta misma semana.' },
          { speakerId: 'VALKYRIE', side: 'RIGHT', text: 'Esto… no es orden. Es una demolición.' },
          { speakerId: 'VALKYRIE', side: 'RIGHT', text: 'Titán sube esta noche al helipuerto. Si de verdad quieres pararlo, no lo harás solo.' },
        ],
      },
      { type: 'UNLOCK', reward: { key: 'story:cap2', text: 'Capítulo 3 desbloqueado: «El Coloso de la Torre».' } },
    ],
  },
  {
    id: 'cap3-coloso',
    title: 'El Coloso de la Torre',
    summary: 'Ryujin sube a la cima de la Torre para enfrentarse a Titán.',
    nodes: [
      {
        type: 'DIALOGUE',
        skippable: true,
        stageId: 'ROOFTOP',
        lines: [
          { speakerId: 'KAZE', side: 'RIGHT', text: 'Los ascensores de servicio están abiertos. De nada.' },
          { speakerId: 'VOLT', side: 'RIGHT', text: 'Y las cámaras, en bucle. Tienes el helipuerto para ti solo.' },
          { speakerId: 'RYUJIN', side: 'LEFT', text: 'No del todo solo.' },
          { speakerId: 'TITAN', side: 'RIGHT', text: 'El último alumno del Dojo Nocturno. Tu maestro también subió hasta aquí.' },
          { speakerId: 'TITAN', side: 'RIGHT', text: 'Dame el Núcleo y te dejaré bajar andando.' },
          { speakerId: 'RYUJIN', side: 'LEFT', text: 'El estilo del dojo no se compra, Titán. Se gana.' },
        ],
      },
      { type: 'MATCH', playerCharacter: 'RYUJIN', opponentCharacter: 'TITAN', stageId: 'ROOFTOP', aiDifficulty: 'MASTER', opponentHp: 1.3, retryable: true },
      {
        type: 'DIALOGUE',
        skippable: true,
        lines: [
          { speakerId: 'TITAN', side: 'RIGHT', text: 'Imposible… La armadura estaba calculada para cualquier estilo.' },
          { speakerId: 'RYUJIN', side: 'LEFT', text: 'Para cualquier estilo que ya existiera. El mío lo estoy aprendiendo todavía.' },
          { speakerId: 'VALKYRIE', side: 'RIGHT', text: 'Seguridad de la Torre: las órdenes de derribo quedan anuladas. Por mí.' },
          { speakerId: 'narrator', side: 'LEFT', text: 'Al amanecer deja de llover sobre la Ciudad Baja. El Dojo Nocturno abre sus puertas.' },
        ],
      },
      { type: 'UNLOCK', reward: { key: 'story:done', text: '¡Historia completada! Gracias por jugar a CYBER DOJO.' } },
    ],
  },
];
