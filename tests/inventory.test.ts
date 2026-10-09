/** FR-4: inventory slots, stacking and Minecraft-style slot clicks. */

import { describe, expect, it } from 'vitest';
import { Inventory, HOTBAR_SIZE, INVENTORY_SIZE } from '../src/inventory/inventory';
import { maxStack } from '../src/inventory/item';
import { B } from '../src/world/blocks';

const STONE = 'b' + B.STONE;
const DIRT = 'b' + B.DIRT;

describe('inventory', () => {
  it('is 9 hotbar slots inside a 36 slot pack', () => {
    const inv = new Inventory();
    expect(HOTBAR_SIZE).toBe(9);
    expect(INVENTORY_SIZE).toBe(36);
    expect(inv.slots.length).toBe(INVENTORY_SIZE);
  });

  it('splits large adds across slots', () => {
    const inv = new Inventory();
    expect(inv.add(STONE, 100)).toBe(0);
    expect(inv.slots[0]).toEqual({ id: STONE, count: 64 });
    expect(inv.slots[1]).toEqual({ id: STONE, count: 36 });
    expect(inv.count(STONE)).toBe(100);
  });

  it('reports the count that does not fit', () => {
    const inv = new Inventory();
    for (let i = 0; i < INVENTORY_SIZE; i++) inv.slots[i] = { id: STONE, count: 64 };
    expect(inv.add(STONE, 5)).toBe(5);
  });

  it('stacks blocks to 64 but tools to 1', () => {
    expect(maxStack(STONE)).toBe(64);
    expect(maxStack('iron_pickaxe')).toBe(1);
  });

  it('wraps hotbar selection', () => {
    const inv = new Inventory();
    inv.select(-1);
    expect(inv.selected).toBe(8);
    inv.cycle(1);
    expect(inv.selected).toBe(0);
    inv.cycle(-1);
    expect(inv.selected).toBe(8);
  });

  it('left click picks up, places and swaps', () => {
    const inv = new Inventory();
    inv.add(STONE, 10);
    inv.clickSlot(0, 0, false);
    expect(inv.cursor).toEqual({ id: STONE, count: 10 });
    expect(inv.slots[0]).toBeNull();
    inv.clickSlot(3, 0, false);
    expect(inv.slots[3]).toEqual({ id: STONE, count: 10 });
    expect(inv.cursor).toBeNull();

    inv.add(DIRT, 1);
    inv.clickSlot(3, 0, false);
    inv.clickSlot(4, 0, false);
    expect(inv.slots[4]!.id).toBe(STONE);

    inv.clickSlot(4, 0, false);
    inv.clickSlot(0, 0, false);
    expect(inv.slots[0]!.id).toBe(STONE);
    expect(inv.cursor!.id).toBe(DIRT);
    inv.clickSlot(4, 0, false);
    expect(inv.slots[4]!.id).toBe(DIRT);
  });

  it('left click merges partial stacks', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: STONE, count: 60 };
    inv.slots[1] = { id: STONE, count: 9 };
    inv.clickSlot(1, 0, false);
    inv.clickSlot(0, 0, false);
    expect(inv.slots[0]!.count).toBe(64);
    expect(inv.cursor!.count).toBe(5);
  });

  it('right click splits a stack and places one', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: STONE, count: 10 };
    inv.clickSlot(0, 1, false);
    expect(inv.cursor!.count).toBe(5);
    expect(inv.slots[0]!.count).toBe(5);
    inv.clickSlot(2, 1, false);
    expect(inv.slots[2]).toEqual({ id: STONE, count: 1 });
    expect(inv.cursor!.count).toBe(4);
  });

  it('shift-click moves between hotbar and backpack', () => {
    const inv = new Inventory();
    inv.slots[20] = { id: DIRT, count: 5 };
    inv.clickSlot(20, 0, true);
    expect(inv.slots[20]).toBeNull();
    expect(inv.slots[0]).toEqual({ id: DIRT, count: 5 });

    inv.clickSlot(0, 0, true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[9]!.id).toBe(DIRT);
  });

  it('consumes and drops the held stack', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: STONE, count: 3 };
    expect(inv.dropHeld(false)).toEqual({ id: STONE, count: 1 });
    expect(inv.slots[0]!.count).toBe(2);
    expect(inv.dropHeld(true)).toEqual({ id: STONE, count: 2 });
    expect(inv.slots[0]).toBeNull();

    inv.slots[0] = { id: DIRT, count: 4 };
    inv.consumeHeld(1);
    expect(inv.slots[0]!.count).toBe(3);
  });

  it('resolves the held tool', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: 'iron_pickaxe', count: 1 };
    inv.select(0);
    expect(inv.heldTool()).toEqual({ kind: 'pickaxe', tier: 3 });
    expect(inv.held()!.id).toBe('iron_pickaxe');
  });

  it('adds and removes by id', () => {
    const inv = new Inventory();
    inv.add(STONE, 70);
    expect(inv.has(STONE, 70)).toBe(true);
    expect(inv.remove(STONE, 70)).toBe(70);
    expect(inv.count(STONE)).toBe(0);
    expect(inv.remove(STONE, 1)).toBe(0);
  });

  it('notifies listeners on change', () => {
    const inv = new Inventory();
    let calls = 0;
    inv.onChange = () => calls++;
    inv.add(STONE, 1);
    inv.select(2);
    expect(calls).toBe(2);
  });
});
