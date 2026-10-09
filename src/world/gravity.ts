/** Falling-block simulation (sand and gravel). */

import type { World } from './world';
import { B, REPLACEABLE } from './blocks';

const FALLING = new Set<number>([B.SAND, B.GRAVEL]);

function key(x: number, y: number, z: number): string {
  return x + ',' + y + ',' + z;
}

export class GravitySystem {
  private readonly pending = new Set<string>();
  private timer = 0;

  constructor(private readonly world: World) {}

  /** Remember a block that may need to fall. */
  queue(x: number, y: number, z: number): void {
    if (!FALLING.has(this.world.getBlock(x, y, z))) return;
    this.pending.add(key(x, y, z));
  }

  /** Called after a block was removed or placed: the block above may now fall. */
  queueAbove(x: number, y: number, z: number): void {
    this.queue(x, y + 1, z);
  }

  clear(): void {
    this.pending.clear();
  }

  get count(): number {
    return this.pending.size;
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.06;
    if (this.pending.size === 0) return;

    for (const k of [...this.pending]) {
      this.pending.delete(k);
      const parts = k.split(',');
      const x = +parts[0];
      const y = +parts[1];
      const z = +parts[2];
      const id = this.world.getBlock(x, y, z);
      if (!FALLING.has(id)) continue;
      if (!this.world.getChunkAt(x, z)) continue;
      const below = this.world.getBlock(x, y - 1, z);
      if (REPLACEABLE[below] !== 1) continue;
      if (!this.world.setBlock(x, y - 1, z, id)) continue;
      this.world.setBlock(x, y, z, 0);
      this.pending.add(key(x, y - 1, z));
    }
  }
}
