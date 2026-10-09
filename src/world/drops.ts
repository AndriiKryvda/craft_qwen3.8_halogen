/** Dropped items: little textured cubes that pop out of broken blocks. */

import * as THREE from 'three';
import type { World } from './world';
import { type Body, move } from '../player/collision';
import { itemIcon } from '../inventory/item';
import { ATLAS_GRID, buildAtlasCanvas } from '../mesh/atlas';

const SIZE = 0.26;
const MAX_DROPS = 48;
const PICKUP_DELAY = 0.45;
const MAGNET_RADIUS = 2.6;
const PICKUP_RADIUS = 0.9;

class DropBody implements Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hw = SIZE / 2;
  h = SIZE;
  onGround = false;

  constructor(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
  }
}

interface Drop {
  body: DropBody;
  mesh: THREE.Mesh;
  id: string;
  count: number;
  age: number;
  spin: number;
}

function tileGeometry(tile: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  const col = tile % ATLAS_GRID;
  const row = Math.floor(tile / ATLAS_GRID);
  const s = 1 / ATLAS_GRID;
  const eps = 0.6 / (ATLAS_GRID * 16);
  const u0 = col * s + eps;
  const u1 = (col + 1) * s - eps;
  const v0 = row * s + eps;
  const v1 = (row + 1) * s - eps;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  uv.needsUpdate = true;
  return g;
}

const TILE_INSET = 16;

export class DropManager {
  readonly list: Drop[] = [];
  private readonly scene: THREE.Scene;
  private readonly world: World;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, world: World) {
    this.scene = scene;
    this.world = world;
    this.texture = new THREE.CanvasTexture(buildAtlasCanvas());
    this.texture.flipY = false;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.material = new THREE.MeshLambertMaterial({ map: this.texture });
  }

  get count(): number {
    return this.list.length;
  }

  spawn(id: string, count: number, x: number, y: number, z: number): void {
    if (count <= 0) return;
    if (this.list.length >= MAX_DROPS) this.remove(this.list[0]);
    const body = new DropBody(
      x,
      y,
      z,
      (Math.random() - 0.5) * 2.2,
      2.4 + Math.random() * 1.4,
      (Math.random() - 0.5) * 2.2
    );
    const mesh = new THREE.Mesh(tileGeometry(itemIcon(id)), this.material);
    mesh.position.set(x, y + SIZE / 2, z);
    mesh.castShadow = false;
    this.scene.add(mesh);
    this.list.push({ body, mesh, id, count, age: 0, spin: Math.random() * Math.PI * 2 });
  }

  private remove(drop: Drop): void {
    this.scene.remove(drop.mesh);
    drop.mesh.geometry.dispose();
    const i = this.list.indexOf(drop);
    if (i >= 0) this.list.splice(i, 1);
  }

  clear(): void {
    for (const d of [...this.list]) this.remove(d);
  }

  /**
   * Physics + pickup. `add` puts items in the inventory and returns what did not fit.
   */
  update(
    dt: number,
    player: { x: number; y: number; z: number },
    add: (id: string, count: number) => number
  ): void {
    for (const drop of [...this.list]) {
      const b = drop.body;
      drop.age += dt;
      drop.spin += dt * 2.2;

      const dx = player.x - b.x;
      const dy = player.y + 0.8 - b.y;
      const dz = player.z - b.z;
      const dist = Math.hypot(dx, dy, dz);

      if (drop.age > PICKUP_DELAY && dist < MAGNET_RADIUS) {
        const pull = dist < PICKUP_RADIUS ? 26 : 9;
        const inv = 1 / Math.max(0.2, dist);
        b.vx += dx * inv * pull * dt;
        b.vy += dy * inv * pull * dt;
        b.vz += dz * inv * pull * dt;
      } else {
        b.vy -= 30 * dt;
        if (b.vy < -60) b.vy = -60;
        if (b.onGround) {
          b.vx *= 0.6;
          b.vz *= 0.6;
        }
      }

      const res = move(this.world, b, b.vx * dt, b.vy * dt, b.vz * dt);
      if (res.hitX) b.vx = 0;
      if (res.hitZ) b.vz = 0;
      if (res.hitY) b.vy = 0;

      drop.mesh.position.set(b.x, b.y + SIZE / 2, b.z);
      drop.mesh.rotation.y = drop.spin;

      if (drop.age > PICKUP_DELAY && dist < PICKUP_RADIUS) {
        const left = add(drop.id, drop.count);
        if (left === 0) {
          this.remove(drop);
        } else if (left !== drop.count) {
          drop.count = left;
        }
      } else if (b.y < -8 || drop.age > 180) {
        this.remove(drop);
      }
    }
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.texture.dispose();
  }
}
