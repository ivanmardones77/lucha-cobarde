import * as THREE from 'three';
import { STAGE_HALF_WIDTH } from '../core/types';
import { createVolumetricBeamMaterial } from './AlleyStage3D';
import floorUrl from '../assets/images/rooftop_floor_metal_1795779368418.jpg';
import holoAdUrl from '../assets/images/rooftop_holo_ad_1795781927260.jpg';
import skylineUrl from '../assets/images/rooftop_skyline_far_1795779368218.jpg';

interface SkyTraffic {
  group: THREE.Group;
  speed: number;
  baseY: number;
  baseZ: number;
}

export class RooftopStage3D {
  public group = new THREE.Group();

  private farSkyPlane!: THREE.Mesh;
  private farSkyMat!: THREE.MeshBasicMaterial;
  private searchlightL!: THREE.Mesh;
  private searchlightR!: THREE.Mesh;
  private radarDish!: THREE.Group;
  private turbines: THREE.Group[] = [];
  private holoMats: THREE.MeshStandardMaterial[] = [];
  private neonMats: Array<{
    mat: THREE.MeshBasicMaterial;
    baseColor: number;
    seed: number;
  }> = [];
  private skyTraffic: SkyTraffic[] = [];
  private beamMats: THREE.ShaderMaterial[] = [];
  private spotLights: THREE.SpotLight[] = [];
  private textures: THREE.Texture[] = [];
  private impactEnergy = 0;

