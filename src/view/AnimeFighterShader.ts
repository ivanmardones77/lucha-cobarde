import * as THREE from 'three';
import { CharacterId, CostumePalette } from '../core/types';

export interface CharacterTextureSet {
  fabricMap: THREE.CanvasTexture;
  fabricNormal: THREE.CanvasTexture;
  armorMap: THREE.CanvasTexture;
  armorNormal: THREE.CanvasTexture;
  wrapMap: THREE.CanvasTexture;
  wrapNormal: THREE.CanvasTexture;
  skinMap: THREE.CanvasTexture;
}

let sharedGradientMap: THREE.DataTexture | null = null;
const textureSetCache = new Map<string, CharacterTextureSet>();

export function getAnimeGradientMap(): THREE.DataTexture {
  if (sharedGradientMap) return sharedGradientMap;
  // 4-step stylized cel ramp capped below 255 so white fabrics retain shaded form without blowing out
  const data = new Uint8Array([
    36, 36, 36, 255,
    92, 92, 92, 255,
    174, 174, 174, 255,
    224, 224, 224, 255,
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  sharedGradientMap = tex;
  return tex;
}

function createHeightToNormalMap(
  heightCanvas: HTMLCanvasElement,
  strength = 2.4
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const ctx = heightCanvas.getContext('2d');
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');

  if (ctx && outCtx) {
    const src = ctx.getImageData(0, 0, w, h).data;
    const dstImg = outCtx.createImageData(w, h);
    const dst = dstImg.data;

    const sampleH = (x: number, y: number): number => {
      const wx = ((x % w) + w) % w;
      const wy = ((y % h) + h) % h;
      return src[(wy * w + wx) * 4] / 255;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (sampleH(x + 1, y) - sampleH(x - 1, y)) * strength;
        const dy = (sampleH(x, y + 1) - sampleH(x, y - 1)) * strength;
        let nx = -dx;
        let ny = -dy;
        let nz = 1.0;
        const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= invLen;
        ny *= invLen;
        nz *= invLen;

        const idx = (y * w + x) * 4;
        dst[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        dst[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        dst[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        dst[idx + 3] = 255;
      }
    }
    outCtx.putImageData(dstImg, 0, 0);
  }

  const tex = new THREE.CanvasTexture(outCanvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildFabricTextures(
  character: CharacterId,
  palette: CostumePalette
): {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
} {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cctx = colorCanvas.getContext('2d')!;

  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = size;
  heightCanvas.height = size;
  const hctx = heightCanvas.getContext('2d')!;

  const alt = palette === 1;

  if (character === 'TITAN') {
    // TITAN: Heavy titanium armor plating + hazard stripes & reactor seams
    cctx.fillStyle = alt ? '#1e3a5f' : '#334155';
    cctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 32) {
      for (let x = 0; x < size; x += 32) {
        cctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
        cctx.lineWidth = 3;
        cctx.strokeRect(x + 2, y + 2, 28, 28);
        hctx.strokeStyle = '#383838';
        hctx.lineWidth = 4;
        hctx.strokeRect(x + 2, y + 2, 28, 28);
      }
    }

    cctx.fillStyle = alt ? '#0284c7' : '#d97706';
    for (let x = -64; x < size + 64; x += 28) {
      cctx.beginPath();
      cctx.moveTo(x, 112);
      cctx.lineTo(x + 14, 112);
      cctx.lineTo(x + 30, 144);
      cctx.lineTo(x + 16, 144);
      cctx.closePath();
      cctx.fill();
    }

    cctx.strokeStyle = alt
      ? 'rgba(56, 189, 248, 0.72)'
      : 'rgba(245, 158, 11, 0.72)';
    cctx.lineWidth = 4;
    cctx.beginPath();
    cctx.moveTo(0, 108);
    cctx.lineTo(size, 108);
    cctx.moveTo(0, 148);
    cctx.lineTo(size, 148);
    cctx.stroke();

    hctx.strokeStyle = '#e4e4e4';
    hctx.lineWidth = 4;
    hctx.beginPath();
    hctx.moveTo(0, 108);
    hctx.lineTo(size, 108);
    hctx.moveTo(0, 148);
    hctx.lineTo(size, 148);
    hctx.stroke();
  } else if (character === 'VOLT') {
    // VOLT: Conductive cyber-tech mesh with circuit lines
    cctx.fillStyle = alt ? '#0f5132' : '#4c1d95';
    cctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#7c7c7c';
    hctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 16) {
      for (let x = 0; x < size; x += 16) {
        cctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
        cctx.lineWidth = 2;
        cctx.strokeRect(x + 1, y + 1, 14, 14);
        hctx.fillStyle = (x + y) % 32 === 0 ? '#9c9c9c' : '#686868';
        hctx.fillRect(x + 2, y + 2, 12, 12);
      }
    }

    cctx.strokeStyle = alt
      ? 'rgba(163, 230, 53, 0.65)'
      : 'rgba(192, 132, 252, 0.65)';
    cctx.lineWidth = 3;
    for (let y = 32; y < size; y += 64) {
      cctx.beginPath();
      cctx.moveTo(0, y);
      cctx.lineTo(84, y);
      cctx.lineTo(108, y - 22);
      cctx.lineTo(176, y - 22);
      cctx.lineTo(200, y);
      cctx.lineTo(size, y);
      cctx.stroke();

      hctx.strokeStyle = '#d8d8d8';
      hctx.lineWidth = 3;
      hctx.stroke();
    }
  } else if (character === 'VALKYRIE') {
    // VALKYRIE: Feather-scale aero weave & metallic piping
    cctx.fillStyle = alt ? '#881337' : '#065f46';
    cctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#7e7e7e';
    hctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 16) {
      const offset = (y / 16) % 2 === 0 ? 0 : 12;
      for (let x = -12; x < size + 12; x += 24) {
        cctx.strokeStyle = alt
          ? 'rgba(251, 191, 36, 0.28)'
          : 'rgba(110, 231, 183, 0.28)';
        cctx.lineWidth = 2;
        cctx.beginPath();
        cctx.arc(x + offset, y, 12, 0, Math.PI);
        cctx.stroke();

        hctx.strokeStyle = '#b4b4b4';
        hctx.lineWidth = 2;
        hctx.beginPath();
        hctx.arc(x + offset, y, 12, 0, Math.PI);
        hctx.stroke();
      }
    }

    cctx.strokeStyle = alt
      ? 'rgba(251, 191, 36, 0.7)'
      : 'rgba(52, 211, 153, 0.65)';
    cctx.lineWidth = 4;
    cctx.beginPath();
    cctx.moveTo(128, 0);
    cctx.lineTo(128, size);
    cctx.stroke();
  } else if (character === 'KAZE') {
    // KAZE: Sleek tactical stealth hex carbon-fiber weave + piping
    cctx.fillStyle = alt ? '#312e81' : '#9f1239';
    cctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#787878';
    hctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x += 8) {
        const offset = (y / 8) % 2 === 0 ? 0 : 4;
        cctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
        cctx.fillRect((x + offset) % size, y, 5, 5);
        hctx.fillStyle = '#a8a8a8';
        hctx.fillRect((x + offset) % size, y, 4, 4);
      }
    }

    cctx.strokeStyle = alt
      ? 'rgba(250, 204, 21, 0.55)'
      : 'rgba(251, 113, 133, 0.45)';
    cctx.lineWidth = 3;
    cctx.beginPath();
    cctx.moveTo(0, 32);
    cctx.lineTo(size, 96);
    cctx.moveTo(0, 224);
    cctx.lineTo(size, 160);
    cctx.stroke();

    hctx.strokeStyle = '#dadada';
    hctx.lineWidth = 4;
    hctx.beginPath();
    cctx.moveTo(0, 32);
    hctx.moveTo(0, 32);
    hctx.lineTo(size, 96);
    hctx.moveTo(0, 224);
    hctx.lineTo(size, 160);
    hctx.stroke();
  } else {
    // RYUJIN: Heavy woven martial arts gi with stitched seams & wear
    cctx.fillStyle = alt ? '#7f1d1d' : '#0c7bb3';
    cctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 6) {
      for (let x = 0; x < size; x += 6) {
        const isEven = ((x + y) / 6) % 2 === 0;
        cctx.fillStyle = isEven
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(6, 24, 48, 0.14)';
        cctx.fillRect(x, y, 4, 4);
        hctx.fillStyle = isEven ? '#a2a2a2' : '#646464';
        hctx.fillRect(x, y, 4, 4);
      }
    }

    cctx.strokeStyle = 'rgba(224, 242, 254, 0.25)';
    cctx.lineWidth = 3;
    cctx.beginPath();
    cctx.moveTo(0, 48);
    cctx.lineTo(size, 48);
    cctx.moveTo(0, 206);
    cctx.lineTo(size, 206);
    cctx.stroke();

    hctx.strokeStyle = '#d4d4d4';
    hctx.lineWidth = 4;
    hctx.beginPath();
    hctx.moveTo(0, 48);
    hctx.lineTo(size, 48);
    hctx.moveTo(0, 206);
    hctx.lineTo(size, 206);
    hctx.stroke();

    cctx.strokeStyle = alt
      ? 'rgba(251, 113, 133, 0.45)'
      : 'rgba(56, 189, 248, 0.42)';
    cctx.lineWidth = 5;
    cctx.beginPath();
    cctx.arc(128, 128, 34, 0, Math.PI * 2);
    cctx.moveTo(106, 128);
    cctx.lineTo(150, 128);
    cctx.moveTo(128, 102);
    cctx.lineTo(128, 154);
    cctx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;

  const normal = createHeightToNormalMap(heightCanvas, 2.2);
  return { map, normal };
}

function buildArmorTextures(): {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
} {
  const size = 256;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const cctx = cCanvas.getContext('2d')!;

  const hCanvas = document.createElement('canvas');
  hCanvas.width = size;
  hCanvas.height = size;
  const hctx = hCanvas.getContext('2d')!;

  cctx.fillStyle = '#cbd5e1';
  cctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const shade = (Math.sin(y * 0.7) + 1) * 0.5;
    cctx.fillStyle = `rgba(15, 23, 42, ${0.03 + shade * 0.05})`;
    cctx.fillRect(0, y, size, 1);
    hctx.fillStyle = `rgb(${118 + Math.round(shade * 22)}, ${118 + Math.round(shade * 22)}, ${118 + Math.round(shade * 22)})`;
    hctx.fillRect(0, y, size, 1);
  }

  cctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  cctx.lineWidth = 4;
  cctx.strokeRect(14, 14, size - 28, size - 28);
  hctx.strokeStyle = '#383838';
  hctx.lineWidth = 5;
  hctx.strokeRect(14, 14, size - 28, size - 28);

  const rivets: Array<[number, number]> = [
    [28, 28],
    [size - 28, 28],
    [28, size - 28],
    [size - 28, size - 28],
  ];
  for (const [rx, ry] of rivets) {
    cctx.fillStyle = '#475569';
    cctx.beginPath();
    cctx.arc(rx, ry, 6, 0, Math.PI * 2);
    cctx.fill();
    hctx.fillStyle = '#e5e5e5';
    hctx.beginPath();
    hctx.arc(rx, ry, 6, 0, Math.PI * 2);
    hctx.fill();
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;

  const normal = createHeightToNormalMap(hCanvas, 2.5);
  return { map, normal };
}

function buildWrapTextures(): {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
} {
  const size = 256;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const cctx = cCanvas.getContext('2d')!;

  const hCanvas = document.createElement('canvas');
  hCanvas.width = size;
  hCanvas.height = size;
  const hctx = hCanvas.getContext('2d')!;

  cctx.fillStyle = '#cbd5e1';
  cctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#888888';
  hctx.fillRect(0, 0, size, size);

  for (let i = -size; i < size * 2; i += 24) {
    cctx.strokeStyle = 'rgba(30, 41, 59, 0.32)';
    cctx.lineWidth = 4;
    cctx.beginPath();
    cctx.moveTo(i, 0);
    cctx.lineTo(i + size, size);
    cctx.stroke();

    cctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    cctx.beginPath();
    cctx.moveTo(i + 4, 0);
    cctx.lineTo(i + 14, 0);
    cctx.lineTo(i + size + 14, size);
    cctx.lineTo(i + size + 4, size);
    cctx.closePath();
    cctx.fill();

    hctx.strokeStyle = '#303030';
    hctx.lineWidth = 5;
    hctx.beginPath();
    hctx.moveTo(i, 0);
    hctx.lineTo(i + size, size);
    hctx.stroke();
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;

  const normal = createHeightToNormalMap(hCanvas, 2.8);
  return { map, normal };
}

function buildSkinTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#f3c6a8');
  grad.addColorStop(0.55, '#e6b18f');
  grad.addColorStop(1, '#d1926f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(180, 95, 70, 0.1)';
  ctx.fillRect(0, 56, size, 12);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function getCharacterTextures(
  character: CharacterId,
  palette: CostumePalette = 0
): CharacterTextureSet {
  const key = `${character}_${palette}`;
  const cached = textureSetCache.get(key);
  if (cached) return cached;

  const fabric = buildFabricTextures(character, palette);
  const armor = buildArmorTextures();
  const wrap = buildWrapTextures();
  const skinMap = buildSkinTexture();

  const set: CharacterTextureSet = {
    fabricMap: fabric.map,
    fabricNormal: fabric.normal,
    armorMap: armor.map,
    armorNormal: armor.normal,
    wrapMap: wrap.map,
    wrapNormal: wrap.normal,
    skinMap,
  };
  textureSetCache.set(key, set);
  return set;
}

export interface AnimeMaterialUniforms {
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uRimPower: { value: number };
  uShadowTint: { value: THREE.Color };
  uSpecStrength: { value: number };
}

export interface AnimeToonOptions {
  color: number;
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  normalScale?: number;
  rimColor: number;
  rimStrength?: number;
  rimPower?: number;
  shadowTint?: number;
  specStrength?: number;
}

export function createAnimeToonMaterial(opts: AnimeToonOptions): {
  material: THREE.MeshToonMaterial;
  uniforms: AnimeMaterialUniforms;
} {
  const uniforms: AnimeMaterialUniforms = {
    uRimColor: { value: new THREE.Color(opts.rimColor) },
    uRimStrength: { value: opts.rimStrength ?? 0.38 },
    uRimPower: { value: opts.rimPower ?? 2.8 },
    uShadowTint: { value: new THREE.Color(opts.shadowTint ?? 0x1e1b4b) },
    uSpecStrength: { value: opts.specStrength ?? 0.16 },
  };

  const material = new THREE.MeshToonMaterial({
    color: opts.color,
    gradientMap: getAnimeGradientMap(),
    map: opts.map,
    normalMap: opts.normalMap,
    normalScale: opts.normalMap
      ? new THREE.Vector2(opts.normalScale ?? 0.65, opts.normalScale ?? 0.65)
      : undefined,
  });

  material.customProgramCacheKey = () => 'anime-cel-rim-v2';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = uniforms.uRimColor;
    shader.uniforms.uRimStrength = uniforms.uRimStrength;
    shader.uniforms.uRimPower = uniforms.uRimPower;
    shader.uniforms.uShadowTint = uniforms.uShadowTint;
    shader.uniforms.uSpecStrength = uniforms.uSpecStrength;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uRimPower;
uniform vec3 uShadowTint;
uniform float uSpecStrength;`
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `vec3 viewDirAnime = normalize(vViewPosition);
vec3 normAnime = normalize(normal);
float ndotvAnime = clamp(dot(normAnime, viewDirAnime), 0.0, 1.0);
float litLuma = clamp(dot(reflectedLight.directDiffuse, vec3(0.3, 0.59, 0.11)), 0.0, 1.0);
float rimFactor = pow(1.0 - ndotvAnime, uRimPower) * smoothstep(-0.35, 0.75, normAnime.y);
// Mask rim on bright lit whites so light outfits never clip into glow
vec3 animeRim = uRimColor * rimFactor * uRimStrength * (1.0 - litLuma * 0.58);

vec3 coloredShadow = mix(uShadowTint * diffuseColor.rgb * 0.42, vec3(0.0), smoothstep(0.08, 0.52, litLuma));

vec3 halfVecAnime = normalize(normalize(vec3(0.35, 0.78, 0.52)) + viewDirAnime);
float specAngle = clamp(dot(normAnime, halfVecAnime), 0.0, 1.0);
float animeSpec = smoothstep(0.93, 0.955, specAngle) * uSpecStrength * smoothstep(0.25, 0.65, litLuma);

vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + coloredShadow + animeRim + vec3(animeSpec) + totalEmissiveRadiance;`
      );
  };

  return { material, uniforms };
}

export function createInkOutlineMaterial(
  width = 0.015,
  colorHex = 0x05070c
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOutlineWidth: { value: width },
      uOutlineColor: { value: new THREE.Color(colorHex) },
    },
    vertexShader: `
      uniform float uOutlineWidth;
      void main() {
        vec3 n = length(normal) > 0.0001 ? normalize(normal) : normalize(position);
        vec3 centerBias = length(position) > 0.0001 ? normalize(position) * (uOutlineWidth * 0.25) : vec3(0.0);
        vec3 extruded = position + n * uOutlineWidth + centerBias;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(extruded, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uOutlineColor;
      void main() {
        gl_FragColor = vec4(uOutlineColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
  });
}
