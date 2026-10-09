# CRAFT — Requirements Specification

**Product:** *Craft* — a browser-playable voxel sandbox game inspired by Minecraft.
**Version:** 1.0 · **Status:** Approved for implementation

---

## 1. Vision

A single-player, browser-native 3D voxel sandbox that captures the core Minecraft loop:

> **Explore a procedurally generated world → mine resources → craft tools → build structures → survive the night.**

No download, no account, no server. Open the page, click **Play**, and you are in a seeded world that is different every time, with terrain, rivers, lakes, forests, deserts and mountains that you can reshape block by block.

### 1.1 Design pillars
| # | Pillar | Meaning |
|---|--------|---------|
| P1 | **Faithful feel** | Mouse-look + WASD, 6-face cubes, 16×16 pixel textures, mining time by hardness, hotbar, crafting grid. |
| P2 | **Instant access** | Runs in a browser tab from a static host. First playable frame < 5 s. |
| P3 | **Endless world** | Chunk-based infinite terrain streamed around the player, deterministic from a seed. |
| P4 | **Real survival loop** | Tools gate what you can mine; hunger, darkness and night mobs create urgency. |
| P5 | **Zero binary assets** | Every texture and sound is generated procedurally at runtime; the repo is 100 % text. |

### 1.2 Non-goals (out of scope for v1)
Multiplayer, redstone, enchanting, brewing, biomes beyond the 6 listed, Nether/End, villages, boats/minecarts, beds/sleeping, mobile touch controls, gamepad, raytracing, mod API.

---

## 2. Personas & core user stories

| Persona | Wants |
|---|---|
| **Curious Explorer** | Walk out and see interesting terrain: rivers, lakes, forests, mountains, caves. |
| **Builder** | Place and remove blocks precisely, obtain materials, build a house before dark. |
| **Crafter / Survivalist** | Progression: hand → wood → stone → iron → diamond; eat to stay alive. |

**User stories (MoSCoW)**

| ID | Story | M |
|---|---|---|
| US-1 | Walk, run, jump, swim and look around with the mouse so the world feels physical. | Must |
| US-2 | Break blocks by holding the mouse button and see progress. | Must |
| US-3 | Broken blocks drop into the inventory and are placeable again. | Must |
| US-4 | 9-slot hotbar and 27-slot backpack. | Must |
| US-5 | 3×3 crafting grid (2×2 on the character sheet) for planks, sticks, tools, torches. | Must |
| US-6 | Furnace to smelt ore, sand and food using fuel. | Must |
| US-7 | World contains water, rivers, lakes and a sea; swimming and drowning work. | Must |
| US-8 | Trees (oak, birch, spruce, cactus) so wood is a real resource. | Must |
| US-9 | Health and hunger bars; die and respawn. | Must |
| US-10 | Day/night cycle where night is dangerous. | Must |
| US-11 | Place torches so light keeps monsters away. | Should |
| US-12 | World persists between browser sessions. | Must |
| US-13 | World seed that can be read and re-entered. | Should |
| US-14 | Chest to store items. | Should |
| US-15 | Farm wheat and cook food. | Should |
| US-16 | Debug overlay (FPS, XYZ, biome, chunk). | Should |
| US-17 | Render distance / FOV / mouse sensitivity settings. | Should |
| US-18 | Grow saplings into trees. | Could |

---

## 3. Functional requirements

### FR-1 World generation
- **FR-1.1** World divided into chunks of **16 × 16 × 64** blocks (X × Z × Y). Sea level = Y 32.
- **FR-1.2** Generation is **fully deterministic** from a 32-bit seed: identical seed ⇒ identical world.
- **FR-1.3** Terrain height from layered value-noise (fBm) plus continentality/erosion terms; range Y 5…60.
- **FR-1.4** **Six biomes** — `plains`, `forest`, `taiga`, `desert`, `mountains`, `beach` — chosen by low-frequency temperature + humidity + relief noise; stable per column and reported by the debug overlay.
- **FR-1.5** **Water**: air below sea level is filled ⇒ oceans, **rivers** (ridged-noise river bands that drag terrain below sea level) and **lakes** (inland depressions).
- **FR-1.6** **Ores** in depth bands via 3D-noise veins: coal (Y 5–45), iron (Y 5–38), gold (Y 5–24), diamond (Y 5–15); rarer = deeper.
- **FR-1.7** **Vegetation**: oak (plains/forest), birch (forest), spruce (taiga), cactus (desert), tall grass & flowers (grass), dead bush (desert), snow in taiga peaks.
- **FR-1.8** **Caves** from 3D noise thresholds below the surface; unlit ⇒ dark.
- **FR-1.9** Bedrock floor at Y 0–1 (unbreakable). Sand/gravel beaches at the water line; clay near shore water.
- **FR-1.10** Saplings grow into full trees over time (random 4–12 min).