  constructor() {
    const loader = new THREE.TextureLoader();
    const skylineTex = this.loadColorTexture(loader, skylineUrl);
    const floorTex = this.loadColorTexture(loader, floorUrl);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(3.2, 1.4);

    const holoTex = this.loadColorTexture(loader, holoAdUrl);

    this.buildSkylineBackdrop(skylineTex);
    this.buildHelipadDeck(floorTex);
    this.buildRooftopStructures(holoTex);
    this.buildForegroundGirders();
    this.buildSkyTraffic();
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

  private createDeckPlateMaps(): {
    normalMap: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
  } {
    const size = 256;
    const nCanvas = document.createElement('canvas');
    nCanvas.width = size;
    nCanvas.height = size;
    const nctx = nCanvas.getContext('2d')!;
    nctx.fillStyle = 'rgb(128, 128, 255)';
    nctx.fillRect(0, 0, size, size);

    const rCanvas = document.createElement('canvas');
    rCanvas.width = size;
    rCanvas.height = size;
    const rctx = rCanvas.getContext('2d')!;
    rctx.fillStyle = '#5c5c5c';
    rctx.fillRect(0, 0, size, size);

    // Metallic deck panel seams & diamond plate ridges
    nctx.strokeStyle = 'rgb(96, 128, 240)';
    nctx.lineWidth = 3;
    rctx.strokeStyle = '#9e9e9e';
    rctx.lineWidth = 3;
    for (let i = 0; i <= size; i += 64) {
      nctx.strokeRect(i, 0, 64, size);
      nctx.strokeRect(0, i, size, 64);
      rctx.strokeRect(i, 0, 64, size);
      rctx.strokeRect(0, i, size, 64);
    }

    for (let y = 8; y < size; y += 16) {
      for (let x = 8; x < size; x += 16) {
        nctx.fillStyle = ((x + y) / 16) % 2 === 0 ? 'rgb(155, 138, 250)' : 'rgb(110, 145, 250)';
        nctx.fillRect(x, y, 4, 2);
        rctx.fillStyle = '#383838';
        rctx.fillRect(x, y, 4, 2);
      }
    }

    const normalMap = new THREE.CanvasTexture(nCanvas);
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(4, 2);

    const roughnessMap = new THREE.CanvasTexture(rCanvas);
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.repeat.set(4, 2);

    this.textures.push(normalMap, roughnessMap);
    return { normalMap, roughnessMap };
  }

  private createHorizonMist(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, 'rgba(15, 10, 32, 0)');
      grad.addColorStop(0.55, 'rgba(26, 16, 48, 0.45)');
      grad.addColorStop(1, 'rgba(8, 12, 24, 0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    this.textures.push(tex);
    return tex;
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
    });
    this.neonMats.push({ mat, baseColor: colorHex, seed });
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  }

  private buildSkylineBackdrop(skylineTex: THREE.Texture): void {
    this.farSkyMat = new THREE.MeshBasicMaterial({
      map: skylineTex,
      color: 0xf8fafc,
      fog: false,
    });
    this.farSkyPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 24.8),
      this.farSkyMat
    );
    this.farSkyPlane.position.set(0, 6.2, -19.2);
    this.group.add(this.farSkyPlane);

    const horizonMist = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 5.2),
      new THREE.MeshBasicMaterial({
        map: this.createHorizonMist(),
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      })
    );
    horizonMist.position.set(0, 1.2, -9.5);
    this.group.add(horizonMist);

    const beamGeo = new THREE.ConeGeometry(3.2, 22, 28, 1, true);
    const beamMatL = createVolumetricBeamMaterial(0xf59e0b, 0.11);
    const beamMatR = createVolumetricBeamMaterial(0xa855f7, 0.11);
    this.beamMats.push(beamMatL, beamMatR);

    this.searchlightL = new THREE.Mesh(beamGeo, beamMatL);
    this.searchlightL.position.set(-6.5, 6.4, -14.8);
    this.searchlightL.rotation.z = -0.32;

    this.searchlightR = new THREE.Mesh(beamGeo, beamMatR);
    this.searchlightR.position.set(6.8, 6.8, -15.2);
    this.searchlightR.rotation.z = 0.34;

    this.group.add(this.searchlightL, this.searchlightR);
  }

  private buildHelipadDeck(floorTex: THREE.Texture): void {
    const deckMaps = this.createDeckPlateMaps();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(25, 11.2),
      new THREE.MeshPhysicalMaterial({
        map: floorTex,
        normalMap: deckMaps.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: deckMaps.roughnessMap,
        color: 0xe2e8f0,
        roughness: 0.55,
        metalness: 0.65,
        clearcoat: 0.45,
        clearcoatRoughness: 0.18,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -1.6;
    floor.receiveShadow = true;
    this.group.add(floor);

    const padRing = new THREE.Mesh(
      new THREE.RingGeometry(2.15, 2.3, 40),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.58,
        toneMapped: false,
      })
    );
    padRing.rotation.x = -Math.PI / 2;
    padRing.position.set(0, 0.015, -0.8);
    this.group.add(padRing);

    const darkSteel = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.4,
      metalness: 0.78,
    });
    const parapet = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.42, 0.48),
      darkSteel
    );
    parapet.position.set(0, 0.21, -3.55);
    parapet.receiveShadow = true;
    this.group.add(parapet);

    const edgeStrip = this.createNeonBar(24, 0.055, 0.08, 0xf59e0b, 0.5);
    edgeStrip.position.set(0, 0.43, -3.35);
    this.group.add(edgeStrip);

    for (let x = -9; x <= 9; x += 2.25) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.95, 0.09),
        darkSteel
      );
      post.position.set(x, 0.85, -3.55);
      this.group.add(post);
    }
    const topRail = new THREE.Mesh(
      new THREE.BoxGeometry(21, 0.07, 0.09),
      darkSteel
    );
    topRail.position.set(0, 1.32, -3.55);
    this.group.add(topRail);

    // Sculpted Corner Arena Limit Laser Beacons
    for (const side of [-1, 1] as const) {
      const px = side * (STAGE_HALF_WIDTH + 0.55);
      const pylonProfile = [
        new THREE.Vector2(0.18, 0),
        new THREE.Vector2(0.15, 0.25),
        new THREE.Vector2(0.12, 1.55),
        new THREE.Vector2(0.16, 1.65),
        new THREE.Vector2(0, 1.78),
      ];
      const pylon = new THREE.Mesh(
        new THREE.LatheGeometry(pylonProfile, 8),
        darkSteel
      );
      pylon.position.set(px, 0, -1.9);
      const light = this.createNeonBar(
        0.1,
        1.1,
        0.26,
        side === -1 ? 0xf59e0b : 0x38bdf8,
        side + 2
      );
      light.position.set(px, 0.92, -1.9);
      this.group.add(pylon, light);
    }
  }

  private buildRooftopStructures(holoTex: THREE.Texture): void {
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.72,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.52,
      metalness: 0.68,
    });

    // Twin Holographic Cyber-Dragon Skyscraper Billboards framing the arena
    for (const [px, accentCol, seed] of [
      [-4.6, 0xf59e0b, 1.1],
      [4.6, 0x38bdf8, 2.7],
    ] as const) {
      const frameBack = new THREE.Mesh(
        new THREE.BoxGeometry(2.15, 2.88, 0.22),
        darkMat
      );
      frameBack.position.set(px, 3.05, -4.75);
      this.group.add(frameBack);

      // Steel support legs anchoring billboard to rooftop deck
      for (const legOff of [-0.75, 0.75]) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.1, 2.0, 8),
          steelMat
        );
        leg.position.set(px + legOff, 1.0, -4.75);
        this.group.add(leg);
      }

      const holoMat = new THREE.MeshStandardMaterial({
        map: holoTex,
        emissiveMap: holoTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.56,
        roughness: 0.25,
        metalness: 0.3,
      });
      this.holoMats.push(holoMat);

      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.98, 2.68), holoMat);
      panel.position.set(px, 3.05, -4.62);
      this.group.add(panel);

      const strip = this.createNeonBar(2.18, 0.06, 0.08, accentCol, seed);
      strip.position.set(px, 4.52, -4.62);
      const spot = new THREE.SpotLight(accentCol, 11, 12, Math.PI * 0.3, 0.85, 1.7);
      spot.position.set(px, 4.5, -4.2);
      spot.target.position.set(px * 0.85, 0, -0.8);
      this.spotLights.push(spot);
      this.group.add(strip, spot, spot.target);
    }

    // Sculpted Lathe Parabolic Radar Array behind the center helipad
    const radarMastProfile = [
      new THREE.Vector2(0.65, 0),
      new THREE.Vector2(0.45, 0.35),
      new THREE.Vector2(0.32, 1.55),
      new THREE.Vector2(0.38, 1.65),
      new THREE.Vector2(0.18, 1.75),
    ];
    const radarBase = new THREE.Mesh(
      new THREE.LatheGeometry(radarMastProfile, 12),
      darkMat
    );
    radarBase.position.set(0, 0, -5.25);
    this.group.add(radarBase);

    this.radarDish = new THREE.Group();
    this.radarDish.position.set(0, 2.15, -5.25);

    const dishProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.42, 0.07),
      new THREE.Vector2(0.84, 0.26),
      new THREE.Vector2(1.12, 0.52),
      new THREE.Vector2(1.06, 0.56),
      new THREE.Vector2(0.78, 0.29),
      new THREE.Vector2(0.38, 0.1),
      new THREE.Vector2(0.0, 0.04),
    ];
    const dishMesh = new THREE.Mesh(
      new THREE.LatheGeometry(dishProfile, 24),
      steelMat
    );
    dishMesh.rotation.x = Math.PI * 0.42;

    const dishRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.09, 0.035, 8, 24),
      darkMat
    );
    dishRim.rotation.x = Math.PI * 0.42 + Math.PI / 2;
    dishRim.position.set(0, 0.12, 0.48);

    const feedHorn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.06, 0.65, 8),
      darkMat
    );
    feedHorn.rotation.x = Math.PI * 0.42;
    feedHorn.position.set(0, 0.08, 0.32);

    const dishBeacon = this.createNeonBar(0.14, 0.14, 0.14, 0xf43f5e, 3.1);
    dishBeacon.position.set(0, 0.18, 0.65);

    this.radarDish.add(dishMesh, dishRim, feedHorn, dishBeacon);
    this.group.add(this.radarDish);

    // Detailed Multi-Blade HVAC Exhaust Turbines with Circular Cowlings
    for (const tx of [-7.4, 7.4]) {
      const hvacGroup = new THREE.Group();
      hvacGroup.position.set(tx, 0, -4.4);

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 1.35, 1.3),
        steelMat
      );
      box.position.y = 0.675;
      hvacGroup.add(box);

      const shroud = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.08, 10, 24),
        darkMat
      );
      shroud.position.set(0, 0.68, 0.65);
      hvacGroup.add(shroud);

      const backing = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 20),
        new THREE.MeshBasicMaterial({ color: 0x050811 })
      );
      backing.position.set(0, 0.68, 0.66);
      hvacGroup.add(backing);

      const fanPivot = new THREE.Group();
      fanPivot.position.set(0, 0.68, 0.68);
      const hub = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.16, 10),
        steelMat
      );
      hub.rotation.x = Math.PI / 2;
      fanPivot.add(hub);

      const bladeGeo = new THREE.BoxGeometry(0.42, 0.1, 0.025);
      for (let b = 0; b < 6; b++) {
        const bladeHolder = new THREE.Group();
        bladeHolder.rotation.z = (b / 6) * Math.PI * 2;
        const blade = new THREE.Mesh(bladeGeo, steelMat);
        blade.position.x = 0.24;
        blade.rotation.x = 0.42;
        bladeHolder.add(blade);
        fanPivot.add(bladeHolder);
      }

      hvacGroup.add(fanPivot);
      this.group.add(hvacGroup);
      this.turbines.push(fanPivot);
    }
  }

  private buildForegroundGirders(): void {
    const fgMat = new THREE.MeshBasicMaterial({ color: 0x04060c });
    for (const side of [-1, 1] as const) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 8.2, 0.32),
        fgMat
      );
      beam.position.set(side * 9.0, 3.2, 3.35);
      this.group.add(beam);
    }
  }

  private buildSkyTraffic(): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.75,
    });
    const cols = [0xf59e0b, 0x38bdf8, 0xf43f5e];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const dir = i % 2 === 0 ? 1 : -1;
      const hull = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.75, 5),
        bodyMat
      );
      hull.rotation.z = dir === 1 ? -Math.PI / 2 : Math.PI / 2;

      const thrusterMat = new THREE.MeshBasicMaterial({
        color: cols[i % cols.length],
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
      });
      const trail = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.75, 6),
        thrusterMat
      );
      trail.rotation.z = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      trail.position.x = -dir * 0.6;

      g.add(hull, trail);
      const baseY = 1.6 + (i % 6) * 1.1;
      const baseZ = -10.5 - (i % 4) * 1.6;
      g.position.set((i - 6) * 2.8, baseY, baseZ);
      this.group.add(g);
      this.skyTraffic.push({
        group: g,
        speed: dir * (0.095 + (i % 3) * 0.045),
        baseY,
        baseZ,
      });
    }
  }

  public triggerImpact(_x: number, intensity: number): void {
    this.impactEnergy = Math.min(1.6, this.impactEnergy + intensity);
  }

  public update(cameraX: number, frame: number, isSuperFlash: boolean): void {
    this.farSkyPlane.position.x = cameraX * 0.44;
    this.impactEnergy *= 0.91;

    this.searchlightL.rotation.z = -0.32 + Math.sin(frame * 0.012) * 0.26;
    this.searchlightR.rotation.z = 0.34 + Math.cos(frame * 0.01) * 0.28;
    for (const bm of this.beamMats) {
      bm.uniforms.uTime.value = frame * 0.03;
      bm.uniforms.uOpacity.value = isSuperFlash ? 0.02 : 0.11;
    }
    for (const sl of this.spotLights) {
      sl.intensity = isSuperFlash ? 2.0 : 11;
    }

    this.radarDish.rotation.y += 0.025 + this.impactEnergy * 0.06;
    for (const fan of this.turbines) {
      fan.rotation.z += 0.14;
    }

    for (const car of this.skyTraffic) {
      car.group.position.x += car.speed;
      if (car.group.position.x > 18) car.group.position.x = -18;
      if (car.group.position.x < -18) car.group.position.x = 18;
    }

    for (const hm of this.holoMats) {
      hm.emissiveIntensity = isSuperFlash
        ? 0.15
        : 0.52 + Math.sin(frame * 0.09) * 0.06 + this.impactEnergy * 0.14;
    }

    for (const n of this.neonMats) {
      if (isSuperFlash) {
        n.mat.color.setHex(0x1e293b);
        continue;
      }
      const pulse = 0.85 + Math.sin(frame * 0.08 + n.seed) * 0.08;
      const surge = this.impactEnergy > 0.3 ? 1.15 : 0.95;
      n.mat.color.setHex(n.baseColor).multiplyScalar(pulse * surge);
    }

    if (isSuperFlash) {
      this.farSkyMat.color.setHex(0x1e293b);
    } else {
      this.farSkyMat.color.setHex(0xf8fafc);
    }
  }

  public dispose(): void {
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    this.group.traverse((obj) => {
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
    for (const t of this.textures) {
      t.dispose();
    }
  }
}
