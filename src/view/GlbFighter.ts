import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS, type FighterState } from '../core/types';

/**
 * PRUEBA DE CONCEPTO: luchador como modelo GLB con esqueleto y animaciones.
 *
 * El tiempo de cada clip sale del estado de la simulación (nunca del reloj), así que
 * encaja con la pausa por impacto, la cámara lenta y el rollback:
 *  · IDLE / WALK_F en bucle según el frame global (WALK_B = WALK_F al revés).
 *  · PUNCH_5P = stateFrame / 60: el impacto cae en el frame activo del 5P.
 *  · Golpes pesados = cruzado retemporizado al startup de cada golpe.
 *  · Impactos, derribo, agachado y salto vienen del pack CC0 de Quaternius redirigido al esqueleto.
 */

const MODEL_HEIGHT = 2.0; // altura en el juego (la caja de daño de Titán mide 1,9)
const TURN_TO_CAMERA = 0.38;
const CROSS_IMPACT = 19; // frame (a 60 fps) en el que el cruzado llega al máximo // gira un poco hacia la cámara para que se lea el volumen

interface Template {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

const loader = new GLTFLoader();
const templates = new Map<string, Promise<Template>>();

function loadTemplate(url: string): Promise<Template> {
  let p = templates.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      const clips = new Map<string, THREE.AnimationClip>();
      for (const c of gltf.animations) clips.set(c.name, c);
      return { scene: gltf.scene, clips };
    });
    templates.set(url, p);
  }
  return p;
}

export class GlbFighter {
  readonly root = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private yawTarget = 0;
  ready = false;

  constructor(url: string) {
    this.root.visible = false;
    loadTemplate(url).then((t) => this.build(t)).catch((e) => {
      console.warn('[GlbFighter] no se pudo cargar el modelo', e);
    });
  }

  private build(t: Template): void {
    const model = cloneSkinned(t.scene);
    // Escala por altura con la malla ya deformada por el esqueleto: el esqueleto
    // viene en centímetros, así que la caja de la malla en reposo no sirve
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    model.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) {
        sm.computeBoundingBox();
        box.union(sm.boundingBox!.clone().applyMatrix4(sm.matrixWorld));
      }
    });
    const h = box.max.y - box.min.y || 1;
    const s = MODEL_HEIGHT / h;
    model.scale.setScalar(s);
    // Pies en el origen y centrado sobre el punto de apoyo de la simulación
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.frustumCulled = false; // la caja de la malla en reposo no sigue a la animación
        m.castShadow = true;
      }
    });
    this.root.add(model);
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of t.clips) {
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = true;
      this.actions.set(name, a);
    }
    this.ready = true;
  }

  private play(name: string, time: number): void {
    const a = this.actions.get(name) ?? this.actions.get('IDLE');
    if (!a || !this.mixer) return;
    if (this.current !== a) {
      this.current?.stop();
      a.reset().play();
      a.setEffectiveWeight(1);
      a.paused = true; // el tiempo lo fijamos nosotros
      this.current = a;
    }
    const d = a.getClip().duration || 1;
    a.time = Math.min(Math.max(0, time), d - 1e-4);
    this.mixer.update(0);
  }

  sync(f: FighterState, globalFrame: number): void {
    if (!this.ready) return;
    this.root.visible = true;
    this.root.position.set(f.x, f.y, 0);
    // El modelo mira a +Z en glTF: se gira hacia el rival y un poco hacia la cámara
    this.yawTarget = f.facing === 1 ? Math.PI / 2 - TURN_TO_CAMERA : -Math.PI / 2 + TURN_TO_CAMERA;
    this.root.rotation.y = this.yawTarget;

    const sec = globalFrame / 60;
    const loopT = (name: string) => {
      const d = this.actions.get(name)?.getClip().duration || 1;
      return sec % d;
    };
    const t = f.stateFrame / 60;
    switch (f.state) {
      case 'WALK_F':
      case 'DASH_F':
        this.play('WALK_F', loopT('WALK_F'));
        break;
      case 'WALK_B':
      case 'DASH_B': {
        const d = this.actions.get('WALK_F')?.getClip().duration || 1;
        this.play('WALK_F', d - (sec % d));
        break;
      }
      case 'CROUCH':
      case 'BLOCK_CROUCH':
        this.play('CROUCH', loopT('CROUCH'));
        break;
      case 'JUMP':
        this.play('JUMP', t);
        break;
      case 'HITSTUN':
        // Alterna cabeza / pecho según el golpe para que dos impactos seguidos no se vean iguales
        this.play(f.comboCount % 2 === 0 ? 'HIT_CHEST' : 'HIT_HEAD', t);
        break;
      case 'JUGGLE':
      case 'KNOCKDOWN':
      case 'THROWN':
      case 'DEFEAT':
        this.play('KNOCKDOWN', t);
        break;
      case 'WAKEUP': {
        // Se levanta: el derribo al revés, rápido
        const d = this.actions.get('KNOCKDOWN')?.getClip().duration || 1;
        this.play('KNOCKDOWN', d - t * 3);
        break;
      }
      case 'ATTACK':
        if (f.moveId === '5P' || f.moveId === '2P' || f.moveId === 'jP') {
          this.play('PUNCH_5P', t);
        } else {
          // Golpes pesados: el puño del cruzado llega al máximo en el frame de impacto del golpe
          const startup = (f.moveId && CHARACTERS[f.character].moves[f.moveId]?.startup) || 10;
          const hit = CROSS_IMPACT / 60;
          const ct = f.stateFrame <= startup ? (f.stateFrame / startup) * hit : hit + (f.stateFrame - startup) / 60;
          this.play('PUNCH_CROSS', ct);
        }
        break;
      default:
        this.play('IDLE', loopT('IDLE'));
    }
  }

  hide(): void {
    this.root.visible = false;
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}
