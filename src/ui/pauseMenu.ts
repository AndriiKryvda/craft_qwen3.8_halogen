/** Esc pause menu: resume, save, settings, quit to title. */

import type { Settings } from '../config';

export interface PauseActions {
  onResume(): void;
  onSave(): void;
  onQuit(): void;
  onSettings(): void;
  getDebug(): boolean;
  setDebug(value: boolean): void;
  getCreative(): boolean;
  setCreative(value: boolean): void;
}

export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly settings: Settings;
  private readonly actions: PauseActions;
  private statusEl: HTMLElement | null = null;
  private visible = false;

  constructor(root: HTMLElement, settings: Settings, actions: PauseActions) {
    this.root = root;
    this.settings = settings;
    this.actions = actions;
    this.build();
  }

  get open(): boolean {
    return this.visible;
  }

  openMenu(): void {
    this.visible = true;
    this.root.classList.remove('hidden');
  }

  closeMenu(): void {
    this.visible = false;
    this.root.classList.add('hidden');
  }

  setStatus(message: string): void {
    if (this.statusEl) this.statusEl.textContent = message;
  }

  private button(label: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  private row(label: string, input: HTMLElement): HTMLDivElement {
    const r = document.createElement('div');
    r.className = 'menu-row';
    const s = document.createElement('span');
    s.textContent = label;
    r.append(s, input);
    return r;
  }

  private range(min: number, max: number, step: number, value: number, onValue: (v: number) => void): HTMLInputElement {
    const i = document.createElement('input');
    i.type = 'range';
    i.min = String(min);
    i.max = String(max);
    i.step = String(step);
    i.value = String(value);
    i.addEventListener('input', () => onValue(parseFloat(i.value)));
    return i;
  }

  private check(value: boolean, onValue: (v: boolean) => void): HTMLInputElement {
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = value;
    i.addEventListener('change', () => onValue(i.checked));
    return i;
  }

  private build(): void {
    this.root.textContent = '';
    const h = document.createElement('h2');
    h.textContent = 'Paused';
    this.root.append(h);

    const col = document.createElement('div');
    col.className = 'menu-col';
    col.append(
      this.button('Back to game', '', () => this.actions.onResume()),
      this.button('Save world', '', () => this.actions.onSave())
    );

    const sel = document.createElement('select');
    for (const v of [2, 3, 4, 6, 8, 10, 12]) {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = v + ' chunks';
      if (v === this.settings.renderDistance) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener('change', () => {
      this.settings.renderDistance = parseInt(sel.value, 10);
      this.actions.onSettings();
    });

    col.append(
      this.row('Render distance', sel),
      this.row('Field of view', this.range(50, 110, 1, this.settings.fov, (v) => {
        this.settings.fov = v;
        this.actions.onSettings();
      })),
      this.row('Mouse sensitivity', this.range(0.2, 3, 0.05, this.settings.sensitivity, (v) => {
        this.settings.sensitivity = v;
        this.actions.onSettings();
      })),
      this.row('Volume', this.range(0, 1, 0.05, this.settings.volume, (v) => {
        this.settings.volume = v;
        this.actions.onSettings();
      })),
      this.row('Recipe book', this.check(this.settings.recipeBook, (v) => {
        this.settings.recipeBook = v;
        this.actions.onSettings();
      })),
      this.row('Debug overlay (F3)', this.check(this.actions.getDebug(), (v) => this.actions.setDebug(v))),
      this.row('Creative mode', this.check(this.actions.getCreative(), (v) => this.actions.setCreative(v))),
      this.button('Save and quit to title', 'danger', () => this.actions.onQuit())
    );
    this.root.append(col);

    this.statusEl = document.createElement('div');
    this.statusEl.id = 'pause-status';
    this.root.append(this.statusEl);
  }
}
