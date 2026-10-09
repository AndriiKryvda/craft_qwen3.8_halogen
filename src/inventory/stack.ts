/** ItemStack helpers shared by inventory, crafting, furnace and mobs. */

import { type ItemStack, getItem, maxStack } from './item';

export function makeStack(id: string, count = 1): ItemStack | null {
  const def = getItem(id);
  if (!def || count <= 0) return null;
  return { id, count: Math.min(count, def.stack) };
}

export function cloneStack(s: ItemStack | null): ItemStack | null {
  return s ? { id: s.id, count: s.count } : null;
}

export function isSame(a: ItemStack | null, b: ItemStack | null): boolean {
  return a !== null && b !== null && a.id === b.id;
}

/** Index of the first slot that could accept more of `id`. */
export function firstPartialOrEmpty(
  slots: Array<ItemStack | null>,
  id: string,
  from = 0,
  to = slots.length
): number {
  const max = maxStack(id);
  for (let i = from; i < to; i++) {
    const s = slots[i];
    if (s === null) return i;
    if (s.id === id && s.count < max) return i;
  }
  return -1;
}

/**
 * Try to place `stack` into `slots[from..to)`, merging into partial stacks
 * first. Returns the number that did not fit.
 */
export function addToSlots(
  slots: Array<ItemStack | null>,
  id: string,
  count: number,
  from = 0,
  to = slots.length
): number {
  const max = maxStack(id);
  let left = count;
  for (let i = from; i < to && left > 0; i++) {
    const s = slots[i];
    if (s && s.id === id && s.count < max) {
      const room = max - s.count;
      const take = Math.min(room, left);
      s.count += take;
      left -= take;
    }
  }
  for (let i = from; i < to && left > 0; i++) {
    if (slots[i] === null) {
      const put = Math.min(max, left);
      slots[i] = { id, count: put };
      left -= put;
    }
  }
  return left;
}

export function countItem(slots: Array<ItemStack | null>, id: string): number {
  let n = 0;
  for (const s of slots) if (s && s.id === id) n += s.count;
  return n;
}

/** Remove up to `count` of `id`; returns how many were actually removed. */
export function removeItems(slots: Array<ItemStack | null>, id: string, count: number): number {
  let left = count;
  for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
    const s = slots[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.count, left);
    s.count -= take;
    left -= take;
    if (s.count === 0) slots[i] = null;
  }
  return count - left;
}

export function hasItems(slots: Array<ItemStack | null>, id: string, count: number): boolean {
  return countItem(slots, id) >= count;
}
