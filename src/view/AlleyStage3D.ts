import * as THREE from 'three';
import { STAGE_HALF_WIDTH } from '../core/types';
import asphaltUrl from '../assets/images/alley_asphalt_floor_1795773805435.jpg';
import billboardUrl from '../assets/images/alley_billboard_art_1795773806321.jpg';
import midgroundUrl from '../assets/images/alley_midground_walls_1795773805104.jpg';
import skylineUrl from '../assets/images/alley_skyline_far_1795773803949.jpg';

interface RainDrop {
  x: number;
  y: number;
  z: number;
  speed: number;
  len: number;
}

interface SteamPuff {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  baseX: number;
  baseZ: number;
  phase: number;
  speed: number;
}

export class AlleyStage3D {
  public group = new THREE.Group();

  private farSkyPlane!: THREE.Mesh;
  private farSkyMat!: THREE.MeshBasicMaterial;
  private midgroundPlane!: THREE.Mesh;
  private midgroundMat!: THREE.MeshBasicMaterial;
  private billboardMat!: THREE.MeshStandardMaterial;

  private searchlightL!: THREE.Mesh;
  private searchlightR!: THREE.Mesh;
  private flickerNeonMats: Array<{
    mat: THREE.MeshBasicMaterial;
    baseColor: number;
    seed: number;
  }> = [];
  private hangingSigns: Array<{ pivot: THREE.Group; phase: number }> = [];

  private rainMesh!: THREE.InstancedMesh;
  private rainDrops: RainDrop[] = [];
  private rainDummy = new THREE.Object3D();

  private steamPuffs: SteamPuff[] = [];
  private textures: THREE.Texture[] = [];
  private impactEnergy = 0;
  private impactBias = 0;

  constructor() {
    const loader = new THREE.TextureLoader();

    const skylineTex = this.loadColorTexture(loader, skylineUrl);
    const midgroundTex = this.loadColorTexture(loader, midgroundUrl);
    const asphaltTex = this.loadColorTexture(loader, asphaltUrl);
    asphaltTex.wrapS = THREE.RepeatWrapping;
    asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set(3.4, 1.35);

    const billboardTex = this.loadColorTexture(loader, billboardUrl);

    this.buildFarParallaxLayer(skylineTex);
    this.buildMidgroundParallaxLayer(midgroundTex);
    this.buildFloorAndCurbs(asphaltTex);
    this.buildAlleyProps(billboardTex);
    this.buildOverheadCablesAndSigns();
    this.buildForegroundParallaxEdges();
    this.buildAtmosphericRain();
    this.buildSewerSteam();
  }

  private loadColorTexture(
    loader: THREE.TextureLoader,
    url: string
  ): THREE.Texture {
    const tex = loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.push(tex);
    return tex;
  }

