import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS, type FighterState } from '../core/types';

/**
 * PRUEBA DE CONCEPTO: luchador como modelo GLB con esqueleto y animaciones.
 *
 * El tiempo de cada clip sale del estado de la simulación (nunca del reloj), así que
 * encaja con la pausa por impacto, la cámara lenta y el rollback:
 *  · IDLE / WALK_F / CROUCH en bucle según el frame global (WALK_B = WALK_F al revés).
 *  · Cada golpe usa el clip de su tabla, retemporizado para que el frame de máximo
 *    alcance del clip caiga justo en el frame de impacto (startup) del golpe.
 *  · Impactos, derribo, agachado y salto vienen del pack CC0 de Quaternius redirigido al esqueleto.
 */

const TURN_TO_CAMERA = 0.38; // gira un poco hacia la cámara para que se lea el volumen

/**
 * Clip de un golpe. `impact` = frame del clip (a 60 fps) con el golpe a máximo alcance;
 * `start` = frame donde arranca (se salta la pose relajada inicial). Sin `impact`, tiempo directo.
 */
export interface GlbMove {
  clip: string;
  impact?: number;
  start?: number;
}

export interface GlbSpec {
  url: string;
  height: number; // altura en el juego, en metros
  moves: Partial<Record<string, GlbMove>>;
  heavy: GlbMove; // golpes sin entrada propia
  block?: { clip: string; hold: number }; // pose de bloqueo de pie (frame del clip)
  springs?: GlbSpring[]; // pelo, coletas, bufandas: movimiento secundario solo visual
}

/**
 * Cadena de huesos con muelle (pelo, coleta...). Huesos ordenados de la raíz a la punta,
 * sin pistas en los clips. Solo afecta a la vista: no toca la simulación ni el rollback.
 */
export interface GlbSpring {
  bones: string[];
  stiffness?: number; // 0..1 por frame: cuánto vuelve a la pose animada (más = más rígido)
  damping?: number; // 0..1 por frame: cuánto frena (más = menos rebote)
  gravity?: number; // m/s², hacia abajo
  maxAngle?: number; // radianes que puede separarse cada hueso de su pose animada
}

interface SpringLink {
  bone: THREE.Bone;
  rest: THREE.Quaternion; // rotación local de reposo (los clips no la animan)
  tailLocal: THREE.Vector3; // punta del hueso en su espacio local
  p: THREE.Vector3; // punta simulada (mundo)
  prev: THREE.Vector3;
}

interface SpringChain {
  cfg: Required<Omit<GlbSpring, 'bones'>>;
  links: SpringLink[];
}

const _head = new THREE.Vector3();
const _target = new THREE.Vector3();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qIdentity = new THREE.Quaternion();
const _inv = new THREE.Matrix4();
const SPRING_DT = 1 / 60;

interface Template {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

const loader = new GLTFLoader();
const templates = new Map<string, Promise<Template>>();

/** Empieza a descargar un modelo para que esté listo antes del combate. */
export function preloadGlb(url: string): void {
  void loadTemplate(url).catch(() => undefined);
}

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
  private springs: SpringChain[] = [];
  private springFrame = -1; // último frame de la simulación aplicado a los muelles
  ready = false;
  failed = false; // si el modelo no carga, la escena vuelve a enseñar el muñeco

