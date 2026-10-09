/** FR-1: world generation is deterministic and shaped like the spec. */

import { describe, expect, it } from 'vitest';
import { generateChunk, findSpawn } from '../src/world/worldgen';
import { columnInfo, BIOME, BIOME_NAMES } from '../src/world/biomes';
import { B } from '../src/world/blocks';
import { CHUNK_VOL, SEA_LEVEL, cidx } from '../src/world/constants';

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('world generation', () => {
  it('produces a full chunk volume', () => {
    const res = generateChunk(0, 0, 1234);
    expect(res.blocks.length).toBe(CHUNK_VOL);
    expect(res.meta.length).toBe(CHUNK_VOL);
  });

  it('is deterministic for the same seed (NFR-7)', () => {
    const a = generateChunk(3, -2, 98765);
    const b = generateChunk(3, -2, 98765);
    expect(same(a.blocks, b.blocks)).toBe(true);
    expect(same(a.height, b.height)).toBe(true);
  });

  it('changes when the seed changes', () => {
    const a = generateChunk(3, -2, 1);
    const b = generateChunk(3, -2, 2);
    expect(same(a.blocks, b.blocks)).toBe(false);
  });

  it('lays an unbreakable bedrock floor', () => {
    const res = generateChunk(0, 0, 4242);
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        expect(res.blocks[cidx(x, 0, z)]).toBe(B.BEDROCK);
      }
    }
  });

  it('keeps terrain heights inside the documented range', () => {
    for (let i = 0; i < 40; i++) {
      const col = columnInfo(i * 13 - 260, i * 7 + 11, 777);
      expect(col.h).toBeGreaterThanOrEqual(1);
      expect(col.h).toBeLessThanOrEqual(62);
      expect(col.biome).toBeGreaterThanOrEqual(0);
      expect(col.biome).toBeLessThan(BIOME_NAMES.length);
    }
  });

  it('reports the same biome for the same column', () => {
    const a = columnInfo(120, -64, 5150);
    const b = columnInfo(120, -64, 5150);
    expect(a.biome).toBe(b.biome);
    expect(a.h).toBe(b.h);
  });

  it('fills ocean columns with water at sea level', () => {
    let checked = 0;
    for (let i = 0; i < 400 && checked < 3; i++) {
      const wx = i * 31;
      const wz = -i * 17;
      const col = columnInfo(wx, wz, 20260);
      if (col.biome !== BIOME.OCEAN) continue;
      const cx = Math.floor(wx / 16);
      const cz = Math.floor(wz / 16);
      const res = generateChunk(cx, cz, 20260);
      const lx = wx - cx * 16;
      const lz = wz - cz * 16;
      expect(res.blocks[cidx(lx, SEA_LEVEL, lz)]).toBe(B.WATER);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('finds a dry spawn point', () => {
    const spot = findSpawn(31337, () => 0.5);
    const col = columnInfo(spot.x, spot.z, 31337);
    expect(col.h).toBeGreaterThanOrEqual(SEA_LEVEL);
  });
});
