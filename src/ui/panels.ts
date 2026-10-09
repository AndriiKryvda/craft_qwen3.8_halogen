/** Container screens: inventory, crafting table, furnace and chest. */

import type { ItemStack } from '../inventory/item';
import { maxStack, matchesSpec, itemsWithSpec } from '../inventory/item';
import { Inventory, HOTBAR_SIZE, INVENTORY_SIZE } from '../inventory/inventory';
import { matchRecipe, isCraftable } from '../inventory/crafting';
import { RECIPES, recipeLabel, type Recipe } from '../inventory/recipes';
import type { FurnaceState } from '../inventory/furnace';
import { furnaceProgress } from '../inventory/furnace';
import { SlotGrid, CursorStack, slotElement, paintSlot, type SlotAccessor } from './slots';

export interface PanelCallbacks {
  onClose(): void;
  onChanged(): void;
  onToast?(message: string): void;
}

type Screen = 'inventory' | 'table' | 'furnace' | 'chest' | null;
type Getter = () => ItemStack | null;
type Setter = (stack: ItemStack | null) => void;

export class Panels {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly cursor: CursorStack;
  private readonly inv: Inventory;
  private readonly cb: PanelCallbacks;

  /** Show the recipe book on the crafting table screen. */
  showBook = true;

  private screen: Screen = null;
  private grids: SlotGrid[] = [];
  private craftGrid: Array<ItemStack | null> = new Array(9).fill(null);
  private craftSize = 2;
  private craftResult: ItemStack | null = null;
  private resultEl: HTMLDivElement | null = null;
  private furnace: FurnaceState | null = null;
  private flameEl: HTMLElement | null = null;
  private arrowEl: HTMLElement | null = null;
  private bookEl: HTMLElement | null = null;
  private chestSlots: Array<ItemStack | null> | null = null;

  constructor(root: HTMLElement, inv: Inventory, cursor: CursorStack, cb: PanelCallbacks) {
    this.root = root;
    this.body = root.querySelector('.panel-body') as HTMLElement;
    this.title = root.querySelector('#panel-title') as HTMLElement;
    this.inv = inv;
    this.cursor = cursor;
    this.cb = cb;
    root.querySelector('#panel-close')!.addEventListener('click', () => this.close());
  }

  get open(): boolean {
    return this.screen !== null;
  }

  get currentScreen(): Screen {
    return this.screen;
  }

  // ---------------------------------------------------------------- lifecycle

  openInventory(): void {
    this.openScreen('inventory', 'Inventory', 2);
  }

  openTable(): void {
    this.openScreen('table', 'Crafting Table', 3);
  }

  openFurnace(state: FurnaceState): void {
    this.furnace = state;
    this.openScreen('furnace', 'Furnace', 2);
  }

  openChest(slots: Array<ItemStack | null>): void {
    while (slots.length < 27) slots.push(null);
    this.chestSlots = slots;
    this.openScreen('chest', 'Chest', 2);
  }

  /** Toggle the inventory screen (E key). */
  toggleInventory(): void {
    if (this.screen === 'inventory') this.close();
    else if (!this.screen) this.openInventory();
  }

  close(): void {
    if (!this.screen) return;
    // Return crafting grid + cursor contents to the player.
    for (const s of this.craftGrid) {
      if (s) this.inv.add(s.id, s.count);
    }
    this.craftGrid = new Array(9).fill(null);
    this.craftResult = null;
    if (this.inv.cursor) {
      this.inv.add(this.inv.cursor.id, this.inv.cursor.count);
      this.inv.cursor = null;
      this.cursor.set(null);
    }
    this.screen = null;
    this.grids = [];
    this.furnace = null;
    this.chestSlots = null;
    this.flameEl = null;
    this.arrowEl = null;
    this.bookEl = null;
    this.resultEl = null;
    this.body.textContent = '';
    this.root.classList.add('hidden');
    this.cb.onClose();
  }