### FR-2 Block system
- **FR-2.1** ≥ 30 block types in one data-driven registry (§6).
- **FR-2.2** Each block declares hardness, required tool tier, drop, solidity, opacity, light emission, liquid flag, cross-plant flag.
- **FR-2.3** Blocks are **broken** by holding LMB; time = `hardness / toolSpeed`; a drop only occurs when the tool tier is sufficient (stone needs wood+, iron ore needs stone+, diamond needs iron+).
- **FR-2.4** Blocks are **placed** with RMB on the hit face, never intersecting the player body, never into a non-air cell.
- **FR-2.5** **Physics-reactive**: sand and gravel fall when unsupported.
- **FR-2.6** **Special blocks**: crafting table (3×3 grid), furnace (smelting), chest (27 slots), torch (light 14, non-solid), water (swim/drown), farmland + wheat (4 stages), glass/leaves (transparent), bedrock (unbreakable).

### FR-3 Player & controls
- **FR-3.1** First-person camera, pointer-lock mouse look, WASD + Space (jump/swim up) + Ctrl (sneak) + double-tap W (sprint) + F (fly in creative).
- **FR-3.2** Player AABB 0.6 × 1.8 × 0.6, eye height 1.62, gravity, per-axis voxel collision resolution.
- **FR-3.3** In water: reduced gravity, slower horizontal speed, Space swims up, air drains when the eye is submerged.
- **FR-3.4** Selection ray from screen centre, range 5 blocks, wireframe highlight of the targeted block.
- **FR-3.5** Creative mode (toggle `G`): infinite blocks, no damage, flight.

### FR-4 Inventory
- **FR-4.1** 9 hotbar + 27 backpack slots; stack size 64 (tools/food 1).
- **FR-4.2** Select with 1–9 or mouse wheel; drop with `Q`.
- **FR-4.3** Inventory screen (`E`): click to pick up / place a stack, right-click to split/place one, shift-click to move between hotbar and backpack, cursor stack follows the mouse.
- **FR-4.4** Item icons are generated procedurally and drawn from the same atlas as blocks.

### FR-5 Crafting
- **FR-5.1** Recipe engine supports **shaped**, **shapeless** and **smelting**; shaped matching trims empty rows/columns and slides the pattern over the grid.
- **FR-5.2** 2×2 grid in the inventory screen; 3×3 when within 4 blocks of a crafting table.
- **FR-5.3** Result slot updates live; crafting consumes one of each input; result goes to the cursor stack.
- **FR-5.4** **Recipe book** lists every recipe, marks craftable ones, and can auto-fill the grid.
- **FR-5.5** ≥ 25 recipes (§7).

### FR-6 Furnace & smelting
- **FR-6.1** Furnace GUI: input, fuel, output, flame and arrow progress.
- **FR-6.2** Fuel seconds: coal/charcoal 80, planks/log 15, stick 5.
- **FR-6.3** Smelts: iron/gold ore and raw metals → ingots, sand → glass, clay → brick, cobblestone → stone, log → charcoal, raw meat → cooked. One item per 10 s of burn.
- **FR-6.4** Furnaces keep burning while loaded, pause when unloaded, and are saved.

