/** Sky + block light propagation, one BFS per channel per chunk. */

import type { World } from './world';
import type { Chunk } from './chunk';
import { CHUNK_SIZE, WORLD_HEIGHT, cidx, CHUNK_VOL } from './constants';
import { LIGHT_COST, EMIT } from './blocks';

const CAP = CHUNK_VOL + 8192;
const qx = new Int32Array(CAP);
const qy = new Int32Array(CAP);
const qz = new Int32Array(CAP);
const ql = new Uint8Array(CAP);
const qchannel = new Uint8Array(CAP); // 0 = sky, 1 = block light
let head = 0;
let tail = 0;

function push(wx: number, wy: number, wz: number, l: number, channel: number): void {
  if (tail >= CAP) return;
  qx[tail] = wx;
  qy[tail] = wy;
  qz[tail] = wz;
  ql[tail] = l;
  qchannel[tail] = channel;
  tail++;
}

/** Queue a neighbour cell's existing light (both channels) as a propagation seed. */
function seedFromWorld(world: World, wx: number, wy: number, wz: number): void {
  const s = world.skyAt(wx, wy, wz);
  if (s > 0) push(wx, wy, wz, s, 0);
  const b = world.blockLightAt(wx, wy, wz);
  if (b > 0) push(wx, wy, wz, b, 1);
}

/** Vertical sunlight: full above the surface, attenuated through translucent blocks. */
function seedSky(chunk: Chunk): void {
  const sky = chunk.sky;
  sky.fill(0);
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      let l = 15;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const i = cidx(x, y, z);
        const cost = LIGHT_COST[chunk.blocks[i]];
        if (cost === 255) l = 0;
        else if (cost > 0) l = Math.max(0, l - cost);
        sky[i] = l;
      }
    }
  }
}

/**
 * Recompute both light channels for one chunk. Reads neighbour border light so
 * light flows across chunk seams, and writes back into neighbours when it can
 * push further than they currently have (marking them for a relight).
 */
export function relightChunk(world: World, chunk: Chunk): void {
  const bx = chunk.cx * CHUNK_SIZE;
  const bz = chunk.cz * CHUNK_SIZE;
  head = 0;
  tail = 0;

  seedSky(chunk);
  chunk.blockLight.fill(0);

  // Seed sky-light queue from this chunk and the neighbour border ring.
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const l = chunk.sky[cidx(x, y, z)];
        if (l > 0) push(bx + x, y, bz + z, l, 0);
      }
    }
  }
  // Neighbour border ring seeds (both channels) so light flows across seams.
  for (let t = 0; t < CHUNK_SIZE; t++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (const e of [-1, CHUNK_SIZE]) {
        seedFromWorld(world, bx + e, y, bz + t);
        seedFromWorld(world, bx + t, y, bz + e);
      }
    }
  }

  // Seed block light from emitters inside the chunk.
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const e = EMIT[chunk.blocks[cidx(x, y, z)]];
        if (e > 0) {
          chunk.blockLight[cidx(x, y, z)] = e;
          push(bx + x, y, bz + z, e, 1);
        }
      }
    }
  }

  const dirtyNeighbours = new Set<string>();

  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    const z = qz[head];
    const l = ql[head];
    const ch = qchannel[head];
    head++;
    if (l <= 1) continue;

    for (let d = 0; d < 6; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      const id = world.getBlock(nx, ny, nz);
      const cost = LIGHT_COST[id];
      if (cost === 255) continue;
      const nl = l - Math.max(1, cost);
      if (nl <= 0) continue;

      const lx = nx - bx;
      const lz = nz - bz;
      const inside = lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE;
      if (inside) {
        const i = cidx(lx, ny, lz);
        const arr = ch === 0 ? chunk.sky : chunk.blockLight;
        if (nl > arr[i]) {
          arr[i] = nl;
          push(nx, ny, nz, nl, ch);
        }
      } else {
        const cur = ch === 0 ? world.skyAt(nx, ny, nz) : world.blockLightAt(nx, ny, nz);
        if (nl > cur) {
          if (ch === 0) world.setSkyAt(nx, ny, nz, nl);
          else world.setBlockLightAt(nx, ny, nz, nl);
          const ck = Math.floor(nx / CHUNK_SIZE) + ',' + Math.floor(nz / CHUNK_SIZE);
          if (ck !== chunk.cx + ',' + chunk.cz) dirtyNeighbours.add(ck);
        }
      }
    }
  }

  dirtyNeighbours.forEach((k) => {
    world.pendingLight.add(k);
    world.pendingMesh.add(k);
    const parts = k.split(',');
    const n = world.getChunk(parseInt(parts[0], 10), parseInt(parts[1], 10));
    if (n) n.meshDirty = true;
  });

  chunk.lit = true;
}
