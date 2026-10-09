/** Block registry: the single source of truth for every block in the game. */

import { TILE } from '../mesh/atlas';

export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hoe';

export interface ToolInfo { kind: ToolKind; tier: number }
export interface Drop { item: string; count: number; chance: number }

export interface BlockDef {
  id: number;
  name: string;
  label: string;
  hardness: number;
  tool: ToolKind | null;
  tier: number;
  solid: boolean;
  opaque: boolean;
  liquid: boolean;
  cross: boolean;
  climb: boolean;
  replaceable: boolean;
  gravity: boolean;
  unbreakable: boolean;
  hurts: boolean;
  light: number;
  top: number;
  side: number;
  bottom: number;
  drop: Drop | null;
  group: string | null;
}

/** Stable numeric ids. The DEFS order below must match. */
export const B = {
  AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLE: 4,
  OAK_LOG: 5, BIRCH_LOG: 6, SPRUCE_LOG: 7,
  OAK_LEAVES: 8, BIRCH_LEAVES: 9, SPRUCE_LEAVES: 10,
  OAK_PLANKS: 11, BIRCH_PLANKS: 12, SPRUCE_PLANKS: 13,
  SAND: 14, GRAVEL: 15, WATER: 16, GLASS: 17,
  COAL_ORE: 18, IRON_ORE: 19, GOLD_ORE: 20, DIAMOND_ORE: 21,
  BEDROCK: 22, TORCH: 23, CRAFTING_TABLE: 24, FURNACE: 25, CHEST: 26,
  BRICKS: 27, STONE_BRICKS: 28, SNOW: 29, ICE: 30, CLAY: 31, CACTUS: 32,
  TALL_GRASS: 33, FLOWER_RED: 34, FLOWER_YELLOW: 35, SAPLING: 36,
  FARMLAND: 37, WHEAT: 38, DEAD_BUSH: 39,
  IRON_BLOCK: 40, GOLD_BLOCK: 41, DIAMOND_BLOCK: 42, COAL_BLOCK: 43,
  LADDER: 44, FENCE: 45
} as const;

export const BLOCK_COUNT = 46;

type Opts = Partial<Omit<BlockDef, 'id' | 'name' | 'label'>>;

function mk(id: number, name: string, label: string, o: Opts = {}): BlockDef {
  return {
    id, name, label,
    hardness: o.hardness ?? 1, tool: o.tool ?? null, tier: o.tier ?? 0,
    solid: o.solid ?? true, opaque: o.opaque ?? true, liquid: o.liquid ?? false,
    cross: o.cross ?? false, climb: o.climb ?? false, replaceable: o.replaceable ?? false,
    gravity: o.gravity ?? false, unbreakable: o.unbreakable ?? false, hurts: o.hurts ?? false,
    light: o.light ?? 0,
    top: o.top ?? TILE.stone, side: o.side ?? o.top ?? TILE.stone, bottom: o.bottom ?? o.side ?? o.top ?? TILE.stone,
    drop: o.drop === undefined ? { item: 'b' + id, count: 1, chance: 1 } : o.drop,
    group: o.group ?? null
  };
}

const self = (id: number): Drop => ({ item: 'b' + id, count: 1, chance: 1 });
const plant = { solid: false, opaque: false, cross: true, hardness: 0.05 } as const;

