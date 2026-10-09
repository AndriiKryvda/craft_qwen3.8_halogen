/** Random ticks: saplings grow, wheat ripens, grass spreads. */

import type { World } from './world';
import { B } from './blocks';
import { placeTree, type TreeType } from './trees';
import { CHUNK_SIZE, CHUNK_VOL } from './constants';

const WORLD_TOP = 127;
const SCRATCH = new Uint8Array(CHUNK_VOL);

const TREE_FOR_LOG: Record<number, TreeType> = {
  [B.OAK_LOG]: 'oak',
  [B.BIRCH_LOG]: 'birch',
  [B.SPRUCE_LOG]: 'spruce'
};

export class GrowthSystem {
  private timer = 0;

  /** Seconds between random-tick batches. */
  interval: number;

  constructor(
    private readonly world: World,
    opts: { interval?: number; ticksPerBatch?: number } = {}
  ) {
    this.interval = opts.interval ?? 1.5;
  }

  /** Grow a sapling at (x, y, z) into a tree, or return false when it cannot. */
  private growTree(x: number, y: number, z: number, rand: () => number): boolean {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const type: TreeType = rand() < 0.25 ? 'birch' : 'oak';
    SCRATCH.fill(0);
    if (!placeTree(SCRATCH, lx, lz, y - 1, type, rand)) return false;
    let placed = 0;
    for (let i = 0; i < CHUNK_VOL; i++) {
      const id = SCRATCH[i];
      if (id === 0) continue;
      const bx = i % CHUNK_SIZE;
      const bz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
      const by = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
      if (this.world.getBlock(cx * CHUNK_SIZE + bx, by, cz * CHUNK_SIZE + bz) !== 0) return false;
      placed++;
    }
    if (placed === 0) return false;
    for (let i = 0; i < CHUNK_VOL; i++) {
      const id = SCRATCH[i];
      if (id === 0) continue;
      const bx = i % CHUNK_SIZE;
      const bz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
      const by = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
      this.world.setBlock(cx * CHUNK_SIZE + bx, by, cz * CHUNK_SIZE + bz, id);
    }
    this.world.setBlock(x, y, z, 0);
    return true;
  }

  /** One random tick around the player. */
  tick(px: number, py: number, pz: number, rand: () => number, radius = 24): void {
    const w = this.world;
    for (let n = 0; n < 14; n++) {
      const x = Math.floor(px + (rand() * 2 - 1) * radius);
      const z = Math.floor(pz + (rand() * 2 - 1) * radius);
      const top = w.heightAt(x, z);
      for (let y = Math.min(WORLD_TOP, top + 2); y >= Math.max(1, top - 3); y--) {
        const id = w.getBlock(x, y, z);
        if (id === B.SAPLING) {
          if (rand() < 0.22) this.growTree(x, y, z, rand);
          break;
        }
        if (id === B.WHEAT) {
          const meta = w.getMeta(x, y, z);
          if (meta < 3 && rand() < 0.35) w.setMeta(x, y, z, meta + 1);
          break;
        }
        if (id === B.DIRT) {
          // Grass creeps sideways into bare dirt.
          if (w.getBlock(x, y + 1, z) === 0 && rand() < 0.4) {
            const sides = [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1]
            ];
            const [dx, dz] = sides[Math.floor(rand() * 4)];
            if (w.getBlock(x + dx, y, z + dz) === B.GRASS) w.setBlock(x, y, z, B.GRASS);
          }
          break;
        }
        if (id === B.GRASS && w.getBlock(x, y + 1, z) === B.DIRT && rand() < 0.3) {
          w.setBlock(x, y + 1, z, B.GRASS);
          break;
        }
      }
    }
  }

  update(dt: number, px: number, py: number, pz: number, rand: () => number, radius?: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.interval;
    this.tick(px, py, pz, rand, radius);
  }
}
