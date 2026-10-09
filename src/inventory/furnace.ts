/** Furnace block entity: fuel burn + smelt progress. */

import type { ItemStack } from './item';
import { fuelOf, maxStack } from './item';
import { smeltResult } from './recipes';
import { CONFIG } from '../config';

export interface FurnaceState {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  /** Seconds of burn left. */
  burn: number;
  /** Total burn seconds of the current fuel unit. */
  burnMax: number;
  /** Seconds of cooking done for the current item. */
  cook: number;
}

function consumeOne(slot: ItemStack | null): ItemStack | null {
  if (!slot) return null;
  if (slot.count <= 1) return null;
  slot.count -= 1;
  return slot;
}

/** Advance one furnace by dt seconds. Pure-ish: mutates the state in place. */
export function tickFurnace(f: FurnaceState, dt: number): void {
  const smelt = f.input ? smeltResult(f.input.id) : undefined;
  const outputRoom =
    smelt !== undefined &&
    (f.output === null || (f.output.id === smelt.id && f.output.count < maxStack(smelt.id)));

  if (f.burn <= 0 && smelt !== undefined && outputRoom && f.fuel) {
    const secs = fuelOf(f.fuel.id);
    if (secs > 0) {
      f.burnMax = secs;
      f.burn = secs;
      f.fuel = consumeOne(f.fuel);
    }
  }

  if (f.burn <= 0) {
    f.cook = 0;
    return;
  }

  f.burn = Math.max(0, f.burn - dt);

  if (!smelt || !outputRoom) {
    f.cook = 0;
    return;
  }

  f.cook += dt;
  if (f.cook >= CONFIG.smeltSeconds) {
    f.cook = 0;
    if (f.output === null) f.output = { id: smelt.id, count: smelt.count };
    else f.output.count += smelt.count;
    f.input = consumeOne(f.input);
  }
}

export function furnaceProgress(f: FurnaceState): { burn: number; cook: number } {
  return {
    burn: f.burnMax > 0 ? f.burn / f.burnMax : 0,
    cook: f.cook / CONFIG.smeltSeconds
  };
}
