/** Global world constants and index math. Keep these powers of two. */

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const SEA_LEVEL = 32;

export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOL = CHUNK_AREA * WORLD_HEIGHT;
export const MAX_LIGHT = 15;

/** Bit-shifted index: y is contiguous so column scans are linear. */
export function cidx(x: number, y: number, z: number): number {
  return (x << 10) | (z << 6) | y;
}

export function chunkKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}

export function posKey(x: number, y: number, z: number): string {
  return x + ',' + y + ',' + z;
}

export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
