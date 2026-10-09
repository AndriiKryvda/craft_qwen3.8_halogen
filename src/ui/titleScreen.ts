/** Title screen: continue the existing world or start a new one. */

export interface TitleActions {
  onContinue(): void;
  onNew(seed: number, mode: 'survival' | 'creative'): void;
  onDelete(): void;
}

/** Non-numeric seeds are hashed so text seeds stay reproducible. */
export function seedFromString(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return (Math.random() * 0x7fffffff) | 0;
  if (/^-?\d+$/.test(trimmed)) return Math.abs(parseInt(trimmed, 10)) % 0x7fffffff;
  let h = 2166136261;
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 0x7fffffff;
}

export class TitleScreen {
  private readonly root: HTMLElement;
  private readonly actions: TitleActions;
  private continueBtn: HTMLButtonElement | null = null;
  private deleteBtn: HTMLButtonElement | null = null;
  private infoEl: HTMLElement | null = null;
  private seedEl: HTMLInputElement | null = null;
  private modeEl: HTMLSelectElement | null = null;

  constructor(root: HTMLElement, actions: TitleActions) {
    this.root = root;
    this.actions = actions;
    this.build();
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Show/hide the continue button depending on whether a save exists. */
  setSaveInfo(summary: string | null): void {
    if (this.continueBtn) this.continueBtn.disabled = summary === null;
    if (this.deleteBtn) this.deleteBtn.disabled = summary === null;
    if (this.infoEl) this.infoEl.textContent = summary ?? 'No saved world yet.';
  }

  private button(label: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  private build(): void {
    this.root.textContent = '';

    const h1 = document.createElement('h1');
    h1.textContent = 'HALOGEN CRAFT';
    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = 'A voxel sandbox that runs entirely in your browser';
    this.root.append(h1, sub);

    this.infoEl = document.createElement('div');
    this.infoEl.className = 'hint';
    this.root.append(this.infoEl);

    this.continueBtn = this.button('Continue', '', () => this.actions.onContinue());
    this.continueBtn.disabled = true;
    this.root.append(this.continueBtn);

    const row = document.createElement('div');
    row.className = 'row';
    this.seedEl = document.createElement('input');
    this.seedEl.type = 'text';
    this.seedEl.placeholder = 'Seed (optional)';
    this.modeEl = document.createElement('select');
    for (const m of ['survival', 'creative']) {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      this.modeEl.append(o);
    }
    row.append(this.seedEl, this.modeEl);
    this.root.append(row);

    this.root.append(
      this.button('Create new world', '', () => {
        const seed = seedFromString(this.seedEl ? this.seedEl.value : '');
        const mode = (this.modeEl ? this.modeEl.value : 'survival') as 'survival' | 'creative';
        this.actions.onNew(seed, mode);
      })
    );

    this.deleteBtn = this.button('Delete world', 'danger', () => this.actions.onDelete());
    this.deleteBtn.disabled = true;
    this.root.append(this.deleteBtn);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML =
      'WASD move · Space jump / swim up · Shift sneak (and Ctrl or double-tap W to sprint) · ' +
      'F fly and G creative · 1-9 select · E inventory · Q drop · F3 debug · Esc menu';
    this.root.append(hint);
  }
}
