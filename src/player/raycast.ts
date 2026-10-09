/** Amanatides & Woo voxel traversal for block selection. */

import type { World } from '../world/world';
import { REPLACEABLE, LIQUID } from '../world/blocks';

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Face normal of the hit side. */
  nx: number;
  ny: number;
  nz: number;
  block: number;
  dist: number;
}

/** Blocks the crosshair can target: anything solid or useful, not fluid/plants. */
function selectable(id: number): boolean {
  return id !== 0 && LIQUID[id] === 0 && REPLACEABLE[id] === 0;
}

export function raycast(
  world: World,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number
): RayHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = stepX === 0 ? Infinity : stepX > 0 ? (x + 1 - ox) / dx : (x - ox) / dx;
  let tMaxY = stepY === 0 ? Infinity : stepY > 0 ? (y + 1 - oy) / dy : (y - oy) / dy;
  let tMaxZ = stepZ === 0 ? Infinity : stepZ > 0 ? (z + 1 - oz) / dz : (z - oz) / dz;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  for (let i = 0; i < 256; i++) {
    const id = world.getBlock(x, y, z);
    if (selectable(id)) {
      return { x, y, z, nx, ny, nz, block: id, dist: t };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDist) break;
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDist) break;
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      if (tMaxZ > maxDist) break;
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
    if (y < 0 || y > 64) break;
  }
  return null;
}
