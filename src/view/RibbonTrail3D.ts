import * as THREE from 'three';

const SEGMENTS = 12;
const VERTS = SEGMENTS * 2;
const _color = new THREE.Color();

export class RibbonChannel {
  public mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private mat: THREE.MeshBasicMaterial;
  private positions: Float32Array;
  private colors: Float32Array;
  private tipHistory: THREE.Vector3[] = [];
  private baseHistory: THREE.Vector3[] = [];
  private activeCount = 0;

  constructor(defaultColor: number) {
    this.positions = new Float32Array(VERTS * 3);
    this.colors = new Float32Array(VERTS * 3);

    const indices: number[] = [];
    for (let i = 0; i < SEGMENTS - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, c, b, d);
    }

    for (let i = 0; i < SEGMENTS; i++) {
      this.tipHistory.push(new THREE.Vector3());
      this.baseHistory.push(new THREE.Vector3());
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3)
    );
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geo.setIndex(indices);

    this.mat = new THREE.MeshBasicMaterial({
      color: defaultColor,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  public reset(): void {
    this.activeCount = 0;
    this.mesh.visible = false;
  }

  public pushSample(
    tip: THREE.Vector3,
    base: THREE.Vector3,
    colorHex: number
  ): void {
    // Guard against teleports / round resets creating cross-screen lines
    if (
      this.activeCount > 0 &&
      this.tipHistory[0].distanceToSquared(tip) > 3.2
    ) {
      this.reset();
    }

    for (let i = SEGMENTS - 1; i > 0; i--) {
      this.tipHistory[i].copy(this.tipHistory[i - 1]);
      this.baseHistory[i].copy(this.baseHistory[i - 1]);
    }
    this.tipHistory[0].copy(tip);
    this.baseHistory[0].copy(base);
    this.activeCount = Math.min(SEGMENTS, this.activeCount + 1);

    this.mat.color.setHex(0xffffff);
    _color.setHex(colorHex);
    this.uploadBuffers();
  }

  public decay(): void {
    if (this.activeCount <= 0) {
      this.mesh.visible = false;
      return;
    }
    this.activeCount = Math.max(0, this.activeCount - 1);
    if (this.activeCount < 2) {
      this.activeCount = 0;
      this.mesh.visible = false;
      return;
    }
    this.uploadBuffers();
  }

  private uploadBuffers(): void {
    if (this.activeCount < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    for (let i = 0; i < SEGMENTS; i++) {
      const srcIdx = Math.min(i, this.activeCount - 1);
      const t = this.tipHistory[srcIdx];
      const b = this.baseHistory[srcIdx];

      // Taper ribbon width toward the tail for sharp anime slash tips
      const lifeRatio = 1 - i / Math.max(1, this.activeCount - 1);
      const fade = i < this.activeCount ? lifeRatio * lifeRatio : 0;

      const midX = (t.x + b.x) * 0.5;
      const midY = (t.y + b.y) * 0.5;
      const midZ = (t.z + b.z) * 0.5;
      const halfSpan = 0.25 + 0.75 * lifeRatio;

      const v0 = i * 6;
      this.positions[v0] = midX + (t.x - midX) * halfSpan;
      this.positions[v0 + 1] = midY + (t.y - midY) * halfSpan;
      this.positions[v0 + 2] = midZ + (t.z - midZ) * halfSpan;

      this.positions[v0 + 3] = midX + (b.x - midX) * halfSpan;
      this.positions[v0 + 4] = midY + (b.y - midY) * halfSpan;
      this.positions[v0 + 5] = midZ + (b.z - midZ) * halfSpan;

      this.colors[v0] = _color.r * fade;
      this.colors[v0 + 1] = _color.g * fade;
      this.colors[v0 + 2] = _color.b * fade;

      this.colors[v0 + 3] = _color.r * fade * 0.55;
      this.colors[v0 + 4] = _color.g * fade * 0.55;
      this.colors[v0 + 5] = _color.b * fade * 0.55;
    }

    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