### FR-7 Survival
- **FR-7.1** Health 20 (10 hearts), hunger 20 (10 drumsticks), air 10 bubbles.
- **FR-7.2** Exhaustion accrues from walking/sprinting/jumping/mining; sprinting drains ~10× walking.
- **FR-7.3** Regen 1 HP / 4 s while hunger ≥ 18 (costs 1.5 hunger). At hunger 0: 1 HP / 4 s starvation damage (never kills below 1 HP in v1).
- **FR-7.4** Damage: fall (> 3 blocks, 1 HP per extra block), drowning (2 HP/s after bubbles empty), mob melee, suffocation.
- **FR-7.5** Food: apple 4, bread 5, cooked beef 8, raw beef 2, cooked pork 8, raw pork 2. Eat with RMB while holding food.
- **FR-7.6** Death ⇒ "You died" screen ⇒ respawn at world spawn with full health/hunger.
- **FR-7.7** Farming: hoe turns grass/dirt into farmland; wheat seeds grow through 4 stages; mature wheat drops 1–3 wheat + 1 seed.

### FR-8 Day/night & lighting
- **FR-8.1** Full day = 20 real minutes; sky, fog and sunlight interpolate through dawn/day/dusk/night with an ambient floor at night.
- **FR-8.2** **Sky light** propagates down and spreads with attenuation; **block light** from torches (14) spreads with attenuation 1/step.
- **FR-8.3** Face brightness = ambient + max(sky × daylight, blockLight), multiplied by per-face directional shading and per-vertex ambient occlusion.
- **FR-8.4** Hostile spawn rate rises when effective light < 8.

### FR-9 Mobs
- **FR-9.1** Passive: **cow**, **pig** — wander, flee when hit, drop raw meat + leather / raw pork.
- **FR-9.2** Hostile: **zombie** (3 HP melee, chases within 16 blocks, burns in daylight), **spider** (faster, jumps, 2 HP melee, active at night and in caves).
- **FR-9.3** Spawning: passive on grass in daylight (cap 12); hostile on solid ground in low light (cap 10); nothing within 8 or beyond 48 blocks of the player; despawn beyond 64.
- **FR-9.4** Mobs use the same voxel collision as the player, step up 1 block, take fall damage, die at 0 HP with a particle puff.

### FR-10 Persistence
- **FR-10.1** IndexedDB store; autosave every 30 s, on `visibilitychange`, and on demand from the pause menu.
- **FR-10.2** Saved: seed, world time, spawn point, player position/rotation/health/hunger/air, inventory, per-chunk block-edit diffs, furnace and chest states, mob list, game mode.
- **FR-10.3** Title screen offers **Continue** (if a save exists) and **New world** (seed field, blank = random; same seed reproduces terrain).

### FR-11 UI/UX
- **FR-11.1** Title → loading with progress → HUD: crosshair, hotbar, health/hunger/air rows, clock + day counter, optional debug overlay (`F3`), toast messages, damage vignette.
- **FR-11.2** `Esc` releases the pointer and opens the pause menu (Resume / Save & Quit / Settings / Controls).
- **FR-11.3** Settings: render distance 2–10, FOV 60–110, mouse sensitivity, master volume, recipe book on/off.
- **FR-11.4** All interactive UI reachable by keyboard; text ≥ 12 px; panel contrast ≥ 4.5:1.

### FR-12 Audio (Could)
- **FR-12.1** Procedurally synthesised with WebAudio (no files): footstep thud, block break, place click, hurt, craft, day wind and night drone.

---

## 4. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Frame rate at render distance 6 on a 2020-class laptop | ≥ 55 FPS average, ≤ 33 ms p95 |
| NFR-2 | Chunk generation + meshing | ≤ 4 ms per chunk, budgeted so a frame never stalls > 8 ms |
| NFR-3 | Memory | < 400 MB JS heap at render distance 6 (≈ 170 chunks) |
| NFR-4 | Cold start to first frame | < 5 s; interactive world < 8 s |
| NFR-5 | Browsers | Latest Chrome/Edge/Firefox/Safari, WebGL2, desktop pointer devices |
| NFR-6 | No network calls after page load | ✔ |
| NFR-7 | Determinism | Same seed + same edits ⇒ same world; unit-tested |
| NFR-8 | Robustness | No uncaught console errors during a 5-minute scripted session |
| NFR-9 | Testability | Pure logic unit-tested with `vitest` |
| NFR-10 | Bundle | < 900 KB JS uncompressed, zero binary asset files in the repo |

---

## 5. Controls (default key map)

