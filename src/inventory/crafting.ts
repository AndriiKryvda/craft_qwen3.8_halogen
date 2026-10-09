/** Grid → recipe matching for the 2x2 inventory grid and 3x3 crafting table. */

import type { ItemStack } from './item';
import { matchesSpec, itemsWithSpec } from './item';
import { RECIPES, type Recipe, type ShapedRecipe, type ShapelessRecipe } from './recipes';

export interface CraftMatch {
  recipe: Recipe;
  /** Grid slot indices to consume (one each). */
  consume: number[];
}

type Grid = Array<ItemStack | null>;

function gridIds(grid: Grid, size: number): Array<string | null> {
  const out: Array<string | null> = [];
  for (let i = 0; i < size * size; i++) {
    const s = grid[i];
    out.push(s && s.count > 0 ? s.id : null);
  }
  return out;
}

interface Bounds {
  minR: number;
  maxR: number;
  minC: number;
  maxC: number;
  empty: boolean;
}

function bounds(ids: Array<string | null>, size: number): Bounds {
  let minR = size, maxR = -1, minC = size, maxC = -1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (ids[r * size + c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  return { minR, maxR, minC, maxC, empty: maxR < 0 };
}

function matchShaped(recipe: ShapedRecipe, ids: Array<string | null>, size: number): boolean {
  const b = bounds(ids, size);
  if (b.empty) return false;
  const rows = b.maxR - b.minR + 1;
  const cols = b.maxC - b.minC + 1;
  if (rows !== recipe.pattern.length || cols !== recipe.pattern[0].length) return false;
  for (let r = 0; r < rows; r++) {
    const line = recipe.pattern[r];
    for (let c = 0; c < cols; c++) {
      const ch = line[c];
      const spec = ch === '.' ? null : recipe.key[ch];
      const got = ids[(b.minR + r) * size + (b.minC + c)];
      if (spec === undefined || spec === null) {
        if (got !== null) return false;
      } else {
        if (got === null || !matchesSpec(got, spec)) return false;
      }
    }
  }
  return true;
}

function matchShapeless(recipe: ShapelessRecipe, ids: Array<string | null>): boolean {
  const filled = ids.filter((x): x is string => x !== null);
  if (filled.length !== recipe.ingredients.length) return false;
  const pool = [...recipe.ingredients];
  for (const id of filled) {
    const idx = pool.findIndex((spec) => matchesSpec(id, spec));
    if (idx < 0) return false;
    pool.splice(idx, 1);
  }
  return pool.length === 0;
}

/** Find the recipe that fits the current grid contents. */
export function matchRecipe(grid: Grid, size: number): CraftMatch | null {
  const ids = gridIds(grid, size);
  if (bounds(ids, size).empty) return null;
  const consume: number[] = [];
  for (let i = 0; i < ids.length; i++) if (ids[i]) consume.push(i);
  for (const recipe of RECIPES) {
    if (recipe.type === 'shaped' && matchShaped(recipe, ids, size)) return { recipe, consume };
    if (recipe.type === 'shapeless' && matchShapeless(recipe, ids)) return { recipe, consume };
  }
  return null;
}

/** Can this recipe be produced with the items currently in `have`? */
export function isCraftable(recipe: Recipe, have: Record<string, number>): boolean {
  if (recipe.type === 'smelting') return (have[recipe.input] ?? 0) >= 1;
  const specs: string[] = [];
  if (recipe.type === 'shaped') {
    for (const line of recipe.pattern) {
      for (const ch of line) {
        if (ch === '.') continue;
        const spec = recipe.key[ch];
        if (spec) specs.push(spec);
      }
    }
  } else {
    specs.push(...recipe.ingredients);
  }
  const need = new Map<string, number>();
  for (const s of specs) need.set(s, (need.get(s) ?? 0) + 1);
  const avail: Record<string, number> = { ...have };
  for (const [spec, count] of need) {
    const options = itemsWithSpec(spec);
    let best = '';
    let bestN = -1;
    for (const o of options) {
      const n = avail[o] ?? 0;
      if (n > bestN) {
        bestN = n;
        best = o;
      }
    }
    if (bestN < count) return false;
    avail[best] = (avail[best] ?? 0) - count;
  }
  return true;
}

/** Item ids a recipe wants in each grid cell (for recipe-book auto-fill). */
export function recipeCells(recipe: Recipe, size: number): Array<string | null> {
  const out: Array<string | null> = new Array(size * size).fill(null);
  if (recipe.type === 'shaped') {
    for (let r = 0; r < recipe.pattern.length; r++) {
      for (let c = 0; c < recipe.pattern[r].length; c++) {
        const ch = recipe.pattern[r][c];
        if (ch === '.') continue;
        const spec = recipe.key[ch];
        if (!spec) continue;
        const options = itemsWithSpec(spec);
        out[r * size + c] = options[0] ?? null;
      }
    }
    return out;
  }
  if (recipe.type === 'shapeless') {
    for (let i = 0; i < recipe.ingredients.length && i < out.length; i++) {
      const options = itemsWithSpec(recipe.ingredients[i]);
      out[i] = options[0] ?? null;
    }
  }
  return out;
}

export function allRecipes(): Recipe[] {
  return RECIPES;
}
