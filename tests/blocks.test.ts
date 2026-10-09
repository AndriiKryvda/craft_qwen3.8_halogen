/** FR-2: the block registry drives hardness, tool gates and drops. */

import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCK_COUNT,
  DEFS,
  HARDNESS,
  LIQUID,
  SOLID,
  EMIT,
  UNBREAKABLE,
  HURTS,
  blockDef,
  blockLabel,
  canHarvest,
  isSolid,
  miningTime,
  rollDrops
} from '../src/world/blocks';
import type { ToolInfo } from '../src/world/blocks';

const hand: ToolInfo | null = null;
const woodPick: ToolInfo = { kind: 'pickaxe', tier: 1 };
const stonePick: ToolInfo = { kind: 'pickaxe', tier: 2 };
const ironPick: ToolInfo = { kind: 'pickaxe', tier: 3 };
const ironShovel: ToolInfo = { kind: 'shovel', tier: 3 };
const rand = (): number => 0.5;

describe('block registry', () => {
  it('defines at least thirty data-driven blocks', () => {
    expect(BLOCK_COUNT).toBeGreaterThanOrEqual(30);
    expect(DEFS.length).toBe(BLOCK_COUNT);
    expect(HARDNESS.length).toBe(BLOCK_COUNT);
  });

  it('every block has a label and a hardness entry', () => {
    for (let id = 0; id < BLOCK_COUNT; id++) {
      expect(blockDef(id).name.length).toBeGreaterThan(0);
      expect(blockLabel(id).length).toBeGreaterThan(0);
    }
  });

  it('flags air, water and solids correctly', () => {
    expect(SOLID[B.AIR]).toBe(0);
    expect(isSolid(B.AIR)).toBe(false);
    expect(LIQUID[B.WATER]).toBe(1);
    expect(SOLID[B.STONE]).toBe(1);
    expect(EMIT[B.TORCH]).toBe(14);
    expect(HURTS[B.CACTUS]).toBe(1);
  });

  it('bedrock is unbreakable even with a diamond pickaxe', () => {
    expect(UNBREAKABLE[B.BEDROCK]).toBe(1);
    expect(miningTime(B.BEDROCK, { kind: 'pickaxe', tier: 4 })).toBe(Infinity);
  });

  it('mining time is hardness / tool speed (FR-2.3)', () => {
    const bare = miningTime(B.STONE, hand);
    const withPick = miningTime(B.STONE, ironPick);
    expect(bare).toBeGreaterThan(withPick);
    expect(miningTime(B.DIRT, ironShovel)).toBeLessThan(bare);
    expect(Number.isFinite(miningTime(B.STONE, woodPick))).toBe(true);
  });

  it('gates drops on the tool tier (FR-2.3)', () => {
    expect(canHarvest(B.STONE, hand)).toBe(false);
    expect(canHarvest(B.STONE, woodPick)).toBe(true);
    expect(canHarvest(B.IRON_ORE, woodPick)).toBe(false);
    expect(canHarvest(B.IRON_ORE, stonePick)).toBe(true);
    expect(canHarvest(B.DIAMOND_ORE, stonePick)).toBe(false);
    expect(canHarvest(B.DIAMOND_ORE, ironPick)).toBe(true);
  });

  it('rolls the declared drops only when the tool suffices', () => {
    expect(rollDrops(B.STONE, hand, rand)).toEqual([]);
    const stone = rollDrops(B.STONE, woodPick, rand);
    expect(stone).toEqual([{ item: 'b' + B.COBBLE, count: 1 }]);
    expect(rollDrops(B.GRASS, ironShovel, rand)).toEqual([{ item: 'b' + B.DIRT, count: 1 }]);
    expect(rollDrops(B.DIAMOND_ORE, ironPick, rand)).toEqual([{ item: 'diamond', count: 1 }]);
    expect(rollDrops(B.CLAY, ironShovel, rand)).toEqual([{ item: 'clay_ball', count: 4 }]);
  });

  it('respects drop chances', () => {
    expect(rollDrops(B.TALL_GRASS, hand, () => 0.9)).toEqual([]);
    expect(rollDrops(B.TALL_GRASS, hand, () => 0.1)).toEqual([{ item: 'wheat_seed', count: 1 }]);
  });

  it('marks the special blocks from FR-2.6', () => {
    expect(DEFS[B.FARMLAND].solid).toBe(true);
    expect(DEFS[B.WHEAT].cross).toBe(true);
    expect(DEFS[B.GLASS].opaque).toBe(false);
    expect(DEFS[B.SAND].gravity).toBe(true);
    expect(DEFS[B.GRAVEL].gravity).toBe(true);
    expect(DEFS[B.TORCH].solid).toBe(false);
  });
});
