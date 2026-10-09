/** Runtime wiring: builds every subsystem and drives the frame loop. */

import * as THREE from 'three';
import { CONFIG, type Settings } from './config';
import { Input } from './engine/input';
import { GameLoop } from './engine/loop';
import { WorldClock } from './engine/time';
import { Audio } from './engine/audio';
import { World } from './world/world';
import { ChunkManager } from './world/chunkManager';
import { CHUNK_SIZE, floorDiv } from './world/constants';
import { HURTS, SOLID } from './world/blocks';
import { ChunkRenderer } from './mesh/chunkRenderer';
import { Sky } from './mesh/sky';
import { SelectionBox } from './mesh/highlight';
import { HandViewModel } from './mesh/viewmodel';
import { Player } from './player/player';
import { PlayerControls } from './player/controls';
import { BlockActions } from './player/mining';
import type { RayHit } from './player/raycast';
import { SwingClock, swingPeriod } from './player/swing';
import { Inventory } from './inventory/inventory';
import { SurvivalStats, type DamageCause } from './survival/stats';
import { DropManager } from './world/drops';
import { GravitySystem } from './world/gravity';
import { GrowthSystem } from './world/growth';
import { findSpawn } from './world/worldgen';
import { MobManager } from './mobs/spawner';
import { tickFurnace } from './inventory/furnace';
import { getItem, type ItemStack } from './inventory/item';
import { Hud } from './ui/hud';
import { Panels } from './ui/panels';
import { CursorStack } from './ui/slots';
import { PauseMenu } from './ui/pauseMenu';
import { SAVE_VERSION, writeSave, type SaveData } from './persistence/save';
import { persistSettings } from './persistence/settings';

