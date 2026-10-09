/** Chunk → GPU buffers: face culling, ambient occlusion, per-face light. */

import type { World } from '../world/world';
import type { Chunk } from '../world/chunk';
import { CHUNK_SIZE, WORLD_HEIGHT, cidx } from '../world/constants';
import { BLOCK_COUNT, OPAQUE, CROSS, LIQUID, TILE_TOP, TILE_SIDE, TILE_BOTTOM, B, DEFS } from '../world/blocks';
import { ATLAS_GRID, UV_EPS } from './atlas';

/** Blocks drawn in the blended pass. */
const ALPHA = new Uint8Array(BLOCK_COUNT);
for (const d of DEFS) {
  ALPHA[d.id] = d.liquid || d.cross || d.id === B.GLASS || d.id === B.ICE ? 1 : 0;
}

const AO_LEVELS = [0.46, 0.66, 0.83, 1.0];

export interface Face {
  nx: number; ny: number; nz: number;
  ux: number; uy: number; uz: number;
  vx: number; vy: number; vz: number;
  /** bl, br, tr, tl corner offsets inside the unit cube. */
  verts: number[][];
  shade: number;
}

export const FACES: Face[] = [
  { nx: 1, ny: 0, nz: 0, ux: 0, uy: 0, uz: -1, vx: 0, vy: 1, vz: 0, verts: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.62 },
  { nx: -1, ny: 0, nz: 0, ux: 0, uy: 0, uz: 1, vx: 0, vy: 1, vz: 0, verts: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.62 },
  { nx: 0, ny: 1, nz: 0, ux: 1, uy: 0, uz: 0, vx: 0, vy: 0, vz: -1, verts: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { nx: 0, ny: -1, nz: 0, ux: 1, uy: 0, uz: 0, vx: 0, vy: 0, vz: 1, verts: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { nx: 0, ny: 0, nz: 1, ux: 1, uy: 0, uz: 0, vx: 0, vy: 1, vz: 0, verts: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8 },
  { nx: 0, ny: 0, nz: -1, ux: -1, uy: 0, uz: 0, vx: 0, vy: 1, vz: 0, verts: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8 }
];

/** Corner signs matching the vertex order bl, br, tr, tl. */
const CORNER = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

export interface MeshData {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  color: Float32Array;
  light: Float32Array;
  index: Uint32Array;
  triangles: number;
}

class Buf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  lit: number[] = [];
  idx: number[] = [];
  count = 0;

  quad(px: number[], py: number[], pz: number[], uv: number[], shade: number[], light: number[]): void {
    const base = this.count;
    for (let k = 0; k < 4; k++) {
      this.pos.push(px[k], py[k], pz[k]);
      this.nor.push(0, 0, 0);
      this.uv.push(uv[k * 2], uv[k * 2 + 1]);
      this.col.push(shade[k], shade[k], shade[k]);
      this.lit.push(light[0], light[1]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }

  toData(): MeshData {
    return {
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nor),
      uv: new Float32Array(this.uv),
      color: new Float32Array(this.col),
      light: new Float32Array(this.lit),
      index: new Uint32Array(this.idx),
      triangles: this.idx.length / 3
    };
  }
}

export interface ChunkMesh {
  opaque: MeshData;
  transparent: MeshData;
}

function tileUv(tile: number): number[] {
  const col = tile % ATLAS_GRID;
  const row = Math.floor(tile / ATLAS_GRID);
  const s = 1 / ATLAS_GRID;
  const u0 = (col + UV_EPS) * s;
  const u1 = (col + 1 - UV_EPS) * s;
  const v0 = (row + UV_EPS) * s;
  const v1 = (row + 1 - UV_EPS) * s;
  // bl, br, tr, tl
  return [u0, v1, u1, v1, u1, v0, u0, v0];
}

export function buildChunkMesh(world: World, chunk: Chunk): ChunkMesh {
  const O = new Buf();
  const T = new Buf();
  const bx = chunk.cx * CHUNK_SIZE;
  const bz = chunk.cz * CHUNK_SIZE;
  const blocks = chunk.blocks;
  const sky = chunk.sky;
  const blk = chunk.blockLight;

  /** Is the cell opaque? Falls back to the world for neighbour chunks. */
  const occ = (x: number, y: number, z: number): number => {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) return OPAQUE[blocks[cidx(x, y, z)]];
    return OPAQUE[world.getBlock(bx + x, y, bz + z)];
  };

  const px = [0, 0, 0, 0];
  const py = [0, 0, 0, 0];
  const pz = [0, 0, 0, 0];
  const shades = [0, 0, 0, 0];

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const i0 = cidx(x, y, z);
        const id = blocks[i0];
        if (id === 0) continue;
        const wx = bx + x;
        const wz = bz + z;
        const buf = ALPHA[id] ? T : O;

        if (CROSS[id]) {
          // Two diagonal quads, flat shading, lit by the block's own cell.
          const uv = tileUv(TILE_TOP[id]);
          const light = [sky[i0] / 15, blk[i0] / 15];
          const flat = [1, 1, 1, 1];
          const x0 = wx + 0.07, x1 = wx + 0.93, z0 = wz + 0.07, z1 = wz + 0.93;
          px[0] = x0; py[0] = y; pz[0] = z0; px[1] = x1; py[1] = y; pz[1] = z1;
          px[2] = x1; py[2] = y + 1; pz[2] = z1; px[3] = x0; py[3] = y + 1; pz[3] = z0;
          buf.quad(px, py, pz, uv, flat, light);
          px[0] = x1; py[0] = y; pz[0] = z0; px[1] = x0; py[1] = y; pz[1] = z1;
          px[2] = x0; py[2] = y + 1; pz[2] = z1; px[3] = x1; py[3] = y + 1; pz[3] = z0;
          buf.quad(px, py, pz, uv, flat, light);
          continue;
        }

        // An open water surface sits slightly below the full cube height.
        let topY = 1;
        if (LIQUID[id]) {
          const above = y + 1 < WORLD_HEIGHT ? blocks[cidx(x, y + 1, z)] : 0;
          if (above === 0) topY = 0.875;
        }

        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nx = x + F.nx;
          const ny = y + F.ny;
          const nz = z + F.nz;
          let nb: number;
          if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT) {
            nb = blocks[cidx(nx, ny, nz)];
          } else {
            nb = world.getBlock(bx + nx, ny, bz + nz);
          }
          if (nb !== 0 && OPAQUE[nb]) continue;
          if (nb === id) continue;

          const tile = F.ny > 0 ? TILE_TOP[id] : F.ny < 0 ? TILE_BOTTOM[id] : TILE_SIDE[id];
          const uv = tileUv(tile);
          const light = [
            occ(nx, ny, nz) === 1 ? 0 : world.skyAt(bx + nx, ny, bz + nz) / 15,
            world.blockLightAt(bx + nx, ny, bz + nz) / 15
          ];

          for (let k = 0; k < 4; k++) {
            const v = F.verts[k];
            px[k] = wx + v[0];
            py[k] = v[1] === 1 ? y + topY : y;
            pz[k] = wz + v[2];
            const du = CORNER[k][0];
            const dv = CORNER[k][1];
            const s1 = occ(nx + du * F.ux, ny + du * F.uy, nz + du * F.uz);
            const s2 = occ(nx + dv * F.vx, ny + dv * F.vy, nz + dv * F.vz);
            const cr = occ(nx + du * F.ux + dv * F.vx, ny + du * F.uy + dv * F.vy, nz + du * F.uz + dv * F.vz);
            const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
            shades[k] = AO_LEVELS[ao] * F.shade;
          }
          buf.quad(px, py, pz, uv, shades, light);
        }
      }
    }
  }

  return { opaque: O.toData(), transparent: T.toData() };
}

