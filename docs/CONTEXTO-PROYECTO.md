# CYBER DOJO — Contexto completo del proyecto

Documento de traspaso para continuar el trabajo en otro chat. Estado a 28-11-2026.

---

## 1. Qué es

**CYBER DOJO** es un juego de lucha 2.5D para navegador, de estética cyberpunk nocturna. Lo publica GitHub Pages.

| | |
|---|---|
| Repositorio | https://github.com/ivanmardones77/lucha-cobarde (carpeta local `/Users/ivanmardones/WORK/KITTGAMES/lucha-cobarde`) |
| Juego publicado | https://ivanmardones77.github.io/lucha-cobarde/ |
| Fuentes 3D | `/Users/ivanmardones/WORK/KITTGAMES/lucha-cobarde-3d/<personaje>/` (archivos .blend y carpeta `fuentes/`) |
| Tecnología | TypeScript, Vite, Three.js, WebAudio y PeerJS (online) |
| Guía visual | `docs/personajes/PERSONAJES.md` + `docs/personajes/img/` (20 imágenes; sin commit) |

**Modos:** Arcade, Historia (3 capítulos), Versus CPU, 2 jugadores, Online, Entrenamiento y Controles.

**Escenarios:** `ALLEY` (callejón) y `ROOFTOP` (azotea).

**Luchadores:**

| Luchador | Estilo | Color principal / acento |
|---|---|---|
| RYUJIN | Shoto equilibrado | `#0284C7` / `#38BDF8` |
| KAZE | Ninja rushdown | `#BE123C` / `#FB7185` |
| TITAN | Grappler coloso | `#D97706` / `#F59E0B` |
| VALKYRIE | Aero-duelista | `#059669` / `#34D399` |
| VOLT | Electro-zoner | `#6D28D9` / `#A855F7` |

---

## 2. Reglas de trabajo acordadas

- **Antes de gastar créditos de Magnific, consultar el coste.**
- **Cada PR se fusiona solo con la aprobación del usuario.** "Sí, en verde" significa: fusionar cuando el CI esté en verde. No fusionar sin preguntar; una vez el clasificador de permisos bloqueó una fusión automática.
- El flujo de trabajo es: rama → PR → check de CI "Tipos, test y build" → fusión → `deploy.yml` publica en Pages.
- Antes de abrir un PR: `npx tsc --noEmit -p .`, `npm test` y `npm run build`.
  - `npm test` ejecuta las pruebas de determinismo, rollback, campaña y online.
- Para probar en local hay un servidor de desarrollo (preview `lucha-dev`) en el puerto 3000.
- **Codex:** el plugin local está desactivado (`"codex@openai-codex": false` en `~/.claude/settings.json`). Los emails vienen de la app de GitHub "ChatGPT Codex Connector"; para que paren, el usuario tiene que desinstalarla desde GitHub. El usuario sigue usando Codex aparte para generar imágenes.

---

## 3. Arquitectura del código

### Núcleo determinista (`src/core/`)
- Simulación con paso fijo (`FIXED_DT = 1/60`). `MatchState` contiene el generador aleatorio (PRNG) y `hashState` resume el estado en un hash.
- El núcleo no usa trigonometría ni `Math.random`, para que sea determinista.
- `rollback.ts` define `RollbackSession`: guarda instantáneas, confirma inputs y re-simula. Permite volver hasta 8 frames (`maxRollback`) y tiene `stateHashAfter(frame)`.
- **Ritmo de juego** (más lento que al principio, "tempo de juego de lucha"):
  - `AIR_TIME_SCALE = 0.78` y `JUMP_TIME_SCALE = 0.62`.
  - Multiplicadores: caminar ×0.5, dash adelante ×0.55, dash atrás ×0.6, proyectil ×0.75, velocidad vertical del salto ×0.8.
  - Los normales emiten el sonido `swing` (`NORMALS_WITH_SWING`).

### Vista 3D (`src/view/`)
- `SceneView3D.ts`: los modelos GLB se usan por defecto (`?sin3d` los desactiva) y se precargan. Mientras cargan no se ve el muñeco primitivo, ni sus estelas.
- `GlbFighter.ts`: luchador 3D genérico.
  - Tipos: `GlbSpec {url, height, moves, heavy, block}` y `GlbMove {clip, impact?, start?}`.
  - Ajusta la duración de la animación (time-warp) para que el frame de impacto coincida con el arranque del golpe.
