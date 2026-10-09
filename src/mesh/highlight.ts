/** Block selection outline, mining progress shading and the punch flinch. */

import * as THREE from 'three';

export class SelectionBox {
  readonly group: THREE.Group;
  private readonly edges: THREE.LineSegments;
  private readonly shade: THREE.Mesh;
  /** 1 right after a punch lands, decays to 0 — the block flinches. */
  private flinch = 0;
  private jx = 0;
  private jy = 0;
  private jz = 0;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 })
    );
    this.shade = new THREE.Mesh(
      new THREE.BoxGeometry(1.004, 1.004, 1.004),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 })
    );
    this.group.add(this.edges);
    this.group.add(this.shade);
    scene.add(this.group);
  }

  show(x: number, y: number, z: number, progress: number): void {
    this.group.visible = true;
    const k = this.flinch;
    this.group.position.set(x + 0.5 + this.jx * k, y + 0.5 + this.jy * k, z + 0.5 + this.jz * k);
    this.group.scale.setScalar(1 - 0.05 * k);
    (this.shade.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, progress * 0.55 + 0.12 * k);
  }

  /** A punch landed: shove the block a little and flash the cracks darker. */
  punch(): void {
    this.flinch = 1;
    this.jx = (Math.random() - 0.5) * 0.05;
    this.jy = (Math.random() - 0.5) * 0.05;
    this.jz = (Math.random() - 0.5) * 0.05;
  }

  /** Fade the flinch out. Call once per rendered frame. */
  tick(dt: number): void {
    if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt * 7);
  }

  hide(): void {
    this.group.visible = false;
    this.flinch = 0;
    this.group.scale.setScalar(1);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.edges.geometry.dispose();
    (this.edges.material as THREE.Material).dispose();
    this.shade.geometry.dispose();
    (this.shade.material as THREE.Material).dispose();
  }
}