  private openScreen(screen: Exclude<Screen, null>, label: string, craftSize: number): void {
    if (this.screen) this.close();
    this.screen = screen;
    this.craftSize = craftSize;
    this.title.textContent = label;
    this.body.textContent = '';
    this.root.classList.remove('hidden');

    if (screen === 'furnace' && this.furnace) this.buildFurnace();
    if (screen === 'chest' && this.chestSlots) this.buildChest();
    if (screen === 'table' || screen === 'inventory') this.buildCrafting();
    this.addInventoryGrids();
    if (screen === 'table' && this.showBook) this.buildBook();
    this.refresh();
    this.cb.onChanged();
  }


  // -------------------------------------------------------------------- slots

  private invAccessor(index: number): SlotAccessor {
    return {
      get: () => this.inv.slots[index],
      click: (button, shift) => {
        this.inv.clickSlot(index, button, shift);
        this.after();
      }
    };
  }

  /** Minecraft-style click handling for a slot that is not part of the inventory. */
  private slotAccessor(get: Getter, set: Setter): SlotAccessor {
    return {
      get,
      click: (button, shift) => this.clickExternal(get, set, button, shift)
    };
  }

  private clickExternal(get: Getter, set: Setter, button: number, shift: boolean): void {
    const slot = get();
    if (shift) {
      if (!slot) return;
      const left = this.inv.add(slot.id, slot.count);
      set(left > 0 ? { id: slot.id, count: left } : null);
      this.after();
      return;
    }
    const cur = this.inv.cursor;
    const room = slot ? maxStack(slot.id) - slot.count : 0;
    if (button === 0) {
      if (!cur) {
        if (slot) {
          this.inv.cursor = slot;
          set(null);
        }
      } else if (!slot) {
        set(cur);
        this.inv.cursor = null;
      } else if (slot.id === cur.id && room > 0) {
        const take = Math.min(room, cur.count);
        slot.count += take;
        cur.count -= take;
        if (cur.count <= 0) this.inv.cursor = null;
      } else {
        this.inv.cursor = slot;
        set(cur);
      }
    } else if (!cur) {
      if (slot) {
        const half = Math.ceil(slot.count / 2);
        this.inv.cursor = { id: slot.id, count: half };
        slot.count -= half;
        if (slot.count <= 0) set(null);
      }
    } else if (!slot) {
      set({ id: cur.id, count: 1 });
      cur.count -= 1;
      if (cur.count <= 0) this.inv.cursor = null;
    } else if (slot.id === cur.id && room > 0) {
      slot.count += 1;
      cur.count -= 1;
      if (cur.count <= 0) this.inv.cursor = null;
    } else {
      this.inv.cursor = slot;
      set(cur);
    }
    this.after();
  }

  private after(): void {
    this.cursor.set(this.inv.cursor);
    this.refresh();
    this.cb.onChanged();
  }

  private addInventoryGrids(): void {
    const wrap = document.createElement('div');
    wrap.className = 'inv-block';
    this.grids.push(
      new SlotGrid(wrap, INVENTORY_SIZE - HOTBAR_SIZE, (i) => this.invAccessor(i + HOTBAR_SIZE), {
        className: 'inv',
        columns: 9
      })
    );
    this.grids.push(
      new SlotGrid(wrap, HOTBAR_SIZE, (i) => this.invAccessor(i), { className: 'hotbar', columns: 9 })
    );
    this.body.append(wrap);
  }

  // ---------------------------------------------------------------- crafting

