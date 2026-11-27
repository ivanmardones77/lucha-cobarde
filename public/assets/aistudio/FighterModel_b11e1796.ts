import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FighterAction, FighterState } from '../core/types';

export class FighterModel {
  public root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<FighterAction, THREE.AnimationAction>();
  private currentAction: FighterAction | null = null;

  // Placeholder 3D estilizado (se oculta automáticamente si se carga un .glb)
  private placeholderGroup = new THREE.Group();
  private torsoMesh: THREE.Mesh;
  private armMesh: THREE.Mesh;
  private baseColor: number;

  constructor(baseColor: number, glbUrl?: string) {
    this.baseColor = baseColor;

    // Construir placeholder 3D inmediato
    const bodyMat = new THREE.MeshStandardMaterial({ color: baseColor });
    this.torsoMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 1.35, 0.5),
      bodyMat
    );
    this.torsoMesh.position.set(0, 0.9, 0);

    const headMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
    );
    headMesh.position.set(0, 1.82, 0);

    // Visor para indicar claramente hacia dónde mira el personaje
    const visorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.14, 0.46),
      new THREE.MeshStandardMaterial({ color: 0x0f172a })
    );
    visorMesh.position.set(0.18, 1.85, 0);

    // Brazo de ataque
    this.armMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.24, 0.24),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc })
    );
    this.armMesh.position.set(0.35, 1.25, 0.18);

    this.placeholderGroup.add(this.torsoMesh, headMesh, visorMesh, this.armMesh);
    this.root.add(this.placeholderGroup);

    if (glbUrl) {
      this.loadGLB(glbUrl);
    }
  }

  private loadGLB(glbUrl: string): void {
    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        this.placeholderGroup.visible = false;
        this.root.add(gltf.scene);
        this.mixer = new THREE.AnimationMixer(gltf.scene);

        const clipMap: Record<FighterAction, string> = {
          IDLE: 'Idle',
          WALK: 'Walk',
          CROUCH: 'Crouch',
          ATTACK: 'Punch',
          HITSTUN: 'HitReact',
          BLOCKSTUN: 'Block',
        };

        for (const [state, clipName] of Object.entries(clipMap)) {
          const clip = THREE.AnimationClip.findByName(
            gltf.animations,
            clipName
          );
          if (clip) {
            const animAction = this.mixer.clipAction(clip);
            if (
              state === 'ATTACK' ||
              state === 'HITSTUN' ||
              state === 'BLOCKSTUN'
            ) {
              animAction.setLoop(THREE.LoopOnce, 1);
              animAction.clampWhenFinished = true;
            }
            this.actions.set(state as FighterAction, animAction);
          }
        }
      },
      undefined,
      () => {
        // Si no existe el archivo .glb, mantiene el placeholder 3D sin errores
      }
    );
  }

  public sync(state: FighterState): void {
    // 1. Posición estricta en plano 2D (Z = 0)
    this.root.position.set(state.x, state.y, 0);

    // 2. Si hay modelo GLB cargado, rotamos en Y y sincronizamos mixer por frame lógico
    if (this.mixer) {
      this.root.rotation.y = state.facing === 1 ? Math.PI / 2 : -Math.PI / 2;

      if (this.currentAction !== state.action) {
        if (this.currentAction) {
          this.actions.get(this.currentAction)?.stop();
        }
        this.currentAction = state.action;
        this.actions.get(state.action)?.reset().play();
      }

      const anim = this.actions.get(state.action);
      if (anim) {
        this.mixer.setTime(state.actionFrame / 60);
      }
      return;
    }

    // 3. Animación procedimental del placeholder 3D basada en estado lógico
    this.placeholderGroup.scale.x = state.facing;

    const isCrouching =
      state.action === 'CROUCH' || state.currentMove === 'LOW_KICK';
    this.placeholderGroup.scale.y = isCrouching ? 0.68 : 1.0;

    // Color feedback para hitstun y blockstun
    const mat = this.torsoMesh.material as THREE.MeshStandardMaterial;
    if (state.action === 'HITSTUN') {
      mat.color.setHex(0xf97316); // Naranja al recibir golpe
    } else if (state.action === 'BLOCKSTUN') {
      mat.color.setHex(0x38bdf8); // Cian al bloquear
    } else {
      mat.color.setHex(this.baseColor);
    }

    // Extensión del brazo durante ataque activo
    if (state.action === 'ATTACK' && state.hitbox) {
      this.armMesh.position.x = 0.72;
      this.armMesh.scale.x = 1.35;
    } else if (state.action === 'ATTACK') {
      this.armMesh.position.x = 0.5;
      this.armMesh.scale.x = 1.0;
    } else {
      this.armMesh.position.x = 0.25;
      this.armMesh.scale.x = 0.85;
    }
  }
}
