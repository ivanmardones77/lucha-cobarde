# Fighting 2.5D Starter (Three.js + TypeScript + Claude Skill)

Base determinista para un juego de lucha **2.5D** con simulación 2D pura a **60 FPS fijos** (`src/core/`), renderizado 3D en **Three.js** (`src/view/`), soporte nativo para **mandos y fightsticks** (`src/input/`), y la skill de Claude Code lista en `.claude/skills/fighting-2-5d/SKILL.md`.

## Características incluidas

- **Bucle determinista a 60 FPS** con acumulador de paso fijo (*fixed timestep*).
- **Soporte para mandos (Web Gamepad API)** para 1 o 2 jugadores: compatible con Xbox, PlayStation (DualSense/DualShock), Nintendo Pro Controller y Arcade/Fightsticks (D-Pad + Stick izquierdo con *deadzone* + botones frontales).
- **Input Buffer de 20 frames** con notación numérica (`1`-`9`) normalizada según el *facing* y detección de *motion inputs* (`236` Quarter-Circle Forward).
- **Sistema de colisiones 2D AABB** separado en *Pushbox*, *Hurtbox* y *Hitbox*.
- **Bloqueo (Guard), Blockstun y Chip Damage**:
  - Mantén **Atrás (`4`)** para bloqueo alto/medio.
  - Mantén **Abajo-Atrás (`1`)** para bloqueo agachado (bloquea ataques bajos `LOW`).
- **Proyectiles 2.5D (Hadouken `236 + Ataque`)** con choque entre proyectiles (*clash*).
- **Soporte para modelos `.glb`** con `AnimationMixer` sincronizado al frame lógico exacto (incluye personajes 3D placeholder listos para probar sin assets externos).
- **HUD HTML/CSS** con barras de vida, indicador de mando conectado, contador de combo y visor de *frame data* en vivo.
- **Debug Overlay 2D** sobre la escena 3D (`F1`).

## Instalación y ejecución

```bash
npm install
npm run dev
```

## Controles (Teclado y Mando)

| Acción | Jugador 1 (Teclado / Mando 1) | Jugador 2 (Teclado / Mando 2) |
| :--- | :--- | :--- |
| Moverse / Bloquear | `A` / `D` o **D-Pad / Stick Izq.** | `←` / `→` o **D-Pad / Stick Izq.** |
| Agacharse / Bloqueo bajo | `S` o **Abajo (D-Pad / Stick)** | `↓` o **Abajo (D-Pad / Stick)** |
| Ataque (`5LP` / `2LK` / `236P`) | `J` o **A / B / X / Y (✕ ○ □ △)** | `K` / `Num1` o **A / B / X / Y** |
| Reiniciar combate | `R` o **Start / Options** | `R` o **Start / Options** |
| Cajas 2D (Debug) | `F1` | `F1` |
| Panel Frame Data | `F2` | `F2` |

> **Nota sobre navegadores:** Al conectar un mando USB o Bluetooth, pulsa cualquier botón del mando con la ventana del juego activa para que el navegador lo detecte (verás `[Mando 1]` en verde en el HUD).
