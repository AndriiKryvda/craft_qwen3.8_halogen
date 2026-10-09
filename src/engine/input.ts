/** Keyboard / mouse state with pointer lock and edge detection. */

/** Logical movement actions -> the physical key codes that trigger them. */
export const KEYMAP: Record<string, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sneak: ['ShiftLeft'],
  sprint: ['ControlLeft'],
  fly: ['KeyF']
};

/** Keys that keep working while a UI panel owns the keyboard. */
export const UI_KEYS = new Set<string>(['Escape', 'KeyE', 'F3', 'F5']);

export class Input {
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private readonly releasedThisFrame = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  lmb = false;
  rmb = false;
  mmb = false;
  lmbPressed = false;
  rmbPressed = false;
  pointerLocked = false;
  /** Set while a UI panel owns the keyboard. */
  uiMode = false;
  onPointerLockLost: (() => void) | null = null;

  private el: HTMLElement | null = null;

  attach(el: HTMLElement): void {
    this.el = el;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', () => this.onLockChange());
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('wheel', this.onWheel);
    if (this.el) this.el.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }

  private onLockChange = (): void => {
    const locked = document.pointerLockElement === this.el;
    // A failed *acquisition* (browser refusal) must not look like a lost lock.
    if (!locked && !this.pointerLocked) return;
    this.pointerLocked = locked;
    if (!this.pointerLocked) {
      this.lmb = false;
      this.rmb = false;
      this.down.clear();
      if (this.onPointerLockLost) this.onPointerLockLost();
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.uiMode && !UI_KEYS.has(e.code)) return;
    if (!this.down.has(e.code)) this.pressedThisFrame.add(e.code);
    this.down.add(e.code);
    if (['Tab', 'F3', 'Space', 'Slash', 'ControlLeft'].includes(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
    this.releasedThisFrame.add(e.code);
  };

  private onBlur = (): void => {
    this.down.clear();
    this.lmb = false;
    this.rmb = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.pointerLocked) return;
    this.wheel += Math.sign(e.deltaY);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    if (e.button === 0) {
      this.lmb = true;
      this.lmbPressed = true;
    }
    if (e.button === 2) {
      this.rmb = true;
      this.rmbPressed = true;
    }
    if (e.button === 1) this.mmb = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.lmb = false;
    if (e.button === 2) this.rmb = false;
    if (e.button === 1) this.mmb = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  requestLock(): void {
    if (this.el && document.pointerLockElement !== this.el) {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    if (this.down.has(code)) return true;
    const list = KEYMAP[code];
    return list !== undefined && list.some((c) => this.down.has(c));
  }

  wasPressed(code: string): boolean {
    if (this.pressedThisFrame.has(code)) return true;
    const list = KEYMAP[code];
    return list !== undefined && list.some((c) => this.pressedThisFrame.has(c));
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  /** Call once at the end of every frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.lmbPressed = false;
    this.rmbPressed = false;
  }
}
