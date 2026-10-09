/** Chunk storage: flat typed arrays with bit-shifted indexing. */

import { CHUNK_SIZE, WORLD_HEIGHT, CHUNK_VOL, CHUNK_AREA, cidx } from './constants';

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly blocks = new Uint8Array(CHUNK_VOL);
  readonly meta = new Uint8Array(CHUNK_VOL);
  readonly sky = new Uint8Array(CHUNK_VOL);
  readonly blockLight = new Uint8Array(CHUNK_VOL);
  /** Topmost non-air/non-water Y per column (0 = none). */
  readonly height = new Uint8Array(CHUNK_AREA);

  generated = false;
  lit = false;
  meshDirty = true;
  /** Opaque + transparent THREE.Mesh; typed loosely to keep three out of world/. */
  meshes: unknown = null;
  /** Per-chunk random tick timer for crop/sapling growth. */
  tick = 0;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }

  get(x: number, y: number, z: number): number {
    return this.blocks[cidx(x, y, z)];
  }

  set(x: number, y: number, z: number, id: number): void {
    this.blocks[cidx(x, y, z)] = id;
  }

  getMeta(x: number, y: number, z: number): number {
    return this.meta[cidx(x, y, z)];
  }

  setMeta(x: number, y: number, z: number, v: number): void {
    this.meta[cidx(x, y, z)] = v;
  }

  heightAt(x: number, z: number): number {
    return this.height[x * CHUNK_SIZE + z];
  }

  /** Recompute one column's surface height by scanning down from the top. */
  recalcColumn(x: number, z: number): void {
    let h = 0;
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = this.blocks[cidx(x, y, z)];
      if (id !== 0 && id !== 16) {
        h = y;
        break;
      }
    }
    this.height[x * CHUNK_SIZE + z] = h;
  }

  recalcAllHeights(): void {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) this.recalcColumn(x, z);
    }
  }

  dispose(): void {
    this.meshes = null;
  }
}