  private createMistTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, 'rgba(6, 9, 19, 0)');
      grad.addColorStop(0.55, 'rgba(7, 11, 22, 0.55)');
      grad.addColorStop(1, 'rgba(6, 9, 19, 0.96)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    this.textures.push(tex);
    return tex;
  }

  private createSteamTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
      grad.addColorStop(0, 'rgba(148, 197, 255, 0.45)');
      grad.addColorStop(0.5, 'rgba(100, 140, 200, 0.16)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(canvas);
    this.textures.push(tex);
    return tex;
  }

  private createHazardTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#eab308';
      for (let x = -64; x < 320; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 64);
        ctx.lineTo(x + 16, 64);
        ctx.lineTo(x + 38, 0);
        ctx.lineTo(x + 22, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(2, 6, 23, 0.25)';
      ctx.fillRect(0, 0, 256, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(8, 1);
    this.textures.push(tex);
    return tex;
  }

  private buildFarParallaxLayer(skylineTex: THREE.Texture): void {
    this.farSkyMat = new THREE.MeshBasicMaterial({
      map: skylineTex,
      color: 0xdbeafe,
      fog: false,
    });
    this.farSkyPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 23.6),
      this.farSkyMat
    );
    this.farSkyPlane.position.set(0, 7.6, -18.5);
    this.group.add(this.farSkyPlane);

    // Sweeping city searchlight beams behind midground roofs
    const beamGeo = new THREE.ConeGeometry(2.6, 22, 16, 1, true);
    const beamMatL = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const beamMatR = beamMatL.clone();
    beamMatR.color.setHex(0xf43f5e);

    this.searchlightL = new THREE.Mesh(beamGeo, beamMatL);
    this.searchlightL.position.set(-5.8, 7.2, -15.2);
    this.searchlightL.rotation.z = -0.35;

    this.searchlightR = new THREE.Mesh(beamGeo, beamMatR);
    this.searchlightR.position.set(6.4, 7.5, -15.5);
    this.searchlightR.rotation.z = 0.38;

    this.group.add(this.searchlightL, this.searchlightR);
  }

  private buildMidgroundParallaxLayer(midgroundTex: THREE.Texture): void {
    this.midgroundMat = new THREE.MeshBasicMaterial({
      map: midgroundTex,
      color: 0xcbd5e1,
    });
    this.midgroundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(29.5, 16.6),
      this.midgroundMat
    );
    this.midgroundPlane.position.set(0, 5.25, -8.4);
    this.group.add(this.midgroundPlane);

    // Soft atmospheric ground mist bridging the 2D alley backdrop into 3D asphalt
    const mistPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 4.2),
      new THREE.MeshBasicMaterial({
        map: this.createMistTexture(),
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      })
    );
    mistPlane.position.set(0, 1.45, -7.8);
    this.group.add(mistPlane);
  }

  private buildFloorAndCurbs(asphaltTex: THREE.Texture): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 11.5),
      new THREE.MeshStandardMaterial({
        map: asphaltTex,
        color: 0xcbd5e1,
        roughness: 0.3,
        metalness: 0.25,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -1.8;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Concrete raised sidewalk & curb along the back of the alley
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.72,
      metalness: 0.15,
    });
    const sidewalk = new THREE.Mesh(
      new THREE.BoxGeometry(25, 0.22, 4.2),
      sidewalkMat
    );
    sidewalk.position.set(0, 0.11, -4.6);
    sidewalk.receiveShadow = true;
    this.group.add(sidewalk);

    // Hazard striped curb lip separating combat lane from sidewalk
    const curbLip = new THREE.Mesh(
      new THREE.BoxGeometry(25, 0.23, 0.22),
      new THREE.MeshStandardMaterial({
        map: this.createHazardTexture(),
        roughness: 0.55,
        metalness: 0.2,
      })
    );
    curbLip.position.set(0, 0.115, -2.48);
    curbLip.receiveShadow = true;
    this.group.add(curbLip);

    // Subtle glowing combat-zone corner boundary strips on asphalt
    const boundGeo = new THREE.PlaneGeometry(0.1, 2.2);
    const boundMatL = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.52,
      toneMapped: false,
    });
    const boundMatR = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.52,
      toneMapped: false,
    });
    const boundL = new THREE.Mesh(boundGeo, boundMatL);
    boundL.rotation.x = -Math.PI / 2;
    boundL.position.set(-STAGE_HALF_WIDTH - 0.15, 0.015, 0);
    const boundR = new THREE.Mesh(boundGeo, boundMatR);
    boundR.rotation.x = -Math.PI / 2;
    boundR.position.set(STAGE_HALF_WIDTH + 0.15, 0.015, 0);
    this.group.add(boundL, boundR);
  }

  private buildAlleyProps(billboardTex: THREE.Texture): void {
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.48,
      metalness: 0.65,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.6,
    });

    // Centerpiece Underground Fight Club Billboard Structure
    const wallBacking = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 3.35, 0.28),
      darkMetalMat
    );
    wallBacking.position.set(0, 2.55, -4.55);
    this.group.add(wallBacking);

    this.billboardMat = new THREE.MeshStandardMaterial({
      map: billboardTex,
      emissiveMap: billboardTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.42,
      roughness: 0.45,
      metalness: 0.2,
    });
    const mural = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 2.92),
      this.billboardMat
    );
    mural.position.set(0, 2.55, -4.4);
    this.group.add(mural);

    // Neon trim tube around the central mural
    const trimTop = this.createNeonBar(5.35, 0.06, 0.06, 0x38bdf8, 0.1);
    trimTop.position.set(0, 4.05, -4.36);
    const trimBot = this.createNeonBar(5.35, 0.06, 0.06, 0xf43f5e, 1.4);
    trimBot.position.set(0, 1.05, -4.36);
    this.group.add(trimTop, trimBot);

    // Supporting Steel I-Beams flanking the central alley bay
    for (const bx of [-3.1, 3.1]) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 5.8, 0.36),
        steelMat
      );
      beam.position.set(bx, 2.9, -4.45);
      beam.castShadow = true;
      this.group.add(beam);
    }

    // 3D Streetlamps flanking the stage corners
    this.addStreetLamp(-5.45, -2.65, 0x38bdf8, 1);
    this.addStreetLamp(5.45, -2.65, 0xf43f5e, -1);

    // Left Corner Props: Industrial Dumpster + Crates + Toxic Barrel
    const dumpsterGroup = new THREE.Group();
    dumpsterGroup.position.set(-7.15, 0.22, -2.95);
    const dumpsterBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.25, 1.15),
      new THREE.MeshStandardMaterial({
        color: 0x1e3a2f,
        roughness: 0.65,
        metalness: 0.35,
      })
    );
    dumpsterBody.position.y = 0.625;
    dumpsterBody.castShadow = true;
    const dumpsterLid = new THREE.Mesh(
      new THREE.BoxGeometry(2.18, 0.16, 1.22),
      darkMetalMat
    );
    dumpsterLid.position.set(0, 1.32, -0.02);
    dumpsterLid.rotation.x = -0.08;
    dumpsterGroup.add(dumpsterBody, dumpsterLid);
    this.group.add(dumpsterGroup);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.96, 12),
      new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        roughness: 0.5,
        metalness: 0.45,
      })
    );
    barrel.position.set(-5.7, 0.7, -3.15);
    barrel.castShadow = true;
    const barrelStripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.14, 12),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    barrelStripe.position.set(-5.7, 0.8, -3.15);
    this.group.add(barrel, barrelStripe);

    // Right Corner Props: Cyber Vending Machine + Crates
    const vendingGroup = new THREE.Group();
    vendingGroup.position.set(7.1, 0.22, -3.1);
    const vendBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 2.25, 0.95),
      steelMat
    );
    vendBody.position.y = 1.125;
    vendBody.castShadow = true;
    const vendScreen = this.createNeonBar(0.92, 1.15, 0.05, 0x38bdf8, 2.1);
    vendScreen.position.set(0, 1.32, 0.47);
    const vendSlot = this.createNeonBar(0.8, 0.16, 0.05, 0xf43f5e, 3.2);
    vendSlot.position.set(0, 0.48, 0.47);
    vendingGroup.add(vendBody, vendScreen, vendSlot);
    this.group.add(vendingGroup);

    // Arena Boundary Hazard Bollards (mark the corner walls subtly)
    for (const side of [-1, 1] as const) {
      const x = side * (STAGE_HALF_WIDTH + 0.55);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.13, 1.35, 8),
        darkMetalMat
      );
      post.position.set(x, 0.675, -1.75);
      const tip = this.createNeonBar(
        0.26,
        0.16,
        0.26,
        side === -1 ? 0x38bdf8 : 0xf43f5e,
        side === -1 ? 0.4 : 1.9
      );
      tip.position.set(x, 1.36, -1.75);
      this.group.add(post, tip);
    }
  }

  private addStreetLamp(
    x: number,
    z: number,
    colorHex: number,
    dir: 1 | -1
  ): void {
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.75,
    });
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 4.9, 8),
      poleMat
    );
    pole.position.set(x, 2.45, z);
    pole.castShadow = true;

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.1, 0.12),
      poleMat
    );
    arm.position.set(x + dir * 0.4, 4.82, z);
    arm.rotation.z = dir * -0.15;

    const bulb = this.createNeonBar(0.45, 0.1, 0.22, colorHex, x);
    bulb.position.set(x + dir * 0.75, 4.72, z);

    // Volumetric downward light cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.55, 4.6, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.065,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    cone.position.set(x + dir * 0.75, 2.42, z);
    this.group.add(pole, arm, bulb, cone);
  }

  private createNeonBar(
    w: number,
    h: number,
    d: number,
    colorHex: number,
    seed: number
  ): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      toneMapped: false,
    });
    this.flickerNeonMats.push({ mat, baseColor: colorHex, seed });
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  }

  private buildOverheadCablesAndSigns(): void {
    const cableMat = new THREE.MeshBasicMaterial({ color: 0x05070c });
    const spans: Array<[number, number, number, number]> = [
      [-9, 5.6, 9, -3.2],
      [-9, 5.1, 9, -4.1],
      [-8, 6.1, 8, -2.5],
    ];
    for (const [x1, y, x2, z] of spans) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(x1, y, z),
        new THREE.Vector3(0, y - 0.75, z),
        new THREE.Vector3(x2, y + 0.15, z)
      );
      const geo = new THREE.TubeGeometry(curve, 18, 0.025, 5, false);
      this.group.add(new THREE.Mesh(geo, cableMat));
    }

    // Two swaying hanging neon alley signs
    const specs: Array<{ x: number; y: number; z: number; col: number; phase: number }> = [
      { x: -3.65, y: 4.5, z: -2.9, col: 0x38bdf8, phase: 0.2 },
      { x: 3.75, y: 4.65, z: -3.0, col: 0xf43f5e, phase: 2.1 },
    ];
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.7,
      roughness: 0.4,
    });

    for (const s of specs) {
      const pivot = new THREE.Group();
      pivot.position.set(s.x, s.y, s.z);

      const box = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.46, 0.14), frameMat);
      box.position.y = -0.28;
      const glow = this.createNeonBar(1.02, 0.34, 0.16, s.col, s.phase);
      glow.position.y = -0.28;

      pivot.add(box, glow);
      this.group.add(pivot);
      this.hangingSigns.push({ pivot, phase: s.phase });
    }
  }

  private buildForegroundParallaxEdges(): void {
    // Dark out-of-focus foreground pipes placed far outside [-6.2, 6.2] so they
    // rush past the screen edges during corner scrambles without ever blocking fighters
    const fgMat = new THREE.MeshBasicMaterial({ color: 0x03050a });
    for (const side of [-1, 1] as const) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 8, 8),
        fgMat
      );
      pipe.position.set(side * 8.9, 3.2, 3.35);
      this.group.add(pipe);

      const crossBar = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.14, 0.14),
        fgMat
      );
      crossBar.position.set(side * 9.3, 4.1, 3.35);
      this.group.add(crossBar);
    }
  }

  private buildAtmosphericRain(): void {
    const count = 135;
    const geo = new THREE.BoxGeometry(0.014, 0.38, 0.014);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.rainMesh = new THREE.InstancedMesh(geo, mat, count);
    this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < count; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * 20,
        y: Math.random() * 8.5,
        z: -5.5 + Math.random() * 8.5,
        speed: 0.24 + Math.random() * 0.16,
        len: 0.75 + Math.random() * 0.65,
      });
    }
    this.group.add(this.rainMesh);
  }

  private buildSewerSteam(): void {
    const steamTex = this.createSteamTexture();
    const planeGeo = new THREE.PlaneGeometry(1.4, 1.4);
    const vents: Array<[number, number]> = [
      [-2.4, -2.05],
      [2.9, -2.15],
    ];
    for (const [vx, vz] of vents) {
      for (let i = 0; i < 3; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: steamTex,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(planeGeo, mat);
        mesh.position.set(vx, 0.2, vz);
        this.group.add(mesh);
        this.steamPuffs.push({
          mesh,
          mat,
          baseX: vx,
          baseZ: vz,
          phase: i * 0.33 + Math.abs(vx) * 0.1,
          speed: 0.008 + i * 0.0015,
        });
      }
    }
  }

  public triggerImpact(x: number, intensity: number): void {
    this.impactEnergy = Math.min(1.6, this.impactEnergy + intensity);
    this.impactBias = x >= 0 ? 1 : -1;
  }

  public update(cameraX: number, frame: number, isSuperFlash: boolean): void {
    // 2D + 3D Parallax layer shifting
    this.farSkyPlane.position.x = cameraX * 0.46;
    this.midgroundPlane.position.x = cameraX * 0.18;

    this.impactEnergy *= 0.91;

    // Searchlights sweep behind skyline
    this.searchlightL.rotation.z = -0.35 + Math.sin(frame * 0.011) * 0.26;
    this.searchlightR.rotation.z = 0.35 + Math.cos(frame * 0.009) * 0.28;

    // Gentle sway + reactive impact swing on hanging alley neon signs
    for (const s of this.hangingSigns) {
      const impactSwing =
        Math.sin(frame * 0.52 + s.phase) * this.impactEnergy * 0.22 * (this.impactBias || 1);
      s.pivot.rotation.z = Math.sin(frame * 0.045 + s.phase) * 0.065 + impactSwing;
    }

    // Flickering alley neon tubes (amplified when stage receives heavy shock)
    for (const n of this.flickerNeonMats) {
      if (isSuperFlash) {
        n.mat.color.setHex(0x1e293b);
        continue;
      }
      const wave =
        Math.sin(frame * 0.19 + n.seed * 3.1) *
        Math.sin(frame * 0.71 + n.seed * 1.7);
      const impactFlicker = this.impactEnergy > 0.35 && frame % 3 === 0 ? 1.45 : 1.0;
      const dim = wave > 0.92 ? 0.38 : impactFlicker;
      n.mat.color.setHex(n.baseColor).multiplyScalar(dim);
    }

    // Super Flash dramatic backdrop dimming
    if (isSuperFlash) {
      this.farSkyMat.color.setHex(0x1e293b);
      this.midgroundMat.color.setHex(0x1e293b);
      this.billboardMat.emissiveIntensity = 0.08;
    } else {
      this.farSkyMat.color.setHex(0xdbeafe);
      this.midgroundMat.color.setHex(0xcbd5e1);
      this.billboardMat.emissiveIntensity = 0.42;
    }

    // Update falling rain streaks (zero allocations)
    for (let i = 0; i < this.rainDrops.length; i++) {
      const d = this.rainDrops[i];
      d.y -= d.speed;
      d.x -= d.speed * 0.14;
      if (d.y < 0) {
        d.y = 8.4;
        d.x = ((d.x + 10) % 20) - 10;
      }
      this.rainDummy.position.set(d.x, d.y, d.z);
      this.rainDummy.rotation.set(0, 0, -0.14);
      this.rainDummy.scale.set(1, d.len, 1);
      this.rainDummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, this.rainDummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;

    // Update rising sewer steam
    for (const p of this.steamPuffs) {
      p.phase = (p.phase + p.speed) % 1;
      const t = p.phase;
      p.mesh.position.set(
        p.baseX + Math.sin(frame * 0.03 + t * 5) * 0.14,
        0.15 + t * 1.55,
        p.baseZ
      );
      const scale = 0.45 + t * 1.15;
      p.mesh.scale.set(scale, scale, 1);
      p.mat.opacity = Math.sin(t * Math.PI) * (isSuperFlash ? 0.1 : 0.32);
    }
  }

  public dispose(): void {
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
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
    for (const t of this.textures) {
      t.dispose();
    }
  }
}
