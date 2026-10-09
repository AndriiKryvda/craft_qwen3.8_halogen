/** FR-6: fuel, smelt results and furnace progress. */

import { describe, expect, it } from 'vitest';
import { furnaceProgress, tickFurnace, type FurnaceState } from '../src/inventory/furnace';
import { fuelOf } from '../src/inventory/item';
import { smeltResult } from '../src/inventory/recipes';
import { CONFIG } from '../src/config';
import { B } from '../src/world/blocks';

const bi = (id: number): string => 'b' + id;
const state = (over: Partial<FurnaceState> = {}): FurnaceState => ({
  input: null,
  fuel: null,
  output: null,
  burn: 0,
  burnMax: 0,
  cook: 0,
  ...over
});

describe('furnace', () => {
  it('uses the documented fuel seconds (FR-6.2)', () => {
    expect(fuelOf('coal')).toBe(80);
    expect(fuelOf('charcoal')).toBe(80);
    expect(fuelOf('stick')).toBe(5);
    expect(fuelOf(bi(B.OAK_PLANKS))).toBe(15);
    expect(fuelOf(bi(B.OAK_LOG))).toBe(15);
    expect(fuelOf('iron_ingot')).toBe(0);
  });

  it('knows every smelt pair from FR-6.3', () => {
    expect(smeltResult(bi(B.SAND))!.id).toBe(bi(B.GLASS));
    expect(smeltResult(bi(B.COBBLE))!.id).toBe(bi(B.STONE));
    expect(smeltResult(bi(B.CLAY))!.id).toBe(bi(B.BRICKS));
    expect(smeltResult(bi(B.OAK_LOG))!.id).toBe('charcoal');
    expect(smeltResult(bi(B.IRON_ORE))!.id).toBe('iron_ingot');
    expect(smeltResult('raw_beef')!.id).toBe('cooked_beef');
    expect(smeltResult(bi(B.STONE))).toBeUndefined();
  });

  it('lights on the first tick and consumes the fuel unit', () => {
    const f = state({ input: { id: bi(B.SAND), count: 2 }, fuel: { id: 'coal', count: 1 } });
    tickFurnace(f, 1);
    expect(f.burnMax).toBe(80);
    expect(f.fuel).toBeNull();
    expect(f.output).toBeNull();
  });

  it('smelts one item per ten seconds of burn (FR-6.3)', () => {
    const f = state({ input: { id: bi(B.SAND), count: 3 }, fuel: { id: 'coal', count: 5 } });
    for (let i = 0; i < CONFIG.smeltSeconds; i++) tickFurnace(f, 1);
    expect(f.output).toEqual({ id: bi(B.GLASS), count: 1 });
    expect(f.input!.count).toBe(2);
  });

  it('does not burn fuel with nothing to smelt', () => {
    const f = state({ input: { id: bi(B.STONE), count: 1 }, fuel: { id: 'coal', count: 1 } });
    tickFurnace(f, 5);
    expect(f.burn).toBe(0);
    expect(f.fuel!.count).toBe(1);
  });

  it('pauses when the output stack is full', () => {
    const f = state({
      input: { id: bi(B.SAND), count: 1 },
      fuel: { id: 'coal', count: 1 },
      output: { id: bi(B.GLASS), count: 64 }
    });
    tickFurnace(f, 30);
    expect(f.output!.count).toBe(64);
    expect(f.input!.count).toBe(1);
  });

  it('reports burn and cook fractions for the GUI', () => {
    const f = state({ input: { id: bi(B.SAND), count: 1 }, fuel: { id: 'coal', count: 1 } });
    tickFurnace(f, 1);
    const p = furnaceProgress(f);
    expect(p.burn).toBeGreaterThan(0.9);
    expect(p.cook).toBeCloseTo(1 / CONFIG.smeltSeconds);
  });

  it('cools down when the fuel runs out (FR-6.4)', () => {
    const f = state({ input: { id: bi(B.SAND), count: 1 }, fuel: { id: 'stick', count: 1 } });
    tickFurnace(f, 1);
    expect(f.burnMax).toBe(5);
    for (let i = 0; i < 10; i++) tickFurnace(f, 1);
    expect(f.burn).toBe(0);
    expect(f.cook).toBe(0);
  });
});