export const DEFS: BlockDef[] = [
  mk(B.AIR, 'air', 'Air', { solid: false, opaque: false, replaceable: true, unbreakable: true, top: 0, side: 0, bottom: 0, drop: null, hardness: 0 }),
  mk(B.STONE, 'stone', 'Stone', { tool: 'pickaxe', tier: 1, hardness: 1.5, top: TILE.stone, drop: self(B.COBBLE) }),
  mk(B.GRASS, 'grass', 'Grass Block', { hardness: 0.6, tool: 'shovel', top: TILE.grass_top, side: TILE.grass_side, bottom: TILE.dirt, drop: self(B.DIRT) }),
  mk(B.DIRT, 'dirt', 'Dirt', { hardness: 0.5, tool: 'shovel', top: TILE.dirt }),
  mk(B.COBBLE, 'cobble', 'Cobblestone', { hardness: 2, tool: 'pickaxe', tier: 1, top: TILE.cobblestone }),
  mk(B.OAK_LOG, 'oak_log', 'Oak Log', { hardness: 2, tool: 'axe', top: TILE.oak_log_top, side: TILE.oak_log_side, bottom: TILE.oak_log_top, group: 'log' }),
  mk(B.BIRCH_LOG, 'birch_log', 'Birch Log', { hardness: 2, tool: 'axe', top: TILE.birch_log_top, side: TILE.birch_log_side, bottom: TILE.birch_log_top, group: 'log' }),
  mk(B.SPRUCE_LOG, 'spruce_log', 'Spruce Log', { hardness: 2, tool: 'axe', top: TILE.spruce_log_top, side: TILE.spruce_log_side, bottom: TILE.spruce_log_top, group: 'log' }),
  mk(B.OAK_LEAVES, 'oak_leaves', 'Oak Leaves', { hardness: 0.2, opaque: false, top: TILE.oak_leaves, group: 'leaves', drop: { item: 'b' + B.SAPLING, count: 1, chance: 0.1 } }),
  mk(B.BIRCH_LEAVES, 'birch_leaves', 'Birch Leaves', { hardness: 0.2, opaque: false, top: TILE.birch_leaves, group: 'leaves', drop: { item: 'b' + B.SAPLING, count: 1, chance: 0.1 } }),
  mk(B.SPRUCE_LEAVES, 'spruce_leaves', 'Spruce Leaves', { hardness: 0.2, opaque: false, top: TILE.spruce_leaves, group: 'leaves', drop: { item: 'b' + B.SAPLING, count: 1, chance: 0.1 } }),
  mk(B.OAK_PLANKS, 'oak_planks', 'Oak Planks', { hardness: 2, tool: 'axe', top: TILE.oak_planks, group: 'planks' }),
  mk(B.BIRCH_PLANKS, 'birch_planks', 'Birch Planks', { hardness: 2, tool: 'axe', top: TILE.birch_planks, group: 'planks' }),
  mk(B.SPRUCE_PLANKS, 'spruce_planks', 'Spruce Planks', { hardness: 2, tool: 'axe', top: TILE.spruce_planks, group: 'planks' }),
  mk(B.SAND, 'sand', 'Sand', { hardness: 0.5, tool: 'shovel', top: TILE.sand, gravity: true }),
  mk(B.GRAVEL, 'gravel', 'Gravel', { hardness: 0.6, tool: 'shovel', top: TILE.gravel, gravity: true }),
  mk(B.WATER, 'water', 'Water', { solid: false, opaque: false, liquid: true, replaceable: true, unbreakable: true, hardness: 0, top: TILE.water, drop: null }),
  mk(B.GLASS, 'glass', 'Glass', { hardness: 0.3, opaque: false, top: TILE.glass }),
  mk(B.COAL_ORE, 'coal_ore', 'Coal Ore', { hardness: 3, tool: 'pickaxe', tier: 1, top: TILE.coal_ore, drop: { item: 'coal', count: 1, chance: 1 } }),
  mk(B.IRON_ORE, 'iron_ore', 'Iron Ore', { hardness: 3, tool: 'pickaxe', tier: 2, top: TILE.iron_ore, drop: { item: 'raw_iron', count: 1, chance: 1 } }),
  mk(B.GOLD_ORE, 'gold_ore', 'Gold Ore', { hardness: 3, tool: 'pickaxe', tier: 3, top: TILE.gold_ore, drop: { item: 'raw_gold', count: 1, chance: 1 } }),
  mk(B.DIAMOND_ORE, 'diamond_ore', 'Diamond Ore', { hardness: 3, tool: 'pickaxe', tier: 3, top: TILE.diamond_ore, drop: { item: 'diamond', count: 1, chance: 1 } }),
  mk(B.BEDROCK, 'bedrock', 'Bedrock', { unbreakable: true, hardness: -1, top: TILE.bedrock, drop: null }),
  mk(B.TORCH, 'torch', 'Torch', { ...plant, replaceable: true, light: 14, top: TILE.torch }),
  mk(B.CRAFTING_TABLE, 'crafting_table', 'Crafting Table', { hardness: 2.5, tool: 'axe', top: TILE.crafting_table_top, side: TILE.crafting_table_side, bottom: TILE.oak_planks }),
  mk(B.FURNACE, 'furnace', 'Furnace', { hardness: 3.5, tool: 'pickaxe', tier: 1, top: TILE.furnace_side, side: TILE.furnace_front, bottom: TILE.furnace_side }),
  mk(B.CHEST, 'chest', 'Chest', { hardness: 2.5, tool: 'axe', top: TILE.chest_top, side: TILE.chest_side, bottom: TILE.chest_top }),
  mk(B.BRICKS, 'bricks', 'Bricks', { hardness: 2, tool: 'pickaxe', tier: 1, top: TILE.bricks }),
  mk(B.STONE_BRICKS, 'stone_bricks', 'Stone Bricks', { hardness: 2, tool: 'pickaxe', tier: 1, top: TILE.stone_bricks }),
  mk(B.SNOW, 'snow', 'Snow Block', { hardness: 0.2, tool: 'shovel', top: TILE.snow }),
  mk(B.ICE, 'ice', 'Ice', { hardness: 0.5, tool: 'pickaxe', opaque: false, top: TILE.ice }),
  mk(B.CLAY, 'clay', 'Clay', { hardness: 0.6, tool: 'shovel', top: TILE.clay, drop: { item: 'clay_ball', count: 4, chance: 1 } }),
  mk(B.CACTUS, 'cactus', 'Cactus', { hardness: 0.4, opaque: false, hurts: true, top: TILE.cactus_top, side: TILE.cactus_side, bottom: TILE.cactus_top }),
  mk(B.TALL_GRASS, 'tall_grass', 'Tall Grass', { ...plant, replaceable: true, top: TILE.tall_grass, drop: { item: 'wheat_seed', count: 1, chance: 0.25 } }),
  mk(B.FLOWER_RED, 'flower_red', 'Poppy', { ...plant, replaceable: true, top: TILE.flower_red }),
  mk(B.FLOWER_YELLOW, 'flower_yellow', 'Dandelion', { ...plant, replaceable: true, top: TILE.flower_yellow }),
  mk(B.SAPLING, 'sapling', 'Oak Sapling', { ...plant, top: TILE.sapling }),
  mk(B.FARMLAND, 'farmland', 'Farmland', { hardness: 0.6, tool: 'shovel', top: TILE.farmland, bottom: TILE.dirt, drop: self(B.DIRT) }),
  mk(B.WHEAT, 'wheat', 'Wheat', { ...plant, top: TILE.wheat_3, drop: null }),
  mk(B.DEAD_BUSH, 'dead_bush', 'Dead Bush', { ...plant, replaceable: true, top: TILE.dead_bush, drop: { item: 'stick', count: 2, chance: 0.35 } }),
  mk(B.IRON_BLOCK, 'iron_block', 'Iron Block', { hardness: 5, tool: 'pickaxe', tier: 2, top: TILE.iron_block }),
  mk(B.GOLD_BLOCK, 'gold_block', 'Gold Block', { hardness: 3, tool: 'pickaxe', tier: 3, top: TILE.gold_block }),
  mk(B.DIAMOND_BLOCK, 'diamond_block', 'Diamond Block', { hardness: 5, tool: 'pickaxe', tier: 3, top: TILE.diamond_block }),
  mk(B.COAL_BLOCK, 'coal_block', 'Coal Block', { hardness: 5, tool: 'pickaxe', tier: 1, top: TILE.coal_block }),
  mk(B.LADDER, 'ladder', 'Ladder', { ...plant, climb: true, hardness: 0.4, top: TILE.ladder }),
  mk(B.FENCE, 'fence', 'Oak Fence', { hardness: 2, tool: 'axe', opaque: false, top: TILE.fence, side: TILE.fence_post, bottom: TILE.fence })
];

