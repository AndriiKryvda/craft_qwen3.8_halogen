/** Block selection outline + mining progress shading. */

import * as THREE from 'three';

export class SelectionBox {
  readonly group: THREE.Group;
  private readonly edges: THREE.LineSegments;
  private readonly shade: THREE.Mesh;

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
    this.group.position.set(x + 0.5, y + 0.5, z + 0.5);
    (this.shade.material as THREE.MeshBasicMaterial).opacity = progress * 0.55;
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.edges.geometry.dispose();
    (this.edges.material as THREE.Material).dispose();
    this.shade.geometry.dispose();
    (this.shade.material as THREE.Material).dispose();
  }
}
