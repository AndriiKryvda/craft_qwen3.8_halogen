# CRAFT — Architecture Document

**Version:** 1.0 · **Companion to:** `docs/REQUIREMENTS.md`

---

## 1. Technology stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | **TypeScript 5.9** (`strict`) | Data-oriented registries and voxel index math benefit from typing |
| Build/dev | **Vite 8** | Instant HMR, first-class TS + ES-module workers, trivial static deploy |
| Rendering | **three.js 0.186** (WebGL2) | Mature `BufferGeometry` + custom `ShaderMaterial`, no engine overhead |
| Tests | **Vitest 5** (node environment) | All simulation logic is DOM-free and therefore unit-testable |
| Assets | **None** — procedural | Textures painted into a `CanvasTexture` atlas; item icons too; audio synthesised with WebAudio |
| Storage | **IndexedDB** (thin promise wrapper) | Multi-MB quota vs. localStorage's string-only limit |
| Threading | 1–3 **Web Workers** for terrain generation | Keeps the render loop inside its frame budget |

There is **no backend, no bundler config beyond `vite.config.ts`, and no binary file in the repository.**

---

## 2. Module map

```
src/
  config.ts                tunables + feature flags (render distance, day length, mobs on/off)
  main.ts                  bootstrap: DOM refs, engine assembly, title screen wiring
  bootstrap.ts             Game class: owns subsystems, fixed-step update, resize

  engine/
    loop.ts                rAF driver, fixed 50 Hz sim step + render step
    input.ts               keyboard/mouse state, pointer lock, key bindings, edge detection
    time.ts                world clock (ticks), daylight factor, day counter
    debug.ts               F3 overlay data (fps, ms, xyz, chunk, biome, block counts)
    audio.ts               WebAudio blips: break, place, step, punch, hurt, craft, ambient bed
    events.ts              tiny typed pub/sub used to decouple subsystems

  world/
    constants.ts           CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, index math
    blocks.ts              BlockDef registry + derived lookup tables
    chunk.ts               Chunk: Uint8Array blocks + meta + light, get/set, dirty flags
    world.ts               World: chunk map, getBlock/setBlock, edits diff, heightmap
    chunkManager.ts        streaming: queue, distance sort, per-frame time budget, unload
    worldgen.ts            pure generateChunk(cx,cz,seed) -> {blocks, meta}
    biomes.ts              temperature/humidity/relief -> BiomeId, surface rules
    noise.ts               mulberry32, hash2d/3d, value noise, fBm, ridged
    trees.ts               oak/birch/spruce/cactus schematics + placement rules
    lighting.ts            sky + block light BFS, relightChunk, border propagation
    gravity.ts             falling sand/gravel settling
    growth.ts              sapling -> tree, wheat stages, random tick scheduler

  mesh/
    atlas.ts               builds the 128x128 texture atlas canvas + UV lookup
    mesher.ts              chunk -> {opaque, transparent} vertex/index arrays + AO + light
    chunkRenderer.ts       THREE.Mesh pool per chunk, rebuild queue, frustum + fog
    highlight.ts           block wireframe + mining-crack overlay + punch flinch
    viewmodel.ts           first-person arm + held item, own scene/camera overlay pass
    sky.ts                 sky dome, sun/moon, fog colour from time of day

  player/
    player.ts              state: pos, vel, yaw/pitch, game mode, mining progress
    physics.ts             integrate + per-axis voxel collision resolution
    collision.ts           AABB vs voxel grid helpers, entity box intersection test
    raycast.ts             Amanatides-Woo DDA returning hit voxel + face normal
    controls.ts            FPS input -> wish direction, jump/sprint/sneak/fly/swim
    swing.ts               first-person punch cadence: how often the fist connects

  inventory/
    item.ts                ItemDef registry (block items, materials, food, tools)
    stack.ts               ItemStack helpers: add/remove/split/merge/count
    inventory.ts           36-slot container + cursor stack, shift-click moves, hotbar index
    crafting.ts            shaped/shapeless matcher over a 2x2 or 3x3 grid
    recipes.ts             the 41 recipe definitions
    furnace.ts             FurnaceState machine: fuel burn, smelt progress, recipes

  mobs/
    mob.ts / ai.ts / models.ts / spawner.ts

  survival/
    stats.ts               health, hunger, exhaustion, air, regen, starvation
    damage.ts              damage types, knockback, invulnerability window, death
    food.ts                eating, hunger restore
    farming.ts             hoe/seeds/crop growth + harvest drops

  ui/
    hud.ts                 crosshair, hotbar, hearts/hunger/bubbles, clock, toasts, vignette
    inventoryUI.ts         inventory + 2x2 crafting + cursor stack interaction
    tableUI.ts             3x3 crafting table + recipe book
    furnaceUI.ts           furnace slots + progress bars
    chestUI.ts             chest 27 slots
    pauseMenu.ts           pause, settings sliders, save & quit, controls list
    titleScreen.ts         new world / seed / continue / help
    slots.ts               shared DOM slot widget (icon, count, drag state, tooltips)
    styles.css             all styling, one file

  persistence/
    idb.ts                 open/get/put/delete promise helpers
    save.ts                serialize/deserialize the whole world state, autosave scheduler

  workers/
    world.worker.ts        receives (cx,cz,seed) -> transfers blocks/meta/height buffers
tests/                     vitest unit tests, one file per pure module
```

