/** FR-7: health, hunger, air and the rules that tie them together. */

import { describe, expect, it } from 'vitest';
import { SurvivalStats } from '../src/survival/stats';
import { CONFIG } from '../src/config';

const dry = { headInWater: false, inWater: false, canRegen: false };
const wet = { headInWater: true, inWater: true, canRegen: false };
const fed = { headInWater: false, inWater: false, canRegen: true };

describe('survival stats', () => {
  it('starts with full vitals (FR-7.1)', () => {
    const s = new SurvivalStats();
    expect(s.health).toBe(CONFIG.maxHealth);
    expect(s.hunger).toBe(CONFIG.maxHunger);
    expect(s.air).toBeCloseTo(CONFIG.airTicks / 10);
  });

  it('fall damage is one HP per block past three (FR-7.4)', () => {
    expect(SurvivalStats.fallDamage(2)).toBe(0);
    expect(SurvivalStats.fallDamage(3)).toBe(0);
    expect(SurvivalStats.fallDamage(4)).toBe(1);
    expect(SurvivalStats.fallDamage(10)).toBe(7);
  });

  it('short invulnerability stops damage stacking', () => {
    const s = new SurvivalStats();
    s.hurt(4, 'mob');
    expect(s.health).toBe(16);
    s.hurt(4, 'mob');
    expect(s.health).toBe(16);
    s.update(1, dry);
    s.hurt(4, 'mob');
    expect(s.health).toBe(12);
  });

  it('exhaustion converts to hunger loss (FR-7.2)', () => {
    const s = new SurvivalStats();
    s.addExhaustion(3.9);
    expect(s.hunger).toBe(20);
    s.addExhaustion(0.2);
    expect(s.hunger).toBe(19);
  });

  it('eating restores hunger up to the cap (FR-7.5)', () => {
    const s = new SurvivalStats();
    s.hunger = 10;
    s.eat(8);
    expect(s.hunger).toBe(18);
    s.eat(50);
    expect(s.hunger).toBe(CONFIG.maxHunger);
  });

  it('regenerates while well fed (FR-7.3)', () => {
    const s = new SurvivalStats();
    s.health = 10;
    for (let i = 0; i < 100; i++) s.update(0.05, fed);
    expect(s.health).toBeGreaterThan(10);
  });

  it('starvation stops at one HP and never kills (FR-7.3)', () => {
    const s = new SurvivalStats();
    s.hunger = 0;
    for (let i = 0; i < 2000; i++) s.update(0.05, dry);
    expect(s.health).toBe(1);
    expect(s.dead).toBe(false);
  });

  it('drowns once the bubbles are gone (FR-7.4)', () => {
    const s = new SurvivalStats();
    s.air = 0;
    for (let i = 0; i < 40; i++) s.update(0.05, wet);
    expect(s.health).toBeLessThan(CONFIG.maxHealth);
  });

  it('refills air out of the water', () => {
    const s = new SurvivalStats();
    s.air = 2;
    for (let i = 0; i < 40; i++) s.update(0.05, dry);
    expect(s.air).toBeCloseTo(CONFIG.airTicks / 10);
  });

  it('dies, reports the cause and resets on respawn (FR-7.6)', () => {
    const s = new SurvivalStats();
    let cause = '';
    s.onDeath = (c) => {
      cause = c;
    };
    s.hurt(CONFIG.maxHealth, 'fall');
    expect(s.dead).toBe(true);
    expect(cause).toBe('fall');
    s.reset();
    expect(s.health).toBe(CONFIG.maxHealth);
    expect(s.hunger).toBe(CONFIG.maxHunger);
    expect(s.dead).toBe(false);
  });
});