export const BLOCKS: BlockDef[] = DEFS;

// ---- flat lookup tables (hot paths must not touch objects) ----------------
export const SOLID = new Uint8Array(BLOCK_COUNT);
export const OPAQUE = new Uint8Array(BLOCK_COUNT);
export const LIQUID = new Uint8Array(BLOCK_COUNT);
export const CROSS = new Uint8Array(BLOCK_COUNT);
export const CLIMB = new Uint8Array(BLOCK_COUNT);
export const REPLACEABLE = new Uint8Array(BLOCK_COUNT);
export const GRAVITY = new Uint8Array(BLOCK_COUNT);
export const HURTS = new Uint8Array(BLOCK_COUNT);
export const UNBREAKABLE = new Uint8Array(BLOCK_COUNT);
export const EMIT = new Uint8Array(BLOCK_COUNT);
/** Light absorbed when passing through: 255 = impassable, 0 = free. */
export const LIGHT_COST = new Uint8Array(BLOCK_COUNT);
export const HARDNESS = new Float32Array(BLOCK_COUNT);
export const TIER_REQ = new Uint8Array(BLOCK_COUNT);
export const TILE_TOP = new Uint16Array(BLOCK_COUNT);
export const TILE_SIDE = new Uint16Array(BLOCK_COUNT);
export const TILE_BOTTOM = new Uint16Array(BLOCK_COUNT);