**Dependency direction** (nothing points "up"):

```
ui ─┐
    ├─► bootstrap ─► engine ─► world ─► mesh
mobs┤                    │        │
    ├─► survival ─► inventory    └─► worldgen ─► {noise, biomes, trees}
persistence ────────────┘
```

`world/`, `inventory/`, `mobs/`, `survival/` never import `three` — only `mesh/`, `bootstrap.ts` and `ui/` touch rendering/DOM. That is what makes the simulation unit-testable in a node process.

---

## 3. Core data structures

### 3.1 Chunk
```ts
class Chunk {
  cx: number; cz: number;
  blocks: Uint8Array;   // 16*16*64 = 16 384 B  block id
  meta:   Uint8Array;   // 16 384 B  wheat stage, growth, orientation
  sky:    Uint8Array;   // 16 384 B  sky light 0..15
  blockLight: Uint8Array; // 16 384 B
  height: Uint8Array;   // 256  surface Y per column (skylight, spawn, mob AI)
  state: 'empty' | 'generated' | 'lit' | 'meshed';
  dirty: boolean; meshes?: { opaque: THREE.Mesh; transparent: THREE.Mesh };
}
```
Indexing is bit-shifted so hot loops stay branch-free (`CHUNK_SIZE = 16`, `WORLD_HEIGHT = 64`):

```ts
idx(x, y, z) = (x << 10) | (z << 6) | y     // y contiguous => column scans are linear
```

≈ 66 KB per chunk ⇒ 170 chunks ≈ 11 MB of raw voxel data, well inside NFR-3.

### 3.2 World
```ts
class World {
  seed: number;
  chunks: Map<string, Chunk>;               // key `${cx},${cz}`
  edits:  Map<string, Map<number, number>>; // chunkKey -> (index -> blockId) player diffs
  getBlock(wx, wy, wz): number              // 0 outside loaded chunks / above world
  setBlock(wx, wy, wz, id, meta?, recordEdit = true)
  heightAt(wx, wz): number
  biomeAt(wx, wz): BiomeId
}
```
`setBlock` records into `edits` (so saves stay tiny), marks the chunk dirty, marks the 4 neighbours dirty when the cell is on a border, and schedules a relight.

### 3.3 Block registry
```ts
interface BlockDef {
  id: number; name: string; label: string;
  hardness: number; tool: ToolKind | null; tier: number;   // 0..4
  solid: boolean; opaque: boolean; liquid: boolean; cross: boolean;
  light: number;                                          // 0..15 emission
  tiles: { top: number; side: number; bottom: number } | number;
  drop?: Drop; group?: 'planks' | 'log' | 'leaves';        // tag groups for recipes
}
```
Derived tables (`SOLID[]`, `OPAQUE[]`, `LIGHT[]`, `HARDNESS[]`) are plain arrays indexed by block id so the mesher and physics never dereference objects in inner loops.

