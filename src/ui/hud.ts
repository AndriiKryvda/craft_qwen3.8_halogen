/** In-game HUD: hotbar, vitals, clock, debug overlay, toasts. */

import { Inventory, HOTBAR_SIZE } from '../inventory/inventory';
import { SlotGrid, type SlotAccessor } from './slots';
import { biomeName } from '../world/biomes';
import type { World } from '../world/world';
import type { Player } from '../player/player';
import type { SurvivalStats } from '../survival/stats';
import type { WorldClock } from '../engine/time';

export interface DebugInfo {
  fps: number;
  ms: number;
  chunks: number;
  pending: number;
  tris: number;
  draws: number;
  mobs: number;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly hotbarGrid: SlotGrid;
  private readonly healthRow: HTMLElement;
  private readonly hungerRow: HTMLElement;
  private readonly airRow: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly debugEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly waterOverlay: HTMLElement;
  private readonly hearts: HTMLElement[] = [];
  private readonly drumsticks: HTMLElement[] = [];
  private readonly bubbles: HTMLElement[] = [];
  debugVisible = false;

  constructor(root: HTMLElement, private readonly inventory: Inventory) {
    this.root = root;
    // This Hud instance owns the HUD containers; drop anything a previous game
    // instance left behind so restarting a world cannot double the hotbar.
    const hotbarEl = document.getElementById('hotbar')!;
    hotbarEl.replaceChildren();
    this.hotbarGrid = new SlotGrid(
      hotbarEl,
      HOTBAR_SIZE,
      (i): SlotAccessor => ({
        get: () => inventory.slots[i],
        click: (button, shift) => {
          inventory.clickSlot(i, button, shift);
          this.refreshHotbar();
        }
      }),
      { className: 'hotbar', columns: HOTBAR_SIZE }
    );

    this.healthRow = document.getElementById('health')!;
    this.hungerRow = document.getElementById('hunger')!;
    this.airRow = document.getElementById('air')!;
    this.healthRow.replaceChildren();
    this.hungerRow.replaceChildren();
    this.airRow.replaceChildren();
    this.clockEl = document.getElementById('clock')!;
    this.debugEl = document.getElementById('debug')!;
    this.toastEl = document.getElementById('toasts')!;
    this.vignette = document.getElementById('damage-vignette')!;
    this.waterOverlay = document.getElementById('water-overlay')!;

    for (let i = 0; i < 10; i++) {
      const h = document.createElement('span');
      h.className = 'heart';
      this.hearts.push(h);
      this.healthRow.append(h);
      const d = document.createElement('span');
      d.className = 'food';
      this.drumsticks.push(d);
      this.hungerRow.append(d);
      const b = document.createElement('span');
      b.className = 'bubble';
      this.bubbles.push(b);
      this.airRow.append(b);
    }
  }

  refreshHotbar(): void {
    this.hotbarGrid.refresh();
    const slots = this.hotbarGrid.el.children;
    for (let i = 0; i < slots.length; i++) {
      slots[i].classList.toggle('selected', i === this.inventory.selected);
    }
  }

  setVitals(stats: SurvivalStats): void {
    for (let i = 0; i < 10; i++) {
      const v = stats.health - i * 2;
      this.hearts[i].className = 'heart ' + (v >= 2 ? 'full' : v >= 1 ? 'half' : 'empty');
      const f = stats.hunger - i * 2;
      this.drumsticks[i].className = 'food ' + (f >= 2 ? 'full' : f >= 1 ? 'half' : 'empty');
      const a = stats.air - i;
      this.bubbles[i].className = 'bubble ' + (a >= 1 ? 'full' : a >= 0.5 ? 'half' : 'empty');
    }
    this.airRow.classList.toggle('hidden', stats.air >= 9.99);
    this.vignette.style.opacity = String(Math.min(0.65, stats.hurtLevel));
  }

  setClock(clock: WorldClock): void {
    this.clockEl.textContent = `${clock.clockLabel} · Day ${clock.dayNumber}`;
  }

  setWater(on: boolean): void {
    this.waterOverlay.classList.toggle('on', on);
  }

  toast(message: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    this.toastEl.append(el);
    window.setTimeout(() => {
      el.classList.add('fade');
      window.setTimeout(() => el.remove(), 500);
    }, 2200);
  }

  setDebug(info: DebugInfo | null, world: World, player: Player, clock: WorldClock): void {
    if (!info || !this.debugVisible) {
      this.debugEl.classList.add('hidden');
      return;
    }
    const bx = Math.floor(player.x);
    const bz = Math.floor(player.z);
    const by = Math.floor(player.y);
    const block = world.getBlock(bx, by - 1, bz);
    this.debugEl.classList.remove('hidden');
    this.debugEl.textContent =
      `Craft 0.1  ${info.fps.toFixed(0)} fps  ${info.ms.toFixed(1)} ms\n` +
      `XYZ ${player.x.toFixed(2)} / ${player.y.toFixed(2)} / ${player.z.toFixed(2)}  ` +
      `chunk ${Math.floor(player.x / 16)},${Math.floor(player.z / 16)}  region ${Math.floor(player.x / 512)},${Math.floor(player.z / 512)}\n` +
      `biome ${biomeName(world.biomeAt(bx, bz))}  standing on #${block}\n` +
      `chunks ${info.chunks} (queue ${info.pending})  draws ${info.draws}  tris ${Math.round(info.tris / 1000)}k  mobs ${info.mobs}\n` +
      `time ${clock.clockLabel}  daylight ${(clock.daylight * 100).toFixed(0)}%  ` +
      `${player.creative ? 'CREATIVE' : 'SURVIVAL'}${player.flying ? ' FLY' : ''}`;
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Remove every DOM node this Hud added so a new game starts from a clean HUD. */
  dispose(): void {
    this.hide();
    this.hotbarGrid.el.remove();
    this.healthRow.replaceChildren();
    this.hungerRow.replaceChildren();
    this.airRow.replaceChildren();
    this.toastEl.replaceChildren();
    this.debugEl.textContent = '';
    this.vignette.style.opacity = '0';
    this.waterOverlay.classList.remove('on');
  }
}
