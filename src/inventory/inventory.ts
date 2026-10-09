/** Player inventory: 9 hotbar + 27 backpack, plus the cursor stack. */

import { type ItemStack, toolInfoOf, maxStack } from './item';
import type { ToolInfo } from '../world/blocks';
import { addToSlots, firstPartialOrEmpty } from './stack';

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;

export class Inventory {
  readonly slots: Array<ItemStack | null> = new Array(INVENTORY_SIZE).fill(null);
  cursor: ItemStack | null = null;
  selected = 0;
  onChange: (() => void) | null = null;

  private changed(): void {
    if (this.onChange) this.onChange();
  }

  get hotbar(): Array<ItemStack | null> {
    return this.slots.slice(0, HOTBAR_SIZE);
  }

  held(): ItemStack | null {
    return this.slots[this.selected];
  }

  heldTool(): ToolInfo | null {
    const h = this.held();
    return h ? toolInfoOf(h.id) : null;
  }

  select(index: number): void {
    this.selected = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.changed();
  }

  cycle(delta: number): void {
    this.select(this.selected + delta);
  }

  /** Add items; returns the count that did not fit. */
  add(id: string, count = 1): number {
    const left = addToSlots(this.slots, id, count);
    if (left !== count) this.changed();
    return left;
  }

  has(id: string, count = 1): boolean {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n >= count;
  }

  remove(id: string, count = 1): number {
    let left = count;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(s.count, left);
      s.count -= take;
      left -= take;
      if (s.count === 0) this.slots[i] = null;
    }
    if (left !== count) this.changed();
    return count - left;
  }

  consumeHeld(n = 1): void {
    const s = this.slots[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    this.changed();
  }

  /**
   * Minecraft-style slot click.
   * button 0 = left, 1 = right. shift = quick-move.
   */
  clickSlot(index: number, button: number, shift: boolean): void {
    const slot = this.slots[index];
    if (shift && slot) {
      const toHotbar = index >= HOTBAR_SIZE;
      const from = toHotbar ? 0 : HOTBAR_SIZE;
      const to = toHotbar ? HOTBAR_SIZE : INVENTORY_SIZE;
      const target = firstPartialOrEmpty(this.slots, slot.id, from, to);
      if (target >= 0) {
        const moved = slot.count;
        const left = addToSlots(this.slots, slot.id, moved, from, to);
        this.slots[index] = left > 0 ? { id: slot.id, count: left } : null;
        if (left !== moved) this.changed();
      }
      return;
    }

    if (button === 0) {
      if (this.cursor === null) {
        if (slot) {
          this.cursor = slot;
          this.slots[index] = null;
        }
      } else if (slot === null) {
        this.slots[index] = this.cursor;
        this.cursor = null;
      } else if (slot.id === this.cursor.id && slot.count < maxStack(slot.id)) {
        const room = maxStack(slot.id) - slot.count;
        const take = Math.min(room, this.cursor.count);
        slot.count += take;
        this.cursor.count -= take;
        if (this.cursor.count <= 0) this.cursor = null;
      } else {
        this.slots[index] = this.cursor;
        this.cursor = slot;
      }
      this.changed();
      return;
    }

    // right button
    if (this.cursor === null) {
      if (slot) {
        const half = Math.ceil(slot.count / 2);
        this.cursor = { id: slot.id, count: half };
        slot.count -= half;
        if (slot.count <= 0) this.slots[index] = null;
      }
    } else if (slot === null) {
      this.slots[index] = { id: this.cursor.id, count: 1 };
      this.cursor.count -= 1;
      if (this.cursor.count <= 0) this.cursor = null;
    } else if (slot.id === this.cursor.id && slot.count < maxStack(slot.id)) {
      slot.count += 1;
      this.cursor.count -= 1;
      if (this.cursor.count <= 0) this.cursor = null;
    } else {
      this.slots[index] = this.cursor;
      this.cursor = slot;
    }
    this.changed();
  }

  /** Drop one (or a whole stack with `all`) of the held item. */
  dropHeld(all: boolean): ItemStack | null {
    const s = this.slots[this.selected];
    if (!s) return null;
    const n = all ? s.count : 1;
    const out: ItemStack = { id: s.id, count: n };
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    this.changed();
    return out;
  }

  clear(): void {
    this.slots.fill(null);
    this.cursor = null;
    this.changed();
  }

  /** Total count of an item id across all slots. */
  count(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }
}
