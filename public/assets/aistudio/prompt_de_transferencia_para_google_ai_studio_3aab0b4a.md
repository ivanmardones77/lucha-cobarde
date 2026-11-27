# Prompt de Transferencia — Cyber Dojo 2.5D (Google AI Studio)

Adjunto/pego el archivo `fighting-2-5d.html` de mi proyecto **Cyber Dojo 2.5D**, un prototipo jugable de juego de lucha 2.5D hecho en un único archivo HTML con **Three.js (r128)**, **Tailwind CSS** y **Web Audio API**.

Quiero que continúes el desarrollo de este proyecto respetando de forma estricta su arquitectura actual y sin romper ninguna mecánica existente.

## 1. Reglas de Arquitectura Obligatorias (2.5D Fighting Game)
1. **Separación estricta Lógica 2D / Visual 3D:** Toda la simulación de combate ocurre en el plano 2D (ejes X e Y, con Z = 0). Three.js (`SceneView3D` y `FighterRig3D`) es únicamente la capa de presentación.
2. **Determinismo a 60 FPS fijos:** La simulación avanza mediante un acumulador de paso fijo (`FIXED_DT = 1 / 60`). **Nunca** uses `deltaTime` variable para *startup*, *active*, *recovery*, *hitstop*, *hitstun*, *blockstun*, *i-frames* o ventanas de cancelación; todo se mide en **frames enteros**.
3. **Colisiones AABB 2D puras:** Todas las colisiones usan `aabbIntersects` en 2D con cajas explícitas (`pushbox`, `hurtbox`, `hitbox` y proyectiles). Prohibido usar colliders o físicas 3D para detectar impactos.
4. **Estado serializable:** Mantén el estado mutable del combate dentro de `matchState` para que en el futuro sea compatible con *Rollback Netcode*.

## 2. Estado Actual del Proyecto (Ya Implementado)
- **Núcleo de combate:**
  - *Input Buffer* circular de 20 frames con notación numérica (`1`–`9`) relativa al *facing*.
  - Botones: **P (Puño)** (`5P`, `2P`, `j.P`), **K (Patada)** (`5K`, `2K` barrido *LOW*, `j.K`), **T (Agarre)** con ventana de *Throw Tech* de 6 frames, **S (Super Art)** y **Dash**.
  - *Motion inputs*: `236P` (Hadouken con *Clash* entre proyectiles), `623P` (Uppercut antiaéreo con *i-frames* F1–F7), `236K` (Patada giratoria multi-hit tipo *Tatsumaki*) y `SUPER` (3 impactos + *Super Flash* cinemático).
  - *Dashes*: *Forward Dash* (`66` o botón Dash, cancelable en ataque tras F4) y *Backdash* (`44`, con 6F de *i-frames* y destello visual).
  - Bloqueo alto (`4`) y agachado (`1`), ataques aéreos *OVERHEAD*, cancelaciones de normales a especiales/Super, escalado de daño y *hitstun decay* en combos, derribos (*knockdown*) con *wake-up i-frames*, y rondas al mejor de 3 con reloj de 99s.
- **Modos, Controles y Depuración:**
  - Modos: **VS IA** (con retraso de reacción humano simulado y *footsies*), **2P Local** y **Entrenamiento** (opciones de *Dummy* + regeneración automática).
  - Controles: Teclado (1P y 2P), **Web Gamepad API** (Xbox / PS / Fightstick para 1 o 2 mandos) y controles **multitáctiles** (`D-Pad` deslizante + botonera arcade con botón `📱 TOUCH`).
  - Depuración: Cajas 2D (`F1`) y panel de *Frame Data* + *Frame Meter* de 60 frames + visor de *Input Buffer* (`F2`).
  - Audio: Efectos procedimentales con Web Audio API y botón de silencio.

## 3. Cómo trabajar a partir de ahora
- Conserva todas las funciones, controles y estilos existentes salvo que te pida cambiarlos explícitamente.
- Antes de proponer cambios grandes, dime si prefieres mantenerlo en un solo archivo HTML o migrarlo a un proyecto modular (Vite + TypeScript).
- Confirma que has leído el código de `fighting-2-5d.html` y dime qué mejoras propones o pregúntame cuál es la siguiente función que quiero añadir.