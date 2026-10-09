/** Simple box-built mob models with a sine walk cycle. No skeletal animation. */

import * as THREE from 'three';

export interface MobModel {
  group: THREE.Group;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
}

function mat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

/** A box whose pivot sits at its top centre, so it swings like a limb. */
function limb(w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(0, -h / 2, 0);
  g.add(mesh);
  g.position.set(x, y, z);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

export function buildMob(typeId: string): MobModel {
  const group = new THREE.Group();
  const legs: THREE.Object3D[] = [];
  const arms: THREE.Object3D[] = [];

  if (typeId === 'cow') {
    group.add(box(0.9, 0.7, 1.3, 0, 0.95, 0, 0x6b4a2c));
    group.add(box(0.55, 0.5, 0.45, 0, 1.05, 0.8, 0xf0ece4));
    group.add(box(0.2, 0.16, 0.16, -0.2, 1.35, 0.82, 0xd8d2c4));
    group.add(box(0.2, 0.16, 0.16, 0.2, 1.35, 0.82, 0xd8d2c4));
    group.add(box(0.4, 0.3, 0.5, 0.2, 1.0, -0.3, 0xf0ece4));
    for (const [x, z] of [[-0.3, 0.45], [0.3, 0.45], [-0.3, -0.45], [0.3, -0.45]] as const) {
      const l = limb(0.22, 0.62, 0.22, x, 0.62, z, 0x5a3d22);
      legs.push(l);
      group.add(l);
    }
  } else if (typeId === 'pig') {
    group.add(box(0.75, 0.6, 1.1, 0, 0.68, 0, 0xe89a9a));
    group.add(box(0.5, 0.45, 0.4, 0, 0.75, 0.7, 0xf0aaaa));
    group.add(box(0.22, 0.18, 0.12, 0, 0.68, 0.94, 0xd97f7f));
    for (const [x, z] of [[-0.26, 0.38], [0.26, 0.38], [-0.26, -0.38], [0.26, -0.38]] as const) {
      const l = limb(0.2, 0.4, 0.2, x, 0.4, z, 0xd98a8a);
      legs.push(l);
      group.add(l);
    }
  } else if (typeId === 'zombie') {
    group.add(box(0.6, 0.95, 0.3, 0, 1.4, 0, 0x3f6b4a));
    group.add(box(0.5, 0.5, 0.5, 0, 2.05, 0, 0x5c8f5c));
    group.add(box(0.16, 0.1, 0.06, -0.13, 2.12, 0.26, 0x1a1a1a));
    group.add(box(0.16, 0.1, 0.06, 0.13, 2.12, 0.26, 0x1a1a1a));
    const la = limb(0.2, 0.8, 0.2, -0.4, 1.8, 0, 0x4a7a52);
    const ra = limb(0.2, 0.8, 0.2, 0.4, 1.8, 0, 0x4a7a52);
    la.rotation.x = -Math.PI / 2.2;
    ra.rotation.x = -Math.PI / 2.2;
    arms.push(la, ra);
    group.add(la);
    group.add(ra);
    for (const [x, z] of [[-0.16, 0], [0.16, 0]] as const) {
      const l = limb(0.24, 0.95, 0.24, x, 0.95, z, 0x33507a);
      legs.push(l);
      group.add(l);
    }
  } else {
    // spider
    group.add(box(0.7, 0.45, 0.7, 0, 0.45, -0.25, 0x3a2a20));
    group.add(box(0.45, 0.35, 0.4, 0, 0.42, 0.45, 0x4a3527));
    group.add(box(0.1, 0.08, 0.06, -0.12, 0.5, 0.66, 0xc03030));
    group.add(box(0.1, 0.08, 0.06, 0.12, 0.5, 0.66, 0xc03030));
    for (let i = 0; i < 4; i++) {
      const z = 0.28 - i * 0.2;
      for (const side of [-1, 1]) {
        const l = limb(0.09, 0.6, 0.09, side * 0.34, 0.42, z, 0x2a1e16);
        l.rotation.z = side * 0.7;
        legs.push(l);
        group.add(l);
      }
    }
  }

  group.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return { group, legs, arms };
}

/** Swing the limbs; phase advances with the mob's walk phase. */
export function animateMob(model: MobModel, phase: number, moving: boolean): void {
  const amp = moving ? 0.6 : 0;
  for (let i = 0; i < model.legs.length; i++) {
    const swing = Math.sin(phase + (i % 2 === 0 ? 0 : Math.PI)) * amp;
    const base = model.legs[i].userData.baseRotX ?? 0;
    model.legs[i].userData.baseRotX = base;
    model.legs[i].rotation.x = base + swing;
  }
}