### 3.4 Items
Blocks double as items (`"block:17"` ⇒ glass). Non-block items: sticks, coal, charcoal, raw/smelted metals, gems, food, tools (`"wood_pickaxe"`), seeds, wheat. `ItemDef` carries `stackMax`, `food?`, `tool?`, `icon: number` (atlas tile).

---

## 4. Rendering pipeline

1. **Atlas** (`mesh/atlas.ts`) — one 128×128 canvas, 8×8 tiles of 16 px. Painters: `speckle`, `stripes`, `logRings`, `planks`, `bricks`, `leaves(alpha)`, `water(alpha)`, `glass(alpha)`, cross plants, plus item icons (tools drawn as handle + tinted head). Output is a `THREE.CanvasTexture` with `NearestFilter`, `generateMipmaps = false`, and UVs inset by half a texel to stop bleeding.
2. **Mesher** (`mesh/mesher.ts`) — for every voxel, test each of the 6 faces against the **world** (not just the chunk) so borders are seamless. Emit a quad when the neighbour is not opaque and not the same transparent type. Two output buffers per chunk: **opaque** and **transparent** (water/glass/leaves/cross plants).
3. **Vertex attributes** — `position`, `uv`, `normal`, `color` (per-face directional shade × per-vertex ambient occlusion from the 3 neighbours of each corner), `light` (vec2 = sky, block, sampled from the cell the face points into).
4. **Shader** — one custom `ShaderMaterial` per pass:
   ```
   lvl    = max(skyLight * daylight, blockLight)
   bright = ambient + (1 - ambient) * lvl
   rgb    = tex.rgb * vertexColor * bright * sunTint
   rgb    = mix(rgb, fogColor, fogFactor(depth))
   ```
   Day/night therefore costs one uniform update, not a remesh.
5. **ChunkRenderer** — pools `THREE.Mesh` objects, rebuilds dirty chunks inside the frame budget, sets `matrixAutoUpdate = false` (positions are baked in world space).
6. **Job budget** — `chunkManager.update()` runs a distance-sorted queue under a `performance.now()` budget (default 6 ms/frame) shared by generation, lighting and meshing. Initial load of 170 chunks completes in ~2–3 s without dropping a frame.

---

## 5. World generation pipeline (pure, worker-safe)

```
generateChunk(cx, cz, seed):
  for each column (x, z):
    temp, humidity  = fBm(low freq)            ┐
    relief          = fBm + ridged             ├─ biomes.pick() -> BiomeId
    continent       = fBm(very low freq)       ┘
    river           = 1 - |ridgedNoise|        -> river mask, carves channel down
    height          = base(continent) + biome amplitude * relief + river carve
    surface/subsurface fill (grass/dirt/stone/sand/snow by biome + height)
  fill water:  y <= SEA_LEVEL and air  ->  WATER
  caves:   3D fBm threshold below surface - 4
  ores:    per-band 3D noise veins (coal/iron/gold/diamond)
  decorate: deterministic per-column hash -> trees, cactus, grass, flowers, dead bush
  heightmap: topmost non-air, non-water column cell
```
Determinism comes from `mulberry32` plus integer hash functions seeded with `(seed, cx, cz)` — no `Math.random()` anywhere in generation, which is what makes FR-1.2 testable. Trees are emitted by the chunk that owns their trunk column and clipped at chunk borders, so a chunk can be generated without its neighbours existing (required for worker parallelism).

---

## 6. Lighting

Two light channels per cell, both `Uint8Array` 0–15.

