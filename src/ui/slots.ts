/** Shared DOM slot widget used by the hotbar, inventory, crafting, furnace and chest. */

import { atlasDataUrl, tileCssPosition } from '../mesh/atlas';
import { itemIcon, itemLabel, type ItemStack } from '../inventory/item';

let iconUrl: string | null = null;

function spriteUrl(): string {
  if (!iconUrl) iconUrl = `url(${atlasDataUrl()})`;
  return iconUrl;
}

export function slotElement(title = ''): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'slot';
  if (title) el.title = title;
  const icon = document.createElement('div');
  icon.className = 'icon';
  const count = document.createElement('div');
  count.className = 'count';
  el.append(icon, count);
  return el;
}

export function paintSlot(el: HTMLElement, stack: ItemStack | null): void {
  const icon = el.querySelector('.icon') as HTMLElement;
  const count = el.querySelector('.count') as HTMLElement;
  if (!stack || stack.count <= 0) {
    icon.style.backgroundImage = 'none';
    count.textContent = '';
    el.removeAttribute('title');
    return;
  }
  const pos = tileCssPosition(itemIcon(stack.id));
  icon.style.backgroundImage = spriteUrl();
  icon.style.backgroundSize = '1600% 1600%';
  icon.style.backgroundPosition = `${pos.x} ${pos.y}`;
  count.textContent = stack.count > 1 ? String(stack.count) : '';
  el.title = itemLabel(stack.id);
}

export interface SlotAccessor {
  get(): ItemStack | null;
  click(button: number, shift: boolean): void;
}

/** A grid of slots bound to accessors; handles clicks and refreshing. */
export class SlotGrid {
  readonly el: HTMLDivElement;
  private readonly slots: HTMLDivElement[] = [];

  constructor(
    parent: HTMLElement,
    count: number,
    private readonly accessor: (index: number) => SlotAccessor,
    opts: { className?: string; columns?: number } = {}
  ) {
    this.el = document.createElement('div');
    this.el.className = 'slot-grid' + (opts.className ? ' ' + opts.className : '');
    if (opts.columns) this.el.style.setProperty('--cols', String(opts.columns));
    for (let i = 0; i < count; i++) {
      const s = slotElement();
      s.dataset.index = String(i);
      s.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        this.accessor(i).click(e.button, e.shiftKey);
        this.refresh();
        this.onChanged?.();
      });
      s.addEventListener('contextmenu', (e) => e.preventDefault());
      this.slots.push(s);
      this.el.append(s);
    }
    parent.append(this.el);
  }

  onChanged: (() => void) | null = null;

  refresh(): void {
    for (let i = 0; i < this.slots.length; i++) {
      paintSlot(this.slots[i], this.accessor(i).get());
    }
  }
}

/** The stack that follows the mouse while the player holds one. */
export class CursorStack {
  readonly el: HTMLDivElement;
  stack: ItemStack | null = null;
  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'cursor-stack hidden';
    root.append(this.el);
    window.addEventListener('mousemove', (e: MouseEvent) => {
      this.el.style.left = e.clientX + 10 + 'px';
      this.el.style.top = e.clientY + 10 + 'px';
    });
  }

  set(stack: ItemStack | null): void {
    this.stack = stack;
    if (!stack) {
      this.el.classList.add('hidden');
      this.el.textContent = '';
      return;
    }
    this.el.classList.remove('hidden');
    const pos = tileCssPosition(itemIcon(stack.id));
    this.el.style.backgroundImage = spriteUrl();
    this.el.style.backgroundSize = '1600% 1600%';
    this.el.style.backgroundPosition = `${pos.x} ${pos.y}`;
    this.el.textContent = stack.count > 1 ? String(stack.count) : '';
    this.el.title = itemLabel(stack.id);
  }
}