| Action | Input |
|---|---|
| Look | Mouse (pointer lock) |
| Move | `W A S D`, double-tap `W` = sprint |
| Jump / swim up | `Space` |
| Sneak (slow, no fall off edge) | `Ctrl` |
| Break block | Hold `LMB` |
| Place block / use block / eat | `RMB` |
| Pick block (creative) | `MMB` |
| Select hotbar slot | `1`–`9`, mouse wheel |
| Drop item | `Q` (one) / `Ctrl+Q` (stack) |
| Inventory | `E` |
| Creative toggle | `G` |
| Fly toggle (creative) | `F` |
| Debug overlay | `F3` |
| Pause | `Esc` |
| Save now | `Ctrl+S` |

---

## 6. Block catalogue (v1)

`Hardness` = seconds with the correct tool. `Tier`: 0 hand · 1 wood · 2 stone · 3 iron · 4 diamond.

| ID | Block | Hard | Tool/Tier | Drop | Solid | Opaque | Light | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Stone | 1.5 | pick/1 | Cobblestone | ✔ | ✔ | | |
| 2 | Grass Block | 0.6 | shovel/0 | Dirt | ✔ | ✔ | | |
| 3 | Dirt | 0.5 | shovel/0 | Dirt | ✔ | ✔ | | |
| 4 | Cobblestone | 2.0 | pick/1 | Cobblestone | ✔ | ✔ | | |
| 5 | Oak Log | 2.0 | axe/0 | Oak Log | ✔ | ✔ | | |
| 6 | Birch Log | 2.0 | axe/0 | Birch Log | ✔ | ✔ | | |
| 7 | Spruce Log | 2.0 | axe/0 | Spruce Log | ✔ | ✔ | | |
| 8/9/10 | Oak/Birch/Spruce Leaves | 0.2 | any | Sapling 10 % | ✔ | ✚ | | transparent |
| 11/12/13 | Oak/Birch/Spruce Planks | 2.0 | axe/0 | self | ✔ | ✔ | | |
| 14 | Sand | 0.5 | shovel/0 | self | ✔ | ✔ | | falls |
| 15 | Gravel | 0.6 | shovel/0 | self | ✔ | ✔ | | falls |
| 16 | Water | — | — | — | ✖ | ✚ | | liquid, swim |
| 17 | Glass | 0.3 | any | self | ✔ | ✚ | | |
| 18 | Coal Ore | 3.0 | pick/1 | Coal | ✔ | ✔ | | |
| 19 | Iron Ore | 3.0 | pick/2 | Raw Iron | ✔ | ✔ | | |
| 20 | Gold Ore | 3.0 | pick/3 | Raw Gold | ✔ | ✔ | | |
| 21 | Diamond Ore | 3.0 | pick/3 | Diamond | ✔ | ✔ | | |
| 22 | Bedrock | ∞ | — | — | ✔ | ✔ | | unbreakable |
| 23 | Torch | 0.05 | hand | self | ✖ | ✚ | 14 | cross plant |
| 24 | Crafting Table | 2.5 | axe/0 | self | ✔ | ✔ | | opens 3×3 |
| 25 | Furnace | 3.5 | pick/1 | self | ✔ | ✔ | | smelts |
| 26 | Chest | 2.5 | axe/0 | self | ✔ | ✔ | | 27 slots |
| 27 | Bricks | 2.0 | pick/1 | self | ✔ | ✔ | | |
| 28 | Stone Bricks | 2.0 | pick/1 | self | ✔ | ✔ | | |
| 29 | Snow Block | 0.2 | shovel/0 | self | ✔ | ✔ | | |
| 30 | Ice | 0.5 | pick/0 | self | ✔ | ✚ | | |
| 31 | Clay | 0.6 | shovel/0 | Clay Ball ×4 | ✔ | ✔ | | |
| 32 | Cactus | 0.4 | any | self | ✔ | ✚ | | damages player |
| 33 | Tall Grass | 0.05 | hand | Seed 20 % | ✖ | ✚ | | cross |
| 34 | Red Flower | 0.05 | hand | self | ✖ | ✚ | | cross |
| 35 | Yellow Flower | 0.05 | hand | self | ✖ | ✚ | | cross |
| 36 | Oak Sapling | 0.05 | hand | self | ✖ | ✚ | | grows |
| 37 | Farmland | 0.6 | shovel/0 | Dirt | ✔ | ✔ | | |
| 38 | Wheat Crop | 0.05 | hand | Wheat + Seed | ✖ | ✚ | | 4 stages |
| 39 | Dead Bush | 0.05 | hand | Stick 25 % | ✖ | ✚ | | cross |
| 40 | Iron Block | 5.0 | pick/2 | self | ✔ | ✔ | | |
| 41 | Gold Block | 3.0 | pick/3 | self | ✔ | ✔ | | |
| 42 | Diamond Block | 5.0 | pick/3 | self | ✔ | ✔ | | |
| 43 | Coal Block | 5.0 | pick/1 | self | ✔ | ✔ | | |
| 44 | Ladder | 0.4 | hand | self | ✖ | ✚ | | climb |
| 45 | Fence | 2.0 | axe/0 | self | ✔ | ✚ | | |