- **Sky**: per column, cells above `height[]` get 15, then a BFS spreads sideways with cost 1 through transparent cells and cost 3 through translucent ones (leaves, water) so cave mouths get soft light.
- **Block**: BFS from emitters (torch = 14) with cost 1.
- `relightChunk(c)` clears and re-seeds from the chunk's own emitters + sky columns + the 1-cell border ring of each neighbour, then runs the BFS. Cost ≈ 16 k cell visits ≈ < 1 ms.
- Editing a block relights its chunk and marks the 4 neighbours' meshes dirty; a neighbour is only relit when the edit sits on its border.

---

## 7. Simulation loop

```
rAF(now):
  dt = clamp(now - last, 0, 50 ms)
  accumulator += dt
  while accumulator >= 50 ms: step(50 ms)   // physics, mobs, survival, furnace, growth
  chunkManager.update(budget)
  renderer.render(scene, camera)
```
A fixed 50 Hz sim step (like Minecraft's 20 TPS) keeps jump height, fall damage and mob speed frame-rate independent. `dt` clamping prevents the classic "tab backgrounded ⇒ player falls through the world" bug.

**Physics** — per-axis sweep: apply the axis delta, enumerate the voxel AABB the body now overlaps, and if any solid voxel is found snap the body flush against it and zero that velocity axis. Order Y → X → Z with grounded detection on the Y pass. Velocities are capped and `dt` bounded, so tunnelling is impossible at gameplay speeds.

**Raycast** — Amanatides & Woo voxel traversal, 5-block reach, skipping air and non-selectable blocks (water, plants), returning `{ x, y, z, face }`.

---

## 8. Crafting & block entities

- `crafting.match(grid, size)` trims empty border rows/columns, then slides each shaped recipe over the grid and compares item ids with tag-group support (`any planks`). Shapeless compares a multiset. The result is `(item, count)` plus the consumed slot list.
- The **recipe book** iterates all recipes and reports craftability by counting inventory items — used both for the "craftable" highlight and for auto-fill.
- **Block entities** live in `World` maps keyed by `"x,y,z"`: `furnaces: Map<pos, FurnaceState>`, `chests: Map<pos, ItemStack[]>`. Furnaces tick only for loaded chunks; `FurnaceState.update(dt)` handles fuel ignition, smelt progress and output stacking.

---

## 9. Mobs

`Mob` reuses `player/physics` with its own AABB. AI is a small state machine in `mobs/ai.ts`:

| State | Trigger | Behaviour |
|---|---|---|
| `idle` | default | stand, occasional yaw turn |
| `wander` | timer 2–5 s | pick a nearby target point, walk, avoid dropping > 3 blocks |
| `flee` | damaged | run away from the attacker for 4 s |
| `chase` | hostile + player < 16 + light < 8 | steer toward player, step up 1 block, jump gaps |
| `attack` | within 1.6 blocks, cooldown 1 s | melee damage + knockback |
| `burn` | undead + daylight | 1 HP/s damage |

`spawner.ts` runs every 2 s: samples a random column in the 8–48 block ring, checks surface block, light and time, respects per-type caps (12 passive / 10 hostile) and despawns beyond 64 blocks. Models are `THREE.Group`s of boxes with a sine-driven leg swing, so no skeletal animation system is needed.

---

## 10. Persistence format

```ts
SaveV1 {
  version: 1, seed: number, time: number, spawn: [x,y,z], mode: 'survival'|'creative',
  player: { pos, vel, yaw, pitch, health, hunger, exhaustion, air, hotbar },
  inventory: (Slot|null)[],
  edits: Record<chunkKey, [index, blockId][]>,
  furnaces: Record<posKey, FurnaceState>, chests: Record<posKey, Slot[]>,
  mobs: { type, x, y, z, health }[],
  settings: { renderDistance, fov, sensitivity, volume, recipeBook }
}
```
One `world` object store, key `"main"`. Edits are stored as diffs, so a heavily modified world still saves in tens of KB. Autosave every 30 s, on `visibilitychange → hidden`, and on `Ctrl+S`. If IndexedDB is unavailable the game runs with an in-memory save and shows a warning toast.

---

## 11. Error handling & resilience

- Every subsystem is wrapped in `try/catch` at the loop boundary: a thrown job is logged, the chunk is skipped, the frame survives.
- Worker creation is feature-detected; on failure `worldgen` runs on the main thread (same module, identical behaviour).
- Pointer-lock loss is expected (it is the pause gesture) and re-shows the pause menu rather than throwing.
- Missing WebGL2 shows a plain-language message instead of a black canvas.

---

## 12. Testing strategy

| Test file | Covers |
|---|---|
| `noise.test.ts` | determinism, range, hash stability across seeds |
| `worldgen.test.ts` | same seed ⇒ identical chunk; water below sea level; bedrock floor; biome variety; forest tree density > desert |
| `blocks.test.ts` | registry integrity, tool tier gates, drop table |
| `collision.test.ts` | rest on ground, wall blocking, ceiling, no tunnelling |
| `raycast.test.ts` | hits expected voxel + face, ignores water, respects max distance |
| `inventory.test.ts` | add/merge/split/remove, stack cap, shift-click move |
| `recipes.test.ts` | every recipe matches its own layout; wrong layouts fail; 2×2 vs 3×3 constraints |
| `survival.test.ts` | fall damage curve, starvation floor, regen, drowning |
| `furnace.test.ts` | fuel ignition, smelt completion, output stacking |
| `save.test.ts` | serialize → deserialize round-trip equality |

Live verification: `npm run build`, `npm run test`, then a scripted Playwright pass that loads the dev server, starts a world, walks, mines a block, opens the inventory, and asserts a clean console plus a non-black canvas screenshot.

---

## 13. Performance budget (render distance 6, 170 chunks)

| Item | Budget |
|---|---|
| Voxel data | 11 MB |
| GPU geometry | ≈ 170 × 2 meshes, ≈ 25 k triangles after frustum culling |
| Draw calls | < 120 after frustum + distance culling |
| Frame | 16.6 ms → sim 1 ms, jobs ≤ 6 ms, render ≤ 8 ms, UI 0.5 ms |
| Chunk gen (worker) | 1–3 ms |
| Chunk mesh | 2–4 ms |
| Chunk relight | < 1 ms |

---

## 14. Key architectural decisions & alternatives

| Decision | Alternative rejected | Why |
|---|---|---|
| Custom voxel `ShaderMaterial` | `MeshLambertMaterial` + real lights | One uniform update for day/night; per-cell light is data, not lights — three.js light count would explode |
| Per-face light, per-vertex AO | Minecraft-style smooth per-vertex light | ~40 % simpler, 90 % of the look |
| Terrain gen in workers, meshing on main | everything in workers | Meshing needs neighbour chunks and light state; shipping that across the boundary costs more than it saves at this scale |
| Diffs for saves | full chunk snapshots | ~100× smaller files, and re-applying diffs on load is trivial |
| Fixed 50 Hz sim step | variable `dt` | deterministic physics, no tunnelling, frame-rate independent |
| Procedural textures | PNG atlas | repo stays text-only, no asset pipeline, new blocks are one function call |
| Click-to-move item stacks | HTML5 drag & drop | faithful to Minecraft, no cross-browser DnD quirks, unit-testable |

---

## 15. Implementation order (milestones)

| M | Deliverable | Exit check |
|---|---|---|
| M0 | Scaffold, dev server, empty scene | `npm run dev` renders, console clean |
| M1 | Chunk storage, noise, biomes, terrain, water, ores, trees | `worldgen.test.ts` green, terrain visible |
| M2 | Mesher, atlas, chunk renderer, streaming | ≥ 55 FPS at distance 6 |
| M3 | Player physics + controls | `collision.test.ts` green, walk/swim works |
| M4 | Raycast, mining, drops, placement | `raycast.test.ts` green, mine/place works |
| M5 | Inventory + HUD | stacks, hotbar, drag works |
| M6 | Crafting, recipe book, furnace | `recipes.test.ts` green, full wood→tool chain works |
| M7 | Survival, day/night, lighting, mobs | night spawns mobs, torch lights, death/respawn |
| M8 | Persistence, settings, polish, docs | save/reload round-trip works, `npm run build` clean |



