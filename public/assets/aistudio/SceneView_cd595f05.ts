import * as THREE from 'three';
import { AABB, MatchState } from '../core/types';
import { FighterModel } from './FighterModel';

export class SceneView {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private fighterModels: [FighterModel, FighterModel];
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private debugGroup = new THREE.Group();
  public showDebug = true;

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x0f172a);

    // FOV bajo (30°) clásico de juegos de lucha 2.5D
    this.camera = new THREE.PerspectiveCamera(
      30,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 2.3, 13);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    // Iluminación
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.25);
    dirLight.position.set(5, 10, 8);
    this.scene.add(dirLight);

    // Suelo y rejilla de referencia 3D
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 6),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(18, 18, 0x475569, 0x334155);
    grid.position.y = 0.005;
    this.scene.add(grid);

    // Pilares visuales de los límites del escenario (corner walls)
    const wallGeo = new THREE.BoxGeometry(0.25, 3.2, 2.5);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.position.set(-7.1, 1.6, 0);
    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.position.set(7.1, 1.6, 0);
    this.scene.add(leftWall, rightWall);

    // Luchadores (puedes pasar '/models/p1.glb' como segundo parámetro)
    this.fighterModels = [
      new FighterModel(0x3b82f6),
      new FighterModel(0xef4444),
    ];
    this.scene.add(
      this.fighterModels[0].root,
      this.fighterModels[1].root,
      this.debugGroup
    );

    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public render(state: MatchState): void {
    const [p1, p2] = state.fighters;

    // 1. Sincronizar modelos 3D de luchadores
    this.fighterModels[0].sync(p1);
    this.fighterModels[1].sync(p2);

    // 2. Sincronizar proyectiles 3D (Hadouken)
    this.syncProjectiles(state);

    // 3. Cámara 2.5D dinámica (centro X + zoom en Z)
    const midX = (p1.x + p2.x) * 0.5;
    const dist = Math.abs(p1.x - p2.x);
    const targetZ = Math.max(10.5, Math.min(17, 8.2 + dist * 0.95));
    this.camera.position.x += (midX - this.camera.position.x) * 0.14;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.14;
    this.camera.lookAt(this.camera.position.x, 1.35, 0);

    // 4. Debug Overlay de cajas 2D
    this.updateDebugBoxes(state);

    this.renderer.render(this.scene, this.camera);
  }

  private syncProjectiles(state: MatchState): void {
    const activeIds = new Set<number>();

    for (const p of state.projectiles) {
      activeIds.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        const color = p.ownerId === 0 ? 0x38bdf8 : 0xfb7185;
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 16, 16),
          new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.7,
          })
        );
        this.scene.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.y, 0);
    }

    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.projectileMeshes.delete(id);
      }
    }
  }

  private updateDebugBoxes(state: MatchState): void {
    while (this.debugGroup.children.length > 0) {
      const child = this.debugGroup.children[0] as THREE.LineSegments;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
      this.debugGroup.remove(child);
    }
    if (!this.showDebug) return;

    for (const f of state.fighters) {
      this.addBoxHelper(f.pushbox, 0xfacc15, 0.45); // Amarillo: Pushbox
      this.addBoxHelper(f.hurtbox, 0x22c55e, 0.5); // Verde: Hurtbox
      if (f.hitbox) this.addBoxHelper(f.hitbox, 0xef4444, 0.55); // Rojo: Hitbox
    }

    for (const p of state.projectiles) {
      this.addBoxHelper(p.hitbox, 0xf97316, 0.6); // Naranja: Proyectil
    }
  }

  private addBoxHelper(box: AABB, color: number, zOffset: number): void {
    const geom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(box.w, box.h));
    const line = new THREE.LineSegments(
      geom,
      new THREE.LineBasicMaterial({ color })
    );
    line.position.set(box.x, box.y, zOffset);
    this.debugGroup.add(line);
  }
}