for (const d of DEFS) {
  const i = d.id;
  SOLID[i] = d.solid ? 1 : 0;
  OPAQUE[i] = d.opaque ? 1 : 0;
  LIQUID[i] = d.liquid ? 1 : 0;
  CROSS[i] = d.cross ? 1 : 0;
  CLIMB[i] = d.climb ? 1 : 0;
  REPLACEABLE[i] = d.replaceable ? 1 : 0;
  GRAVITY[i] = d.gravity ? 1 : 0;
  HURTS[i] = d.hurts ? 1 : 0;
  UNBREAKABLE[i] = d.unbreakable ? 1 : 0;
  EMIT[i] = d.light;
  LIGHT_COST[i] = d.opaque ? 255 : d.cross || !d.solid ? 0 : 2;
  HARDNESS[i] = d.hardness;
  TIER_REQ[i] = d.tier;
  TILE_TOP[i] = d.top;
  TILE_SIDE[i] = d.side;
  TILE_BOTTOM[i] = d.bottom;
}

export function blockDef(id: number): BlockDef {
  return DEFS[id] ?? DEFS[0];
}

export function blockLabel(id: number): string {
  return DEFS[id]?.label ?? 'Air';
}

/** A face is hidden when the neighbour fully blocks sight. */
export function hidesFace(selfId: number, neighborId: number): boolean {
  if (neighborId === 0) return false;
  if (OPAQUE[neighborId]) return true;
  return neighborId === selfId;
}

export function isReplaceable(id: number): boolean {
  return REPLACEABLE[id] === 1;
}

export function isSolid(id: number): boolean {
  return SOLID[id] === 1;
}

// ---- mining ---------------------------------------------------------------

const TOOL_SPEED = [1, 2, 4, 6, 8];

function toolIndex(tool: ToolInfo | null): number {
  return tool ? Math.min(4, Math.max(1, tool.tier)) : 0;
}

/** Seconds required to break `id` with `tool`. Infinity = unbreakable. */
export function miningTime(id: number, tool: ToolInfo | null): number {
  if (UNBREAKABLE[id]) return Infinity;
  const h = HARDNESS[id];
  if (h <= 0) return 0.02;
  const def = DEFS[id];
  const right = tool !== null && def.tool !== null && tool.kind === def.tool;
  const speed = right ? TOOL_SPEED[toolIndex(tool)] : 1;
  return Math.max(0.02, (h * 1.5) / speed);
}

/** Does the tool yield the block's drop? */
export function canHarvest(id: number, tool: ToolInfo | null): boolean {
  if (UNBREAKABLE[id]) return false;
  const need = TIER_REQ[id];
  if (need === 0) return true;
  const def = DEFS[id];
  if (!tool || !def.tool || tool.kind !== def.tool) return false;
  return tool.tier >= need;
}

export function rollDrops(id: number, tool: ToolInfo | null, rand: () => number): Array<{ item: string; count: number }> {
  if (!canHarvest(id, tool)) return [];
  if (id === B.WHEAT) {
    return [
      { item: 'wheat_item', count: 1 + Math.floor(rand() * 3) },
      { item: 'wheat_seed', count: 1 }
    ];
  }
  const d = DEFS[id].drop;
  if (!d || rand() > d.chance) return [];
  return [{ item: d.item, count: d.count }];
}

/** Blocks that open a UI when right-clicked instead of being placed onto. */
export function isInteractable(id: number): boolean {
  return id === B.CRAFTING_TABLE || id === B.FURNACE || id === B.CHEST;
}