  constructor(private spec: GlbSpec) {
    this.root.visible = false;
    loadTemplate(spec.url).then((t) => this.build(t)).catch((e) => {
      this.failed = true;
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
    const s = this.spec.height / h;
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
    this.buildSprings(model);
    this.ready = true;
  }

  private buildSprings(model: THREE.Object3D): void {
    for (const s of this.spec.springs ?? []) {
      const bones = s.bones.map((n) => model.getObjectByName(n) as THREE.Bone | undefined);
      if (bones.some((b) => !b)) {
        console.warn('[GlbFighter] faltan huesos del muelle', s.bones);
        continue;
      }
      const links = (bones as THREE.Bone[]).map((bone, i, all) => {
        // La punta es el siguiente hueso; el último repite el largo del anterior
        const next = all[i + 1];
        const tailLocal = next ? next.position.clone() : bone.position.clone();
        return { bone, rest: bone.quaternion.clone(), tailLocal, p: new THREE.Vector3(), prev: new THREE.Vector3() };
      });
      this.springs.push({
        cfg: {
          stiffness: s.stiffness ?? 0.15,
          damping: s.damping ?? 0.2,
          gravity: s.gravity ?? 2,
          maxAngle: s.maxAngle ?? 0.6,
        },
        links,
      });
    }
  }

  /**
   * Avanza los muelles un paso por frame de la simulación. Quietos durante la pausa por impacto;
   * si el frame retrocede o salta (rollback, revancha) vuelven a la pose animada.
   */
  private updateSprings(globalFrame: number, hitstop: number): void {
    if (!this.springs.length || !this.model) return;
    let steps = globalFrame - this.springFrame;
    const reset = this.springFrame < 0 || steps < 0 || steps > 30;
    this.springFrame = globalFrame;
    if (hitstop > 0 && !reset) steps = 0;
    steps = reset ? 1 : Math.min(steps, 4);
    this.model.updateMatrixWorld(true);
    for (const ch of this.springs) {
      const { stiffness, damping, gravity, maxAngle } = ch.cfg;
      for (const L of ch.links) {
        const b = L.bone;
        b.quaternion.copy(L.rest);
        b.updateMatrixWorld(true);
        b.getWorldPosition(_head);
        _target.copy(L.tailLocal).applyMatrix4(b.matrixWorld);
        const len = _target.distanceTo(_head);
        if (reset) {
          L.p.copy(_target);
          L.prev.copy(_target);
        }
        for (let k = 0; k < steps; k++) {
          _v.subVectors(L.p, L.prev).multiplyScalar(1 - damping);
          L.prev.copy(L.p);
          L.p.add(_v).addScaledVector(_a.subVectors(_target, L.p), stiffness);
          L.p.y -= gravity * SPRING_DT * SPRING_DT;
          L.p.sub(_head).setLength(len).add(_head); // largo fijo
        }
        // Gira el hueso hacia la punta simulada (en su espacio local), con un tope de ángulo
        _inv.copy(b.matrixWorld).invert();
        _a.copy(L.tailLocal).normalize();
        _b.copy(L.p).applyMatrix4(_inv).normalize();
        _q.setFromUnitVectors(_a, _b);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
        if (ang > maxAngle) {
          _q.slerpQuaternions(_qIdentity, _q, maxAngle / ang);
          // la punta simulada se queda en el tope para no acumular energía
          L.p.copy(L.tailLocal).applyQuaternion(_q).applyMatrix4(b.matrixWorld);
        }
        b.quaternion.multiply(_q);
        b.updateMatrixWorld(true);
      }
    }
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

  sync(f: FighterState, globalFrame: number, hitstop = 0): void {
    this.syncPose(f, globalFrame);
    if (this.ready) this.updateSprings(globalFrame, hitstop);
  }

  private syncPose(f: FighterState, globalFrame: number): void {
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
      case 'BLOCK_STAND':
        if (this.spec.block) this.play(this.spec.block.clip, this.spec.block.hold / 60);
        else this.play('IDLE', loopT('IDLE'));
        break;
      case 'CROUCH':
      case 'BLOCK_CROUCH':
        this.play('CROUCH', loopT('CROUCH'));
        break;
      case 'JUMP':
        this.play(this.actions.has('JUMP_TUCK') ? 'JUMP_TUCK' : 'JUMP', t);
        break;
      case 'HITSTUN':
        // Alterna cabeza / pecho según el golpe para que dos impactos seguidos no se vean iguales
        // Reacciones hechas desde la guardia del personaje (si el GLB las trae)
        if (this.actions.has('HIT_HIGH')) this.play(f.comboCount % 2 === 0 ? 'HIT_HIGH' : 'HIT_BODY', t);
        else this.play(f.comboCount % 2 === 0 ? 'HIT_CHEST' : 'HIT_HEAD', t);
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
      case 'ATTACK': {
        const mv = (f.moveId && this.spec.moves[f.moveId]) || this.spec.heavy;
        if (mv.impact === undefined) {
          this.play(mv.clip, t);
        } else {
          const startup = (f.moveId && CHARACTERS[f.character].moves[f.moveId]?.startup) || 10;
          const hit = mv.impact / 60;
          const from = (mv.start ?? 0) / 60;
          this.play(
            mv.clip,
            f.stateFrame <= startup ? from + (f.stateFrame / startup) * (hit - from) : hit + (f.stateFrame - startup) / 60
          );
        }
        break;
      }
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
