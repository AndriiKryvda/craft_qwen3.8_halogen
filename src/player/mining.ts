/** Block interaction: mining, placement, farming, eating and block entities. */

import { CONFIG } from '../config';
import type { World } from '../world/world';
import { posKey } from '../world/constants';
import {
  B,
  LIQUID,
  REPLACEABLE,
  SOLID,
  UNBREAKABLE,
  isInteractable,
  miningTime,
  rollDrops
} from '../world/blocks';
import type { ItemStack } from '../inventory/item';
import { foodOf, getItem, toolInfoOf } from '../inventory/item';
import type { FurnaceState } from '../inventory/furnace';
import type { SoundKind } from '../engine/audio';
import type { Player } from './player';
import type { Inventory } from '../inventory/inventory';
import { raycast, type RayHit } from './raycast';

export interface BlockActionHooks {
  sound(kind: SoundKind): void;
  toast(message: string): void;
  spawnDrop(id: string, count: number, x: number, y: number, z: number): void;
  openTable(): void;
  openFurnace(state: FurnaceState): void;
  openChest(slots: Array<ItemStack | null>): void;
  /** Eat the held food (the caller owns the hunger bar). */
  eat(itemId: string, points: number): void;
  /** Ask the gravity system to look at the block above `x,y,z`. */
  gravityAbove(x: number, y: number, z: number): void;
}

/** Would a solid block at this cell push into the player's box? */
function blocksPlayer(player: Player, x: number, y: number, z: number): boolean {
  return (
    x < player.x + player.hw &&
    x + 1 > player.x - player.hw &&
    y < player.y + player.h &&
    y + 1 > player.y &&
    z < player.z + player.hw &&
    z + 1 > player.z - player.hw
  );
}

export class BlockActions {
  /** Current raycast result, refreshed every simulation step. */
  target: RayHit | null = null;

  constructor(
    private readonly world: World,
    private readonly player: Player,
    private readonly inv: Inventory,
    private readonly hooks: BlockActionHooks
  ) {}

  /** Advance mining progress. `mining` is the held left mouse button. */
  update(dt: number, mining: boolean): void {
    const dir = this.player.forwardVector();
    this.target = raycast(
      this.world,
      this.player.x,
      this.player.eyeY,
      this.player.z,
      dir.x,
      dir.y,
      dir.z,
      CONFIG.reach
    );

    if (!mining || !this.target) {
      this.player.mining = null;
      return;
    }

    const hit = this.target;
    const tool = this.inv.heldTool();
    const total = this.player.creative ? 0.02 : miningTime(hit.block, tool);
    if (!Number.isFinite(total)) {
      this.player.mining = null;
      this.hooks.toast('This block cannot be broken');
      return;
    }

    let t = this.player.mining;
    if (!t || t.x !== hit.x || t.y !== hit.y || t.z !== hit.z) {
      t = { x: hit.x, y: hit.y, z: hit.z, progress: 0, total };
      this.player.mining = t;
    }
    t.progress += dt;
    if (t.progress >= t.total) {
      this.breakBlock(hit);
      this.player.mining = null;
    }
  }

  /** Left click released: clear any half-finished mining progress. */
  cancelMining(): void {
    this.player.mining = null;
  }

  /** Break the given block and scatter whatever it yields. */
  breakBlock(hit: RayHit): void {
    const w = this.world;
    const id = w.getBlock(hit.x, hit.y, hit.z);
    if (id === B.AIR || UNBREAKABLE[id]) return;

    const tool = this.inv.heldTool();
    const drops = this.player.creative ? [] : rollDrops(id, tool, Math.random);
    const key = posKey(hit.x, hit.y, hit.z);

    // Block entities spill their contents before disappearing.
    const furnace = w.furnaces.get(key);
    if (furnace) {
      for (const stack of [furnace.input, furnace.fuel, furnace.output]) {
        if (stack) this.hooks.spawnDrop(stack.id, stack.count, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      }
      w.furnaces.delete(key);
    }
    const chest = w.chests.get(key);
    if (chest) {
      for (const stack of chest) {
        if (stack) this.hooks.spawnDrop(stack.id, stack.count, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      }
      w.chests.delete(key);
    }

    w.setBlock(hit.x, hit.y, hit.z, B.AIR);
    for (const d of drops) {
      this.hooks.spawnDrop(d.item, d.count, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    }
    this.hooks.gravityAbove(hit.x, hit.y, hit.z);
    this.hooks.sound('break');
  }

  /** Right click: use the world, or place / use the held item. */
  interact(): void {
    const hit = this.target;
    if (!hit) return;
    const w = this.world;

    if (isInteractable(hit.block)) {
      if (hit.block === B.CRAFTING_TABLE) this.hooks.openTable();
      else if (hit.block === B.FURNACE) this.hooks.openFurnace(w.ensureFurnace(hit.x, hit.y, hit.z));
      else this.hooks.openChest(w.chestAt(hit.x, hit.y, hit.z));
      return;
    }

    const held = this.inv.held();
    if (!held) return;

    // Food first: right click eats whatever is held.
    const food = foodOf(held.id);
    if (food > 0) {
      this.hooks.eat(held.id, food);
      return;
    }

    if (CONFIG.farmingEnabled && this.useOnWorld(hit, held)) return;

    const def = getItem(held.id);
    const block = def ? def.block : -1;
    if (block === undefined || block === null || block < 0) return;

    const px = hit.x + hit.nx;
    const py = hit.y + hit.ny;
    const pz = hit.z + hit.nz;
    if (py < 0 || py > 127) return;
    const existing = w.getBlock(px, py, pz);
    if (REPLACEABLE[existing] !== 1 && LIQUID[existing] !== 1) return;
    if (SOLID[block] === 1 && blocksPlayer(this.player, px, py, pz)) return;

    if (!w.setBlock(px, py, pz, block)) return;
    this.hooks.gravityAbove(px, py, pz);
    if (!this.player.creative) this.inv.consumeHeld(1);
    this.hooks.sound('place');
  }

  /**
   * Farming actions that consume the held item instead of placing it:
   * hoe -> farmland, seeds -> wheat. Returns true when something happened.
   */
  private useOnWorld(hit: RayHit, held: ItemStack): boolean {
    const w = this.world;
    const tool = toolInfoOf(held.id);
    if (tool && tool.kind === 'hoe') {
      const id = hit.block;
      if ((id === B.GRASS || id === B.DIRT) && w.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
        if (w.setBlock(hit.x, hit.y, hit.z, B.FARMLAND)) {
          if (!this.player.creative) this.inv.consumeHeld(1);
          this.hooks.sound('place');
          return true;
        }
      }
    }
    if (
      held.id === 'wheat_seed' &&
      hit.block === B.FARMLAND &&
      w.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR
    ) {
      if (w.setBlock(hit.x, hit.y + 1, hit.z, B.WHEAT, 0)) {
        if (!this.player.creative) this.inv.consumeHeld(1);
        this.hooks.sound('place');
        return true;
      }
    }
    return false;
  }

  /** Q: throw the held stack (or one item) out in front of the player. */
  dropHeld(all: boolean): void {
    const stack = this.inv.dropHeld(all);
    if (!stack) return;
    const dir = this.player.forwardVector();
    this.hooks.spawnDrop(
      stack.id,
      stack.count,
      this.player.x + dir.x * 0.6,
      this.player.eyeY - 0.3,
      this.player.z + dir.z * 0.6
    );
    this.hooks.sound('place');
  }
}

