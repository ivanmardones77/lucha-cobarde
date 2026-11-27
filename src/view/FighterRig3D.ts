import * as THREE from 'three';
import {
  CHARACTERS,
  CharacterId,
  FighterState,
  getFighterMove,
} from '../core/types';
import {
  AnimeMaterialUniforms,
  createAnimeToonMaterial,
  createInkOutlineMaterial,
  getCharacterTextures,
} from './AnimeFighterShader';
import { RibbonChannel } from './RibbonTrail3D';

let sharedShadowTexture: THREE.CanvasTexture | null = null;

function getContactShadowTexture(): THREE.CanvasTexture {
  if (sharedShadowTexture) return sharedShadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0.78)');
    grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.38)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  sharedShadowTexture = tex;
  return tex;
}

const _vTip = new THREE.Vector3();
const _vBase = new THREE.Vector3();

interface GhostSlot {
  root: THREE.Group;
  hips: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  armF: THREE.Group;
  armB: THREE.Group;
  legF: THREE.Group;
  legB: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

export class FighterRig3D {
  public root = new THREE.Group();
  public trailGroup = new THREE.Group();

  private character: CharacterId;
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();

  private armF!: THREE.Group;
  private armFElbow!: THREE.Group;
  private fingerF!: THREE.Group;
  private chargeOrbF!: THREE.Mesh;

  private armB!: THREE.Group;
  private armBElbow!: THREE.Group;
  private fingerB!: THREE.Group;
  private chargeOrbB!: THREE.Mesh;

  private legF!: THREE.Group;
  private legFKnee!: THREE.Group;
  private toeF!: THREE.Group;

  private legB!: THREE.Group;
  private legBKnee!: THREE.Group;
  private toeB!: THREE.Group;

  // World-space trail markers attached to hands & boots
  private handFTip = new THREE.Object3D();
  private handFBase = new THREE.Object3D();
  private handBTip = new THREE.Object3D();
  private handBBase = new THREE.Object3D();
  private footFTip = new THREE.Object3D();
  private footFBase = new THREE.Object3D();
  private footBTip = new THREE.Object3D();
  private footBBase = new THREE.Object3D();

  private ribbons: {
    handF: RibbonChannel;
    handB: RibbonChannel;
    footF: RibbonChannel;
    footB: RibbonChannel;
  };

  // Spring-physics secondary motion chains
  private tailSegments: THREE.Group[] = [];
  private tailAngles: number[] = [0, 0, 0, 0];
  private tailVels: number[] = [0, 0, 0, 0];

  private skirtFlaps: THREE.Group[] = [];
  private skirtAngles: number[] = [0, 0];
  private skirtVels: number[] = [0, 0];

  private contactShadow!: THREE.Mesh;
  private aura!: THREE.Mesh;

  private matBody!: THREE.MeshToonMaterial;
  private bodyUniforms!: AnimeMaterialUniforms;
  private matArmor!: THREE.MeshToonMaterial;
  private armorUniforms!: AnimeMaterialUniforms;
  private matDark!: THREE.MeshToonMaterial;
  private matWrap!: THREE.MeshToonMaterial;
  private matSkin!: THREE.MeshToonMaterial;
  private matHair!: THREE.MeshToonMaterial;
  private matGlow!: THREE.MeshStandardMaterial;
  private matOutline!: THREE.ShaderMaterial;

  private ghosts: GhostSlot[] = [];
  private nextGhostIdx = 0;
  private lastGhostFrame = -10;
  private lastAnimFrame = -1;
  private accentHex: number;

  constructor(character: CharacterId) {
    this.character = character;
    this.accentHex = CHARACTERS[character].accentColor;

    this.ribbons = {
      handF: new RibbonChannel(this.accentHex),
      handB: new RibbonChannel(this.accentHex),
      footF: new RibbonChannel(this.accentHex),
      footB: new RibbonChannel(this.accentHex),
    };
    this.trailGroup.add(
      this.ribbons.handF.mesh,
      this.ribbons.handB.mesh,
      this.ribbons.footF.mesh,
      this.ribbons.footB.mesh
    );

    this.buildRig(character);
    this.initGhostPool();
  }

  public setCharacter(character: CharacterId): void {
    if (this.character === character) return;
    this.character = character;
    this.accentHex = CHARACTERS[character].accentColor;
    this.disposeGroup(this.root);
    this.hips = new THREE.Group();
    this.chest = new THREE.Group();
    this.head = new THREE.Group();
    this.tailSegments = [];
    this.tailAngles = [0, 0, 0, 0];
    this.tailVels = [0, 0, 0, 0];
    this.skirtFlaps = [];
    this.skirtAngles = [0, 0];
    this.skirtVels = [0, 0];
    this.buildRig(character);
    this.resetTrails();
  }

  private resetTrails(): void {
    for (const g of this.ghosts) {
      g.life = 0;
      g.root.visible = false;
    }
    this.ribbons.handF.reset();
    this.ribbons.handB.reset();
    this.ribbons.footF.reset();
    this.ribbons.footB.reset();
  }

