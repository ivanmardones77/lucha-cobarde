import * as THREE from 'three';
import { STAGE_HALF_WIDTH } from '../core/types';
import floorUrl from '../assets/images/rooftop_floor_metal_1795779368418.jpg';
import skylineUrl from '../assets/images/rooftop_skyline_far_1795779368218.jpg';

interface SkyTraffic {
  mesh: THREE.Mesh;
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
  private neonMats: Array<{
    mat: THREE.MeshBasicMaterial;
    baseColor: number;
    seed: number;
  }> = [];
  private skyTraffic: SkyTraffic[] = [];
  private textures: THREE.Texture[] = [];
  private impactEnergy = 0;

  constructor() {
    const loader = new THREE.TextureLoader();
    const skylineTex = this.loadColorTexture(loader, skylineUrl);
    const floorTex = this.loadColorTexture(loader, floorUrl);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(3.2, 1.4);

    this.buildSkylineBackdrop(skylineTex);
    this.buildHelipadDeck(floorTex);
    this.buildRooftopStructures();
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
      toneMapped: false,
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

    const beamGeo = new THREE.ConeGeometry(2.8, 22, 16, 1, true);
    const beamMatL = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.085,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const beamMatR = beamMatL.clone();
    beamMatR.color.setHex(0xa855f7);

    this.searchlightL = new THREE.Mesh(beamGeo, beamMatL);
    this.searchlightL.position.set(-6.5, 6.4, -14.8);
    this.searchlightL.rotation.z = -0.32;

    this.searchlightR = new THREE.Mesh(beamGeo, beamMatR);
    this.searchlightR.position.set(6.8, 6.8, -15.2);
    this.searchlightR.rotation.z = 0.34;

    this.group.add(this.searchlightL, this.searchlightR);
  }

  private buildHelipadDeck(floorTex: THREE.Texture): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(25, 11.2),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        color: 0xe2e8f0,
        roughness: 0.36,
        metalness: 0.55,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -1.6;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Illuminated Helipad Ring Emblem recessed on center floor
    const padRing = new THREE.Mesh(
      new THREE.RingGeometry(2.15, 2.28, 36),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.52,
        toneMapped: false,
      })
    );
    padRing.rotation.x = -Math.PI / 2;
    padRing.position.set(0, 0.015, -0.8);
    this.group.add(padRing);

    // Raised Steel Parapet Edge & Guard Rails along the back edge of the roof
    const darkSteel = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.45,
      metalness: 0.72,
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

    // Corner Arena Limit Laser Posts
    for (const side of [-1, 1] as const) {
      const px = side * (STAGE_HALF_WIDTH + 0.55);
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 1.75, 0.24),
        darkSteel
      );
      pylon.position.set(px, 0.88, -1.9);
      const light = this.createNeonBar(
        0.16,
        1.2,
        0.26,
        side === -1 ? 0xf59e0b : 0x38bdf8,
        side + 2
      );
      light.position.set(px, 0.92, -1.9);
      this.group.add(pylon, light);
    }
  }

  private buildRooftopStructures(): void {
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.68,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.65,
    });

    // Twin Holographic Skyscraper Pylons framing the background
    for (const [px, col, seed] of [
      [-4.6, 0xf59e0b, 1.1],
      [4.6, 0x38bdf8, 2.7],
    ] as const) {
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 5.2, 0.75),
        steelMat
      );
      tower.position.set(px, 2.6, -4.6);
      const strip = this.createNeonBar(0.22, 4.4, 0.78, col, seed);
      strip.position.set(px, 2.65, -4.6);
      this.group.add(tower, strip);
    }

    // Central Spinning Radar Array behind the helipad
    const radarBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.62, 1.6, 10),
      darkMat
    );
    radarBase.position.set(0, 0.8, -5.2);
    this.group.add(radarBase);

    this.radarDish = new THREE.Group();
    this.radarDish.position.set(0, 1.95, -5.2);
    const dishCross = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.28, 0.14),
      steelMat
    );
    const dishBeacon = this.createNeonBar(0.18, 0.18, 0.18, 0xf43f5e, 3.1);
    dishBeacon.position.y = 0.25;
    this.radarDish.add(dishCross, dishBeacon);
    this.group.add(this.radarDish);

    // Twin Rooftop HVAC Exhaust Turbines on left & right wings
    for (const tx of [-7.4, 7.4]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.25, 1.3), steelMat);
      box.position.set(tx, 0.62, -4.4);
      this.group.add(box);

      const fanPivot = new THREE.Group();
      fanPivot.position.set(tx, 0.68, -3.72);
      const b1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.14, 0.05),
        darkMat
      );
      const b2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.82, 0.05),
        darkMat
      );
      fanPivot.add(b1, b2);
      this.group.add(fanPivot);
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
    const geo = new THREE.BoxGeometry(0.9, 0.045, 0.045);
    const cols = [0xf59e0b, 0x38bdf8, 0xf43f5e];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: cols[i % cols.length],
        transparent: true,
        opacity: 0.72,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const baseY = 1.6 + (i % 6) * 1.1;
      const baseZ = -10.5 - (i % 4) * 1.6;
      mesh.position.set((i - 7) * 2.5, baseY, baseZ);
      this.group.add(mesh);
      this.skyTraffic.push({
        mesh,
        speed: (i % 2 === 0 ? 1 : -1) * (0.09 + (i % 3) * 0.045),
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

    this.radarDish.rotation.y += 0.025 + this.impactEnergy * 0.06;
    for (const fan of this.turbines) {
      fan.rotation.z += 0.14;
    }

    for (const car of this.skyTraffic) {
      car.mesh.position.x += car.speed;
      if (car.mesh.position.x > 18) car.mesh.position.x = -18;
      if (car.mesh.position.x < -18) car.mesh.position.x = 18;
    }

    for (const n of this.neonMats) {
      if (isSuperFlash) {
        n.mat.color.setHex(0x1e293b);
        continue;
      }
      const pulse = 0.9 + Math.sin(frame * 0.08 + n.seed) * 0.1;
      const surge = this.impactEnergy > 0.3 ? 1.4 : 1.0;
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
