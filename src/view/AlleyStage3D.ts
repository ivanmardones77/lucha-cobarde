import * as THREE from 'three';
import { STAGE_HALF_WIDTH } from '../core/types';
import asphaltUrl from '../assets/images/alley_asphalt_floor_1795773805435.webp';
import billboardUrl from '../assets/images/alley_billboard_art_1795773806321.webp';
import midgroundUrl from '../assets/images/alley_midground_walls_1795773805104.webp';
import neonSignsUrl from '../assets/images/alley_neon_signs_1795781927107.webp';
import skylineUrl from '../assets/images/alley_skyline_far_1795773803949.webp';
import vendingFrontUrl from '../assets/images/alley_vending_front_1795781925601.webp';

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

export function createVolumetricBeamMaterial(
  colorHex: number,
  maxOpacity = 0.14
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: maxOpacity },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vec3 n = normalize(vNormalView);
        vec3 v = normalize(vViewPos);
        float ndotv = max(0.0, dot(n, v));
        float softEdge = pow(ndotv, 2.8);
        float vertFade = smoothstep(0.0, 0.58, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
        float dust = 0.88 + 0.12 * sin(vUv.y * 16.0 - uTime * 1.4 + vUv.x * 12.56);
        float alpha = softEdge * vertFade * dust * uOpacity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

export class AlleyStage3D {
  public group = new THREE.Group();

  private farSkyPlane!: THREE.Mesh;
  private farSkyMat!: THREE.MeshBasicMaterial;
  private midgroundPlane!: THREE.Mesh;
  private midgroundMat!: THREE.MeshBasicMaterial;
  private billboardMat!: THREE.MeshStandardMaterial;
  private vendingFrontMat!: THREE.MeshStandardMaterial;

  private searchlightL!: THREE.Mesh;
  private searchlightR!: THREE.Mesh;
  private flickerNeonMats: Array<{
    mat: THREE.MeshBasicMaterial;
    baseColor: number;
    seed: number;
  }> = [];
  private hangingSigns: Array<{
    pivot: THREE.Group;
    phase: number;
    glowMat: THREE.MeshBasicMaterial;
    seed: number;
  }> = [];

  private rainMesh!: THREE.InstancedMesh;
  private rainDrops: RainDrop[] = [];
  private rainDummy = new THREE.Object3D();

  private steamPuffs: SteamPuff[] = [];
  private beamMats: THREE.ShaderMaterial[] = [];
  private spotLights: THREE.SpotLight[] = [];
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
    const vendingTex = this.loadColorTexture(loader, vendingFrontUrl);

    this.buildFarParallaxLayer(skylineTex);
    this.buildMidgroundParallaxLayer(midgroundTex);
    this.buildFloorAndCurbs(asphaltTex);
    this.buildAlleyProps(billboardTex, vendingTex);
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

  private createWetPuddleMaps(): {
    roughnessMap: THREE.CanvasTexture;
    normalMap: THREE.CanvasTexture;
  } {
    const w = 512;
    const h = 256;
    const rCanvas = document.createElement('canvas');
    rCanvas.width = w;
    rCanvas.height = h;
    const rctx = rCanvas.getContext('2d')!;

    // Base damp asphalt roughness (~0.62)
    rctx.fillStyle = '#9e9e9e';
    rctx.fillRect(0, 0, w, h);

    // Subtle aggregate grit
    for (let i = 0; i < 2400; i++) {
      const gx = (i * 73) % w;
      const gy = (i * 137) % h;
      rctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(20,20,20,0.14)';
      rctx.fillRect(gx, gy, 2, 2);
    }

    // Mirror-glossy rain puddles (dark = low roughness ~0.06)
    const puddles: Array<[number, number, number, number]> = [
      [110, 145, 78, 32],
      [260, 162, 96, 36],
      [405, 138, 72, 28],
      [185, 195, 58, 20],
      [340, 196, 64, 22],
    ];
    for (const [px, py, rx, ry] of puddles) {
      const grad = rctx.createRadialGradient(px, py, rx * 0.15, px, py, rx);
      grad.addColorStop(0, 'rgba(14, 14, 14, 0.96)');
      grad.addColorStop(0.65, 'rgba(26, 26, 26, 0.88)');
      grad.addColorStop(1, 'rgba(158, 158, 158, 0)');
      rctx.save();
      rctx.translate(px, py);
      rctx.scale(1, ry / rx);
      rctx.translate(-px, -py);
      rctx.fillStyle = grad;
      rctx.beginPath();
      rctx.arc(px, py, rx, 0, Math.PI * 2);
      rctx.fill();
      rctx.restore();
    }

    // Matching normal map with subtle asphalt grain + smooth puddle ripples
    const nCanvas = document.createElement('canvas');
    nCanvas.width = w;
    nCanvas.height = h;
    const nctx = nCanvas.getContext('2d')!;
    nctx.fillStyle = 'rgb(128, 128, 255)';
    nctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 3200; i++) {
      const gx = (i * 97) % w;
      const gy = (i * 53) % h;
      nctx.fillStyle = i % 2 === 0 ? 'rgb(142, 128, 250)' : 'rgb(114, 128, 250)';
      nctx.fillRect(gx, gy, 2, 1);
    }

    for (const [px, py, rx, ry] of puddles) {
      nctx.save();
      nctx.translate(px, py);
      nctx.scale(1, ry / rx);
      nctx.fillStyle = 'rgb(128, 128, 255)';
      nctx.beginPath();
      nctx.arc(0, 0, rx * 0.82, 0, Math.PI * 2);
      nctx.fill();
      // Subtle raindrop ripple rings inside puddles
      nctx.strokeStyle = 'rgba(152, 152, 255, 0.45)';
      nctx.lineWidth = 2;
      nctx.beginPath();
      nctx.arc(-rx * 0.2, 0, rx * 0.24, 0, Math.PI * 2);
      nctx.stroke();
      nctx.beginPath();
      nctx.arc(rx * 0.25, 4, rx * 0.16, 0, Math.PI * 2);
      nctx.stroke();
      nctx.restore();
    }

    const roughnessMap = new THREE.CanvasTexture(rCanvas);
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.needsUpdate = true;

    const normalMap = new THREE.CanvasTexture(nCanvas);
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.needsUpdate = true;

    this.textures.push(roughnessMap, normalMap);
    return { roughnessMap, normalMap };
  }

  private createCorrugatedMetalNormalMap(): THREE.CanvasTexture {
    const w = 128;
    const h = 128;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    for (let x = 0; x < w; x++) {
      const slope = Math.cos((x / 16) * Math.PI * 2);
      const nx = Math.round((0.5 + slope * 0.35) * 255);
      ctx.fillStyle = `rgb(${nx}, 128, 240)`;
      ctx.fillRect(x, 0, 1, h);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    this.textures.push(tex);
    return tex;
  }

  private createNeonSignPair(): [THREE.CanvasTexture, THREE.CanvasTexture] {
    const makePlaceholder = (bg: string): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = bg;
      ctx.fillRect(10, 10, 236, 108);
      return c;
    };

    const topTex = new THREE.CanvasTexture(makePlaceholder('#38bdf8'));
    const botTex = new THREE.CanvasTexture(makePlaceholder('#f43f5e'));
    topTex.colorSpace = THREE.SRGBColorSpace;
    botTex.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(topTex, botTex);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const sliceHalf = (
        syRatio: number,
        hRatio: number,
        target: THREE.CanvasTexture
      ) => {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 256;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(
          img,
          img.width * 0.02,
          img.height * syRatio,
          img.width * 0.96,
          img.height * hRatio,
          0,
          0,
          512,
          256
        );
        target.image = c;
        target.needsUpdate = true;
      };
      sliceHalf(0.02, 0.45, topTex);
      sliceHalf(0.53, 0.45, botTex);
    };
    img.src = neonSignsUrl;

    return [topTex, botTex];
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

    const beamGeo = new THREE.ConeGeometry(3.2, 22, 28, 1, true);
    const beamMatL = createVolumetricBeamMaterial(0x38bdf8, 0.11);
    const beamMatR = createVolumetricBeamMaterial(0xf43f5e, 0.11);
    this.beamMats.push(beamMatL, beamMatR);

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
    const wetMaps = this.createWetPuddleMaps();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 11.5),
      new THREE.MeshPhysicalMaterial({
        map: asphaltTex,
        normalMap: wetMaps.normalMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughnessMap: wetMaps.roughnessMap,
        roughness: 0.85,
        metalness: 0.28,
        clearcoat: 0.92,
        clearcoatRoughness: 0.09,
        clearcoatNormalMap: wetMaps.normalMap,
        clearcoatNormalScale: new THREE.Vector2(0.25, 0.25),
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

    const hazardTex = this.createHazardTexture();
    const curbLip = new THREE.Mesh(
      new THREE.BoxGeometry(25, 0.23, 0.22),
      new THREE.MeshStandardMaterial({
        map: hazardTex,
        roughness: 0.55,
        metalness: 0.2,
      })
    );
    curbLip.position.set(0, 0.115, -2.48);
    curbLip.receiveShadow = true;
    this.group.add(curbLip);

    // Corner laser floor strips
    const boundGeo = new THREE.PlaneGeometry(0.1, 2.2);
    const boundMatL = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      toneMapped: false,
    });
    const boundMatR = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.55,
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

  private buildAlleyProps(
    billboardTex: THREE.Texture,
    vendingTex: THREE.Texture
  ): void {
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.72,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.52,
      metalness: 0.65,
    });
    const corrugatedNorm = this.createCorrugatedMetalNormalMap();

    // Centerpiece Underground Fight Club Billboard Structure + Beveled Frame & Overhead Hoods
    const wallBacking = new THREE.Mesh(
      new THREE.BoxGeometry(5.68, 3.42, 0.3),
      darkMetalMat
    );
    wallBacking.position.set(0, 2.55, -4.56);
    this.group.add(wallBacking);

    this.billboardMat = new THREE.MeshStandardMaterial({
      map: billboardTex,
      emissiveMap: billboardTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.46,
      roughness: 0.35,
      metalness: 0.2,
    });
    const mural = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 2.92),
      this.billboardMat
    );
    mural.position.set(0, 2.55, -4.4);
    this.group.add(mural);

    const trimTop = this.createNeonBar(5.38, 0.06, 0.06, 0x38bdf8, 0.1);
    trimTop.position.set(0, 4.08, -4.36);
    const trimBot = this.createNeonBar(5.38, 0.06, 0.06, 0xf43f5e, 1.4);
    trimBot.position.set(0, 1.02, -4.36);
    this.group.add(trimTop, trimBot);

    // Overhead billboard floodlight brackets
    for (const fx of [-1.8, 0, 1.8]) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.08, 0.45),
        steelMat
      );
      arm.position.set(fx, 4.24, -4.25);
      const hood = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.14, 0.14, 8),
        darkMetalMat
      );
      hood.position.set(fx, 4.18, -4.05);
      hood.rotation.x = 0.45;
      const bulb = this.createNeonBar(0.14, 0.04, 0.08, 0xe0f2fe, fx + 5);
      bulb.position.set(fx, 4.12, -4.02);
      this.group.add(arm, hood, bulb);
    }

    // Supporting Flanged Steel I-Beams flanking the central alley bay
    for (const bx of [-3.1, 3.1]) {
      const web = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 5.8, 0.34),
        darkMetalMat
      );
      web.position.set(bx, 2.9, -4.45);
      const flangeF = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 5.8, 0.08),
        steelMat
      );
      flangeF.position.set(bx, 2.9, -4.3);
      flangeF.castShadow = true;
      this.group.add(web, flangeF);
    }

    // 3D Streetlamps flanking the stage corners
    this.addStreetLamp(-5.45, -2.65, 0x38bdf8, 1);
    this.addStreetLamp(5.45, -2.65, 0xf43f5e, -1);

    // Left Corner Props: Detailed Corrugated Dumpster + Ribbed Toxic Drum
    const dumpsterGroup = new THREE.Group();
    dumpsterGroup.position.set(-7.15, 0.22, -2.95);
    const dumpsterMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a2f,
      normalMap: corrugatedNorm,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.55,
      metalness: 0.42,
    });
    const dumpsterBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.22, 1.15),
      dumpsterMat
    );
    dumpsterBody.position.y = 0.61;
    dumpsterBody.castShadow = true;

    const dumpsterRim = new THREE.Mesh(
      new THREE.BoxGeometry(2.22, 0.1, 1.24),
      steelMat
    );
    dumpsterRim.position.y = 1.22;

    const dumpsterLidL = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.1, 1.18),
      darkMetalMat
    );
    dumpsterLidL.position.set(-0.54, 1.31, -0.02);
    dumpsterLidL.rotation.x = -0.1;

    const dumpsterLidR = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.1, 1.18),
      darkMetalMat
    );
    dumpsterLidR.position.set(0.54, 1.35, -0.04);
    dumpsterLidR.rotation.x = -0.22;
    dumpsterLidR.rotation.z = -0.08;

    const forkPocketL = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.14, 1.2),
      darkMetalMat
    );
    forkPocketL.position.set(-0.98, 0.45, 0);
    dumpsterGroup.add(
      dumpsterBody,
      dumpsterRim,
      dumpsterLidL,
      dumpsterLidR,
      forkPocketL
    );
    this.group.add(dumpsterGroup);

    // Sculpted Lathe/Ribbed Industrial Drum
    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(-5.7, 0.22, -3.15);
    const barrelProfile = [
      new THREE.Vector2(0.32, 0),
      new THREE.Vector2(0.34, 0.04),
      new THREE.Vector2(0.33, 0.32),
      new THREE.Vector2(0.365, 0.34),
      new THREE.Vector2(0.33, 0.37),
      new THREE.Vector2(0.33, 0.62),
      new THREE.Vector2(0.365, 0.64),
      new THREE.Vector2(0.33, 0.67),
      new THREE.Vector2(0.34, 0.94),
      new THREE.Vector2(0.32, 0.98),
      new THREE.Vector2(0, 0.98),
    ];
    const barrel = new THREE.Mesh(
      new THREE.LatheGeometry(barrelProfile, 16),
      new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        roughness: 0.42,
        metalness: 0.55,
      })
    );
    barrel.castShadow = true;
    const barrelBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.342, 0.342, 0.16, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.45,
        metalness: 0.25,
      })
    );
    barrelBand.position.y = 0.5;
    barrelGroup.add(barrel, barrelBand);
    this.group.add(barrelGroup);

    // Right Corner Prop: 2D-Illustrated Cyberpunk Vending Machine Cabinet
    const vendingGroup = new THREE.Group();
    vendingGroup.position.set(7.1, 0.22, -3.1);
    const vendCabinet = new THREE.Mesh(
      new THREE.BoxGeometry(1.42, 2.28, 0.96),
      steelMat
    );
    vendCabinet.position.y = 1.14;
    vendCabinet.castShadow = true;

    const vendTrim = new THREE.Mesh(
      new THREE.BoxGeometry(1.48, 0.1, 1.02),
      darkMetalMat
    );
    vendTrim.position.y = 2.28;

    this.vendingFrontMat = new THREE.MeshStandardMaterial({
      map: vendingTex,
      emissiveMap: vendingTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.88,
      roughness: 0.28,
      metalness: 0.35,
    });
    const vendFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.36, 2.16),
      this.vendingFrontMat
    );
    vendFace.position.set(0, 1.14, 0.485);

    const vendSideGlow = this.createNeonBar(0.04, 1.85, 0.06, 0x38bdf8, 2.4);
    vendSideGlow.position.set(-0.71, 1.14, 0.46);
    vendingGroup.add(vendCabinet, vendTrim, vendFace, vendSideGlow);
    this.group.add(vendingGroup);

    // Arena Boundary Sculpted Hazard Bollards
    for (const side of [-1, 1] as const) {
      const x = side * (STAGE_HALF_WIDTH + 0.55);
      const bollardProfile = [
        new THREE.Vector2(0.15, 0),
        new THREE.Vector2(0.15, 0.12),
        new THREE.Vector2(0.115, 0.16),
        new THREE.Vector2(0.105, 1.24),
        new THREE.Vector2(0.13, 1.28),
        new THREE.Vector2(0.11, 1.38),
        new THREE.Vector2(0, 1.41),
      ];
      const post = new THREE.Mesh(
        new THREE.LatheGeometry(bollardProfile, 12),
        darkMetalMat
      );
      post.position.set(x, 0, -1.75);
      const tip = this.createNeonBar(
        0.24,
        0.12,
        0.24,
        side === -1 ? 0x38bdf8 : 0xf43f5e,
        side === -1 ? 0.4 : 1.9
      );
      tip.position.set(x, 1.22, -1.75);
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
      roughness: 0.4,
      metalness: 0.78,
    });
    const poleProfile = [
      new THREE.Vector2(0.16, 0),
      new THREE.Vector2(0.15, 0.35),
      new THREE.Vector2(0.11, 0.45),
      new THREE.Vector2(0.08, 4.85),
      new THREE.Vector2(0, 4.92),
    ];
    const pole = new THREE.Mesh(
      new THREE.LatheGeometry(poleProfile, 10),
      poleMat
    );
    pole.position.set(x, 0, z);
    pole.castShadow = true;

    const armCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x, 4.75, z),
      new THREE.Vector3(x + dir * 0.42, 5.05, z),
      new THREE.Vector3(x + dir * 0.85, 4.78, z)
    );
    const arm = new THREE.Mesh(
      new THREE.TubeGeometry(armCurve, 10, 0.048, 6, false),
      poleMat
    );

    const hood = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.24, 0.14, 10),
      poleMat
    );
    hood.position.set(x + dir * 0.85, 4.76, z);

    const bulb = this.createNeonBar(0.36, 0.08, 0.2, colorHex, x);
    bulb.position.set(x + dir * 0.85, 4.68, z);

    // Volumetric soft-edge light shaft (no sharp geometric edges)
    const beamMat = createVolumetricBeamMaterial(colorHex, 0.13);
    this.beamMats.push(beamMat);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.85, 4.6, 28, 1, true),
      beamMat
    );
    cone.position.set(x + dir * 0.85, 2.38, z);

    // Real 3D SpotLight illuminating the wet alley puddles & props
    const spot = new THREE.SpotLight(colorHex, 13, 12, Math.PI * 0.28, 0.82, 1.7);
    spot.position.set(x + dir * 0.85, 4.62, z);
    spot.target.position.set(x + dir * 0.55, 0, z + 1.85);
    this.spotLights.push(spot);

    this.group.add(pole, arm, hood, bulb, cone, spot, spot.target);
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

    const [topSignTex, botSignTex] = this.createNeonSignPair();
    const specs: Array<{
      x: number;
      y: number;
      z: number;
      tex: THREE.CanvasTexture;
      phase: number;
    }> = [
      { x: -3.75, y: 4.55, z: -2.9, tex: topSignTex, phase: 0.2 },
      { x: 3.85, y: 4.68, z: -3.0, tex: botSignTex, phase: 2.1 },
    ];
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.75,
      roughness: 0.35,
    });

    for (const s of specs) {
      const pivot = new THREE.Group();
      pivot.position.set(s.x, s.y, s.z);

      // Twin suspension chains
      for (const cx of [-0.52, 0.52]) {
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6),
          frameMat
        );
        rod.position.set(cx, -0.05, 0);
        pivot.add(rod);
      }

      const casing = new THREE.Mesh(
        new THREE.BoxGeometry(1.48, 0.74, 0.12),
        frameMat
      );
      casing.position.y = -0.45;

      const glowMat = new THREE.MeshBasicMaterial({
        map: s.tex,
        color: 0xffffff,
        toneMapped: false,
      });
      const frontFace = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.68),
        glowMat
      );
      frontFace.position.set(0, -0.45, 0.068);

      pivot.add(casing, frontFace);
      this.group.add(pivot);
      this.hangingSigns.push({
        pivot,
        phase: s.phase,
        glowMat,
        seed: s.phase,
      });
    }
  }

  private buildForegroundParallaxEdges(): void {
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
    this.farSkyPlane.position.x = cameraX * 0.46;
    this.midgroundPlane.position.x = cameraX * 0.18;

    this.impactEnergy *= 0.91;

    this.searchlightL.rotation.z = -0.35 + Math.sin(frame * 0.011) * 0.26;
    this.searchlightR.rotation.z = 0.35 + Math.cos(frame * 0.009) * 0.28;
    for (const bm of this.beamMats) {
      bm.uniforms.uTime.value = frame * 0.03;
      bm.uniforms.uOpacity.value = isSuperFlash ? 0.02 : 0.12;
    }
    for (const sl of this.spotLights) {
      sl.intensity = isSuperFlash ? 2.5 : 13;
    }

    for (const s of this.hangingSigns) {
      const impactSwing =
        Math.sin(frame * 0.52 + s.phase) *
        this.impactEnergy *
        0.22 *
        (this.impactBias || 1);
      s.pivot.rotation.z =
        Math.sin(frame * 0.045 + s.phase) * 0.065 + impactSwing;

      if (isSuperFlash) {
        s.glowMat.color.setHex(0x1e293b);
      } else {
        const flicker =
          Math.sin(frame * 0.23 + s.seed * 4) *
            Math.sin(frame * 0.67 + s.seed) >
          0.91
            ? 0.45
            : 0.92;
        s.glowMat.color.setScalar(flicker);
      }
    }

    for (const n of this.flickerNeonMats) {
      if (isSuperFlash) {
        n.mat.color.setHex(0x1e293b);
        continue;
      }
      const wave =
        Math.sin(frame * 0.19 + n.seed * 3.1) *
        Math.sin(frame * 0.71 + n.seed * 1.7);
      const impactFlicker =
        this.impactEnergy > 0.35 && frame % 3 === 0 ? 1.18 : 0.92;
      const dim = wave > 0.92 ? 0.38 : impactFlicker;
      n.mat.color.setHex(n.baseColor).multiplyScalar(dim);
    }

    if (isSuperFlash) {
      this.farSkyMat.color.setHex(0x1e293b);
      this.midgroundMat.color.setHex(0x1e293b);
      this.billboardMat.emissiveIntensity = 0.08;
      this.vendingFrontMat.emissiveIntensity = 0.14;
    } else {
      this.farSkyMat.color.setHex(0xdbeafe);
      this.midgroundMat.color.setHex(0xcbd5e1);
      this.billboardMat.emissiveIntensity = 0.36;
      this.vendingFrontMat.emissiveIntensity = 0.58;
    }

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