  private disposeGroup(group: THREE.Object3D): void {
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (!disposedGeos.has(obj.geometry)) {
          disposedGeos.add(obj.geometry);
          obj.geometry.dispose();
        }
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (!disposedMats.has(m)) {
              disposedMats.add(m);
              m.dispose();
            }
          });
        } else if (!disposedMats.has(obj.material)) {
          disposedMats.add(obj.material);
          obj.material.dispose();
        }
      }
    });
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
  }

  private addAnimeMesh(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    withOutline = true,
    castShadow = true
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = castShadow;
    parent.add(mesh);

    if (withOutline) {
      const outline = new THREE.Mesh(geo, this.matOutline);
      outline.castShadow = false;
      mesh.add(outline);
    }
    return mesh;
  }

  private createLatheLimb(
    profile: Array<[number, number]>,
    radialSegs = 12,
    scaleX = 1,
    scaleZ = 1
  ): THREE.LatheGeometry {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, radialSegs);
    if (scaleX !== 1 || scaleZ !== 1) {
      geo.scale(scaleX, 1, scaleZ);
    }
    geo.computeVertexNormals();
    return geo;
  }

  private createTaperedHairStrand(
    points: Array<[number, number, number]>,
    baseRadius: number,
    tipRadius = 0.008
  ): THREE.TubeGeometry {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    );
    const tubularSegs = 10;
    const radialSegs = 6;
    const geo = new THREE.TubeGeometry(curve, tubularSegs, 1, radialSegs, false);
    const pos = geo.attributes.position;
    const ringCount = radialSegs + 1;

    for (let i = 0; i <= tubularSegs; i++) {
      const u = i / tubularSegs;
      const center = curve.getPointAt(u);
      const r = baseRadius * (1 - u) + tipRadius * u;
      for (let j = 0; j < ringCount; j++) {
        const idx = i * ringCount + j;
        const dx = pos.getX(idx) - center.x;
        const dy = pos.getY(idx) - center.y;
        const dz = pos.getZ(idx) - center.z;
        pos.setXYZ(idx, center.x + dx * r, center.y + dy * r, center.z + dz * r);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  private createBevelPlate(
    w: number,
    h: number,
    depth: number,
    taperBottom = 0.72
  ): THREE.ExtrudeGeometry {
    const shape = new THREE.Shape();
    const hw = w * 0.5;
    const bw = hw * taperBottom;
    const hh = h * 0.5;
    shape.moveTo(-bw, -hh);
    shape.lineTo(bw, -hh);
    shape.lineTo(hw, hh * 0.52);
    shape.lineTo(hw * 0.62, hh);
    shape.lineTo(-hw * 0.62, hh);
    shape.lineTo(-hw, hh * 0.52);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.018,
      bevelSegments: 2,
    });
    geo.center();
    return geo;
  }

  private createCurvedEnergyBlade(): THREE.ExtrudeGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.28);
    shape.quadraticCurveTo(0.08, 0.08, 0.055, -0.08);
    shape.lineTo(0.02, -0.25);
    shape.lineTo(-0.025, -0.24);
    shape.quadraticCurveTo(-0.045, 0.04, 0, 0.28);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.026,
      bevelEnabled: true,
      bevelThickness: 0.009,
      bevelSize: 0.008,
      bevelSegments: 1,
    });
    geo.center();
    return geo;
  }

  private buildRig(character: CharacterId): void {
    const spec = CHARACTERS[character];
    const isKaze = character === 'KAZE';
    const isTitan = character === 'TITAN';
    const tex = getCharacterTextures(character);

    this.matOutline = createInkOutlineMaterial(isTitan ? 0.017 : 0.014, 0x05070c);

    const bodyBuilt = createAnimeToonMaterial({
      color: 0xffffff,
      map: tex.fabricMap,
      normalMap: tex.fabricNormal,
      normalScale: isTitan ? 0.8 : 0.55,
      rimColor: spec.accentColor,
      rimStrength: isTitan ? 0.85 : 0.72,
      rimPower: 2.5,
      shadowTint: isTitan ? 0x271705 : isKaze ? 0x2e1065 : 0x172554,
      specStrength: isTitan ? 0.48 : isKaze ? 0.34 : 0.14,
    });
    this.matBody = bodyBuilt.material;
    this.bodyUniforms = bodyBuilt.uniforms;

    const armorBuilt = createAnimeToonMaterial({
      color: isTitan ? 0x94a3b8 : isKaze ? 0x64748b : 0xf1f5f9,
      map: tex.armorMap,
      normalMap: tex.armorNormal,
      normalScale: 0.75,
      rimColor: spec.accentColor,
      rimStrength: 0.88,
      rimPower: 2.3,
      shadowTint: 0x1e293b,
      specStrength: 0.52,
    });
    this.matArmor = armorBuilt.material;
    this.armorUniforms = armorBuilt.uniforms;

    this.matDark = createAnimeToonMaterial({
      color: isTitan ? 0x0f172a : isKaze ? 0x1e293b : 0x273549,
      normalMap: tex.fabricNormal,
      normalScale: 0.35,
      rimColor: spec.accentColor,
      rimStrength: 0.48,
      rimPower: 2.8,
      shadowTint: 0x0f172a,
      specStrength: 0.22,
    }).material;

    this.matWrap = createAnimeToonMaterial({
      color: isTitan ? 0xb45309 : 0xffffff,
      map: tex.wrapMap,
      normalMap: tex.wrapNormal,
      normalScale: 0.7,
      rimColor: spec.accentColor,
      rimStrength: 0.45,
      rimPower: 3.0,
      shadowTint: 0x334155,
      specStrength: 0.14,
    }).material;

    this.matSkin = createAnimeToonMaterial({
      color: 0xffffff,
      map: tex.skinMap,
      rimColor: spec.accentColor,
      rimStrength: 0.42,
      rimPower: 3.1,
      shadowTint: 0x7c2d12,
      specStrength: 0.12,
    }).material;

    this.matHair = createAnimeToonMaterial({
      color: isKaze ? 0x0f172a : 0x1e1b2e,
      rimColor: spec.accentColor,
      rimStrength: 0.7,
      rimPower: 2.4,
      shadowTint: 0x090d16,
      specStrength: 0.55,
    }).material;

    this.matGlow = new THREE.MeshStandardMaterial({
      color: spec.accentColor,
      emissive: spec.accentColor,
      emissiveIntensity: 1.6,
      roughness: 0.18,
      metalness: 0.15,
      toneMapped: false,
    });

    // Soft radial contact shadow on floor
    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.42, 0.96),
      new THREE.MeshBasicMaterial({
        map: getContactShadowTexture(),
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      })
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.02;
    this.root.add(this.contactShadow);

    // Hips / Pelvis Root
    this.hips.position.y = isTitan ? 1.02 : 0.94;
    this.root.add(this.hips);

    const pelvisGeo = this.createLatheLimb(
      [
        [0.09, -0.06],
        [isTitan ? 0.215 : isKaze ? 0.155 : 0.175, 0.02],
        [isTitan ? 0.205 : isKaze ? 0.145 : 0.165, 0.13],
        [isTitan ? 0.145 : 0.11, 0.17],
      ],
      12,
      0.86,
      isTitan ? 1.25 : 1.15
    );
    this.addAnimeMesh(this.hips, pelvisGeo, this.matDark);

    // Obi / Cyber Tactical Belt
    const belt = this.addAnimeMesh(
      this.hips,
      new THREE.CylinderGeometry(
        isTitan ? 0.24 : isKaze ? 0.175 : 0.2,
        isTitan ? 0.25 : isKaze ? 0.18 : 0.21,
        isTitan ? 0.095 : 0.075,
        12
      ),
      isKaze || isTitan ? this.matDark : this.matBody
    );
    belt.scale.set(0.88, 1, isTitan ? 1.28 : 1.18);
    belt.position.y = 0.12;

    const beltGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(
        isTitan ? 0.246 : isKaze ? 0.182 : 0.208,
        isTitan ? 0.246 : isKaze ? 0.182 : 0.208,
        0.032,
        12
      ),
      this.matGlow
    );
    beltGlow.scale.set(0.88, 1, isTitan ? 1.28 : 1.18);
    beltGlow.position.y = 0.12;
    this.hips.add(beltGlow);

    // Front & Back Spring-Physics Garment Flaps (Gi skirt / Shinobi sash / Titan armor tassets)
    const flapGeo = this.createBevelPlate(isTitan ? 0.24 : 0.18, 0.28, 0.038, 1.18);
    flapGeo.rotateY(Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(i === 0 ? (isTitan ? 0.18 : 0.14) : (isTitan ? -0.18 : -0.14), 0.09, 0);
      const flap = this.addAnimeMesh(
        pivot,
        flapGeo,
        isTitan ? this.matArmor : isKaze ? this.matDark : this.matBody
      );
      flap.position.y = -0.14;
      this.hips.add(pivot);
      this.skirtFlaps.push(pivot);
    }

    // Articulated Sculpted Chest / Ribcage
    this.chest.position.y = 0.15;
    this.hips.add(this.chest);

    const torsoGeo = this.createLatheLimb(
      [
        [isTitan ? 0.175 : isKaze ? 0.125 : 0.145, 0.0],
        [isTitan ? 0.215 : isKaze ? 0.142 : 0.165, 0.15],
        [isTitan ? 0.285 : isKaze ? 0.185 : 0.218, 0.36],
        [isTitan ? 0.295 : isKaze ? 0.19 : 0.224, 0.48],
        [isTitan ? 0.14 : 0.105, isTitan ? 0.56 : 0.51],
      ],
      14,
      isTitan ? 0.96 : 0.86,
      isTitan ? 1.32 : 1.2
    );
    this.addAnimeMesh(
      this.chest,
      torsoGeo,
      isKaze || isTitan ? this.matBody : this.matSkin
    );

    if (isTitan) {
      // TITAN: Massive beveled chest cuirass + amber reactor core + hydraulic thruster pauldrons
      const cuirassGeo = this.createBevelPlate(0.38, 0.36, 0.2, 0.72);
      cuirassGeo.rotateY(Math.PI / 2);
      const cuirass = this.addAnimeMesh(this.chest, cuirassGeo, this.matArmor);
      cuirass.position.set(0.14, 0.34, 0);

      const reactorCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.085, 0.06, 12),
        this.matGlow
      );
      reactorCore.rotation.z = Math.PI / 2;
      reactorCore.position.set(0.24, 0.36, 0);
      this.chest.add(reactorCore);

      const heavyPauldron = this.createBevelPlate(0.34, 0.24, 0.32, 1.3);
      for (const side of [-1, 1] as const) {
        const p = this.addAnimeMesh(this.chest, heavyPauldron, this.matArmor);
        p.position.set(0, 0.5, side * 0.38);
        p.rotation.x = side * 0.22;
        const vent = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.042, 0.24),
          this.matGlow
        );
        vent.position.set(0.02, 0.55, side * 0.4);
        vent.rotation.x = side * 0.22;
        this.chest.add(vent);
      }
    } else if (!isKaze) {
      // RYUJIN: Sculpted sleeveless Martial Arts Gi vest + crossed V-lapels + Cyber Pauldrons
      const giVestGeo = this.createLatheLimb(
        [
          [0.152, 0.0],
          [0.174, 0.15],
          [0.228, 0.35],
          [0.232, 0.44],
          [0.12, 0.49],
        ],
        14,
        0.88,
        1.22
      );
      const giVest = this.addAnimeMesh(this.chest, giVestGeo, this.matBody);
      giVest.position.set(-0.015, 0, 0);

      // Crossed Gi Lapel Collar framing bare chest
      const lapelL = this.addAnimeMesh(
        this.chest,
        this.createTaperedHairStrand(
          [
            [0.04, 0.48, 0.12],
            [0.17, 0.32, 0.05],
            [0.14, 0.04, -0.04],
          ],
          0.036,
          0.028
        ),
        this.matArmor
      );
      const lapelR = this.addAnimeMesh(
        this.chest,
        this.createTaperedHairStrand(
          [
            [0.04, 0.48, -0.12],
            [0.17, 0.32, -0.05],
            [0.14, 0.04, 0.04],
          ],
          0.036,
          0.028
        ),
        this.matArmor
      );
      lapelL.castShadow = false;
      lapelR.castShadow = false;

      // Titanium Shoulder Pauldrons with glowing trim
      const pauldronGeo = this.createBevelPlate(0.24, 0.16, 0.22, 1.25);
      for (const side of [-1, 1] as const) {
        const p = this.addAnimeMesh(this.chest, pauldronGeo, this.matArmor);
        p.position.set(0, 0.46, side * 0.28);
        p.rotation.x = side * 0.26;
        const pTrim = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.028, 0.18),
          this.matGlow
        );
        pTrim.position.set(0.02, 0.49, side * 0.29);
        pTrim.rotation.x = side * 0.26;
        this.chest.add(pTrim);
      }
    } else {
      // KAZE: Sleek armored tactical chest harness + glowing shinobi core V
      const vestPlateGeo = this.createBevelPlate(0.27, 0.32, 0.12, 0.68);
      vestPlateGeo.rotateY(Math.PI / 2);
      const vest = this.addAnimeMesh(this.chest, vestPlateGeo, this.matDark);
      vest.position.set(0.11, 0.31, 0);

      const coreV = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.055, 0),
        this.matGlow
      );
      coreV.position.set(0.18, 0.36, 0);
      this.chest.add(coreV);

      const padGeo = this.createBevelPlate(0.2, 0.11, 0.17, 1.15);
      for (const side of [-1, 1] as const) {
        const p = this.addAnimeMesh(this.chest, padGeo, this.matArmor);
        p.position.set(0, 0.45, side * 0.24);
        p.rotation.x = side * 0.32;
      }

      // High glowing cyber collar
      const collar = this.addAnimeMesh(
        this.chest,
        new THREE.CylinderGeometry(0.165, 0.185, 0.11, 12),
        this.matDark
      );
      collar.position.set(-0.01, 0.49, 0);
      const collarRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.17, 0.016, 6, 16),
        this.matGlow
      );
      collarRing.rotation.x = Math.PI / 2;
      collarRing.position.set(-0.01, 0.54, 0);
      this.chest.add(collarRing);
    }

    // Sculpted Neck & Clavicles
    const neck = this.addAnimeMesh(
      this.chest,
      this.createLatheLimb(
        [
          [isTitan ? 0.12 : 0.095, 0],
          [isTitan ? 0.1 : 0.078, 0.08],
          [isTitan ? 0.095 : 0.074, 0.15],
        ],
        10
      ),
      isKaze || isTitan ? this.matDark : this.matSkin
    );
    neck.position.y = isTitan ? 0.54 : 0.49;

    // Sculpted Organic Head & Jawline
    this.head.position.set(0.01, isTitan ? 0.72 : 0.68, 0);
    this.chest.add(this.head);

    const skullGeo = this.createLatheLimb(
      [
        [0.0, -0.14],
        [0.072, -0.11],
        [0.122, -0.02],
        [0.136, 0.06],
        [0.125, 0.13],
        [0.075, 0.165],
        [0.0, 0.175],
      ],
      14,
      isTitan ? 1.18 : 1.08,
      isTitan ? 1.04 : 0.94
    );
    this.addAnimeMesh(
      this.head,
      skullGeo,
      isKaze ? this.matDark : this.matSkin
    );

    // Expressive glowing anime visor / eyes slit
    const visorGeo = new THREE.BoxGeometry(
      isTitan ? 0.19 : 0.17,
      isTitan ? 0.068 : isKaze ? 0.052 : 0.062,
      isTitan ? 0.28 : 0.25
    );
    const visor = new THREE.Mesh(visorGeo, this.matGlow);
    visor.position.set(0.075, 0.025, 0);
    visor.rotation.z = -0.08;
    this.head.add(visor);

    // Brow ridge for fierce fighting-game glare
    const brow = this.addAnimeMesh(
      this.head,
      new THREE.BoxGeometry(0.18, 0.036, isTitan ? 0.285 : 0.255),
      isKaze || isTitan ? this.matArmor : this.matHair
    );
    brow.position.set(0.065, 0.065, 0);
    brow.rotation.z = -0.12;

    if (isTitan) {
      // TITAN: Armored cyber-helmet shell + horned brow crest + chin guard
      const helmet = this.addAnimeMesh(
        this.head,
        this.createLatheLimb(
          [
            [0.152, 0.03],
            [0.162, 0.13],
            [0.11, 0.19],
            [0.0, 0.21],
          ],
          12,
          1.18,
          1.06
        ),
        this.matArmor
      );
      helmet.position.set(-0.01, 0, 0);
      const chinGuard = this.addAnimeMesh(
        this.head,
        this.createBevelPlate(0.24, 0.11, 0.2, 0.8),
        this.matDark
      );
      chinGuard.rotation.y = Math.PI / 2;
      chinGuard.position.set(0.07, -0.07, 0);

      for (const side of [-1, 1] as const) {
        const fin = this.addAnimeMesh(
          this.head,
          this.createBevelPlate(0.06, 0.16, 0.04, 0.4),
          this.matArmor
        );
        fin.position.set(0.04, 0.18, side * 0.13);
        fin.rotation.z = -0.25;
      }
    } else if (isKaze) {
      // Half-face ninja respirator mask + hooded cowl + curved high ponytail
      const mask = this.addAnimeMesh(
        this.head,
        this.createBevelPlate(0.22, 0.13, 0.22, 0.72),
        this.matBody
      );
      mask.rotation.y = Math.PI / 2;
      mask.position.set(0.055, -0.055, 0);

      const cowl = this.addAnimeMesh(
        this.head,
        this.createLatheLimb(
          [
            [0.145, 0.05],
            [0.15, 0.13],
            [0.09, 0.185],
            [0.0, 0.2],
          ],
          12,
          1.12,
          0.98
        ),
        this.matDark
      );
      cowl.position.set(-0.01, 0, 0);

      // Sweeping curved 3-strand shinobi ponytail
      const ponyCurves: Array<{ pts: Array<[number, number, number]>; r: number }> = [
        {
          pts: [
            [-0.12, 0.12, 0],
            [-0.28, 0.2, 0],
            [-0.44, 0.04, 0],
            [-0.52, -0.18, 0],
          ],
          r: 0.058,
        },
        {
          pts: [
            [-0.12, 0.11, 0.04],
            [-0.25, 0.15, 0.08],
            [-0.38, -0.02, 0.06],
          ],
          r: 0.036,
        },
        {
          pts: [
            [-0.12, 0.11, -0.04],
            [-0.25, 0.15, -0.08],
            [-0.38, -0.02, -0.06],
          ],
          r: 0.036,
        },
      ];
      for (const c of ponyCurves) {
        this.addAnimeMesh(
          this.head,
          this.createTaperedHairStrand(c.pts, c.r, 0.008),
          this.matHair
        );
      }
    } else {
      // RYUJIN: Glowing Hachimaki headband + 8 curved spiky anime hair locks
      const headband = this.addAnimeMesh(
        this.head,
        new THREE.CylinderGeometry(0.15, 0.146, 0.056, 14),
        this.matGlow
      );
      headband.scale.set(1.09, 1, 0.96);
      headband.position.set(0, 0.085, 0);

      const locks: Array<Array<[number, number, number]>> = [
        [[0.02, 0.13, 0], [0.1, 0.25, 0], [0.17, 0.31, 0]],
        [[0.0, 0.13, 0.07], [0.06, 0.24, 0.13], [0.1, 0.29, 0.18]],
        [[0.0, 0.13, -0.07], [0.06, 0.24, -0.13], [0.1, 0.29, -0.18]],
        [[-0.04, 0.14, 0], [-0.14, 0.26, 0], [-0.26, 0.27, 0]],
        [[-0.06, 0.12, 0.08], [-0.17, 0.2, 0.14], [-0.28, 0.17, 0.17]],
        [[-0.06, 0.12, -0.08], [-0.17, 0.2, -0.14], [-0.28, 0.17, -0.17]],
        [[-0.1, 0.06, 0.05], [-0.21, 0.06, 0.09], [-0.3, -0.02, 0.11]],
        [[-0.1, 0.06, -0.05], [-0.21, 0.06, -0.09], [-0.3, -0.02, -0.11]],
      ];
      for (const pts of locks) {
        this.addAnimeMesh(
          this.head,
          this.createTaperedHairStrand(pts, 0.048, 0.008),
          this.matHair
        );
      }
    }

    // 4-Segment Spring-Physics Flowing Headband / Scarf / Power Hose
    const tailAnchor = isKaze || isTitan ? this.chest : this.head;
    let prevParent: THREE.Object3D = tailAnchor;
    for (let i = 0; i < 4; i++) {
      const segPivot = new THREE.Group();
      if (i === 0) {
        segPivot.position.set(
          isTitan ? -0.22 : isKaze ? -0.14 : -0.15,
          isTitan ? 0.48 : isKaze ? 0.49 : 0.09,
          0
        );
      } else {
        segPivot.position.set(-0.19, 0, 0);
      }
      const w = isTitan ? 0.18 : 0.21;
      const h = isTitan ? 0.065 - i * 0.008 : isKaze ? 0.082 - i * 0.01 : 0.05 - i * 0.006;
      const d = isTitan ? 0.09 - i * 0.01 : isKaze ? 0.18 - i * 0.02 : 0.11 - i * 0.012;
      const segMesh = this.addAnimeMesh(
        segPivot,
        new THREE.BoxGeometry(w, h, d),
        isTitan ? this.matDark : this.matGlow,
        true,
        false
      );
      segMesh.position.set(-w * 0.48, 0, 0);
      prevParent.add(segPivot);
      this.tailSegments.push(segPivot);
      prevParent = segPivot;
    }

    // 2-Segment Sculpted Muscular Arms + Articulated Hands
    const armFBuilt = this.createArm(
      character,
      true,
      this.handFTip,
      this.handFBase
    );
    this.armF = armFBuilt.shoulder;
    this.armFElbow = armFBuilt.elbow;
    this.fingerF = armFBuilt.fingers;
    this.chargeOrbF = armFBuilt.chargeOrb;
    this.armF.position.set(0.03, isTitan ? 0.46 : 0.42, isTitan ? 0.36 : isKaze ? 0.24 : 0.28);
    this.chest.add(this.armF);

    const armBBuilt = this.createArm(
      character,
      false,
      this.handBTip,
      this.handBBase
    );
    this.armB = armBBuilt.shoulder;
    this.armBElbow = armBBuilt.elbow;
    this.fingerB = armBBuilt.fingers;
    this.chargeOrbB = armBBuilt.chargeOrb;
    this.armB.position.set(-0.04, isTitan ? 0.46 : 0.42, isTitan ? -0.36 : isKaze ? -0.24 : -0.28);
    this.chest.add(this.armB);

    // 2-Segment Sculpted Muscular Legs + Articulated Boots/Toes
    const legFBuilt = this.createLeg(character, this.footFTip, this.footFBase);
    this.legF = legFBuilt.hip;
    this.legFKnee = legFBuilt.knee;
    this.toeF = legFBuilt.toe;
    this.legF.position.set(0.05, -0.02, isTitan ? 0.17 : 0.13);
    this.hips.add(this.legF);

    const legBBuilt = this.createLeg(character, this.footBTip, this.footBBase);
    this.legB = legBBuilt.hip;
    this.legBKnee = legBBuilt.knee;
    this.toeB = legBBuilt.toe;
    this.legB.position.set(-0.05, -0.02, isTitan ? -0.17 : -0.13);
    this.hips.add(this.legB);

    // Additive Energy Aura Cylinder
    this.aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.88, 2.08, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: spec.accentColor,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.aura.position.y = 1.04;
    this.root.add(this.aura);
  }

  private createArm(
    character: CharacterId,
    isFront: boolean,
    tipMarker: THREE.Object3D,
    baseMarker: THREE.Object3D
  ): {
    shoulder: THREE.Group;
    elbow: THREE.Group;
    fingers: THREE.Group;
    chargeOrb: THREE.Mesh;
  } {
    const isKaze = character === 'KAZE';
    const isTitan = character === 'TITAN';
    const shoulder = new THREE.Group();
    const upperProfile: Array<[number, number]> = isTitan
      ? [
          [0.095, -0.29],
          [0.124, -0.17],
          [0.132, -0.08],
          [0.138, -0.02],
          [0.095, 0.02],
        ]
      : isKaze
        ? [
            [0.052, -0.27],
            [0.068, -0.16],
            [0.072, -0.08],
            [0.078, -0.02],
            [0.056, 0.02],
          ]
        : [
            [0.064, -0.27],
            [0.086, -0.16],
            [0.092, -0.08],
            [0.098, -0.02],
            [0.068, 0.02],
          ];
    this.addAnimeMesh(
      shoulder,
      this.createLatheLimb(upperProfile, 10, 1.04, 0.96),
      isTitan ? this.matArmor : isKaze ? (isFront ? this.matBody : this.matDark) : this.matSkin
    );

    const elbow = new THREE.Group();
    elbow.position.y = isTitan ? -0.28 : -0.26;
    shoulder.add(elbow);

    const forearmProfile: Array<[number, number]> = isTitan
      ? [
          [0.088, -0.28],
          [0.118, -0.16],
          [0.125, -0.05],
          [0.096, 0.01],
        ]
      : isKaze
        ? [
            [0.044, -0.26],
            [0.056, -0.15],
            [0.066, -0.05],
            [0.054, 0.01],
          ]
        : [
            [0.052, -0.26],
            [0.068, -0.14],
            [0.076, -0.05],
            [0.062, 0.01],
          ];
    this.addAnimeMesh(
      elbow,
      this.createLatheLimb(forearmProfile, 10),
      isTitan ? this.matBody : this.matWrap
    );

    // Sculpted Hand + Articulated Finger Cluster (Oversized Piston Gauntlets for TITAN)
    const palmScale = isTitan ? 1.55 : 1;
    const palm = this.addAnimeMesh(
      elbow,
      new THREE.BoxGeometry(0.082 * palmScale, 0.088 * palmScale, 0.072 * palmScale),
      isKaze ? this.matDark : this.matArmor
    );
    palm.position.y = isTitan ? -0.32 : -0.295;

    // Knuckle glow strip
    const knuckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.088 * palmScale, 0.032 * palmScale, 0.076 * palmScale),
      this.matGlow
    );
    knuckle.position.set(0.01, isTitan ? -0.35 : -0.32, 0);
    elbow.add(knuckle);

    const fingers = new THREE.Group();
    fingers.position.set(0.015, isTitan ? -0.37 : -0.335, 0);
    const fingerBlock = this.addAnimeMesh(
      fingers,
      new THREE.BoxGeometry(0.046 * palmScale, 0.078 * palmScale, 0.066 * palmScale),
      isTitan ? this.matArmor : isKaze ? this.matDark : this.matSkin
    );
    fingerBlock.position.y = -0.036 * palmScale;
    elbow.add(fingers);

    // Palm charge orb for Hadouken / Focus / Super startup
    const chargeOrb = new THREE.Mesh(
      new THREE.SphereGeometry(isTitan ? 0.12 : 0.085, 10, 10),
      new THREE.MeshBasicMaterial({
        color: this.accentHex,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    chargeOrb.position.set(0.04, isTitan ? -0.35 : -0.32, 0);
    chargeOrb.visible = false;
    elbow.add(chargeOrb);

    if (isKaze) {
      // Curved plasma kunai / tonfa blade mounted along forearm
      const bladeGeo = this.createCurvedEnergyBlade();
      bladeGeo.rotateY(Math.PI / 2);
      const blade = new THREE.Mesh(bladeGeo, this.matGlow);
      blade.position.set(0.09, -0.22, 0);
      blade.rotation.z = -0.22;
      elbow.add(blade);

      tipMarker.position.set(0.14, -0.46, 0);
      baseMarker.position.set(0.05, -0.14, 0);
    } else {
      tipMarker.position.set(0.04, isTitan ? -0.44 : -0.38, 0);
      baseMarker.position.set(-0.02, -0.16, 0);
    }
    elbow.add(tipMarker, baseMarker);

    return { shoulder, elbow, fingers, chargeOrb };
  }

  private createLeg(
    character: CharacterId,
    tipMarker: THREE.Object3D,
    baseMarker: THREE.Object3D
  ): { hip: THREE.Group; knee: THREE.Group; toe: THREE.Group } {
    const isKaze = character === 'KAZE';
    const isTitan = character === 'TITAN';
    const hip = new THREE.Group();
    const thighProfile: Array<[number, number]> = isTitan
      ? [
          [0.105, -0.48],
          [0.142, -0.32],
          [0.164, -0.15],
          [0.168, -0.04],
          [0.13, 0.02],
        ]
      : isKaze
        ? [
            [0.068, -0.44],
            [0.088, -0.3],
            [0.105, -0.14],
            [0.108, -0.04],
            [0.088, 0.02],
          ]
        : [
            [0.082, -0.44],
            [0.108, -0.3],
            [0.128, -0.14],
            [0.132, -0.04],
            [0.105, 0.02],
          ];
    this.addAnimeMesh(
      hip,
      this.createLatheLimb(thighProfile, 12, 1.04, 0.98),
      isTitan ? this.matBody : isKaze ? this.matDark : this.matBody
    );

    if (isKaze) {
      // Tactical thigh kunai holster strap
      const strap = this.addAnimeMesh(
        hip,
        new THREE.CylinderGeometry(0.106, 0.104, 0.055, 10),
        this.matBody
      );
      strap.position.y = -0.2;
    }

    const knee = new THREE.Group();
    knee.position.y = isTitan ? -0.46 : -0.42;
    hip.add(knee);

    // Armored knee guard
    const kneePad = this.addAnimeMesh(
      knee,
      this.createBevelPlate(isTitan ? 0.16 : 0.11, isTitan ? 0.16 : 0.12, 0.07, 0.8),
      this.matArmor
    );
    kneePad.rotation.y = Math.PI / 2;
    kneePad.position.set(isTitan ? 0.085 : 0.065, 0, 0);

    const shinProfile: Array<[number, number]> = isTitan
      ? [
          [0.08, -0.48],
          [0.106, -0.3],
          [0.128, -0.13],
          [0.11, -0.03],
          [0.1, 0.02],
        ]
      : isKaze
        ? [
            [0.048, -0.44],
            [0.062, -0.3],
            [0.082, -0.14],
            [0.07, -0.03],
            [0.064, 0.02],
          ]
        : [
            [0.054, -0.44],
            [0.072, -0.28],
            [0.094, -0.13],
            [0.082, -0.03],
            [0.074, 0.02],
          ];
    this.addAnimeMesh(
      knee,
      this.createLatheLimb(shinProfile, 12),
      isTitan ? this.matArmor : isKaze ? this.matWrap : this.matArmor
    );

    // Sculpted Boot Heel + Articulated Toe Cap
    const bootW = isTitan ? 1.32 : 1;
    const heel = this.addAnimeMesh(
      knee,
      new THREE.BoxGeometry(0.16 * bootW, 0.1 * bootW, 0.135 * bootW),
      isTitan ? this.matDark : this.matBody
    );
    heel.position.set(0.02, isTitan ? -0.495 : -0.455, 0);

    const toe = new THREE.Group();
    toe.position.set(0.095 * bootW, isTitan ? -0.5 : -0.46, 0);
    const toeCap = this.addAnimeMesh(
      toe,
      new THREE.BoxGeometry(0.11 * bootW, 0.078 * bootW, 0.132 * bootW),
      isTitan ? this.matArmor : this.matDark
    );
    toeCap.position.set(0.045, 0.005, 0);

    const toeGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.045 * bootW, 0.032, 0.138 * bootW),
      this.matGlow
    );
    toeGlow.position.set(0.082 * bootW, 0.005, 0);
    toe.add(toeGlow);
    knee.add(toe);

    tipMarker.position.set(0.17 * bootW, isTitan ? -0.5 : -0.46, 0);
    baseMarker.position.set(0.0, -0.22, 0);
    knee.add(tipMarker, baseMarker);

    return { hip, knee, toe };
  }

  private initGhostPool(): void {
    const torsoGeo = new THREE.CylinderGeometry(0.2, 0.14, 0.52, 8);
    const headGeo = new THREE.SphereGeometry(0.14, 8, 8);
    const limbGeo = new THREE.CylinderGeometry(0.07, 0.055, 0.5, 6);
    const legGeo = new THREE.CylinderGeometry(0.09, 0.065, 0.82, 6);

    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: this.accentHex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });

      const root = new THREE.Group();
      root.visible = false;
      const hips = new THREE.Group();
      root.add(hips);

      const chest = new THREE.Group();
      chest.position.y = 0.15;
      hips.add(chest);

      const torso = new THREE.Mesh(torsoGeo, mat);
      torso.position.y = 0.26;
      chest.add(torso);

      const head = new THREE.Group();
      head.position.y = 0.68;
      head.add(new THREE.Mesh(headGeo, mat));
      chest.add(head);

      const armF = new THREE.Group();
      armF.position.set(0.03, 0.42, 0.25);
      const armFM = new THREE.Mesh(limbGeo, mat);
      armFM.position.y = -0.25;
      armF.add(armFM);
      chest.add(armF);

      const armB = new THREE.Group();
      armB.position.set(-0.04, 0.42, -0.25);
      const armBM = new THREE.Mesh(limbGeo, mat);
      armBM.position.y = -0.25;
      armB.add(armBM);
      chest.add(armB);

      const legF = new THREE.Group();
      legF.position.set(0.05, -0.02, 0.13);
      const legFM = new THREE.Mesh(legGeo, mat);
      legFM.position.y = -0.42;
      legF.add(legFM);
      hips.add(legF);

      const legB = new THREE.Group();
      legB.position.set(-0.05, -0.02, -0.13);
      const legBM = new THREE.Mesh(legGeo, mat);
      legBM.position.y = -0.42;
      legB.add(legBM);
      hips.add(legB);

      this.trailGroup.add(root);
      this.ghosts.push({
        root,
        hips,
        chest,
        head,
        armF,
        armB,
        legF,
        legB,
        mat,
        life: 0,
        maxLife: 11,
      });
    }
  }

  private spawnGhostSnapshot(f: FighterState, colorHex: number): void {
    const slot = this.ghosts[this.nextGhostIdx];
    this.nextGhostIdx = (this.nextGhostIdx + 1) % this.ghosts.length;

    slot.root.position.set(f.x, f.y, -0.04);
    slot.root.rotation.y = this.root.rotation.y;
    slot.root.scale.copy(this.root.scale);
    slot.hips.position.copy(this.hips.position);
    slot.hips.rotation.copy(this.hips.rotation);
    slot.chest.rotation.copy(this.chest.rotation);
    slot.head.rotation.copy(this.head.rotation);
    slot.armF.rotation.copy(this.armF.rotation);
    slot.armB.rotation.copy(this.armB.rotation);
    slot.legF.rotation.copy(this.legF.rotation);
    slot.legB.rotation.copy(this.legB.rotation);

    slot.mat.color.setHex(colorHex);
    slot.maxLife = 11;
    slot.life = slot.maxLife;
    slot.mat.opacity = 0.4;
    slot.root.visible = true;
  }

  private updateGhosts(): void {
    for (const g of this.ghosts) {
      if (g.life <= 0) {
        g.root.visible = false;
        continue;
      }
      g.life--;
      g.mat.opacity = (g.life / g.maxLife) * 0.4;
      if (g.life <= 0) g.root.visible = false;
    }
  }

  private stepSpringChains(f: FighterState, globalFrame: number): void {
    const facingVx = -f.vx * f.facing;
    const wind = Math.sin(globalFrame * 0.18 + f.id * 1.3) * 0.045;

    for (let i = 0; i < this.tailSegments.length; i++) {
      const wave =
        Math.sin(globalFrame * 0.25 - i * 0.85) * (0.045 + i * 0.018);
      const target =
        i === 0
          ? -0.22 + Math.max(-0.35, Math.min(0.55, facingVx * 2.1 - f.vy * 1.1)) + wave
          : Math.max(-0.35, Math.min(0.45, facingVx * 0.85 - f.vy * 0.45)) +
            wave +
            wind;

      const k = 0.26;
      const damp = 0.72;
      this.tailVels[i] =
        (this.tailVels[i] + (target - this.tailAngles[i]) * k) * damp;
      this.tailAngles[i] += this.tailVels[i];
      this.tailSegments[i].rotation.z = this.tailAngles[i];
    }

    for (let i = 0; i < this.skirtFlaps.length; i++) {
      const dir = i === 0 ? 1 : -1;
      const legKickBoost =
        dir === 1
          ? Math.max(0, this.legF.rotation.z * 0.55)
          : Math.max(0, -this.legB.rotation.z * 0.45);
      const target =
        dir * (0.14 + Math.max(0, -facingVx * 0.9 * dir)) + legKickBoost;
      this.skirtVels[i] =
        (this.skirtVels[i] + (target - this.skirtAngles[i]) * 0.28) * 0.74;
      this.skirtAngles[i] += this.skirtVels[i];
      this.skirtFlaps[i].rotation.z = this.skirtAngles[i];
    }
  }

  public sync(f: FighterState, globalFrame: number, hitstop = 0): void {
    this.setCharacter(f.character);

    this.root.position.set(f.x, f.y, 0);
    this.root.rotation.y = f.facing === 1 ? 0 : Math.PI;

    // Reset default articulated combat stance
    const baseHipY = f.character === 'TITAN' ? 1.02 : 0.94;
    this.hips.position.set(0, baseHipY, 0);
    this.hips.rotation.set(0, 0, 0);
    this.chest.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);

    this.armF.rotation.set(0, 0, 0.55);
    this.armFElbow.rotation.set(0, 0, 1.25);
    this.armB.rotation.set(0, 0, 0.88);
    this.armBElbow.rotation.set(0, 0, 1.35);

    this.legF.rotation.set(0, 0, 0.24);
    this.legFKnee.rotation.set(0, 0, -0.35);
    this.toeF.rotation.set(0, 0, 0);

    this.legB.rotation.set(0, 0, -0.24);
    this.legBKnee.rotation.set(0, 0, -0.18);
    this.toeB.rotation.set(0, 0, 0);

    let fingerCurlF = 1.45; // closed fist default
    let fingerCurlB = 1.45;
    let showChargeF = false;
    let showChargeB = false;

    const t = f.stateFrame;
    const breath = Math.sin(globalFrame * 0.12) * 0.032;

    if (f.state === 'IDLE') {
      this.hips.position.y = baseHipY - 0.01 + breath;
      this.hips.rotation.y = -0.18;
      this.chest.rotation.y = 0.22;
      this.chest.rotation.z = -0.05 + breath * 0.6;
      this.head.rotation.y = -0.06;
      this.armF.rotation.z = (f.character === 'TITAN' ? 0.72 : 0.6) + breath * 1.8;
      this.armFElbow.rotation.z = 1.3;
      this.armB.rotation.z = 0.98 - breath * 1.8;
      this.armBElbow.rotation.z = 1.4;
    } else if (f.state === 'WALK_F' || f.state === 'WALK_B') {
      const s = Math.sin(globalFrame * 0.35);
      const c = Math.cos(globalFrame * 0.35);
      this.hips.position.y = 0.92 + Math.abs(c) * 0.04;
      this.hips.rotation.y = s * 0.18;
      this.chest.rotation.y = -s * 0.15;
      this.chest.rotation.z = f.state === 'WALK_F' ? -0.12 : 0.08;
      this.legF.rotation.z = s * 0.56;
      this.legFKnee.rotation.z = -Math.max(0.12, -s * 0.55 + 0.25);
      this.toeF.rotation.z = s < 0 ? 0.35 : -0.1;
      this.legB.rotation.z = -s * 0.56;
      this.legBKnee.rotation.z = -Math.max(0.12, s * 0.55 + 0.25);
      this.toeB.rotation.z = s > 0 ? 0.35 : -0.1;
      this.armF.rotation.z = 0.68 - s * 0.36;
      this.armB.rotation.z = 0.88 + s * 0.36;
    } else if (f.state === 'CROUCH') {
      this.hips.position.y = 0.56;
      this.chest.rotation.z = -0.24;
      this.head.rotation.z = 0.18;
      this.legF.rotation.z = 1.18;
      this.legFKnee.rotation.z = -1.68;
      this.toeF.rotation.z = 0.42;
      this.legB.rotation.z = -0.52;
      this.legBKnee.rotation.z = -0.95;
      this.armF.rotation.z = 0.42;
      this.armFElbow.rotation.z = 1.45;
    } else if (f.state === 'JUMP') {
      this.hips.position.y = 1.02;
      this.chest.rotation.z = -0.12;
      this.legF.rotation.z = 0.85;
      this.legFKnee.rotation.z = -1.18;
      this.toeF.rotation.z = -0.35;
      this.legB.rotation.z = -0.35;
      this.legBKnee.rotation.z = -0.78;
      this.armF.rotation.z = 1.2;
      this.armFElbow.rotation.z = 0.82;
    } else if (f.state === 'BLOCK_STAND') {
      this.chest.rotation.z = 0.16;
      this.chest.rotation.y = 0.32;
      this.head.rotation.z = -0.1;
      this.armF.rotation.z = 1.45;
      this.armFElbow.rotation.z = 1.25;
      this.armB.rotation.z = 1.3;
      this.armBElbow.rotation.z = 1.3;
    } else if (f.state === 'BLOCK_CROUCH') {
      this.hips.position.y = 0.56;
      this.chest.rotation.z = 0.12;
      this.chest.rotation.y = 0.32;
      this.armF.rotation.z = 1.5;
      this.armFElbow.rotation.z = 1.3;
      this.armB.rotation.z = 1.35;
      this.armBElbow.rotation.z = 1.3;
      this.legF.rotation.z = 1.15;
      this.legFKnee.rotation.z = -1.65;
      this.legB.rotation.z = -0.55;
      this.legBKnee.rotation.z = -0.95;
    } else if (f.state === 'HITSTUN' || f.state === 'THROWN') {
      this.chest.rotation.z = 0.44;
      this.chest.rotation.y = -0.28;
      this.head.rotation.z = 0.26;
      this.hips.position.x = -0.12;
      this.armF.rotation.z = -0.5;
      this.armFElbow.rotation.z = 0.25;
      this.armB.rotation.z = -0.7;
      this.armBElbow.rotation.z = 0.25;
      fingerCurlF = 0.2;
      fingerCurlB = 0.2;
    } else if (f.state === 'JUGGLE') {
      this.hips.position.y = 0.88;
      this.hips.rotation.z = 0.85;
      this.armF.rotation.z = -0.8;
      this.armFElbow.rotation.z = 0.2;
      this.armB.rotation.z = 1.9;
      this.legF.rotation.z = 0.55;
      this.legFKnee.rotation.z = -0.6;
      this.legB.rotation.z = -0.35;
      fingerCurlF = 0.2;
    } else if (f.state === 'KNOCKDOWN') {
      this.hips.position.y = 0.24;
      this.hips.rotation.z = Math.PI * 0.48;
      this.armF.rotation.z = -0.4;
      this.armFElbow.rotation.z = 0.2;
      this.legFKnee.rotation.z = -0.2;
      fingerCurlF = 0.2;
    } else if (f.state === 'WAKEUP') {
      const p = Math.min(1, t / 14);
      this.hips.position.y = 0.24 + p * 0.7;
      this.hips.rotation.z = (1 - p) * Math.PI * 0.45;
    } else if (f.state === 'DASH_F') {
      this.hips.position.y = 0.82;
      this.chest.rotation.z = -0.5;
      this.head.rotation.z = 0.32;
      this.armF.rotation.z = -0.42;
      this.armFElbow.rotation.z = 0.42;
      this.armB.rotation.z = -0.72;
      this.armBElbow.rotation.z = 0.42;
      this.legF.rotation.z = 0.78;
      this.legFKnee.rotation.z = -0.65;
      this.legB.rotation.z = -0.82;
      this.legBKnee.rotation.z = -0.35;
      fingerCurlF = 0.25;
      fingerCurlB = 0.25;
    } else if (f.state === 'DASH_B') {
      this.hips.position.y = 0.96 + Math.sin((t / 16) * Math.PI) * 0.22;
      this.chest.rotation.z = 0.36;
      this.armF.rotation.z = 1.1;
      this.armFElbow.rotation.z = 0.7;
      this.armB.rotation.z = 0.85;
      this.legF.rotation.z = -0.55;
      this.legB.rotation.z = 0.55;
    }

    let ribbonHandF = false;
    let ribbonHandB = false;
    let ribbonFootF = false;
    let ribbonFootB = false;

    const move = getFighterMove(f);
    let introAura = false;
    if (f.state === 'THROW_HOLD' && f.moveId === '63214T') {
      // 2-stage cinematic command grab lift & powerbomb slam
      if (t <= 11) {
        const p = t / 11;
        this.hips.position.y = baseHipY - 0.1 * p;
        this.chest.rotation.z = 0.24 * p;
        this.armF.rotation.z = 1.35 + p * 1.35;
        this.armFElbow.rotation.z = 0.35;
        this.armB.rotation.z = 1.25 + p * 1.35;
        this.armBElbow.rotation.z = 0.35;
        ribbonHandF = true;
        ribbonHandB = true;
      } else if (t <= 14) {
        this.hips.position.y = baseHipY;
        this.chest.rotation.z = 0.28;
        this.armF.rotation.z = 2.75;
        this.armFElbow.rotation.z = 0.25;
        this.armB.rotation.z = 2.65;
        this.armBElbow.rotation.z = 0.25;
      } else {
        const p = Math.min(1, (t - 14) / 6);
        this.hips.position.y = baseHipY - 0.26 * p;
        this.chest.rotation.z = 0.28 - p * 0.85;
        this.armF.rotation.z = 2.75 - p * 2.15;
        this.armFElbow.rotation.z = 0.25;
        this.armB.rotation.z = 2.65 - p * 2.15;
        this.armBElbow.rotation.z = 0.25;
        ribbonHandF = true;
        ribbonHandB = true;
      }
    } else if (f.state === 'INTRO_POSE') {
      if (f.character === 'TITAN') {
        if (t <= 16) {
          const p = t / 16;
          this.hips.position.y = baseHipY + 0.08 * p;
          this.chest.rotation.z = 0.18 * p;
          this.armF.rotation.z = 0.7 + p * 2.1;
          this.armFElbow.rotation.z = 0.65;
          this.armB.rotation.z = 0.9 + p * 1.9;
          this.armBElbow.rotation.z = 0.65;
        } else {
          const slamP = Math.min(1, (t - 16) / 6);
          this.hips.position.y = baseHipY - 0.28 * Math.sin(slamP * Math.PI * 0.65);
          this.chest.rotation.z = -0.45 * slamP;
          this.armF.rotation.z = 2.8 - slamP * 2.1;
          this.armFElbow.rotation.z = 0.22;
          this.armB.rotation.z = 2.8 - slamP * 2.1;
          this.armBElbow.rotation.z = 0.22;
          introAura = t >= 18 && t <= 40;
          ribbonHandF = t >= 16 && t <= 28;
          ribbonHandB = t >= 16 && t <= 28;
        }
      } else if (f.character === 'RYUJIN') {
        if (t <= 14) {
          const p = t / 14;
          this.hips.position.y = 0.92 - p * 0.14;
          this.hips.rotation.y = -0.25 * p;
          this.chest.rotation.z = -0.18 * p;
          this.armF.rotation.z = 0.55 - p * 0.9;
          this.armFElbow.rotation.z = 1.45;
          this.armB.rotation.z = 0.88 - p * 1.1;
          this.armBElbow.rotation.z = 1.45;
          this.legF.rotation.z = 0.38;
          this.legFKnee.rotation.z = -0.68;
          showChargeF = t >= 4;
          showChargeB = t >= 4;
        } else {
          const flare = Math.min(1, (t - 14) / 10);
          this.hips.position.y = 0.78 + flare * 0.18;
          this.hips.rotation.y = 0.35 * flare;
          this.chest.rotation.y = 0.25 * flare;
          this.chest.rotation.z = 0.12 * flare;
          this.armF.rotation.z = 1.85 * flare;
          this.armFElbow.rotation.z = 0.35;
          this.armB.rotation.z = -0.45;
          this.armBElbow.rotation.z = 1.45;
          introAura = t <= 38;
          ribbonHandF = t >= 14 && t <= 26;
        }
      } else {
        // KAZE: deep crouched ninja landing -> rises & whips plasma blades
        if (t <= 22) {
          this.hips.position.y = 0.54;
          this.hips.rotation.y = -0.22;
          this.chest.rotation.z = -0.42;
          this.head.rotation.z = 0.3;
          this.armF.rotation.z = 0.25;
          this.armFElbow.rotation.z = 1.3;
          this.armB.rotation.z = -0.65;
          this.armBElbow.rotation.z = 0.4;
          this.legF.rotation.z = 1.22;
          this.legFKnee.rotation.z = -1.72;
          this.legB.rotation.z = -0.58;
          this.legBKnee.rotation.z = -0.95;
        } else {
          const rise = Math.min(1, (t - 22) / 12);
          const slash = t >= 34 && t <= 50;
          this.hips.position.y = 0.54 + rise * 0.42;
          this.hips.rotation.y = slash ? 0.42 : -0.15;
          this.chest.rotation.z = slash ? -0.28 : 0.08;
          this.armF.rotation.z = slash ? 1.65 : 2.15;
          this.armFElbow.rotation.z = slash ? 0.15 : 1.05;
          this.armB.rotation.z = slash ? -0.45 : 1.85;
          this.armBElbow.rotation.z = slash ? 0.3 : 1.15;
          ribbonHandF = t >= 32 && t <= 54;
          ribbonHandB = t >= 32 && t <= 50;
        }
      }
    } else if (f.state === 'VICTORY') {
      this.hips.position.y = baseHipY + 0.02;
      this.chest.rotation.z = 0.08;
      this.armF.rotation.z = 2.65;
      this.armFElbow.rotation.z = 0.25;
      this.armB.rotation.z = 2.45;
      this.armBElbow.rotation.z = 0.35;
    } else if (f.state === 'DEFEAT') {
      this.hips.position.y = 0.24;
      this.hips.rotation.z = Math.PI * 0.5;
    } else if (f.state === 'ATTACK' && move) {
      const id = move.id;
      const inWindow = t >= Math.max(1, move.startup - 2) && t <= move.startup + move.active + 2;
      const active = t > move.startup && t <= move.startup + move.active;

      if (id === '5P') {
        this.hips.rotation.y = active ? 0.35 : -0.25;
        this.chest.rotation.y = active ? 0.42 : -0.3;
        this.chest.rotation.z = -0.18;
        this.armF.rotation.z = active ? 1.56 : 0.42;
        this.armFElbow.rotation.z = active ? 0.06 : 1.45;
        ribbonHandF = inWindow;
      } else if (id === '6P') {
        if (f.character === 'RYUJIN') {
          this.chest.rotation.z = active ? -0.44 : 0.16;
          this.chest.rotation.y = active ? 0.32 : -0.2;
          this.armF.rotation.z = active ? 1.05 : 2.35;
          this.armFElbow.rotation.z = active ? 0.2 : 0.95;
          this.armB.rotation.z = 0.5;
        } else {
          this.hips.position.y = 0.86;
          this.chest.rotation.z = 0.14;
          this.armF.rotation.z = active ? 2.42 : 0.85;
          this.armFElbow.rotation.z = active ? 0.15 : 1.1;
        }
        ribbonHandF = inWindow;
      } else if (id === '2P') {
        this.hips.position.y = 0.56;
        this.hips.rotation.y = active ? 0.32 : -0.2;
        this.chest.rotation.z = -0.24;
        this.armF.rotation.z = active ? 1.58 : 0.55;
        this.armFElbow.rotation.z = active ? 0.08 : 1.3;
        this.legF.rotation.z = 1.15;
        this.legFKnee.rotation.z = -1.65;
        this.legB.rotation.z = -0.55;
        this.legBKnee.rotation.z = -0.95;
        ribbonHandF = inWindow;
      } else if (id === 'jP') {
        this.chest.rotation.z = -0.28;
        this.armF.rotation.z = active ? 1.25 : 0.65;
        this.armFElbow.rotation.z = active ? 0.12 : 1.15;
        this.legF.rotation.z = 0.78;
        this.legFKnee.rotation.z = -1.1;
        ribbonHandF = inWindow;
      } else if (id === '5K') {
        this.hips.rotation.y = active ? -0.42 : 0.2;
        this.chest.rotation.z = active ? 0.28 : 0.1;
        this.legF.rotation.z = active ? 1.64 : 0.68;
        this.legFKnee.rotation.z = active ? -0.06 : -1.15;
        this.toeF.rotation.z = -0.28;
        this.legB.rotation.z = -0.18;
        this.armF.rotation.z = -0.35;
        ribbonFootF = inWindow;
      } else if (id === '6K') {
        if (f.character === 'KAZE') {
          this.hips.position.y = 0.34;
          this.hips.rotation.z = 0.68;
          this.legF.rotation.z = 1.58;
          this.legFKnee.rotation.z = -0.05;
          this.legB.rotation.z = -0.65;
        } else {
          this.hips.rotation.y = active ? -0.45 : 0.15;
          this.chest.rotation.z = active ? 0.34 : 0.05;
          this.legF.rotation.z = active ? 1.72 : 0.65;
          this.legFKnee.rotation.z = active ? -0.05 : -1.0;
          this.legB.rotation.z = -0.45;
        }
        ribbonFootF = inWindow;
      } else if (id === '2K') {
        this.hips.position.y = 0.42;
        this.hips.rotation.y = active ? -0.35 : 0.15;
        this.chest.rotation.z = active ? 0.35 : -0.15;
        this.legF.rotation.z = active ? 1.68 : 0.75;
        this.legFKnee.rotation.z = active ? -0.06 : -1.1;
        this.legB.rotation.z = -0.85;
        this.legBKnee.rotation.z = -0.9;
        this.armB.rotation.z = -0.5;
        ribbonFootF = inWindow;
      } else if (id === 'jK') {
        this.chest.rotation.z = 0.25;
        this.legF.rotation.z = active ? 1.48 : 0.6;
        this.legFKnee.rotation.z = active ? -0.08 : -1.0;
        this.legB.rotation.z = -0.55;
        this.armF.rotation.z = -0.25;
        ribbonFootF = inWindow;
      } else if (id === 'j214K') {
        this.hips.rotation.z = -0.55;
        this.legF.rotation.z = 1.38;
        this.legFKnee.rotation.z = -0.1;
        this.legB.rotation.z = -0.6;
        this.armF.rotation.z = -0.4;
        ribbonFootF = inWindow;
      } else if (id === '236K' || id === 'EX_236K') {
        if (f.character === 'TITAN') {
          // Spinning Armored Double Lariat
          this.hips.position.y = baseHipY - 0.08;
          this.hips.rotation.y = t * (id === 'EX_236K' ? 0.85 : 0.68);
          this.armF.rotation.z = 1.56;
          this.armFElbow.rotation.z = 0.12;
          this.armB.rotation.z = -1.56;
          this.armBElbow.rotation.z = 0.12;
          ribbonHandF = true;
          ribbonHandB = true;
        } else if (f.character === 'KAZE') {
          this.hips.position.y = 0.78;
          this.chest.rotation.z = -0.52;
          this.armF.rotation.z = 1.65 + Math.sin(t * 0.9) * 0.7;
          this.armFElbow.rotation.z = 0.2;
          this.armB.rotation.z = 1.45 - Math.sin(t * 0.9) * 0.7;
          this.armBElbow.rotation.z = 0.2;
          this.legF.rotation.z = 0.75;
          this.legB.rotation.z = -0.85;
          ribbonHandF = true;
          ribbonHandB = true;
        } else {
          this.hips.position.y = 1.05;
          this.hips.rotation.y = t * (id === 'EX_236K' ? 0.95 : 0.72);
          this.legF.rotation.z = 1.58;
          this.legFKnee.rotation.z = -0.05;
          this.legB.rotation.z = -0.35;
          this.armF.rotation.z = 1.1;
          this.armB.rotation.z = -1.1;
          ribbonFootF = true;
        }
      } else if (id === '41236K') {
        if (f.character === 'TITAN') {
          this.hips.position.y = baseHipY - 0.05;
          this.hips.rotation.y = t * 0.85;
          this.armF.rotation.z = 1.56;
          this.armFElbow.rotation.z = 0.12;
          this.armB.rotation.z = -1.56;
          this.armBElbow.rotation.z = 0.12;
          ribbonHandF = true;
          ribbonHandB = true;
        } else {
          this.hips.position.y = 0.88;
          this.chest.rotation.z = -0.42;
          this.armF.rotation.z = 1.55 + Math.sin(t * 1.1) * 0.65;
          this.armFElbow.rotation.z = 0.22;
          this.legF.rotation.z = 1.35 + Math.cos(t * 1.1) * 0.45;
          this.legFKnee.rotation.z = -0.15;
          ribbonHandF = true;
          ribbonFootF = true;
        }
      } else if (id === '236P' || id === 'EX_236P' || id === 'j236P') {
        const thrust = t >= move.startup;
        this.hips.rotation.y = thrust ? 0.25 : -0.45;
        this.chest.rotation.y = thrust ? 0.25 : -0.35;
        this.chest.rotation.z = thrust ? -0.32 : 0.14;
        this.armF.rotation.z = thrust ? 1.55 : -0.55;
        this.armFElbow.rotation.z = thrust ? 0.08 : 1.55;
        this.armB.rotation.z = thrust ? 1.55 : -0.55;
        this.armBElbow.rotation.z = thrust ? 0.08 : 1.55;
        fingerCurlF = 0.15;
        fingerCurlB = 0.15;
        showChargeF = !thrust;
        showChargeB = !thrust;
        ribbonHandF = thrust && inWindow;
        ribbonHandB = thrust && inWindow;
      } else if (id === '214P' || id === 'EX_214P') {
        this.hips.rotation.y = active ? 0.42 : -0.35;
        this.chest.rotation.z = active ? -0.36 : 0.22;
        this.armF.rotation.z = active ? 1.62 : -0.35;
        this.armFElbow.rotation.z = active ? 0.1 : 1.2;
        this.armB.rotation.z = active ? 1.2 : 0.85;
        fingerCurlF = 0.15;
        ribbonHandF = inWindow;
        ribbonHandB = id === 'EX_214P';
      } else if (id === '214K') {
        if (f.character === 'TITAN') {
          this.hips.position.y = baseHipY - 0.14;
          this.chest.rotation.z = -0.52;
          this.chest.rotation.y = 0.55;
          this.armF.rotation.z = -0.35;
          this.armFElbow.rotation.z = 1.45;
          this.legF.rotation.z = 0.65;
          this.legB.rotation.z = -0.75;
          ribbonHandF = true;
        } else if (f.character === 'RYUJIN') {
          this.hips.position.y = 1.05;
          this.chest.rotation.z = -0.2;
          this.legF.rotation.z = active ? 1.15 : 2.35;
          this.legFKnee.rotation.z = active ? -0.1 : -0.45;
          ribbonFootF = inWindow;
        } else {
          this.hips.position.y = 0.75;
          this.chest.rotation.z = -0.55;
          this.hips.rotation.y = t * 0.6;
          ribbonHandF = true;
          ribbonHandB = true;
        }
      } else if (id === '22P') {
        if (f.character === 'TITAN') {
          const stompDown = t >= move.startup;
          this.hips.position.y = stompDown ? baseHipY - 0.22 : baseHipY + 0.12;
          this.chest.rotation.z = stompDown ? -0.35 : 0.18;
          this.legF.rotation.z = stompDown ? 0.45 : 1.42;
          this.legFKnee.rotation.z = stompDown ? -0.4 : -1.55;
          this.armF.rotation.z = stompDown ? 0.45 : 2.4;
          this.armB.rotation.z = stompDown ? 0.35 : 2.3;
          ribbonFootF = true;
          ribbonHandF = stompDown;
        } else {
          this.hips.position.y = 0.8;
          this.armF.rotation.z = 2.3;
          this.armFElbow.rotation.z = 0.4;
          this.armB.rotation.z = 2.3;
          this.armBElbow.rotation.z = 0.4;
          fingerCurlF = 0.15;
          fingerCurlB = 0.15;
          showChargeF = true;
          showChargeB = true;
        }
      } else if (id === '623P' || id === 'EX_623P') {
        this.hips.rotation.y = 0.35;
        this.chest.rotation.z = -0.12;
        this.armF.rotation.z = 2.95;
        this.armFElbow.rotation.z = 0.08;
        this.legF.rotation.z = 0.95;
        this.legFKnee.rotation.z = -1.25;
        ribbonHandF = true;
        if (id === 'EX_623P') ribbonHandB = true;
      } else if (id === 'FOCUS') {
        this.chest.rotation.z = active ? -0.45 : 0.3;
        this.armF.rotation.z = active ? 1.65 : -0.45;
        this.armFElbow.rotation.z = active ? 0.1 : 1.1;
        this.armB.rotation.z = active ? 1.25 : 1.75;
        showChargeF = !active;
        ribbonHandF = active;
      } else if (id === 'ROLL') {
        this.hips.position.y = 0.55;
        this.hips.rotation.z = -t * 0.48;
        this.legF.rotation.z = 1.05;
        this.legFKnee.rotation.z = -1.5;
        this.legB.rotation.z = -0.9;
      } else if (id === 'THROW' || id === '63214T') {
        const whiffing = t > move.startup + move.active && !f.moveConnected;
        fingerCurlF = 0.15;
        fingerCurlB = 0.15;
        if (whiffing) {
          this.chest.rotation.z = -0.38;
          this.armF.rotation.z = 0.35;
          this.armB.rotation.z = -0.45;
          this.legF.rotation.z = 0.48;
        } else {
          this.armF.rotation.z = id === '63214T' ? 2.1 : 1.55;
          this.armFElbow.rotation.z = 0.25;
          this.armB.rotation.z = id === '63214T' ? 2.0 : 1.45;
          this.armBElbow.rotation.z = 0.25;
          ribbonHandF = true;
          ribbonHandB = true;
        }
      } else if (id === 'SUPER') {
        this.chest.rotation.z = -0.35;
        this.armF.rotation.z = 1.6 + Math.sin(t * 1.4) * 0.45;
        this.armFElbow.rotation.z = 0.15;
        this.armB.rotation.z = 1.6 - Math.sin(t * 1.4) * 0.45;
        this.armBElbow.rotation.z = 0.15;
        fingerCurlF = 0.15;
        fingerCurlB = 0.15;
        showChargeF = t < move.startup;
        showChargeB = t < move.startup;
        ribbonHandF = true;
        ribbonHandB = true;
        ribbonFootF = true;
      }
    }

    if (f.state === 'DASH_F') {
      ribbonHandF = true;
      ribbonFootB = true;
    }

    // Apply articulated hand curl & charging palm glow
    this.fingerF.rotation.z = fingerCurlF;
    this.fingerB.rotation.z = fingerCurlB;
    this.chargeOrbF.visible = showChargeF;
    this.chargeOrbB.visible = showChargeB;
    if (showChargeF || showChargeB) {
      const pulse = 0.85 + Math.sin(globalFrame * 0.7) * 0.35;
      this.chargeOrbF.scale.setScalar(pulse);
      this.chargeOrbB.scale.setScalar(pulse);
    }

    // Step secondary spring physics only on advancing frames
    if (hitstop === 0 && globalFrame !== this.lastAnimFrame) {
      this.stepSpringChains(f, globalFrame);
    }

    // Hitstop micro-shake on impacted / blocking defender
    if (
      hitstop > 0 &&
      (f.state === 'HITSTUN' ||
        f.state === 'JUGGLE' ||
        f.state === 'THROWN' ||
        f.state === 'BLOCK_STAND' ||
        f.state === 'BLOCK_CROUCH')
    ) {
      this.hips.position.x += Math.sin(globalFrame * 3.1 + f.id * 1.7) * 0.055;
      this.hips.position.y += Math.cos(globalFrame * 2.4) * 0.025;
    }

    // Squash & stretch for crisp arcade feel
    let targetSx = 1;
    let targetSy = 1;
    let targetSz = 1;
    if (f.vy > 0.12) {
      targetSx = 0.91;
      targetSy = 1.1;
      targetSz = 0.93;
    } else if (f.vy < -0.14) {
      targetSx = 1.07;
      targetSy = 0.93;
      targetSz = 1.03;
    } else if (f.state === 'CROUCH' && f.stateFrame <= 3) {
      targetSx = 1.1;
      targetSy = 0.9;
      targetSz = 1.05;
    }
    this.root.scale.x += (targetSx - this.root.scale.x) * 0.3;
    this.root.scale.y += (targetSy - this.root.scale.y) * 0.3;
    this.root.scale.z += (targetSz - this.root.scale.z) * 0.3;

    // Contact shadow anchored to y = 0 regardless of fighter height f.y
    this.contactShadow.position.y = -f.y + 0.02;
    const heightScale = Math.max(0.42, 1 - f.y * 0.22);
    this.contactShadow.scale.set(heightScale, heightScale, 1);
    (this.contactShadow.material as THREE.MeshBasicMaterial).opacity =
      0.82 * heightScale;

    // Aura, Super-ready rim pulse & hit/block flashes
    const auraMat = this.aura.material as THREE.MeshBasicMaterial;
    const isBackdashInvuln = f.state === 'DASH_B' && f.invulnFrames > 0;
    const isExMove = Boolean(move && move.isEx);
    const isSuperMove = Boolean(move && move.isSuper);
    const hasArmor = f.armorHits > 0;
    const superReady = f.superMeter >= 100;
    const showAura =
      f.invulnFrames > 0 ||
      hasArmor ||
      isExMove ||
      isSuperMove ||
      introAura ||
      f.state === 'DASH_F';

    if (isBackdashInvuln) {
      auraMat.color.setHex(0xe0f2fe);
      auraMat.opacity = 0.56;
    } else if (isExMove || hasArmor) {
      auraMat.color.setHex(0xfacc15);
      auraMat.opacity = hasArmor ? 0.48 : 0.42;
    } else if (f.state === 'DASH_F') {
      auraMat.color.setHex(this.accentHex);
      auraMat.opacity = 0.24;
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
      this.matBody.emissiveIntensity = 0.9;
      this.matArmor.emissive.setHex(0xffffff);
      this.matArmor.emissiveIntensity = 0.65;
    } else if (isBlockFlash) {
      this.matBody.emissive.setHex(0x38bdf8);
      this.matBody.emissiveIntensity = 0.5;
      this.matArmor.emissive.setHex(0x38bdf8);
      this.matArmor.emissiveIntensity = 0.35;
    } else if (hasArmor || isExMove) {
      this.matBody.emissive.setHex(0xfacc15);
      this.matBody.emissiveIntensity = 0.38;
      this.matArmor.emissive.setHex(0xfacc15);
      this.matArmor.emissiveIntensity = 0.25;
    } else {
      this.matBody.emissive.setHex(0x000000);
      this.matBody.emissiveIntensity = 0;
      this.matArmor.emissive.setHex(0x000000);
      this.matArmor.emissiveIntensity = 0;
    }

    // Dynamic anime rim intensity boost when EX, Armor, or Super 100% ready
    const rimBoost =
      isExMove || hasArmor
        ? 1.25
        : superReady
          ? 0.85 + Math.sin(globalFrame * 0.2) * 0.25
          : 0.72;
    this.bodyUniforms.uRimStrength.value = rimBoost;
    this.armorUniforms.uRimStrength.value = rimBoost + 0.15;
    if (isExMove || hasArmor) {
      this.bodyUniforms.uRimColor.value.setHex(0xfacc15);
      this.armorUniforms.uRimColor.value.setHex(0xfacc15);
    } else {
      this.bodyUniforms.uRimColor.value.setHex(this.accentHex);
      this.armorUniforms.uRimColor.value.setHex(this.accentHex);
    }

    // Update continuous world-space Ribbon Trails
    if (hitstop === 0 && globalFrame !== this.lastAnimFrame) {
      this.root.updateMatrixWorld(true);
      const trailCol = isExMove || hasArmor ? 0xfacc15 : this.accentHex;

      const updateRibbon = (
        activeFlag: boolean,
        channel: RibbonChannel,
        tipObj: THREE.Object3D,
        baseObj: THREE.Object3D
      ): void => {
        if (activeFlag) {
          tipObj.getWorldPosition(_vTip);
          baseObj.getWorldPosition(_vBase);
          channel.pushSample(_vTip, _vBase, trailCol);
        } else {
          channel.decay();
        }
      };

      updateRibbon(ribbonHandF, this.ribbons.handF, this.handFTip, this.handFBase);
      updateRibbon(ribbonHandB, this.ribbons.handB, this.handBTip, this.handBBase);
      updateRibbon(ribbonFootF, this.ribbons.footF, this.footFTip, this.footFBase);
      updateRibbon(ribbonFootB, this.ribbons.footB, this.footBTip, this.footBBase);
    }

    // Ghost afterimages on high-speed dashes, rolls, specials, EX & Supers
    const isGhostMove =
      f.state === 'DASH_F' ||
      f.state === 'DASH_B' ||
      (f.state === 'ATTACK' &&
        move !== null &&
        (move.isEx ||
          move.isSuper ||
          move.id === 'ROLL' ||
          move.id === '214K' ||
          move.id === '41236K' ||
          move.id === '236K' ||
          move.id === '623P'));

    if (
      hitstop === 0 &&
      isGhostMove &&
      globalFrame !== this.lastGhostFrame &&
      globalFrame % 2 === 0
    ) {
      const ghostColor =
        isExMove || hasArmor
          ? 0xfacc15
          : isBackdashInvuln
            ? 0xe0f2fe
            : this.accentHex;
      this.spawnGhostSnapshot(f, ghostColor);
      this.lastGhostFrame = globalFrame;
    }
    this.updateGhosts();
    this.lastAnimFrame = globalFrame;
  }

  public dispose(): void {
    this.disposeGroup(this.root);
    this.disposeGroup(this.trailGroup);
    this.ribbons.handF.dispose();
    this.ribbons.handB.dispose();
    this.ribbons.footF.dispose();
    this.ribbons.footB.dispose();
  }
}
