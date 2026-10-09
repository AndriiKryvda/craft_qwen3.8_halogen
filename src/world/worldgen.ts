/** Deterministic chunk generation. Pure: no DOM, no THREE, worker-safe. */

import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, CHUNK_VOL, CHUNK_AREA, cidx } from './constants';
import { B } from './blocks';
import { hash2, hash3, mulberry32 } from './noise';
import { columnInfo, BIOME } from './biomes';
import { placeTree, type TreeType } from './trees';

export interface GenResult {
  blocks: Uint8Array;
  meta: Uint8Array;
  height: Uint8Array;
}

/** Tree density per biome (probability per eligible column). */
const TREE_DENSITY: number[] = [0.004, 0.014, 0.075, 0.06, 0.01, 0.006, 0.004];

interface OreBand {
  block: number;
  maxY: number;
  threshold: number;
  seed: number;
}

const ORES: OreBand[] = [
  { block: B.DIAMOND_ORE, maxY: 16, threshold: 0.9975, seed: 54 },
  { block: B.GOLD_ORE, maxY: 26, threshold: 0.995, seed: 53 },
  { block: B.IRON_ORE, maxY: 40, threshold: 0.99, seed: 52 },
  { block: B.COAL_ORE, maxY: 48, threshold: 0.984, seed: 51 }
];

function surfaceBlock(biome: number, h: number): number {
  switch (biome) {
    case BIOME.OCEAN:
      return h <= SEA_LEVEL - 2 ? B.GRAVEL : B.SAND;
    case BIOME.BEACH:
    case BIOME.DESERT:
      return B.SAND;
    case BIOME.MOUNTAINS:
      return h > 50 ? B.SNOW : h > 44 ? B.STONE : B.GRASS;
    case BIOME.TAIGA:
      return h > 46 ? B.SNOW : B.GRASS;
    default:
      return B.GRASS;
  }
}

function subSurface(biome: number): number {
  if (biome === BIOME.DESERT || biome === BIOME.BEACH) return B.SAND;
  if (biome === BIOME.OCEAN) return B.CLAY;
  if (biome === BIOME.MOUNTAINS) return B.STONE;
  return B.DIRT;
}

/** Cheap 3D "vein" test: a 2x2x2 lattice hash above a threshold. */
function oreAt(wx: number, y: number, wz: number, ore: OreBand): boolean {
  if (y > ore.maxY) return false;
  return hash3(Math.floor(wx / 2), Math.floor(y / 2), Math.floor(wz / 2), ore.seed) > ore.threshold;
}

export function generateChunk(cx: number, cz: number, seed: number): GenResult {
  const blocks = new Uint8Array(CHUNK_VOL);
  const meta = new Uint8Array(CHUNK_VOL);
  const height = new Uint8Array(CHUNK_AREA);
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  // ---- pass 1: terrain columns ------------------------------------------
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = baseX + x;
      const wz = baseZ + z;
      const col = columnInfo(wx, wz, seed);
      const h = col.h;
      const surf = surfaceBlock(col.biome, h);
      const sub = subSurface(col.biome);

      for (let y = 0; y <= h; y++) {
        let id: number;
        if (y <= 1) id = B.BEDROCK;
        else if (y === h) id = surf;
        else if (y > h - 4) id = sub;
        else id = B.STONE;
        blocks[cidx(x, y, z)] = id;
      }

      // ---- caves (below the surface skin, above bedrock) ----------------
      for (let y = 2; y <= h - 3; y++) {
        const c =
          hash3(Math.floor(wx / 5), Math.floor(y / 3), Math.floor(wz / 5), seed + 41) * 0.6 +
          hash3(Math.floor(wx / 9), Math.floor(y / 6), Math.floor(wz / 9), seed + 42) * 0.4;
        if (c > 0.83) blocks[cidx(x, y, z)] = 0;
      }

      // ---- water fill ----------------------------------------------------
      for (let y = h + 1; y <= SEA_LEVEL; y++) {
        if (blocks[cidx(x, y, z)] === 0) blocks[cidx(x, y, z)] = B.WATER;
      }
    }
  }

  // ---- pass 2: ores ------------------------------------------------------
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = baseX + x;
      const wz = baseZ + z;
      for (let y = 2; y <= 48; y++) {
        const i = cidx(x, y, z);
        if (blocks[i] !== B.STONE) continue;
        for (const ore of ORES) {
          if (oreAt(wx, y, wz, ore)) {
            blocks[i] = ore.block;
            break;
          }
        }
      }
    }
  }

  // ---- pass 3: decoration ------------------------------------------------
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = baseX + x;
      const wz = baseZ + z;
      const col = columnInfo(wx, wz, seed);
      const h = col.h;
      if (h >= SEA_LEVEL) {
        const top = blocks[cidx(x, h, z)];
        const r = hash2(wx, wz, seed + 61);
        if (col.biome === BIOME.DESERT && top === B.SAND && r < TREE_DENSITY[BIOME.DESERT]) {
          placeTree(blocks, x, z, h, 'cactus', mulberry32(hash2(wx, wz, seed + 77) * 4294967296));
        } else if (top === B.GRASS) {
          const density = TREE_DENSITY[col.biome];
          if (r < density) {
            const type: TreeType =
              col.biome === BIOME.TAIGA
                ? 'spruce'
                : col.biome === BIOME.FOREST && hash2(wx, wz, seed + 62) < 0.4
                  ? 'birch'
                  : 'oak';
            placeTree(blocks, x, z, h, type, mulberry32(hash2(wx, wz, seed + 78) * 4294967296));
          } else if (r < density + 0.1) {
            const p = hash2(wx, wz, seed + 63);
            blocks[cidx(x, h + 1, z)] = p < 0.06 ? B.FLOWER_RED : p < 0.11 ? B.FLOWER_YELLOW : B.TALL_GRASS;
          }
        }
      } else if (col.biome === BIOME.DESERT && hash2(wx, wz, seed + 64) < 0.02) {
        if (blocks[cidx(x, h, z)] === B.SAND) blocks[cidx(x, h + 1, z)] = B.DEAD_BUSH;
      }
    }
  }

  // ---- pass 4: heightmap -------------------------------------------------
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      let hh = 0;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const id = blocks[cidx(x, y, z)];
        if (id !== 0 && id !== B.WATER) {
          hh = y;
          break;
        }
      }
      height[x * CHUNK_SIZE + z] = hh;
    }
  }

  return { blocks, meta, height };
}

/** Find a safe standing position near the origin: land, above sea, no fluid. */
export function findSpawn(seed: number, rand: () => number): { x: number; y: number; z: number } {
  for (let attempt = 0; attempt < 400; attempt++) {
    const r = attempt === 0 ? 0 : 6 + Math.floor(rand() * 90);
    const a = rand() * Math.PI * 2;
    const wx = Math.round(Math.cos(a) * r);
    const wz = Math.round(Math.sin(a) * r);
    const col = columnInfo(wx, wz, seed);
    if (col.biome === BIOME.OCEAN || col.biome === BIOME.BEACH) continue;
    if (col.h <= SEA_LEVEL) continue;
    if (col.h > 52) continue;
    return { x: wx + 0.5, y: col.h + 1.05, z: wz + 0.5 };
  }
  const col = columnInfo(0, 0, seed);
  return { x: 0.5, y: Math.max(SEA_LEVEL + 1, col.h + 1.05), z: 0.5 };
}

