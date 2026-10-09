/** FR-10 / NFR-7: block edits, block entities and the day clock. */

import { describe, expect, it } from 'vitest';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { B } from '../src/world/blocks';
import { SEA_LEVEL, WORLD_HEIGHT, chunkKey } from '../src/world/constants';
import { generateChunk } from '../src/world/worldgen';
import { WorldClock } from '../src/engine/time';
import { CONFIG } from '../src/config';
import { groundWorld } from './helpers';

describe('world', () => {
  it('clamps vertical lookups', () => {
    const w = groundWorld(5);
    expect(w.getBlock(0, -1, 0)).toBe(B.BEDROCK);
    expect(w.getBlock(0, WORLD_HEIGHT, 0)).toBe(B.AIR);
  });

  it('records player edits and marks the chunk dirty', () => {
    const w = groundWorld(5);
    expect(w.setBlock(2, 6, 2, B.OAK_PLANKS)).toBe(true);
  });

  it('writes and reads blocks, and refuses missing chunks', () => {
    const w = groundWorld(5);
    expect(w.setBlock(2, 6, 2, B.OAK_PLANKS)).toBe(true);
    expect(w.getBlock(2, 6, 2)).toBe(B.OAK_PLANKS);
    expect(w.edits.get(chunkKey(0, 0))!.size).toBe(1);
    expect(w.pendingMesh.size).toBeGreaterThan(0);

    w.detach(3, 3);
    expect(w.setBlock(60, 6, 60, B.OAK_PLANKS)).toBe(false);
  });

  it('updates the column height when blocks change', () => {
    const w = groundWorld(5);
    expect(w.heightAt(4, 4)).toBe(5);
    w.setBlock(4, 6, 4, B.STONE);
    expect(w.heightAt(4, 4)).toBe(6);
    w.setBlock(4, 6, 4, B.AIR);
    expect(w.heightAt(4, 4)).toBe(5);
  });

  it('re-applies stored edits to a regenerated chunk (NFR-7)', () => {
    const seed = 4242;
    const w = new World(seed);
    const fresh = new Chunk(0, 0);
    const gen = generateChunk(0, 0, seed);
    fresh.blocks.set(gen.blocks);
    fresh.meta.set(gen.meta);
    fresh.height.set(gen.height);
    fresh.generated = true;
    w.attach(fresh);

    const x = 5;
    const z = 9;
    const y = w.heightAt(x, z);
    expect(w.setBlock(x, y, z, B.GOLD_BLOCK)).toBe(true);

    const rebuilt = new Chunk(0, 0);
    rebuilt.blocks.set(gen.blocks);
    rebuilt.height.set(gen.height);
    rebuilt.generated = true;
    expect(rebuilt.get(x, y, z)).not.toBe(B.GOLD_BLOCK);

    w.applyEdits(rebuilt);
    expect(rebuilt.get(x, y, z)).toBe(B.GOLD_BLOCK);
    expect(rebuilt.heightAt(x, z)).toBe(y);
  });

  it('owns one furnace and one chest state per position', () => {
    const w = groundWorld(5);
    const f = w.ensureFurnace(1, 6, 1);
    expect(w.ensureFurnace(1, 6, 1)).toBe(f);
    expect(w.furnaceAt(1, 6, 1)).toBe(f);
    expect(w.furnaceAt(9, 9, 9)).toBeUndefined();

    const chest = w.chestAt(2, 6, 2);
    expect(chest.length).toBe(27);
    chest[0] = { id: 'coal', count: 3 };
    expect(w.chestAt(2, 6, 2)[0]!.count).toBe(3);
  });

  it('reads and writes block metadata', () => {
    const w = groundWorld(5);
    w.setMeta(3, 6, 3, 2);
    expect(w.getMeta(3, 6, 3)).toBe(2);
  });

  it('sea level matches the specification', () => {
    expect(SEA_LEVEL).toBe(32);
  });
});

describe('world clock', () => {
  it('wraps after a full day (FR-8.1)', () => {
    const clock = new WorldClock(0);
    clock.advance(CONFIG.dayLength);
    expect(clock.fraction).toBeCloseTo(0, 6);
  });

  it('advances proportionally to elapsed seconds', () => {
    const clock = new WorldClock(0);
    clock.advance(CONFIG.dayLength / 4);
    expect(clock.fraction).toBeCloseTo(0.25, 6);
    expect(clock.daylight).toBeGreaterThan(0.9);
  });

  it('is dark at midnight and bright at noon', () => {
    const noon = new WorldClock(0.25);
    const midnight = new WorldClock(0.75);
    expect(noon.daylight).toBeGreaterThan(0.9);
    expect(midnight.daylight).toBeLessThan(0.2);
    expect(midnight.isNight).toBe(true);
  });

  it('formats a 24 hour label and a day counter', () => {
    const clock = new WorldClock(0);
    expect(clock.clockLabel).toBe('06:00');
    expect(clock.dayNumber).toBe(1);
    expect(clock.palette().zenith.length).toBe(3);
    expect(clock.palette().sunDir.length).toBe(3);
  });
});