  private buildCrafting(): void {
    const row = document.createElement('div');
    row.className = 'craft-row';
    const size = this.craftSize;
    const grid = new SlotGrid(
      row,
      size * size,
      (i) =>
        this.slotAccessor(
          () => this.craftGrid[i],
          (s) => {
            this.craftGrid[i] = s;
            this.updateCraft();
          }
        ),
      { className: 'craft', columns: size }
    );
    grid.onChanged = () => this.updateCraft();

    const arrow = document.createElement('div');
    arrow.className = 'craft-arrow';
    arrow.textContent = '\u279C';

    const result = slotElement('Result');
    result.classList.add('result');
    result.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      this.takeCraft(e.shiftKey);
    });
    result.addEventListener('contextmenu', (e) => e.preventDefault());
    this.resultEl = result;

    row.append(arrow, result);
    this.body.append(row);
  }

  private updateCraft(): void {
    const m = matchRecipe(this.craftGrid, this.craftSize);
    this.craftResult = m ? { id: m.recipe.result.id, count: m.recipe.result.count } : null;
    if (this.resultEl) paintSlot(this.resultEl, this.craftResult);
  }

  /** Pull one (or, with shift, as many as fit) crafted result out of the grid. */
  private takeCraft(all: boolean): void {
    let made = 0;
    for (let guard = 0; guard < 64; guard++) {
      const m = matchRecipe(this.craftGrid, this.craftSize);
      if (!m) break;
      const out = m.recipe.result;
      const cur = this.inv.cursor;
      const max = maxStack(out.id);
      if (cur && (cur.id !== out.id || cur.count + out.count > max)) break;
      if (!cur && all) {
        const left = this.inv.add(out.id, out.count);
        if (left > 0) break;
      }
      for (const i of m.consume) {
        const s = this.craftGrid[i];
        if (!s) continue;
        s.count -= 1;
        if (s.count <= 0) this.craftGrid[i] = null;
      }
      if (cur) cur.count += out.count;
      else this.inv.cursor = { id: out.id, count: out.count };
      made += out.count;
      if (!all) break;
    }
    if (made > 0 && this.cb.onToast) this.cb.onToast('Crafted ' + made);
    this.updateCraft();
    this.after();
  }

  /** Recipe ingredient specs laid out on a 3x3 grid. */
  private specs(recipe: Recipe): Array<string | null> {
    const out: Array<string | null> = new Array(9).fill(null);
    if (recipe.type === 'shaped') {
      for (let r = 0; r < recipe.pattern.length; r++) {
        const line = recipe.pattern[r];
        for (let c = 0; c < line.length && c < 3; c++) {
          const ch = line[c];
          if (ch === '.') continue;
          const spec = recipe.key[ch];
          if (spec) out[r * 3 + c] = spec;
        }
      }
    } else if (recipe.type === 'shapeless') {
      for (let i = 0; i < recipe.ingredients.length && i < 9; i++) out[i] = recipe.ingredients[i];
    }
    return out;
  }

  /** Recipe-book click: fill the crafting grid from the inventory. */
  private autoFill(recipe: Recipe): void {
    for (const s of this.craftGrid) {
      if (s) this.inv.add(s.id, s.count);
    }
    this.craftGrid = new Array(9).fill(null);
    const size = this.craftSize;
    const specs = this.specs(recipe);
    const picks: Array<{ cell: number; slot: number }> = [];
    const taken = new Map<number, number>();
    let ok = true;
    for (let cell = 0; cell < size * size && ok; cell++) {
      const spec = specs[cell];
      if (!spec) continue;
      let found = -1;
      for (let i = 0; i < this.inv.slots.length; i++) {
        const s = this.inv.slots[i];
        if (!s || !matchesSpec(s.id, spec)) continue;
        if (s.count - (taken.get(i) ?? 0) <= 0) continue;
        found = i;
        break;
      }
      if (found < 0) ok = false;
      else {
        taken.set(found, (taken.get(found) ?? 0) + 1);
        picks.push({ cell, slot: found });
      }
    }
    if (!ok) {
      if (this.cb.onToast) this.cb.onToast('Not enough materials');
      this.updateCraft();
      this.after();
      return;
    }
    for (const p of picks) {
      const s = this.inv.slots[p.slot];
      if (!s) continue;
      this.craftGrid[p.cell] = { id: s.id, count: 1 };
      s.count -= 1;
      if (s.count <= 0) this.inv.slots[p.slot] = null;
    }
    this.updateCraft();
    this.after();
  }


  private buildBook(): void {
    const book = document.createElement('div');
    book.className = 'recipe-book';
    const head = document.createElement('div');
    head.className = 'book-head';
    head.textContent = 'Recipe book — click a recipe to fill the grid';
    book.append(head);
    const list = document.createElement('div');
    list.className = 'book-list';
    RECIPES.forEach((recipe, idx) => {
      if (recipe.type === 'smelting') return;
      const entry = document.createElement('div');
      entry.className = 'book-entry';
      entry.dataset.recipe = String(idx);
      entry.title = recipeLabel(recipe);
      const specs = this.specs(recipe);
      const mini = document.createElement('div');
      mini.className = 'book-mini';
      for (let i = 0; i < 9; i++) {
        const cell = slotElement();
        cell.classList.add('mini');
        const spec = specs[i];
        if (spec) {
          const options = itemsWithSpec(spec);
          if (options.length) paintSlot(cell, { id: options[0], count: 1 });
        }
        mini.append(cell);
      }
      const out = slotElement(recipeLabel(recipe));
      paintSlot(out, { id: recipe.result.id, count: recipe.result.count });
      entry.append(mini, out);
      entry.addEventListener('click', () => this.autoFill(recipe));
      list.append(entry);
    });
    book.append(list);
    this.bookEl = book;
    this.body.append(book);
  }

  // ------------------------------------------------------------------ furnace

  private buildFurnace(): void {
    const f = this.furnace!;
    const row = document.createElement('div');
    row.className = 'furnace-row';

    const left = document.createElement('div');
    left.className = 'furnace-slots';
    this.grids.push(
      new SlotGrid(left, 1, () => this.slotAccessor(() => f.input, (s) => { f.input = s; }), {
        className: 'single'
      })
    );
    this.grids.push(
      new SlotGrid(left, 1, () => this.slotAccessor(() => f.fuel, (s) => { f.fuel = s; }), {
        className: 'single'
      })
    );

    const mid = document.createElement('div');
    mid.className = 'furnace-mid';
    const flame = document.createElement('div');
    flame.className = 'flame-wrap';
    const flameFill = document.createElement('div');
    flameFill.className = 'flame';
    flame.append(flameFill);
    this.flameEl = flameFill;
    const arrowWrap = document.createElement('div');
    arrowWrap.className = 'arrow-wrap';
    const arrowFill = document.createElement('div');
    arrowFill.className = 'arrow-fill';
    arrowWrap.append(arrowFill);
    this.arrowEl = arrowFill;
    mid.append(flame, arrowWrap);

    row.append(left, mid);
    this.grids.push(
      new SlotGrid(row, 1, () => this.slotAccessor(() => f.output, (s) => { f.output = s; }), {
        className: 'single output'
      })
    );
    this.body.append(row);
  }

  // -------------------------------------------------------------------- chest

  private buildChest(): void {
    const slots = this.chestSlots!;
    const wrap = document.createElement('div');
    wrap.className = 'chest-block';
    this.grids.push(
      new SlotGrid(
        wrap,
        27,
        (i) =>
          this.slotAccessor(
            () => slots[i] ?? null,
            (s) => {
              slots[i] = s;
            }
          ),
        { className: 'chest', columns: 9 }
      )
    );
    this.body.append(wrap);
  }

  // ------------------------------------------------------------------ refresh

  refresh(): void {
    for (const g of this.grids) g.refresh();
    if (this.resultEl) paintSlot(this.resultEl, this.craftResult);
    if (this.furnace && this.flameEl && this.arrowEl) {
      const p = furnaceProgress(this.furnace);
      this.flameEl.style.height = Math.round(p.burn * 100) + '%';
      this.arrowEl.style.width = Math.round(p.cook * 100) + '%';
    }
    this.refreshBook();
  }

  private refreshBook(): void {
    if (!this.bookEl) return;
    const have = this.haveCounts();
    this.bookEl.querySelectorAll('[data-recipe]').forEach((n) => {
      const idx = parseInt((n as HTMLElement).dataset.recipe!, 10);
      const r = RECIPES[idx];
      if (r) n.classList.toggle('craftable', isCraftable(r, have));
    });
  }

  private haveCounts(): Record<string, number> {
    const have: Record<string, number> = {};
    for (const s of this.inv.slots) {
      if (s) have[s.id] = (have[s.id] ?? 0) + s.count;
    }
    return have;
  }
}

