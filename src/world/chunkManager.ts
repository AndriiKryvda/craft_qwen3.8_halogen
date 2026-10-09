/** Streams chunks in and out around the player under a per-frame time budget. */

import { World } from './world';
import { Chunk } from './chunk';
import { CHUNK_SIZE, chunkKey, floorDiv } from './constants';
import { generateChunk } from './worldgen';
import { relightChunk } from './lighting';

interface GenJob {
  cx: number;
  cz: number;
  d: number;
}

interface WorkerResult {
  id: number;
  cx: number;
  cz: number;
  blocks: Uint8Array;
  meta: Uint8Array;
  height: Uint8Array;
}

export class ChunkManager {
  readonly world: World;
  renderDistance = 6;
  private centerX = 0;
  private centerZ = 0;
  private queue: GenJob[] = [];
  private requested = new Set<string>();
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private nextId = 1;
  private inflight = new Map<number, GenJob>();
  private useWorkers = false;
  private queueDirty = true;

  constructor(world: World, workerCount = 2) {
    this.world = world;
    this.useWorkers = this.spawnWorkers(workerCount);
  }

  private spawnWorkers(count: number): boolean {
    if (typeof Worker === 'undefined') return false;
    try {
      for (let i = 0; i < count; i++) {
        const w = new Worker(new URL('../workers/world.worker.ts', import.meta.url), { type: 'module' });
        const slot = this.workers.length;
        this.busy.push(false);
        w.onmessage = (e: MessageEvent<WorkerResult>) => {
          this.busy[slot] = false;
          const job = this.inflight.get(e.data.id);
          this.inflight.delete(e.data.id);
          if (job) this.onChunkReady(job.cx, job.cz, e.data);
        };
        w.onerror = () => {
          this.busy[slot] = false;
          this.useWorkers = false;
        };
        this.workers.push(w);
      }
      return true;
    } catch {
      this.workers = [];
      this.busy = [];
      return false;
    }
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  /** Re-centre streaming on a world position. */
  setCenter(wx: number, wz: number): void {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    if (cx !== this.centerX || cz !== this.centerZ) {
      this.centerX = cx;
      this.centerZ = cz;
      this.queueDirty = true;
    }
  }

  private buildQueue(): void {
    const r = this.renderDistance;
    const jobs: GenJob[] = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const cx = this.centerX + dx;
        const cz = this.centerZ + dz;
        const k = chunkKey(cx, cz);
        if (this.world.chunks.has(k) || this.requested.has(k)) continue;
        jobs.push({ cx, cz, d: dx * dx + dz * dz });
      }
    }
    jobs.sort((a, b) => a.d - b.d);
    this.queue = jobs;
    this.queueDirty = false;
    this.unload(r + 2);
  }

  private unload(radius: number): void {
    for (const key of [...this.world.chunks.keys()]) {
      const c = this.world.chunks.get(key);
      if (!c) continue;
      if (Math.abs(c.cx - this.centerX) > radius || Math.abs(c.cz - this.centerZ) > radius) {
        this.world.detach(c.cx, c.cz);
      }
    }
  }

  private fillChunk(cx: number, cz: number, res: { blocks: Uint8Array; meta: Uint8Array; height: Uint8Array }): Chunk {
    const chunk = new Chunk(cx, cz);
    chunk.blocks.set(res.blocks);
    chunk.meta.set(res.meta);
    chunk.height.set(res.height);
    chunk.generated = true;
    this.world.applyEdits(chunk);
    this.world.attach(chunk);
    return chunk;
  }

  private onChunkReady(cx: number, cz: number, res: WorkerResult): void {
    this.requested.delete(chunkKey(cx, cz));
    this.fillChunk(cx, cz, res);
  }

  private generateInline(cx: number, cz: number): void {
    this.requested.delete(chunkKey(cx, cz));
    this.fillChunk(cx, cz, generateChunk(cx, cz, this.world.seed));
  }

  private dispatch(job: GenJob): boolean {
    if (this.useWorkers) {
      for (let i = 0; i < this.workers.length; i++) {
        if (!this.busy[i]) {
          this.busy[i] = true;
          const id = this.nextId++;
          this.inflight.set(id, job);
          this.workers[i].postMessage({ id, cx: job.cx, cz: job.cz, seed: this.world.seed });
          return true;
        }
      }
      return false;
    }
    this.generateInline(job.cx, job.cz);
    return true;
  }

  /** Remaining streaming work (drives the loading screen). */
  get pendingWork(): number {
    return this.queue.length + this.world.pendingLight.size + this.world.pendingMesh.size;
  }

  /** Run generation + lighting jobs for at most `budgetMs`. */
  update(budgetMs: number): number {
    const t0 = performance.now();
    let done = 0;
    if (this.queueDirty) this.buildQueue();

    // 1. Relight anything waiting (cheap, keeps meshes correct).
    for (const key of [...this.world.pendingLight]) {
      if (performance.now() - t0 > budgetMs) return done;
      const parts = key.split(',');
      const chunk = this.world.getChunk(parseInt(parts[0], 10), parseInt(parts[1], 10));
      this.world.pendingLight.delete(key);
      if (!chunk || !chunk.generated) continue;
      relightChunk(this.world, chunk);
      chunk.meshDirty = true;
      this.world.pendingMesh.add(key);
      done++;
    }

    // 2. Ask for missing chunks.
    let inFlight = this.busy.reduce((n, b) => n + (b ? 1 : 0), 0);
    while (this.queue.length > 0 && inFlight < Math.max(2, this.workers.length + 1)) {
      const job = this.queue[0];
      const k = chunkKey(job.cx, job.cz);
      this.queue.shift();
      if (this.world.chunks.has(k)) continue;
      this.requested.add(k);
      if (!this.dispatch(job)) {
        this.requested.delete(k);
        break;
      }
      inFlight++;
      done++;
      if (performance.now() - t0 > budgetMs) break;
    }
    return done;
  }

  /** Generate and light a small area immediately (used before placing the player). */
  generateImmediate(cx: number, cz: number, radius = 1): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const x = cx + dx;
        const z = cz + dz;
        if (!this.world.chunks.has(chunkKey(x, z))) this.generateInline(x, z);
      }
    }
    for (const c of this.world.chunks.values()) {
      if (!c.lit) relightChunk(this.world, c);
    }
  }
}

