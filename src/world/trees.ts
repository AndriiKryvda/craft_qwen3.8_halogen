/** Tree and plant schematics. Trees are clipped to their own chunk so chunk
 *  generation stays independent (required for worker parallelism). */

import { B } from './blocks';
import { cidx, WORLD_HEIGHT } from './constants';

export type TreeType = 'oak' | 'birch' | 'spruce' | 'cactus';

const LEAVES: Record<TreeType, number> = {
  oak: B.OAK_LEAVES,
  birch: B.BIRCH_LEAVES,
  spruce: B.SPRUCE_LEAVES,
  cactus: B.CACTUS
};

const TRUNK: Record<TreeType, number> = {
  oak: B.OAK_LOG,
  birch: B.BIRCH_LOG,
  spruce: B.SPRUCE_LOG,
  cactus: B.CACTUS
};

export function trunkHeight(type: TreeType, rand: () => number): number {
  switch (type) {
    case 'oak':
      return 4 + Math.floor(rand() * 3);
    case 'birch':
      return 5 + Math.floor(rand() * 3);
    case 'spruce':
      return 7 + Math.floor(rand() * 4);
    case 'cactus':
      return 1 + Math.floor(rand() * 3);
  }
}

/**
 * Write a tree into the chunk buffers with its trunk at local (lx, lz) standing
 * on y = baseY + 1. Returns false (writing nothing) when it would not fit.
 */
export function placeTree(
  blocks: Uint8Array,
  lx: number,
  lz: number,
  baseY: number,
  type: TreeType,
  rand: () => number
): boolean {
  const h = trunkHeight(type, rand);
  const canopyR = type === 'cactus' ? 0 : 2;
  if (lx < canopyR + 1 || lx > 14 - canopyR || lz < canopyR + 1 || lz > 14 - canopyR) return false;
  if (baseY + h + 3 >= WORLD_HEIGHT) return false;

  const put = (x: number, y: number, z: number, id: number): void => {
    if (x < 0 || x > 15 || z < 0 || z > 15 || y < 0 || y >= WORLD_HEIGHT) return;
    const i = cidx(x, y, z);
    if (blocks[i] === 0 || (id === LEAVES[type] && (blocks[i] === LEAVES[type] || blocks[i] === 16))) {
      blocks[i] = id;
    }
  };

  const trunk = TRUNK[type];
  for (let i = 1; i <= h; i++) put(lx, baseY + i, lz, trunk);

  if (type === 'cactus') return true;

  if (type === 'spruce') {
    // Narrow crown, widening rings below it.
    for (let k = 0; k < 6; k++) {
      const y = baseY + h - k;
      const r = k < 1 ? 0 : k < 3 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (dx === 0 && dz === 0 && k < 2) continue;
          put(lx + dx, y, lz + dz, LEAVES[type]);
        }
      }
    }
    put(lx, baseY + h + 1, lz, LEAVES[type]);
    return true;
  }

  // Oak / birch: two wide layers, two narrow ones on top.
  for (let dy = h - 2; dy <= h + 1; dy++) {
    const r = dy <= h - 1 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && rand() < 0.6) continue;
        if (dx === 0 && dz === 0 && dy <= h) continue;
        put(lx + dx, baseY + dy, lz + dz, LEAVES[type]);
      }
    }
  }
  return true;
}
