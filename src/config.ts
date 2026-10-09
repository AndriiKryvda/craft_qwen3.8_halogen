/** Tunables and feature flags. Everything the player can adjust lives here or in settings. */

export interface Settings {
  renderDistance: number;
  fov: number;
  sensitivity: number;
  volume: number;
  recipeBook: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  renderDistance: 6,
  fov: 75,
  sensitivity: 1,
  volume: 0.6,
  recipeBook: true
};

export const CONFIG = {
  /** Fixed simulation step in seconds (20 Hz, like Minecraft). */
  simStep: 0.05,
  /** Max wall-clock time a single frame's chunk jobs may consume. */
  jobBudgetMs: 6,
  /** Number of terrain-generation workers. */
  workerCount: 2,
  /** Length of a full day/night cycle in real seconds. */
  dayLength: 1200,
  /** Seconds between autosaves. */
  autosaveInterval: 30,
  /** Block reach. */
  reach: 5,

  mobsEnabled: true,
  farmingEnabled: true,

  // Physics
  gravity: 32,
  jumpSpeed: 8.9,
  walkSpeed: 4.317,
  sprintMul: 1.32,
  sneakMul: 0.32,
  flySpeed: 16,
  terminalVelocity: 78,
  playerWidth: 0.6,
  playerHeight: 1.8,
  eyeHeight: 1.62,

  // Water
  waterGravity: 8,
  waterDrag: 0.75,
  swimUpSpeed: 3.6,
  airTicks: 100, // 10 s of bubbles

  // Survival
  maxHealth: 20,
  maxHunger: 20,
  regenExhaustionCost: 1.5,
  fallDamageThreshold: 3,

  // Mobs
  passiveCap: 12,
  hostileCap: 10,
  spawnMinDist: 10,
  spawnMaxDist: 44,
  despawnDist: 64,
  spawnInterval: 2,

  // Furnace
  smeltSeconds: 10
};
