/** Entry point: title screen, settings and the game lifecycle. */

import type { Settings } from './config';
import { Game } from './bootstrap';
import { TitleScreen } from './ui/titleScreen';
import { readSave, clearSave, storageAvailable, type SaveData } from './persistence/save';
import { loadSettings } from './persistence/settings';

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el;
}

/** Last-resort on-screen error report (also mirrored to the console). */
function showFatal(error: unknown): void {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  let el = document.getElementById('fatal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatal';
    document.body.append(el);
  }
  el.classList.remove('hidden');
  el.textContent = `Something went wrong:\n${message}`;
  console.error(error);
}

function describe(save: SaveData): string {
  const when = Number.isFinite(save.savedAt) ? new Date(save.savedAt).toLocaleString() : 'unknown time';
  return `Seed ${save.seed} · ${save.mode} · saved ${when}`;
}

class App {
  private readonly settings: Settings = loadSettings();
  private readonly title: TitleScreen;
  private game: Game | null = null;

  constructor() {
    this.title = new TitleScreen(mustGet('title'), {
      onContinue: () => void this.continueWorld(),
      onNew: (seed, mode) => this.newWorld(seed, mode),
      onDelete: () => void this.deleteWorld()
    });
    void this.refresh();
  }

  /** Back to the title screen, with an up-to-date "continue" summary. */
  private async refresh(): Promise<void> {
    const save = storageAvailable ? await readSave().catch(() => null) : null;
    this.title.setSaveInfo(save ? describe(save) : null);
    this.title.show();
  }

  private launch(seed: number, mode: 'survival' | 'creative', save: SaveData | null): void {
    this.title.hide();
    try {
      const game = new Game({
        settings: this.settings,
        seed,
        mode,
        save,
        onQuit: () => {
          this.game = null;
          void this.refresh();
        },
        onFatal: showFatal
      });
      this.game = game;
      game.start();
      if (import.meta.env.DEV) {
        (window as unknown as { __craft: Game }).__craft = game;
      }
    } catch (error) {
      showFatal(error);
      void this.refresh();
    }
  }

  private async continueWorld(): Promise<void> {
    const save = await readSave().catch(() => null);
    if (!save) {
      void this.refresh();
      return;
    }
    Object.assign(this.settings, save.settings ?? {});
    this.launch(save.seed, save.mode, save);
  }

  private newWorld(seed: number, mode: 'survival' | 'creative'): void {
    this.launch(seed, mode, null);
  }

  private async deleteWorld(): Promise<void> {
    try {
      await clearSave();
    } catch (error) {
      showFatal(error);
    }
    void this.refresh();
  }
}

window.addEventListener('error', (event) => showFatal(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => showFatal(event.reason));

export const app = new App();
