# Halogen Craft

A Minecraft-inspired voxel sandbox that runs **entirely in the browser** — TypeScript +
[three.js](https://threejs.org) (WebGL2), built with Vite. No backend and no downloaded
assets: terrain, textures, item icons and audio are all generated procedurally at runtime.

Worlds are saved locally in **IndexedDB**, and chunk generation runs in **Web Workers**
so the render loop stays inside its frame budget.

| | |
|---|---|
| Language | TypeScript 5.9 (`strict`) |
| Renderer | three.js 0.186 (WebGL2) |
| Build / dev server | Vite 8 |
| Tests | Vitest 5 (99 unit tests, node environment) |
| Storage | IndexedDB (thin promise wrapper) |
| Backend | none — 100% client-side |

---

## Requirements

- **Node.js 20.19+** (Node 22 LTS or newer recommended — verified on Node 24 / npm 11)
- A **WebGL2**-capable browser: current Chrome, Edge, Firefox or Safari
- Keyboard + mouse (on-screen touch controls appear on touch devices)

---

## Quick start

```bash
# 1. install dependencies (once)
npm install

# 2. start the dev server with HMR
npm run dev
```

Then open **<http://127.0.0.1:5173>** in your browser, click **Create new world**
(optionally type a seed and pick *survival* or *creative*), then click into the window to
capture the mouse.

> The dev server binds to `127.0.0.1:5173` (see `vite.config.ts`). Use another port with
> `npm run dev -- --port 3000`, or expose it on your LAN with `npm run dev -- --host`.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot module replacement at `http://127.0.0.1:5173` |
| `npm run build` | Type-checks (`tsc --noEmit`) then produces an optimised bundle in `dist/` |
| `npm run preview` | Serves the built `dist/` folder locally — run it after `npm run build` |
| `npm run typecheck` | TypeScript check only, no emit |
| `npm test` | Runs the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |

### Building & deploying statically

```bash
npm run build      # -> dist/
npm run preview    # -> http://localhost:4173
```

`base` is set to `./`, so the contents of `dist/` can be dropped on any static host
(Netlify, GitHub Pages, nginx, `npx serve dist`). **Do not open `dist/index.html` directly
from disk with `file://`** — ES modules and Web Workers are blocked by browser CORS rules,
so the game will not start. It must be served over `http(s)://`.

---

## Controls

| Input | Action |
|---|---|
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows | Move |
| <kbd>Space</kbd> | Jump · swim up · fly up (while flying) |
| <kbd>Shift</kbd> | Sneak · descend while flying |
| <kbd>Ctrl</kbd> or double-tap <kbd>W</kbd> | Sprint |
| <kbd>F</kbd> | Toggle flight (creative only) |
| <kbd>G</kbd> | Toggle creative mode |
| Mouse | Look around |
| <kbd>LMB</kbd> (hold) | Mine the targeted block |
| <kbd>RMB</kbd> | Place a block · open a crafting table / furnace / chest · eat, plant, etc. |
| <kbd>1</kbd>–<kbd>9</kbd> or mouse wheel | Select hotbar slot |
| <kbd>E</kbd> | Inventory + 2×2 crafting grid |
| <kbd>Q</kbd> | Drop the held stack (hold <kbd>Shift</kbd> to drop the whole stack) |
| <kbd>F3</kbd> | Debug overlay (FPS, position, biome, chunk stats) |
| <kbd>F5</kbd> | Save the world now |
| <kbd>Esc</kbd> | Close a panel, or open the pause menu (settings, save, quit to title) |

Clicking the canvas locks the pointer; press <kbd>Esc</kbd> to release it.

**Survival:** health, hunger, drowning, fall damage, hostile mobs at night, farming and
furnace smelting. **Creative:** flight, unlimited blocks, no damage.

---

## Saving

Progress is written to IndexedDB as a single `world` record holding a diff of edited
chunks, so even a heavily modified world saves in tens of KB. Autosave fires every 30
seconds, when the tab is hidden, and from the pause menu or <kbd>F5</kbd>. The title screen
then offers **Continue** / **Delete world**. If IndexedDB is unavailable (some private
browsing modes), the game falls back to an in-memory save and shows a warning toast.

---

## Project layout

```
index.html              DOM shell: canvas, HUD, panels, title screen
vite.config.ts          dev server, build target, Vitest config
src/
  main.ts               entry point — title screen + game lifecycle
  bootstrap.ts          Game class: owns subsystems, fixed 50 Hz sim step, resize
  config.ts             tunables & feature flags (render distance, day length, mobs…)
  engine/               loop, input, time, audio
  world/                chunks, worldgen, biomes, noise, lighting, growth, gravity
  mesh/                 texture atlas, chunk mesher, chunk renderer, sky
  player/               player state, collision, raycast, mining, controls
  inventory/            items, stacks, inventory, crafting, recipes, furnace
  mobs/                 mob state, models, spawner
  survival/             health / hunger / air stats
  ui/                   HUD, panels, pause menu, title screen, styles
  persistence/          IndexedDB wrapper, save/load, settings
  workers/              terrain-generation worker
tests/                  Vitest unit tests (simulation logic is DOM-free)
docs/
  REQUIREMENTS.md       functional requirements
  ARCHITECTURE.md       module map, data model, algorithms
```

`world/`, `inventory/`, `mobs/` and `survival/` never import `three`, which is what makes
them unit-testable in a plain node process.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing at `http://127.0.0.1:5173` | Make sure `npm run dev` is still running; check the port printed in the terminal, or pass `-- --port <port>` |
| `EADDRINUSE` / port already used | `npm run dev -- --port 5174` |
| Blank canvas / "WebGL not supported" | Enable hardware acceleration, update GPU drivers, use a WebGL2 browser |
| Mouse won't lock | Click the canvas again; browsers require a user gesture and block re-lock for ~1 s after <kbd>Esc</kbd> |
| Save does not persist | Leave private/incognito mode (IndexedDB is blocked or wiped there) |
| `npm install` fails | Delete `node_modules/` and `package-lock.json`, then reinstall; Node must be ≥ 20.19 |
| Low FPS | Lower **render distance** in the pause menu; close other GPU-heavy tabs |

---

## Notes

- No server component and no telemetry — everything stays on your machine.
- Design details, algorithms (value-noise fBm, meshing with ambient occlusion, DDA
  raycast, lighting BFS) and the full requirement list live in [`docs/`](docs/).
- Tuning knobs such as day length, gravity, mob caps and worker count live in
  [`src/config.ts`](src/config.ts).

