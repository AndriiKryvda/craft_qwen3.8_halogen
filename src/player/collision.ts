/** Axis-aligned voxel collision, resolved one axis at a time. */

import type { World } from '../world/world';
import { SOLID } from '../world/blocks';

export interface Body {
  /** Feet position. */
  x: number;
  y: number;
  z: number;
  /** Half width and total height. */
  hw: number;
  h: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
}

const EPS = 1e-4;

/** True when the box overlaps at least one solid voxel. */
export function boxOverlapsSolid(
  world: World,
  x: number,
  y: number,
  z: number,
  hw: number,
  h: number
): boolean {
  const x0 = Math.floor(x - hw);
  const x1 = Math.floor(x + hw - EPS);
  const y0 = Math.floor(y);
  const y1 = Math.floor(y + h - EPS);
  const z0 = Math.floor(z - hw);
  const z1 = Math.floor(z + hw - EPS);
  for (let bx = x0; bx <= x1; bx++) {
    for (let by = y0; by <= y1; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        if (SOLID[world.getBlock(bx, by, bz)] === 1) return true;
      }
    }
  }
  return false;
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
  landed: boolean;
  fallSpeed: number;
}

/** Move a body by (dx,dy,dz), resolving each axis independently. */
export function move(world: World, b: Body, dx: number, dy: number, dz: number): MoveResult {
  const res: MoveResult = { hitX: false, hitY: false, hitZ: false, landed: false, fallSpeed: b.vy };

  // ---- Y ----------------------------------------------------------------
  if (dy !== 0) {
    const wasDown = b.vy < 0;
    b.y += dy;
    if (boxOverlapsSolid(world, b.x, b.y, b.z, b.hw, b.h)) {
      res.hitY = true;
      if (dy < 0) {
        b.y = Math.floor(b.y) + 1 + EPS;
        if (wasDown) res.landed = true;
      } else {
        b.y = Math.floor(b.y + b.h) - b.h - EPS;
      }
      b.vy = 0;
    }
    b.onGround = res.landed || boxOverlapsSolid(world, b.x, b.y - 0.02, b.z, b.hw, b.h);
  } else {
    b.onGround = boxOverlapsSolid(world, b.x, b.y - 0.02, b.z, b.hw, b.h);
  }

  // ---- X ----------------------------------------------------------------
  if (dx !== 0) {
    b.x += dx;
    if (boxOverlapsSolid(world, b.x, b.y, b.z, b.hw, b.h)) {
      res.hitX = true;
      if (dx > 0) b.x = Math.floor(b.x + b.hw) - b.hw - EPS;
      else b.x = Math.floor(b.x - b.hw) + 1 + b.hw + EPS;
      b.vx = 0;
    }
  }

  // ---- Z ----------------------------------------------------------------
  if (dz !== 0) {
    b.z += dz;
    if (boxOverlapsSolid(world, b.x, b.y, b.z, b.hw, b.h)) {
      res.hitZ = true;
      if (dz > 0) b.z = Math.floor(b.z + b.hw) - b.hw - EPS;
      else b.z = Math.floor(b.z - b.hw) + 1 + b.hw + EPS;
      b.vz = 0;
    }
  }
  return res;
}

/** Does a box centred at (x,y,z) overlap the body? Used for placement checks. */
export function boxesOverlap(
  ax: number, ay: number, az: number, ahw: number, ah: number,
  bx: number, by: number, bz: number, bhw: number, bh: number
): boolean {
  return (
    Math.abs(ax - bx) < ahw + bhw &&
    Math.abs(ay + ah / 2 - (by + bh / 2)) < (ah + bh) / 2 &&
    Math.abs(az - bz) < ahw + bhw
  );
}
