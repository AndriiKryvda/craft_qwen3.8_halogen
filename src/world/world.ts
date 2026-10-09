/** World: chunk map, block access, player edit diff, block entities. */

import { Chunk } from './chunk';
import { CHUNK_SIZE, WORLD_HEIGHT, cidx, chunkKey, posKey, floorDiv } from './constants';
import { columnInfo } from './biomes';
import { B, SOLID, LIQUID, REPLACEABLE, EMIT } from './blocks';
import type { ItemStack } from '../inventory/item';
import type { FurnaceState } from '../inventory/furnace';

export class World {
  readonly seed: number;
  readonly chunks = new Map<string, Chunk>();
  /** chunkKey -> (cell index -> block id). Only player-made changes. */
  readonly edits = new Map<string, Map<number, number>>();
  readonly furnaces = new Map<string, FurnaceState>();
  readonly chests = new Map<string, Array<ItemStack | null>>();
  /** Chunks whose lighting must be recomputed. */
  readonly pendingLight = new Set<string>();
  /** Chunks whose mesh must be rebuilt. */
  readonly pendingMesh = new Set<string>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  getChunkAt(wx: number, wz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(floorDiv(wx, CHUNK_SIZE), floorDiv(wz, CHUNK_SIZE)));
  }

  attach(chunk: Chunk): void {
    this.chunks.set(chunkKey(chunk.cx, chunk.cz), chunk);
    this.pendingLight.add(chunkKey(chunk.cx, chunk.cz));
    this.pendingMesh.add(chunkKey(chunk.cx, chunk.cz));
  }

  detach(cx: number, cz: number): void {
    const k = chunkKey(cx, cz);
    const c = this.chunks.get(k);
    if (c) c.dispose();
    this.chunks.delete(k);
    this.pendingLight.delete(k);
    this.pendingMesh.delete(k);
  }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0) return B.BEDROCK;
    if (wy >= WORLD_HEIGHT) return 0;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 0;
    return c.blocks[cidx(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)];
  }

  getMeta(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 0;
    return c.meta[cidx(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)];
  }

  setMeta(wx: number, wy: number, wz: number, v: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return;
    c.meta[cidx(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)] = v;
    this.pendingMesh.add(chunkKey(cx, cz));
  }

  /**
   * Set a block. `record` stores the change in the edit diff so it survives a
   * reload; regeneration always happens first and edits are re-applied on top.
   */
  setBlock(wx: number, wy: number, wz: number, id: number, meta = 0, record = true): boolean {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    const c = this.chunks.get(key);
    if (!c) return false;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const i = cidx(lx, wy, lz);
    if (c.blocks[i] === id && c.meta[i] === meta) return false;
    c.blocks[i] = id;
    c.meta[i] = meta;
    if (record) {
      let m = this.edits.get(key);
      if (!m) {
        m = new Map();
        this.edits.set(key, m);
      }
      m.set(i, id);
    }
    c.recalcColumn(lx, lz);
    c.meshDirty = true;
    this.pendingMesh.add(key);
    this.pendingLight.add(key);
    if (lx === 0) this.markNeighbour(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markNeighbour(cx + 1, cz);
    if (lz === 0) this.markNeighbour(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markNeighbour(cx, cz + 1);
    return true;
  }

  private markNeighbour(cx: number, cz: number): void {
    const k = chunkKey(cx, cz);
    const n = this.chunks.get(k);
    if (n) {
      n.meshDirty = true;
      this.pendingMesh.add(k);
      this.pendingLight.add(k);
    }
  }

  isSolidAt(wx: number, wy: number, wz: number): boolean {
    return SOLID[this.getBlock(wx, wy, wz)] === 1;
  }

  isLiquidAt(wx: number, wy: number, wz: number): boolean {
    return LIQUID[this.getBlock(wx, wy, wz)] === 1;
  }

  isReplaceableAt(wx: number, wy: number, wz: number): boolean {
    return REPLACEABLE[this.getBlock(wx, wy, wz)] === 1;
  }

  /** Highest non-air, non-water block in the column (world space). */
  heightAt(wx: number, wz: number): number {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) return c.heightAt(wx - cx * CHUNK_SIZE, wz - cz * CHUNK_SIZE);
    return columnInfo(wx, wz, this.seed).h;
  }

  biomeAt(wx: number, wz: number): number {
    return columnInfo(wx, wz, this.seed).biome;
  }

  // ---- light access ------------------------------------------------------
  skyAt(wx: number, wy: number, wz: number): number {
    if (wy >= WORLD_HEIGHT) return 15;
    if (wy < 0) return 0;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 15;
    return c.sky[cidx(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)];
  }

  setSkyAt(wx: number, wy: number, wz: number, v: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return;
    c.sky[cidx(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)] = v;
  }

  blockLightAt(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 0;
    return c.blockLight[cidx(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)];
  }

  setBlockLightAt(wx: number, wy: number, wz: number, v: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return;
    c.blockLight[cidx(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)] = v;
  }

  /** Effective light at a cell, 0..15, used by spawn rules. */
  lightAt(wx: number, wy: number, wz: number, daylight: number): number {
    return Math.max(this.blockLightAt(wx, wy, wz), Math.round(this.skyAt(wx, wy, wz) * daylight));
  }

  emitterAt(wx: number, wy: number, wz: number): number {
    return EMIT[this.getBlock(wx, wy, wz)];
  }

  /** Re-apply stored edits after a chunk is (re)generated. */
  applyEdits(chunk: Chunk): void {
    const m = this.edits.get(chunkKey(chunk.cx, chunk.cz));
    if (!m) return;
    m.forEach((id, i) => {
      chunk.blocks[i] = id;
    });
    chunk.recalcAllHeights();
  }

  furnaceAt(wx: number, wy: number, wz: number): FurnaceState | undefined {
    return this.furnaces.get(posKey(wx, wy, wz));
  }

  ensureFurnace(wx: number, wy: number, wz: number): FurnaceState {
    const k = posKey(wx, wy, wz);
    let f = this.furnaces.get(k);
    if (!f) {
      f = { input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 };
      this.furnaces.set(k, f);
    }
    return f;
  }

  chestAt(wx: number, wy: number, wz: number): Array<ItemStack | null> {
    const k = posKey(wx, wy, wz);
    let c = this.chests.get(k);
    if (!c) {
      c = new Array(27).fill(null);
      this.chests.set(k, c);
    }
    return c;
  }

  get loadedChunks(): number {
    return this.chunks.size;
  }
}