- `glbSpecs.ts`: tabla de clips por personaje. Los ataques aéreos usan `M_AIRPUNCH` y `M_AIRKICK`.
- Modelos: `src/assets/models/{titan,ryujin,kaze,valkyrie,volt}.glb`, de 3 a 4,6 MB cada uno.
  - Clips: IDLE, WALK_F, M_*, CROUCH, JUMP, JUMP_TUCK, HIT_HIGH, HIT_BODY, M_AIRKICK, M_AIRPUNCH, KNOCKDOWN, entre otros.

### Audio (`src/audio/SoundEngine.ts`)
- Motor de samples sobre WebAudio: elige entre variaciones, varía un poco la velocidad de cada reproducción y, si falta un sample, lo sintetiza.
- 46 MP3 en `src/assets/audio/`:
  - Golpes, bloqueos, swings y dash.
  - Locutor en inglés: round1/2/final, fight, ko, perfect, timeover, youwin.
  - Sonidos de menú: `uiMove`, `uiConfirm`, `uiBack`, `uiStart`.

### Campaña (`src/campaign/` y `src/view/CampaignUI.ts`)
- `CampaignRunner` encadena los nodos `DIALOGUE`, `MATCH` y `UNLOCK`, con autoguardado y continuaciones en Arcade.
- `CampaignUI` muestra diálogos de estilo novela visual: texto tipo máquina de escribir, botón Saltar, y control por teclado, mando y táctil.
- **Último cambio (PR #24):**
  - Los retratos fijos pasaron a ser sprites animados (`src/view/storySprites.ts` y `src/assets/images/story/*.webp`, 2,3 MB). Cada hoja es una cuadrícula de 4×4 viñetas de 384×512, con el apoyo de los pies en (192, 492). Viñetas 0–7: reposo a 5 fps; viñetas 8–15: hablando a 7 fps.
  - Cada sprite se voltea para mirar al centro. El que habla usa las viñetas de hablar mientras se escribe su frase, se ilumina y pasa delante.
  - Fondos ilustrados `bg_alley.webp` y `bg_rooftop.webp`, mostrados con `campaignUI.setScene(stage)`; el escenario 3D vuelve al empezar el combate.

### Online (`src/net/`)
- PeerJS con el broker público gratuito, conexión WebRTC directa. Supabase se descartó porque el usuario no puede crear más organizaciones.
- La sala se crea con un código de 4 letras; el id del anfitrión es `cyberdojo-<código>`.
- Dos canales: `game` (no fiable, para los inputs) y `ctrl` (fiable, para elegir luchador, empezar, revancha, etc.).
- `OnlineMatch.ts`:
  - Retraso de entrada de 2 frames y rollback de hasta 8.
  - Reenvía los últimos 16 frames de input, codificados en 9 bits.
  - Predice el input del rival, espera si va más de 8 frames adelantado y sincroniza el ritmo con la ventaja de frames.
  - Compara un hash del estado cada 60 frames para detectar desincronías.
- `?netlocal` permite probar con dos pestañas del mismo navegador (BroadcastChannel).
- **Probado:** dos pestañas sin ningún desajuste de hash; los tests simulan 0, 100 y 150 ms con un 10 % de pérdida de paquetes.
- **Sin probar:** la revancha y el cambio de luchador online en el navegador, y el ping real entre redes distintas. No hay servidor TURN, así que algunas redes muy cerradas no conectarán.

---

## 4. Pipeline de modelos 3D (para repetirlo)

Coste aproximado por personaje: **unos 2.175 créditos de Magnific.**

1. Generar la hoja de vistas del personaje (turnaround) con `images_character_sheet`.
2. Recortar las vistas y, si hace falta, quitar el fondo con `images_remove_background`.
3. Generar el modelo con `models3d_generate`, modelo `hunyuan-v3.1-pro`: 1.070 créditos. A veces da "Downstream service unavailable"; en ese caso no cobra y se puede reintentar.
4. En Blender:
   - Soldar las costuras exactas (`remove_doubles 0.00002`).
   - Reducir la malla a 60.000 triángulos (Meshy rechaza 500.000).
   - Escalar y exportar a GLB.
5. Subir el GLB y riggear con `models3d_rig` (meshy): 120 créditos.
6. Animar con `models3d_animate` a 60 fps: 120 créditos por animación. Ids del catálogo de Meshy:
   - 21 walk, 192 jab, 209 kick, 217 sweep, 194 uppercut
   - 125 Charged_Spell_Cast, 127 Charged_Ground_Slam, 138 Block1
   - 421 Over_Shoulder_Throw, 422 Rising_Flying_Kick, 455 Sweep_Kick
7. Postproceso en Blender, en modo headless por línea de comandos (la interfaz gráfica se colgaba):
   - Asignar `action_slot` a cada clip y quitar el desplazamiento de raíz (las caderas solo conservan el movimiento vertical).
   - Quitar el giro de las caderas en el slam.
   - El IDLE se construye desde la guardia (M_BLOCK) más una respiración.
   - Reacciones a golpes, salto con encogido y ataques aéreos hechos a mano desde la guardia (`fix_anims.py`).
   - Usar `bash -c` en lugar de zsh para los scripts, por un problema de separación de palabras.
8. ActionForge se probó y se abandonó. Se usó el pack CC0 de Quaternius para algunos retargets.

Valkyrie no tiene alas, capa ni lanza en 3D. Volt no tiene rayos y lleva la chaqueta ajustada.

---

## 5. Ideas de mejora pendientes (lista que se propuso)

- La paleta alternativa todavía no tiñe los modelos 3D.
- Pulir algunas animaciones más si se detectan fallos.
- Online:
  - Probar la revancha y el cambio de luchador con dos personas reales.
  - Valorar un servidor TURN gratuito.
- Commit de `docs/personajes/` si se quiere guardar en el repo.

---

## 6. Tarea en curso: cinemáticas del modo historia

El usuario no está contento con las animaciones actuales de diálogo. Las hojas de Codex deforman la imagen en lugar de cambiar de pose: parece un idle mal hecho y el personaje "flota". Ha pedido a Codex lo siguiente:

> Quiero mejorar mucho las animaciones, ahora es un idle mal hecho y se deforma el personaje. Es mejor crear varias escenas durante el diálogo. Con cambios de plano estilo anime. Con primeros planos viendo cómo gesticulan los personajes. Movimientos de cámara. Planos cinematográficos en la escena. Una animática como si fueran intros de grandes juegos que usan el 2.5D y el parallax.

**Formato recomendado para que se pueda integrar en el juego** (pedírselo así a Codex):

1. **Capas separadas en PNG transparente por escena:** fondo lejano, medio, personajes y primer plano (lluvia, cables, neones). El parallax depende de que las capas vengan separadas.
2. **Bustos en primer plano por personaje con varias expresiones** (neutral, enfado, sonrisa, sorpresa), dibujados como poses distintas, nunca deformados. Para que hablen, 2 o 3 bocas (cerrada, entreabierta, abierta) como capa aparte.
3. **Guion de planos en JSON** que indique por cada frase del diálogo:
   - el plano (general, medio, primer plano, contraplano);
   - las capas que lleva;
   - el movimiento de cámara (zoom y posición de inicio y fin, duración, suavizado);
   - la expresión de cada personaje.
4. **Mismo tamaño de lienzo y punto de apoyo** en todas las imágenes del mismo tipo.

Con capas más guion se reproduce dentro del juego de forma interactiva: avanza con cada frase, se puede saltar y funciona en móvil. Un vídeo ya montado solo serviría como cinemática cerrada.

**Encaje en el código:** sustituir o ampliar `CampaignUI` (capa `.cg-scene` y actores `.cg-portrait`). Los textos de los capítulos están en `src/campaign/` (`story.ts` y `data/`). Cada nodo DIALOGUE tiene `lines` con `speakerId`, `side` y `text`, y opcionalmente `stageId`.

**Entrega anterior de Codex** (ya integrada en el PR #24), como referencia:
- Zip `~/Documents/ChatGPT/PLAYABLES/cyber-dojo-historia.zip`.
- Contenía las hojas de sprites, `sprites.json`, fondos y un visor web.
- Ryujin y Volt miran a la derecha; Kaze, Valkyrie y Titan, a la izquierda.

---

## 7. Historial de PRs (todos fusionados)

| PR | Contenido |
|---|---|
| #5–#16 | Modelos 3D de los cinco luchadores, tempo, sonido, locutor y sonidos de menú |
| #17–#20 | Modelos 3D por defecto, precarga, sin muñeco primitivo ni sus estelas |
| #21 | Reacciones, salto y ataques aéreos corregidos |
| #22 | Online fase 1: salas con código (PeerJS) |
| #23 | Online fase 2: combate con rollback |
| #24 | Historia: sprites animados y fondos ilustrados |