---

## 7. Recipe list (v1)

**Shapeless** — Log → 4 Planks (×3 wood types) · Planks → 4 Sticks · 9 Coal ↔ Coal Block · 9 Iron ↔ Iron Block · 9 Gold ↔ Gold Block · 9 Diamond ↔ Diamond Block · 4 Clay Ball → Clay Block · 4 Brick → Bricks.

**Shaped**

| Result | Pattern |
|---|---|
| Crafting Table | `PPP / P·P` (any planks) |
| Chest | `PPP / P·P / PPP` |
| Furnace | `CCC / C·C / CCC` (cobblestone) |
| Torch ×4 | `C / S` (coal or charcoal over stick) |
| Ladder ×3 | `S·S / SS / S·S` |
| Fence ×3 | `P·P / P·P` |
| Pickaxe | `PPP / ·S· / ·S·` |
| Axe | `PP / PS / ·S·` |
| Shovel | `P / S / S` |
| Sword | `P / P / S` |
| Hoe | `PP / ·S / ·S` |
| Bread | `WWW` (wheat) |
| Stone Bricks ×4 | `CC / CC` (stone) |

Tool material rows: **wood / stone / iron / diamond** × 5 tools = 20 tool recipes.

**Smelting** — Iron Ore · Raw Iron → Iron Ingot · Gold Ore · Raw Gold → Gold Ingot · Sand → Glass · Clay Block → Bricks · Cobblestone → Stone · Log → Charcoal · Raw Beef → Cooked Beef · Raw Pork → Cooked Pork.

**Total: 41 recipes** (requirement ≥ 25).

---

## 8. Acceptance criteria (v1 = "done")

1. `npm install && npm run dev` opens the title screen; **New world** generates terrain with ≥ 1 visible water body and ≥ 1 tree within 40 blocks of spawn.
2. Player can walk, sprint, jump, swim, fall and take fall damage; cannot walk through solid blocks; cannot place a block inside themselves.
3. Mining stone by hand takes ≥ 1 s and drops nothing; with a wooden pickaxe it drops cobblestone. Iron ore drops nothing with a wooden pickaxe, drops raw iron with a stone pickaxe.
4. Player can craft planks → sticks → crafting table → wooden pickaxe, and smelt raw iron in a furnace fuelled by coal.
5. Night arrives within 10 minutes and spawns ≥ 1 hostile mob; a placed torch lights its surroundings and suppresses spawning nearby.
6. Health reaching 0 shows the death screen; respawn works and the world is intact.
7. `Ctrl+S`, close the tab, reopen, **Continue** restores position, time, inventory and every block placed/broken.
8. `npm run build` and `npm run test` pass with zero errors; browser console is clean during a scripted 5-minute session.
9. FPS ≥ 55 at render distance 6 (built-in debug overlay).

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Mesh/light rebuilds cause hitches | NFR-1/2 fail | Per-frame time-boxed job queue; workers for terrain gen; border-only relight of neighbours |
| Light propagation cost in caves | stutter on torch place | Cap BFS queue per tick; relight only the affected chunk + borders |
| Pointer lock / IndexedDB blocked in some embeds | can't play | Click-to-lock retry; in-memory save fallback with a warning toast |
| Texture atlas bleeding | visual artefacts | Nearest filtering, no mipmaps, half-texel UV inset |
| Scope creep (mobs, farming) | schedule | Features behind flags in `src/config.ts`; mobs can be disabled |
| Cross-chunk mesh seams | holes at chunk borders | Mesher samples the world (neighbour-aware), remesh neighbours on edit |



