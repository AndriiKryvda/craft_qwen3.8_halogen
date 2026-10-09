/** FR-2.3/2.4, FR-7.5, FR-7.7: the mining and block interaction pipeline. */

import { describe, expect, it } from 'vitest';
import { BlockActions, type BlockActionHooks } from '../src/player/mining';
import { Inventory } from '../src/inventory/inventory';
import { Player } from '../src/player/player';
import { B } from '../src/world/blocks';
import { CONFIG } from '../src/config';
import { groundWorld } from './helpers';

interface Harness {
  world: ReturnType<typeof groundWorld>;
  player: Player;
  inv: Inventory;
  actions: BlockActions;
  log: string[];
}

function harness(creative = false): Harness {
  const world = groundWorld(9);
  const player = new Player(0.5, 10, 0.5);
  player.creative = creative;
  player.pitch = -Math.PI / 2 + 0.01;
  player.yaw = 0;
  const inv = new Inventory();
  const log: string[] = [];
  const hooks: BlockActionHooks = {
    sound: (kind) => log.push('sound:' + kind),
    toast: (message) => log.push('toast:' + message),
    spawnDrop: (id, count) => log.push(`drop:${id}x${count}`),
    openTable: () => log.push('table'),
    openFurnace: () => log.push('furnace'),
    openChest: () => log.push('chest'),
    eat: (id, points) => log.push(`eat:${id}:${points}`),
    gravityAbove: () => log.push('gravity')
  };
  const actions = new BlockActions(world, player, inv, hooks);
  return { world, player, inv, actions, log };
}

describe('BlockActions', () => {
  it('targets the block the player looks at', () => {
    const h = harness();
    h.actions.update(0.05, false);
    expect(h.actions.target).not.toBeNull();
    expect(h.actions.target!.y).toBe(9);
  });

  it('breaks a block after the mining time and drops it (FR-2.3)', () => {
    const h = harness();
    h.world.setBlock(0, 9, 0, B.DIRT);
    for (let i = 0; i < 20; i++) h.actions.update(0.05, true);
    expect(h.world.getBlock(0, 9, 0)).toBe(B.AIR);
    expect(h.log).toContain('drop:b' + B.DIRT + 'x1');
    expect(h.log).toContain('sound:break');
    // the ray keeps going, so progress restarts on the block underneath
    expect(h.player.mining!.y).toBe(8);
  });

  it('does not drop when the tool tier is too low', () => {
    const h = harness();
    for (let i = 0; i < 60; i++) h.actions.update(0.05, true);
    expect(h.world.getBlock(0, 9, 0)).toBe(B.AIR);
    expect(h.log.some((l) => l.startsWith('drop:'))).toBe(false);
  });

  it('breaks instantly in creative and drops nothing', () => {
    const h = harness(true);
    h.world.setBlock(0, 9, 0, B.DIRT);
    h.actions.update(0.05, true);
    expect(h.world.getBlock(0, 9, 0)).toBe(B.AIR);
    expect(h.log.some((l) => l.startsWith('drop:'))).toBe(false);
  });

  it('refuses to break unbreakable blocks', () => {
    const h = harness();
    h.world.setBlock(0, 9, 0, B.BEDROCK);
    h.actions.update(0.05, true);
    expect(h.world.getBlock(0, 9, 0)).toBe(B.BEDROCK);
    expect(h.log).toContain('toast:This block cannot be broken');
  });

  it('spills a chest before the chest disappears', () => {
    const h = harness();
    h.world.setBlock(0, 9, 0, B.CHEST);
    h.world.chestAt(0, 9, 0)[0] = { id: 'coal', count: 3 };
    for (let i = 0; i < 80; i++) h.actions.update(0.05, true);
    expect(h.log).toContain('drop:coalx3');
    expect(h.world.chests.size).toBe(0);
  });

  it('opens container screens on right click (FR-2.6)', () => {
    const table = harness();
    table.world.setBlock(0, 9, 0, B.CRAFTING_TABLE);
    table.actions.update(0.05, false);
    table.actions.interact();
    expect(table.log).toContain('table');

    const furnace = harness();
    furnace.world.setBlock(0, 9, 0, B.FURNACE);
    furnace.actions.update(0.05, false);
    furnace.actions.interact();
    expect(furnace.log).toContain('furnace');
    expect(furnace.world.furnaces.size).toBe(1);
  });

  it('places the held block on the hit face (FR-2.4)', () => {
    const h = harness();
    h.player.pitch = 0;
    h.player.z = 4.5;
    h.world.setBlock(0, 11, 1, B.STONE);
    h.inv.add('b' + B.COBBLE, 3);
    h.actions.update(0.05, false);
    h.actions.interact();
    expect(h.world.getBlock(0, 11, 2)).toBe(B.COBBLE);
    expect(h.inv.count('b' + B.COBBLE)).toBe(2);
    expect(h.log).toContain('sound:place');
  });

  it('never places a block inside the player', () => {
    const h = harness();
    h.inv.add('b' + B.COBBLE, 1);
    h.actions.update(0.05, false);
    h.actions.interact();
    expect(h.world.getBlock(0, 10, 0)).not.toBe(B.COBBLE);
    expect(h.inv.count('b' + B.COBBLE)).toBe(1);
  });

  it('eats the held food (FR-7.5)', () => {
    const h = harness();
    h.inv.add('apple', 2);
    h.actions.update(0.05, false);
    h.actions.interact();
    expect(h.log).toContain('eat:apple:' + 4);
  });

  it('tills soil and plants seeds (FR-7.7)', () => {
    const hoe = harness();
    hoe.world.setBlock(0, 9, 0, B.GRASS);
    hoe.inv.add('wood_hoe', 1);
    hoe.actions.update(0.05, false);
    hoe.actions.interact();
    expect(hoe.world.getBlock(0, 9, 0)).toBe(B.FARMLAND);

    const seeds = harness();
    seeds.world.setBlock(0, 9, 0, B.FARMLAND);
    seeds.inv.add('wheat_seed', 1);
    seeds.actions.update(0.05, false);
    seeds.actions.interact();
    expect(seeds.world.getBlock(0, 10, 0)).toBe(B.WHEAT);
  });

  it('throws the held stack out in front (FR-4.2)', () => {
    const h = harness();
    h.inv.slots[0] = { id: 'coal', count: 5 };
    h.actions.dropHeld(false);
    expect(h.log).toContain('drop:coalx1');
    expect(h.inv.slots[0]!.count).toBe(4);
    h.actions.dropHeld(true);
    expect(h.inv.slots[0]).toBeNull();
  });

  it('clears progress when the button is released', () => {
    const h = harness();
    for (let i = 0; i < 5; i++) h.actions.update(0.05, true);
    expect(h.player.mining).not.toBeNull();
    h.actions.update(0.05, false);
    expect(h.player.mining).toBeNull();
  });

  it('uses the reach from CONFIG', () => {
    expect(CONFIG.reach).toBe(5);
  });
});
