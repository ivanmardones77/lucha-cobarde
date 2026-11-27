import * as THREE from 'three';
import {
  CHARACTERS,
  CharacterId,
  FighterState,
  getFighterMove,
} from '../core/types';

export class FighterRig3D {
  public root = new THREE.Group();
  private character: CharacterId;
  private hips = new THREE.Group();
  private torso!: THREE.Mesh;
  private head = new THREE.Group();
  private armF!: THREE.Group;
  private armB!: THREE.Group;
  private legF!: THREE.Group;
  private legB!: THREE.Group;
  private accessoryTail!: THREE.Mesh;
  private aura!: THREE.Mesh;
  private matBody!: THREE.MeshStandardMaterial;
  private accentHex: number;

  constructor(character: CharacterId) {
    this.character = character;
    this.accentHex = CHARACTERS[character].accentColor;
    this.buildRig(character);
  }

  public setCharacter(character: CharacterId): void {
    if (this.character === character) return;
    this.character = character;
    this.accentHex = CHARACTERS[character].accentColor;
    this.disposeGroup(this.root);
    this.hips = new THREE.Group();
    this.head = new THREE.Group();
    this.buildRig(character);
  }

  private disposeGroup(group: THREE.Object3D): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
  }

  private buildRig(character: CharacterId): void {
    const spec = CHARACTERS[character];
    const isKaze = character === 'KAZE';

    const matBody = new THREE.MeshStandardMaterial({
      color: spec.primaryColor,
      roughness: isKaze ? 0.3 : 0.4,
      metalness: isKaze ? 0.55 : 0.35,
    });
    this.matBody = matBody;
    const matDark = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      metalness: 0.6,
    });
    const matGlow = new THREE.MeshStandardMaterial({
      color: spec.accentColor,
      emissive: spec.accentColor,
      emissiveIntensity: 1.4,
    });

    this.hips.position.y = 0.95;
    this.root.add(this.hips);

    // Torso (Kaze más estilizada, Ryujin con hombreras)
    this.torso = new THREE.Mesh(
      new THREE.BoxGeometry(isKaze ? 0.40 : 0.48, 0.62, isKaze ? 0.30 : 0.36),
      matBody
    );
    this.torso.position.y = 0.32;
    this.torso.castShadow = true;
    this.hips.add(this.torso);

    if (!isKaze) {
      // Hombreras armadura Shoto para Ryujin
      const shoulderGeo = new THREE.BoxGeometry(0.24, 0.16, 0.54);
      const shoulders = new THREE.Mesh(shoulderGeo, matDark);
      shoulders.position.y = 0.58;
      this.hips.add(shoulders);
    }

    // Cinturón luminoso
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(isKaze ? 0.42 : 0.5, 0.1, isKaze ? 0.32 : 0.38),
      matGlow
    );
    belt.position.y = 0.04;
    this.hips.add(belt);

    // Cabeza + Visor + Cinta/Bufanda trasera distintiva
    this.head.position.set(0, 0.78, 0);
    const skull = new THREE.Mesh(
      new THREE.BoxGeometry(0.31, 0.34, 0.31),
      matDark
    );
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, isKaze ? 0.07 : 0.11, 0.34),
      matGlow
    );
    visor.position.set(0.06, isKaze ? 0.04 : 0.03, 0);
    this.head.add(skull, visor);

    if (isKaze) {
      // Bufanda cyber ondeante detrás de Kaze
      this.accessoryTail = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.11, 0.24),
        matGlow
      );
      this.accessoryTail.position.set(-0.28, 0.58, 0);
      this.hips.add(this.accessoryTail);
    } else {
      // Cinta de artista marcial detrás de la cabeza de Ryujin
      this.accessoryTail = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.07, 0.14),
        matGlow
      );
      this.accessoryTail.position.set(-0.26, 0.04, 0);
      this.head.add(this.accessoryTail);
    }

    this.hips.add(this.head);

    // Brazos (Kaze lleva cuchillas/tonfas luminosas en los antebrazos)
    this.armF = this.createLimb(
      isKaze ? 0.14 : 0.17,
      0.56,
      isKaze ? 0.14 : 0.17,
      matBody,
      matGlow,
      isKaze
    );
    this.armF.position.set(0.05, 0.56, 0.27);
    this.hips.add(this.armF);

    this.armB = this.createLimb(
      isKaze ? 0.14 : 0.17,
      0.56,
      isKaze ? 0.14 : 0.17,
      matDark,
      matGlow,
      isKaze
    );
    this.armB.position.set(-0.05, 0.56, -0.27);
    this.hips.add(this.armB);

    // Piernas
    this.legF = this.createLimb(0.19, 0.78, 0.19, matDark, matBody, false);
    this.legF.position.set(0.06, -0.02, 0.14);
    this.hips.add(this.legF);

    this.legB = this.createLimb(0.19, 0.78, 0.19, matDark, matBody, false);
    this.legB.position.set(-0.06, -0.02, -0.14);
    this.hips.add(this.legB);

    this.aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.85, 2.1, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: spec.accentColor,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
      })
    );
    this.aura.position.y = 1.05;
    this.root.add(this.aura);
  }

  private createLimb(
    w: number,
    h: number,
    d: number,
    matMain: THREE.Material,
    matTip: THREE.Material,
    hasBlade: boolean
  ): THREE.Group {
    const pivot = new THREE.Group();
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matMain);
    seg.position.y = -h * 0.45;
    seg.castShadow = true;
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.15, h * 0.26, d * 1.15),
      matTip
    );
    tip.position.y = -h * 0.85;
    pivot.add(seg, tip);

    if (hasBlade) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.36, 0.12),
        matTip
      );
      blade.position.set(-0.08, -h * 0.72, 0);
      pivot.add(blade);
    }
    return pivot;
  }

  public sync(f: FighterState, globalFrame: number): void {
    this.setCharacter(f.character);

    this.root.position.set(f.x, f.y, 0);
    this.root.rotation.y = f.facing === 1 ? 0 : Math.PI;

    this.hips.position.set(0, 0.92, 0);
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.armF.rotation.set(0, 0, 0.55);
    this.armB.rotation.set(0, 0, 0.85);
    this.legF.rotation.set(0, 0, 0.22);
    this.legB.rotation.set(0, 0, -0.22);

    const t = f.stateFrame;
    const breath = Math.sin(globalFrame * 0.12) * 0.035;
    this.accessoryTail.rotation.z =
      Math.sin(globalFrame * 0.22) * 0.16 +
      (f.state === 'DASH_F' ? 0.35 : 0);

    if (f.state === 'IDLE') {
      this.hips.position.y = 0.92 + breath;
      this.armF.rotation.z = 0.75 + breath * 2;
      this.armB.rotation.z = 1.05 - breath * 2;
    } else if (f.state === 'WALK_F' || f.state === 'WALK_B') {
      const s = Math.sin(globalFrame * 0.35);
      this.legF.rotation.z = s * 0.55;
      this.legB.rotation.z = -s * 0.55;
      this.armF.rotation.z = 0.7 - s * 0.35;
      this.armB.rotation.z = 0.7 + s * 0.35;
    } else if (f.state === 'CROUCH') {
      this.hips.position.y = 0.56;
      this.torso.rotation.z = -0.22;
      this.legF.rotation.z = 0.85;
      this.legB.rotation.z = -0.75;
    } else if (f.state === 'JUMP') {
      this.hips.position.y = 1.0;
      this.legF.rotation.z = 0.65;
      this.legB.rotation.z = -0.45;
      this.armF.rotation.z = 1.25;
    } else if (f.state === 'BLOCK_STAND') {
      this.torso.rotation.z = 0.16;
      this.armF.rotation.z = 1.7;
      this.armB.rotation.z = 1.5;
    } else if (f.state === 'BLOCK_CROUCH') {
      this.hips.position.y = 0.56;
      this.torso.rotation.z = 0.12;
      this.armF.rotation.z = 1.75;
      this.armB.rotation.z = 1.55;
      this.legF.rotation.z = 0.85;
    } else if (f.state === 'HITSTUN' || f.state === 'THROWN') {
      this.torso.rotation.z = 0.42;
      this.hips.position.x = -0.12;
      this.armF.rotation.z = -0.5;
      this.armB.rotation.z = -0.7;
    } else if (f.state === 'JUGGLE') {
      this.hips.position.y = 0.88;
      this.hips.rotation.z = 0.85;
      this.armF.rotation.z = -0.8;
      this.armB.rotation.z = 1.9;
      this.legF.rotation.z = 0.45;
      this.legB.rotation.z = -0.35;
    } else if (f.state === 'KNOCKDOWN') {
      this.hips.position.y = 0.25;
      this.hips.rotation.z = Math.PI * 0.48;
      this.armF.rotation.z = -0.4;
    } else if (f.state === 'WAKEUP') {
      const p = Math.min(1, t / 14);
      this.hips.position.y = 0.25 + p * 0.67;
      this.hips.rotation.z = (1 - p) * Math.PI * 0.45;
    } else if (f.state === 'DASH_F') {
      this.hips.position.y = 0.82;
      this.torso.rotation.z = -0.45;
      this.armF.rotation.z = -0.35;
      this.armB.rotation.z = -0.65;
      this.legF.rotation.z = 0.72;
      this.legB.rotation.z = -0.78;
    } else if (f.state === 'DASH_B') {
      this.hips.position.y = 0.96 + Math.sin((t / 16) * Math.PI) * 0.22;
      this.torso.rotation.z = 0.38;
      this.armF.rotation.z = 1.15;
      this.armB.rotation.z = 0.85;
      this.legF.rotation.z = -0.55;
      this.legB.rotation.z = 0.55;
    }

    const move = getFighterMove(f);
    if (f.state === 'VICTORY') {
      this.armF.rotation.z = 2.8;
      this.armB.rotation.z = 2.6;
    } else if (f.state === 'DEFEAT') {
      this.hips.position.y = 0.25;
      this.hips.rotation.z = Math.PI * 0.5;
    } else if (f.state === 'ATTACK' && move) {
      const id = move.id;
      const active = t > move.startup && t <= move.startup + move.active;
      if (id === '5P') {
        this.torso.rotation.z = -0.18;
        this.armF.rotation.z = active ? 1.58 : 0.6;
      } else if (id === '6P') {
        if (f.character === 'RYUJIN') {
          this.torso.rotation.z = active ? -0.42 : 0.15;
          this.armF.rotation.z = active ? 1.05 : 2.35;
          this.armB.rotation.z = 0.5;
        } else {
          this.hips.position.y = 0.86;
          this.torso.rotation.z = 0.12;
          this.armF.rotation.z = active ? 2.55 : 0.85;
        }
      } else if (id === '2P') {
        this.hips.position.y = 0.56;
        this.torso.rotation.z = -0.24;
        this.armF.rotation.z = active ? 1.58 : 0.55;
        this.legF.rotation.z = 0.85;
        this.legB.rotation.z = -0.75;
      } else if (id === 'jP') {
        this.torso.rotation.z = -0.28;
        this.armF.rotation.z = active ? 1.32 : 0.65;
        this.legF.rotation.z = 0.6;
      } else if (id === '5K') {
        this.torso.rotation.z = active ? 0.28 : 0.1;
        this.legF.rotation.z = active ? 1.62 : 0.65;
        this.legB.rotation.z = -0.18;
        this.armF.rotation.z = -0.35;
      } else if (id === '6K') {
        if (f.character === 'KAZE') {
          this.hips.position.y = 0.36;
          this.hips.rotation.z = 0.65;
          this.legF.rotation.z = 1.55;
          this.legB.rotation.z = -0.65;
        } else {
          this.torso.rotation.z = active ? 0.32 : 0.05;
          this.legF.rotation.z = active ? 1.72 : 0.6;
          this.legB.rotation.z = -0.45;
        }
      } else if (id === '2K') {
        this.hips.position.y = 0.44;
        this.torso.rotation.z = active ? 0.35 : -0.15;
        this.legF.rotation.z = active ? 1.68 : 0.7;
        this.legB.rotation.z = -0.85;
        this.armB.rotation.z = -0.5;
      } else if (id === 'jK') {
        this.torso.rotation.z = 0.25;
        this.legF.rotation.z = active ? 1.48 : 0.6;
        this.legB.rotation.z = -0.55;
        this.armF.rotation.z = -0.25;
      } else if (id === 'j214K') {
        this.hips.rotation.z = -0.55;
        this.legF.rotation.z = 1.35;
        this.legB.rotation.z = -0.6;
        this.armF.rotation.z = -0.4;
      } else if (id === '236K' || id === 'EX_236K') {
        if (f.character === 'KAZE') {
          this.hips.position.y = 0.78;
          this.torso.rotation.z = -0.52;
          this.armF.rotation.z = 1.65 + Math.sin(t * 0.9) * 0.7;
          this.armB.rotation.z = 1.45 - Math.sin(t * 0.9) * 0.7;
          this.legF.rotation.z = 0.75;
          this.legB.rotation.z = -0.85;
        } else {
          this.hips.position.y = 1.05;
          this.hips.rotation.y = t * (id === 'EX_236K' ? 0.95 : 0.72);
          this.legF.rotation.z = 1.58;
          this.legB.rotation.z = -0.35;
          this.armF.rotation.z = 1.1;
          this.armB.rotation.z = -1.1;
        }
      } else if (id === '41236K') {
        this.hips.position.y = 0.88;
        this.torso.rotation.z = -0.4;
        this.armF.rotation.z = 1.55 + Math.sin(t * 1.1) * 0.65;
        this.legF.rotation.z = 1.35 + Math.cos(t * 1.1) * 0.45;
      } else if (id === '236P' || id === 'EX_236P' || id === 'j236P') {
        this.torso.rotation.z = -0.28;
        this.armF.rotation.z = active ? 1.55 : 0.2;
        this.armB.rotation.z = active ? 1.55 : 0.2;
      } else if (id === '214P' || id === 'EX_214P') {
        this.torso.rotation.z = active ? -0.36 : 0.22;
        this.armF.rotation.z = active ? 1.72 : -0.35;
        this.armB.rotation.z = active ? 1.2 : 0.85;
      } else if (id === '214K') {
        if (f.character === 'RYUJIN') {
          this.hips.position.y = 1.05;
          this.torso.rotation.z = -0.2;
          this.legF.rotation.z = active ? 1.15 : 2.35;
        } else {
          this.hips.position.y = 0.75;
          this.torso.rotation.z = -0.55;
          this.hips.rotation.y = t * 0.6;
        }
      } else if (id === '22P') {
        this.hips.position.y = 0.8;
        this.armF.rotation.z = 2.3;
        this.armB.rotation.z = 2.3;
      } else if (id === '623P' || id === 'EX_623P') {
        this.torso.rotation.z = -0.12;
        this.armF.rotation.z = 2.95;
        this.legF.rotation.z = 0.9;
      } else if (id === 'FOCUS') {
        this.torso.rotation.z = active ? -0.45 : 0.3;
        this.armF.rotation.z = active ? 1.65 : -0.45;
        this.armB.rotation.z = active ? 1.25 : 1.75;
      } else if (id === 'ROLL') {
        this.hips.position.y = 0.55;
        this.hips.rotation.z = -t * 0.48;
        this.legF.rotation.z = 0.9;
        this.legB.rotation.z = -0.9;
      } else if (id === 'THROW' || id === '63214T') {
        const whiffing = t > move.startup + move.active && !f.moveConnected;
        if (whiffing) {
          this.torso.rotation.z = -0.38;
          this.armF.rotation.z = 0.35;
          this.armB.rotation.z = -0.45;
          this.legF.rotation.z = 0.48;
        } else {
          this.armF.rotation.z = id === '63214T' ? 2.1 : 1.55;
          this.armB.rotation.z = id === '63214T' ? 2.0 : 1.45;
        }
      } else if (id === 'SUPER') {
        this.torso.rotation.z = -0.35;
        this.armF.rotation.z = 1.6 + Math.sin(t * 1.4) * 0.45;
        this.armB.rotation.z = 1.6 - Math.sin(t * 1.4) * 0.45;
      }
    }

    const auraMat = this.aura.material as THREE.MeshBasicMaterial;
    const isBackdashInvuln = f.state === 'DASH_B' && f.invulnFrames > 0;
    const isExMove = Boolean(move && move.isEx);
    const hasArmor = f.armorHits > 0;
    const showAura =
      f.invulnFrames > 0 ||
      hasArmor ||
      isExMove ||
      Boolean(move && move.isSuper) ||
      f.state === 'DASH_F';

    if (isBackdashInvuln) {
      auraMat.color.setHex(0xe0f2fe);
      auraMat.opacity = 0.58;
    } else if (isExMove || hasArmor) {
      auraMat.color.setHex(0xfacc15);
      auraMat.opacity = hasArmor ? 0.48 : 0.42;
    } else if (f.state === 'DASH_F') {
      auraMat.color.setHex(this.accentHex);
      auraMat.opacity = 0.22;
    } else {
      auraMat.color.setHex(this.accentHex);
      auraMat.opacity = showAura ? 0.38 : 0.0;
    }
    if (showAura) this.aura.rotation.y += 0.18;

    const isHitFlash =
      (f.state === 'HITSTUN' ||
        f.state === 'JUGGLE' ||
        f.state === 'THROWN') &&
      f.stateFrame <= 3;
    const isBlockFlash =
      (f.state === 'BLOCK_STAND' || f.state === 'BLOCK_CROUCH') &&
      f.stateFrame <= 3;
    if (isHitFlash) {
      this.matBody.emissive.setHex(0xffffff);
      this.matBody.emissiveIntensity = 0.85;
    } else if (isBlockFlash) {
      this.matBody.emissive.setHex(0x38bdf8);
      this.matBody.emissiveIntensity = 0.45;
    } else if (hasArmor || isExMove) {
      this.matBody.emissive.setHex(0xfacc15);
      this.matBody.emissiveIntensity = 0.35;
    } else {
      this.matBody.emissive.setHex(0x000000);
      this.matBody.emissiveIntensity = 0;
    }
  }
}