export interface GameOptions {
  settings: Settings;
  seed: number;
  mode: 'survival' | 'creative';
  /** Restored save file; when null a fresh world is created. */
  save?: SaveData | null;
  /** Called after the world has been saved and torn down. */
  onQuit(): void;
  /** Called when an unrecoverable runtime error happens. */
  onFatal?(error: unknown): void;
}

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly world: World;
  readonly cm: ChunkManager;
  readonly chunks: ChunkRenderer;
  readonly sky: Sky;
  readonly selection: SelectionBox;
  readonly hand: HandViewModel;
  readonly player: Player;
  readonly controls: PlayerControls;
  readonly input: Input;
  readonly clock: WorldClock;
  readonly audio: Audio;
  readonly inventory: Inventory;
  readonly stats: SurvivalStats;
  readonly drops: DropManager;
  readonly gravity: GravitySystem;
  readonly growth: GrowthSystem;
  readonly mobs: MobManager;
  readonly hud: Hud;
  readonly panels: Panels;
  readonly cursor: CursorStack;
  readonly pause: PauseMenu;
  readonly mining: BlockActions;
  readonly loop: GameLoop;

  paused = false;
  dead = false;
  private disposed = false;
  private readonly settings: Settings;
  private readonly opts: GameOptions;
  private readonly deathEl: HTMLElement;
  private readonly deathCause: HTMLElement;
  private readonly sunColor = new THREE.Color();
  private readonly fogColor = new THREE.Color();
  private prevX = 0;
  private prevY = 0;
  private prevZ = 0;
  private autosave = CONFIG.autosaveInterval;
  private envTimer = 0;
  private saving = false;
  /** First-person punch animation clock — view only, advanced once per frame. */
  private readonly swing = new SwingClock();

  constructor(opts: GameOptions) {
    this.opts = opts;
    this.settings = opts.settings;

    const host = document.getElementById('game') ?? document.body;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const canvas = this.renderer.domElement;
    canvas.tabIndex = -1;
    canvas.style.display = 'block';
    host.appendChild(canvas);

    this.camera = new THREE.PerspectiveCamera(
      opts.settings.fov,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      1000
    );
    this.camera.rotation.order = 'YXZ';

    this.world = new World(opts.seed);
    this.cm = new ChunkManager(this.world, CONFIG.workerCount);
    this.cm.renderDistance = opts.settings.renderDistance;

    this.clock = new WorldClock(0.08);
    this.player = new Player(0.5, 40, 0.5);
    this.player.creative = opts.mode === 'creative';

    this.chunks = new ChunkRenderer(this.scene, this.world);
    this.sky = new Sky(this.scene);
    this.selection = new SelectionBox(this.scene);
    this.hand = new HandViewModel(this.renderer, window.innerWidth, window.innerHeight);
    this.drops = new DropManager(this.scene, this.world);
    this.gravity = new GravitySystem(this.world);
    this.growth = new GrowthSystem(this.world);
    this.mobs = new MobManager(this.scene, this.world);

    this.inventory = new Inventory();
    this.stats = new SurvivalStats();
    this.audio = new Audio();
    this.input = new Input();
    this.controls = new PlayerControls(this.input);

    this.hud = new Hud(mustGet('hud'), this.inventory);
    this.cursor = new CursorStack(document.body);
    this.panels = new Panels(mustGet('panel'), this.inventory, this.cursor, {
      onClose: () => {
        this.syncUiMode();
        this.panels.refresh();
        if (!this.paused && !this.dead) this.requestLock();
      },
      onChanged: () => {
        this.hud.refreshHotbar();
        this.panels.refresh();
      }
    });

    this.pause = new PauseMenu(mustGet('pause'), this.settings, {
      onResume: () => this.resume(),
      onSave: () => void this.save(false),
      onQuit: () => void this.quit(),
      onSettings: () => this.applySettings(),
      getDebug: () => this.hud.debugVisible,
      setDebug: (v) => {
        this.hud.debugVisible = v;
      },
      getCreative: () => this.player.creative,
      setCreative: (v) => this.setCreative(v)
    });

    this.mining = new BlockActions(this.world, this.player, this.inventory, {
      sound: (kind) => this.audio.play(kind),
      toast: (message) => this.hud.toast(message),
      spawnDrop: (id, count, x, y, z) => this.drops.spawn(id, count, x, y, z),
      openTable: () => this.openPanel(() => this.panels.openTable()),
      openFurnace: (state) => this.openPanel(() => this.panels.openFurnace(state)),
      openChest: (slots) => this.openPanel(() => this.panels.openChest(slots)),
      eat: (itemId, points) => this.eat(itemId, points),
      gravityAbove: (x, y, z) => this.gravity.queueAbove(x, y, z)
    });

    this.inventory.onChange = () => {
      this.cursor.set(this.inventory.cursor);
      this.hud.refreshHotbar();
    };

    this.stats.onDamage = () => this.audio.play('hurt');
    this.stats.onDeath = (cause) => this.onDeath(cause);

    this.loop = new GameLoop({
      simStep: CONFIG.simStep,
      maxFrame: 0.25,
      maxSteps: 5,
      sim: (dt) => this.sim(dt),
      render: (alpha, dt) => this.render(alpha, dt)
    });

    this.deathEl = this.buildDeathOverlay();
    this.deathCause = this.deathEl.querySelector('#death-cause') as HTMLElement;

    if (opts.save) this.applySave(opts.save);
    else this.placeAtSpawn();

    this.applySettings();
    this.audio.setVolume(opts.settings.volume);
    this.hud.refreshHotbar();
    this.hud.setVitals(this.stats);
    this.hud.setClock(this.clock);
    this.hud.show();
    this.wireEvents();
  }


  // ------------------------------------------------------------- lifecycle ---

  start(): void {
    if (this.disposed) return;
    this.paused = false;
    this.syncPrev();
    this.loop.start();
    this.requestLock();
  }

  /**
   * Snapshot the player's render position. `prevY` is kept in eye space because
   * that is what render() interpolates towards; mixing feet Y with eye Y makes the
   * camera lerp a full body height every frame, which reads as the world flickering.
   */
  private syncPrev(): void {
    const p = this.player;
    this.prevX = p.x;
    this.prevY = p.eyeY;
    this.prevZ = p.z;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.removeEventListener('mousedown', this.onCanvasDown);
    this.input.detach();
    this.mobs.clear();
    this.drops.clear();
    this.chunks.dispose();
    this.sky.dispose(this.scene);
    this.selection.dispose(this.scene);
    this.hand.dispose();
    this.hud.dispose();
    this.panels.close();
    this.pause.closeMenu();
    this.deathEl.classList.add('hidden');
    this.cursor.el.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private wireEvents(): void {
    this.input.attach(this.renderer.domElement);
    this.input.onPointerLockLost = () => {
      if (!this.panels.open && !this.pause.open && !this.dead && !this.paused) this.openPause();
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.addEventListener('mousedown', this.onCanvasDown);
  }

  /** FR-10.1: leaving the tab flushes the world to disk. */
  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden' && !this.dead) void this.save(true);
  };

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.hand.resize(w, h);
  };

  private onBeforeUnload = (): void => {
    void this.save(true);
  };

  private onCanvasDown = (): void => {
    this.audio.init();
    if (!this.paused && !this.dead && !this.panels.open) this.requestLock();
  };

  private requestLock(): void {
    try {
      this.input.requestLock();
    } catch {
      /* the browser may refuse a re-lock right after Escape */
    }
  }

  private syncUiMode(): void {
    this.input.uiMode = this.panels.open || this.pause.open || this.dead;
  }

  /** Open a container panel, releasing the mouse so slots can be clicked. */
  private openPanel(open: () => void): void {
    open();
    this.input.releaseLock();
    this.syncUiMode();
    this.panels.refresh();
  }

  // ------------------------------------------------------------ game states --

  openPause(): void {
    if (this.paused || this.dead) return;
    this.panels.close();
    this.paused = true;
    this.player.mining = null;
    this.swing.reset();
    this.input.releaseLock();
    this.pause.openMenu();
    this.syncUiMode();
  }

  resume(): void {
    if (this.dead) return;
    this.paused = false;
    this.pause.closeMenu();
    this.controls.reset();
    this.syncUiMode();
    this.requestLock();
  }

  setCreative(value: boolean): void {
    this.player.creative = value;
    if (!value) this.player.flying = false;
  }

  private eat(itemId: string, points: number): void {
    if (this.stats.hunger >= CONFIG.maxHunger) {
      this.hud.toast('You are not hungry');
      return;
    }
    this.stats.eat(points);
    if (!this.player.creative) this.inventory.consumeHeld(1);
    this.audio.play('eat');
    void itemId;
  }

  private onDeath(cause: DamageCause): void {
    this.dead = true;
    this.paused = true;
    this.panels.close();
    this.pause.closeMenu();
    this.input.releaseLock();
    this.audio.play('death');
    this.deathCause.textContent = DEATH_MESSAGES[cause] ?? 'You died';
    this.deathEl.classList.remove('hidden');
    this.syncUiMode();
  }

  respawn(): void {
    this.stats.reset();
    this.dead = false;
    this.paused = false;
    this.player.flying = false;
    this.player.teleport(this.player.spawn.x, this.player.spawn.y, this.player.spawn.z);
    this.syncPrev();
    this.controls.reset();
    this.deathEl.classList.add('hidden');
    this.syncUiMode();
    this.hud.setVitals(this.stats);
    this.requestLock();
  }

  private buildDeathOverlay(): HTMLElement {
    let el = document.getElementById('death');
    if (!el) {
      el = document.createElement('div');
      el.id = 'death';
      document.body.append(el);
    }
    // Always rebuild: a reused element would keep the previous game's handler.
    el.textContent = '';
    const box = document.createElement('div');
    box.className = 'death-box';
    const title = document.createElement('h2');
    title.textContent = 'You died';
    const cause = document.createElement('p');
    cause.id = 'death-cause';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-btn';
    btn.textContent = 'Respawn';
    btn.addEventListener('click', () => this.respawn());
    box.append(title, cause, btn);
    el.append(box);
    el.classList.add('hidden');
    return el;
  }

  // ------------------------------------------------------------- persistence -

  private serialize(): SaveData {
    const edits: Record<string, number[]> = {};
    for (const [key, map] of this.world.edits) {
      const flat: number[] = [];
      map.forEach((id, i) => {
        flat.push(i, id);
      });
      if (flat.length) edits[key] = flat;
    }
    const furnaces: SaveData['furnaces'] = {};
    for (const [key, f] of this.world.furnaces) {
      furnaces[key] = {
        input: f.input,
        fuel: f.fuel,
        output: f.output,
        burn: f.burn,
        burnMax: f.burnMax,
        cook: f.cook
      };
    }
    const chests: Record<string, Array<ItemStack | null>> = {};
    for (const [key, slots] of this.world.chests) chests[key] = slots;

    return {
      version: SAVE_VERSION,
      seed: this.world.seed,
      time: this.clock.fraction,
      mode: this.player.creative ? 'creative' : 'survival',
      spawn: [this.player.spawn.x, this.player.spawn.y, this.player.spawn.z],
      player: {
        x: this.player.x,
        y: this.player.y,
        z: this.player.z,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        health: this.stats.health,
        hunger: this.stats.hunger,
        air: this.stats.air,
        selected: this.inventory.selected
      },
      inventory: this.inventory.slots.slice(),
      edits,
      furnaces,
      chests,
      mobs: this.mobs.serialize(),
      settings: { ...this.settings },
      savedAt: Date.now()
    };
  }

  /** Write the save file. `silent` skips the on-screen confirmation. */
  async save(silent: boolean): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      await writeSave(this.serialize());
      if (!silent) this.hud.toast('World saved');
    } catch (err) {
      this.hud.toast('Save failed');
      if (this.opts.onFatal) this.opts.onFatal(err);
    } finally {
      this.saving = false;
    }
  }

  private async quit(): Promise<void> {
    this.paused = true;
    try {
      await writeSave(this.serialize());
    } catch {
      /* quitting even if the write fails */
    }
    try {
      this.dispose();
    } catch (err) {
      if (this.opts.onFatal) this.opts.onFatal(err);
    }
    this.opts.onQuit();
  }

  applySettings(): void {
    const s = this.settings;
    this.camera.fov = s.fov;
    this.camera.far = Math.max(200, s.renderDistance * CHUNK_SIZE * 2.5);
    this.camera.updateProjectionMatrix();
    this.cm.renderDistance = s.renderDistance;
    this.audio.setVolume(s.volume);
    this.panels.showBook = s.recipeBook;
    persistSettings(s);
  }

  // ------------------------------------------------------------- world setup -

  private placeAtSpawn(): void {
    const spot = findSpawn(this.world.seed, Math.random);
    const px = Math.floor(spot.x);
    const pz = Math.floor(spot.z);
    this.cm.generateImmediate(floorDiv(px, CHUNK_SIZE), floorDiv(pz, CHUNK_SIZE), 1);
    const y = this.world.heightAt(px, pz) + 1;
    this.player.spawn = { x: px + 0.5, y, z: pz + 0.5 };
    this.player.teleport(px + 0.5, y, pz + 0.5);
    this.cm.setCenter(px + 0.5, pz + 0.5);
    this.cm.update(400);
  }

  private applySave(data: SaveData): void {
    this.clock.fraction = data.time;
    this.player.creative = data.mode === 'creative';
    const spawn = data.spawn ?? [0.5, 40, 0.5];
    this.player.spawn = { x: spawn[0], y: spawn[1], z: spawn[2] };

    for (const [key, flat] of Object.entries(data.edits ?? {})) {
      const map = new Map<number, number>();
      for (let i = 0; i + 1 < flat.length; i += 2) map.set(flat[i], flat[i + 1]);
      if (map.size) this.world.edits.set(key, map);
    }
    for (const [key, f] of Object.entries(data.furnaces ?? {})) {
      this.world.furnaces.set(key, {
        input: f.input ?? null,
        fuel: f.fuel ?? null,
        output: f.output ?? null,
        burn: f.burn ?? 0,
        burnMax: f.burnMax ?? 0,
        cook: f.cook ?? 0
      });
    }
    for (const [key, slots] of Object.entries(data.chests ?? {})) this.world.chests.set(key, slots);

    const saved = data.inventory ?? [];
    for (let i = 0; i < this.inventory.slots.length; i++) this.inventory.slots[i] = saved[i] ?? null;
    this.inventory.selected = data.player?.selected ?? 0;

    const p = data.player;
    if (p) {
      this.stats.health = clamp(p.health, 1, CONFIG.maxHealth);
      this.stats.hunger = clamp(p.hunger, 0, CONFIG.maxHunger);
      this.stats.air = clamp(p.air, 0, CONFIG.airTicks / 10);
      this.player.yaw = p.yaw;
      this.player.pitch = p.pitch;
    }

    const px = p?.x ?? 0.5;
    const pz = p?.z ?? 0.5;
    this.cm.generateImmediate(floorDiv(px, CHUNK_SIZE), floorDiv(pz, CHUNK_SIZE), 1);
    const py = p?.y ?? this.world.heightAt(Math.floor(px), Math.floor(pz)) + 1;
    this.player.teleport(px, py, pz);
    this.mobs.restore(data.mobs ?? []);
    this.cm.setCenter(px, pz);
    this.cm.update(400);
  }

  // ------------------------------------------------------------------ frame --

  /** Shortcuts that must keep working while a panel or the menu owns the mouse. */
  private hotkeys(): void {
    const i = this.input;
    if (i.wasPressed('Escape')) {
      if (this.panels.open) this.panels.close();
      else if (this.dead) return;
      else if (this.pause.open) this.resume();
      else this.openPause();
    }
    if (this.dead || this.pause.open) return;
    if (i.wasPressed('KeyE')) {
      this.panels.toggleInventory();
      this.syncUiMode();
      if (!this.panels.open) this.requestLock();
    }
    if (i.wasPressed('F3')) this.hud.toggleDebug();
    if (i.wasPressed('F5')) void this.save(false);
    if (i.wasPressed('KeyG') && !this.panels.open) this.setCreative(!this.player.creative);
  }

  private sim(dt: number): void {
    this.hotkeys();
    if (this.paused || this.dead) {
      this.input.endFrame();
      return;
    }

    const p = this.player;
    const i = this.input;

    const mouse = i.consumeMouse();
    if (mouse.dx !== 0 || mouse.dy !== 0) p.look(mouse.dx, mouse.dy, this.settings.sensitivity);
    if (p.creative && i.wasPressed('fly')) p.flying = !p.flying;

    this.prevX = p.x;
    this.prevY = p.eyeY;
    this.prevZ = p.z;

    const cmd = this.controls.read(dt, p);
    p.update(this.world, dt, cmd);

    if (p.fallDamage > 0) {
      const dmg = p.fallDamage;
      p.fallDamage = 0;
      if (!p.creative) this.stats.hurt(dmg, 'fall');
    }
    if (p.exhaustion > 0) {
      if (!p.creative) this.stats.addExhaustion(p.exhaustion);
      p.exhaustion = 0;
    }
    if (!p.creative) {
      this.stats.update(dt, { headInWater: p.headInWater, inWater: p.inWater, canRegen: true });
      this.hazards(dt);
    }

    const wheel = i.consumeWheel();
    if (wheel !== 0) this.inventory.cycle(wheel);
    for (let n = 1; n <= 9; n++) {
      if (i.wasPressed('Digit' + n)) this.inventory.select(n - 1);
    }

    if (this.panels.open) {
      this.mining.cancelMining();
      this.mining.target = null;
    } else {
      this.mining.update(dt, i.lmb);
      if (i.rmbPressed) {
        this.mining.interact();
        this.swing.trigger();
      }
      if (i.wasPressed('KeyQ')) this.mining.dropHeld(i.isDown('sneak'));
    }

    this.gravity.update(dt);
    this.growth.update(dt, p.x, p.y, p.z, Math.random);
    for (const state of this.world.furnaces.values()) tickFurnace(state, dt);

    const strikes = this.mobs.update(dt, p, this.clock.daylight);
    for (const strike of strikes) this.mobStrike(strike.damage, strike.from.x, strike.from.z);

    this.drops.update(dt, p, (id, count) => this.inventory.add(id, count));

    this.clock.advance(dt);
    this.cm.setCenter(p.x, p.z);

    this.autosave -= dt;
    if (this.autosave <= 0) {
      this.autosave = CONFIG.autosaveInterval;
      void this.save(true);
    }

    i.endFrame();
  }

  private mobStrike(damage: number, fromX: number, fromZ: number): void {
    if (this.player.creative || this.stats.dead) return;
    this.stats.hurt(damage, 'mob');
    this.audio.play('hit');
    const p = this.player;
    const dx = p.x - fromX;
    const dz = p.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    p.vx += (dx / d) * 7;
    p.vz += (dz / d) * 7;
    if (p.onGround) p.vy = 4.2;
  }

  private suffocate = 0;

  /** Contact damage from hurting blocks, plus suffocation inside solids. */
  private hazards(dt: number): void {
    const p = this.player;
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    const feet = Math.floor(p.y);
    if (HURTS[this.world.getBlock(x, feet, z)] === 1) this.stats.hurt(1, 'cactus');
    if (HURTS[this.world.getBlock(x, feet + 1, z)] === 1) this.stats.hurt(1, 'cactus');

    const head = Math.floor(p.eyeY);
    if (SOLID[this.world.getBlock(x, head, z)] === 1) {
      this.suffocate += dt;
      if (this.suffocate >= 1) {
        this.suffocate = 0;
        this.stats.hurt(1, 'suffocate');
      }
    } else this.suffocate = 0;
  }

  /**
   * Punch animation: while the left button is down on a block the arm swings
   * over and over, and every punch that lands thuds, dents the block and flashes
   * the cracks. Purely cosmetic — the mining progress itself lives in the sim.
   */
  private updateHand(dt: number, hit: RayHit | null, daylight: number): void {
    const p = this.player;
    const ui = this.panels.open || this.pause.open || this.dead || this.paused;
    this.hand.visible = !ui;

    const held = this.inventory.held();
    const def = held ? getItem(held.id) : undefined;
    this.hand.setHeld(def ? def.icon : -1, def ? def.block >= 0 : false);

    const punching = !ui && !!hit && this.input.lmb;
    const landed = this.swing.update(dt, punching, swingPeriod(this.inventory.heldTool(), p.creative));
    if (landed) {
      this.audio.play('punch');
      if (hit) this.selection.punch();
    }

    this.hand.update(dt, {
      extension: this.swing.extension,
      bob: p.bob,
      moving: Math.abs(p.vx) + Math.abs(p.vz) > 0.6,
      daylight,
      sneak: p.sneaking
    });
  }

  private render(alpha: number, dt: number): void {
    const p = this.player;
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    const bob = p.onGround ? Math.sin(p.bob) * 0.045 : 0;
    this.camera.position.set(
      this.prevX + (p.x - this.prevX) * a,
      this.prevY + (p.eyeY - this.prevY) * a + bob,
      this.prevZ + (p.z - this.prevZ) * a
    );
    this.camera.rotation.set(p.pitch, p.yaw, 0);

    const palette = this.clock.palette();
    this.sky.update(this.camera, palette);
    this.sunColor.setRGB(palette.sun[0], palette.sun[1], palette.sun[2]);
    this.fogColor.setRGB(palette.fog[0], palette.fog[1], palette.fog[2]);
    this.chunks.setDaylight(palette.daylight, this.sunColor);
    const far = Math.max(24, this.cm.renderDistance * CHUNK_SIZE);
    this.chunks.setFog(far * 0.55, far, this.fogColor);
    this.scene.background = this.fogColor;

    this.cm.update(CONFIG.jobBudgetMs);
    this.chunks.update(CONFIG.jobBudgetMs);

    const hit = this.mining.target;
    const mine = p.mining;
    if (hit && !this.panels.open) {
      const progress = mine && mine.total > 0 ? Math.min(1, mine.progress / mine.total) : 0;
      this.selection.show(hit.x, hit.y, hit.z, progress);
    } else this.selection.hide();
    this.selection.tick(dt);
    this.updateHand(dt, hit, palette.daylight);

    this.chunks.countStats(this.camera);
    this.hud.setWater(p.headInWater);
    this.hud.setVitals(this.stats);
    this.hud.setClock(this.clock);
    if (this.hud.debugVisible) {
      this.hud.setDebug(
        {
          fps: this.loop.fps,
          ms: this.loop.ms,
          chunks: this.world.loadedChunks,
          pending: this.cm.pendingWork,
          tris: this.chunks.triangles,
          draws: this.chunks.drawCalls,
          mobs: this.mobs.count
        },
        this.world,
        p,
        this.clock
      );
    }

    this.renderer.render(this.scene, this.camera);
    this.hand.render();
  }
}

const DEATH_MESSAGES: Record<string, string> = {
  fall: 'You hit the ground too hard',
  drown: 'You drowned',
  starve: 'You starved to death',
  mob: 'You were slain',
  cactus: 'You were pricked to death',
  suffocate: 'You suffocated',
  void: 'You fell out of the world'
};




