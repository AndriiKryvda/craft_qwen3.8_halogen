/** SwingClock: the fist must land exactly once per swing, whatever the frame rate. */

import { describe, expect, it } from 'vitest';
import {
  IMPACT_PHASE,
  SWING_BASE_PERIOD,
  SWING_CREATIVE_PERIOD,
  SWING_MIN_PERIOD,
  SwingClock,
  swingExtension,
  swingPeriod
} from '../src/player/swing';
import type { ToolInfo } from '../src/world/blocks';

const hand: ToolInfo | null = null;
const wooden: ToolInfo = { kind: 'pickaxe', tier: 0 };
const diamond: ToolInfo = { kind: 'pickaxe', tier: 4 };

describe('swingPeriod', () => {
  it('is slowest bare handed and never slower than the base period', () => {
    expect(swingPeriod(hand)).toBe(SWING_BASE_PERIOD);
  });

  it('speeds up with a better tool but stays above the floor', () => {
    expect(swingPeriod(diamond)).toBeLessThan(swingPeriod(wooden));
    expect(swingPeriod(diamond)).toBeGreaterThanOrEqual(SWING_MIN_PERIOD);
  });

  it('has its own snappy cadence in creative mode', () => {
    expect(swingPeriod(diamond, true)).toBe(SWING_CREATIVE_PERIOD);
  });

  it('ignores junk tiers instead of crashing', () => {
    expect(swingPeriod({ kind: 'axe', tier: 99 })).toBeGreaterThan(0);
  });
});

describe('swingExtension', () => {
  it('starts and ends at rest, fully extended at the impact', () => {
    expect(swingExtension(0)).toBeCloseTo(0);
    expect(swingExtension(1)).toBeCloseTo(0);
    expect(swingExtension(IMPACT_PHASE)).toBeCloseTo(1);
  });

  it('stays inside 0..1 even for nonsense phases', () => {
    for (const p of [-5, -0.2, 0.3, 0.9, 42]) {
      const e = swingExtension(p);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });
});

describe('SwingClock', () => {
  const period = SWING_BASE_PERIOD;

  it('goes quiet and returns to rest as soon as punching stops', () => {
    const c = new SwingClock();
    for (let i = 0; i < 10; i++) c.update(0.016, true, period);
    expect(c.active).toBe(true);
    c.update(0.016, false, period);
    expect(c.active).toBe(false);
    expect(c.phase).toBe(0);
    expect(c.extension).toBeCloseTo(0);
  });

  it('lands exactly one punch per cycle at a smooth frame rate', () => {
    const c = new SwingClock();
    let hits = 0;
    const seconds = 4;
    const frames = Math.round(seconds / 0.016);
    for (let i = 0; i < frames; i++) if (c.update(0.016, true, period)) hits++;
    // ~3 punches per second, and never one per frame.
    const expected = seconds / period;
    expect(hits).toBeGreaterThanOrEqual(Math.floor(expected));
    expect(hits).toBeLessThanOrEqual(Math.ceil(expected));
  });

  it('never loses a punch when the frame time spikes', () => {
    const c = new SwingClock();
    // One huge frame: at most one impact may be reported, but it must be reported.
    expect(c.update(2.5, true, period)).toBe(true);
    expect(c.update(0.016, true, period)).toBe(false);
  });

  it('reports the impact at the impact phase, not at the end of the cycle', () => {
    const c = new SwingClock();
    let landedAt = -1;
    for (let i = 0; i < 200; i++) {
      const hit = c.update(period / 100, true, period);
      if (hit && landedAt < 0) landedAt = c.phase;
    }
    expect(landedAt).toBeGreaterThanOrEqual(IMPACT_PHASE);
    expect(landedAt).toBeLessThan(IMPACT_PHASE + 0.02);
  });

  it('punches faster with a diamond pickaxe than bare handed', () => {
    const count = (tool: ToolInfo | null): number => {
      const c = new SwingClock();
      let hits = 0;
      for (let i = 0; i < Math.round(3 / 0.016); i++) {
        if (c.update(0.016, true, swingPeriod(tool))) hits++;
      }
      return hits;
    };
    expect(count(diamond)).toBeGreaterThan(count(hand));
  });

  it('runs a single swing for a right-click then stops on its own', () => {
    const c = new SwingClock();
    c.trigger();
    let hits = 0;
    for (let i = 0; i < Math.round(3 / 0.016); i++) if (c.update(0.016, false, period)) hits++;
    expect(hits).toBe(1);
    expect(c.active).toBe(false);
    expect(c.extension).toBeCloseTo(0);
  });

  it('reset() drops a queued swing', () => {
    const c = new SwingClock();
    c.trigger();
    c.reset();
    expect(c.update(0.016, false, period)).toBe(false);
  });

  it('survives a zero or negative delta', () => {
    const c = new SwingClock();
    expect(c.update(0, true, period)).toBe(false);
    expect(c.update(-1, true, period)).toBe(false);
    expect(c.phase).toBe(0);
  });
});
