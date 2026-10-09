/** All crafting and smelting recipes. */

import { B } from '../world/blocks';

export interface RecipeResult {
  id: string;
  count: number;
}

export interface ShapedRecipe {
  type: 'shaped';
  name: string;
  /** Rows of equal length; '.' means empty. Each other char maps through `key`. */
  pattern: string[];
  key: Record<string, string>;
  result: RecipeResult;
}

export interface ShapelessRecipe {
  type: 'shapeless';
  name: string;
  /** Item ids or "#tags". */
  ingredients: string[];
  result: RecipeResult;
}

export interface SmeltRecipe {
  type: 'smelting';
  name: string;
  input: string;
  result: RecipeResult;
}

export type Recipe = ShapedRecipe | ShapelessRecipe | SmeltRecipe;

const bi = (id: number): string => 'b' + id;

const PLANKS = '#planks';
const STICK = 'stick';

export const RECIPES: Recipe[] = [];

function shaped(name: string, pattern: string[], key: Record<string, string>, result: RecipeResult): void {
  const width = Math.max(...pattern.map((r) => r.length));
  RECIPES.push({ type: 'shaped', name, pattern: pattern.map((r) => r.padEnd(width, '.')), key, result });
}

function shapeless(name: string, ingredients: string[], result: RecipeResult): void {
  RECIPES.push({ type: 'shapeless', name, ingredients, result });
}

// ---- wood & basics --------------------------------------------------------
shapeless('Oak Planks', [bi(B.OAK_LOG)], { id: bi(B.OAK_PLANKS), count: 4 });
shapeless('Birch Planks', [bi(B.BIRCH_LOG)], { id: bi(B.BIRCH_PLANKS), count: 4 });
shapeless('Spruce Planks', [bi(B.SPRUCE_LOG)], { id: bi(B.SPRUCE_PLANKS), count: 4 });
shapeless('Sticks', [PLANKS, PLANKS], { id: STICK, count: 4 });

shaped('Crafting Table', ['PPP', 'P.P'], { P: PLANKS }, { id: bi(B.CRAFTING_TABLE), count: 1 });
shaped('Chest', ['PPP', 'P.P', 'PPP'], { P: PLANKS }, { id: bi(B.CHEST), count: 1 });
shaped('Furnace', ['CCC', 'C.C', 'CCC'], { C: bi(B.COBBLE) }, { id: bi(B.FURNACE), count: 1 });
shaped('Torch', ['C', 'S'], { C: '#coal', S: STICK }, { id: bi(B.TORCH), count: 4 });
shaped('Ladder', ['S.S', 'SSS', 'S.S'], { S: STICK }, { id: bi(B.LADDER), count: 3 });
shaped('Fence', ['P.P', 'P.P'], { P: PLANKS }, { id: bi(B.FENCE), count: 3 });
shaped('Stone Bricks', ['CC', 'CC'], { C: bi(B.STONE) }, { id: bi(B.STONE_BRICKS), count: 4 });
shaped('Bricks', ['BB', 'BB'], { B: 'brick_item' }, { id: bi(B.BRICKS), count: 1 });
shaped('Clay Block', ['CC', 'CC'], { C: 'clay_ball' }, { id: bi(B.CLAY), count: 1 });
shaped('Bread', ['WWW'], { W: 'wheat_item' }, { id: 'bread', count: 1 });

// ---- tools ----------------------------------------------------------------
const TOOL_PATTERNS: Record<string, string[]> = {
  pickaxe: ['MMM', 'MSM', 'MSM'],
  axe: ['MM.', 'MS.', '.S.'],
  shovel: ['M', 'S', 'S'],
  sword: ['M', 'M', 'S'],
  hoe: ['MM.', '.S.', '.S.']
};

const TOOL_MATERIALS: Array<[string, string, string]> = [
  ['wood', 'Wooden', PLANKS],
  ['stone', 'Stone', bi(B.COBBLE)],
  ['iron', 'Iron', 'iron_ingot'],
  ['diamond', 'Diamond', 'diamond']
];

for (const [tier, label, material] of TOOL_MATERIALS) {
  for (const kind of Object.keys(TOOL_PATTERNS)) {
    const nice = kind.charAt(0).toUpperCase() + kind.slice(1);
    shaped(`${label} ${nice}`, TOOL_PATTERNS[kind], { M: material, S: STICK }, { id: `${tier}_${kind}`, count: 1 });
  }
}

// ---- compress / decompress ------------------------------------------------
const COMPRESS: Array<[string, number]> = [
  ['coal', B.COAL_BLOCK],
  ['iron_ingot', B.IRON_BLOCK],
  ['gold_ingot', B.GOLD_BLOCK],
  ['diamond', B.DIAMOND_BLOCK]
];
for (const [item, blockId] of COMPRESS) {
  shapeless(`Compress ${item}`, [item, item, item, item, item, item, item, item, item], {
    id: bi(blockId),
    count: 1
  });
  shapeless(`Decompress ${bi(blockId)}`, [bi(blockId)], { id: item, count: 9 });
}

// ---- smelting -------------------------------------------------------------
export const SMELTING = new Map<string, RecipeResult>();

function smelt(input: string, result: RecipeResult): void {
  SMELTING.set(input, result);
  RECIPES.push({ type: 'smelting', name: `Smelt ${input}`, input, result });
}

smelt('raw_iron', { id: 'iron_ingot', count: 1 });
smelt(bi(B.IRON_ORE), { id: 'iron_ingot', count: 1 });
smelt('raw_gold', { id: 'gold_ingot', count: 1 });
smelt(bi(B.GOLD_ORE), { id: 'gold_ingot', count: 1 });
smelt(bi(B.SAND), { id: bi(B.GLASS), count: 1 });
smelt(bi(B.CLAY), { id: bi(B.BRICKS), count: 1 });
smelt(bi(B.COBBLE), { id: bi(B.STONE), count: 1 });
smelt(bi(B.OAK_LOG), { id: 'charcoal', count: 1 });
smelt(bi(B.SPRUCE_LOG), { id: 'charcoal', count: 1 });
smelt('raw_beef', { id: 'cooked_beef', count: 1 });
smelt('raw_pork', { id: 'cooked_pork', count: 1 });

export function smeltResult(inputId: string): RecipeResult | undefined {
  return SMELTING.get(inputId);
}

export function recipeLabel(r: Recipe): string {
  return r.name;
}
