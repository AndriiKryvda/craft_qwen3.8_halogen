/** FR-5: shaped/shapeless matching, tags and the recipe book helpers. */

import { describe, expect, it } from 'vitest';
import { allRecipes, isCraftable, matchRecipe, recipeCells } from '../src/inventory/crafting';
import { RECIPES, recipeLabel } from '../src/inventory/recipes';
import { B } from '../src/world/blocks';
import type { ItemStack } from '../src/inventory/item';

const bi = (id: number): string => 'b' + id;
const grid = (size: number): Array<ItemStack | null> => new Array(size * size).fill(null);
const put = (g: Array<ItemStack | null>, i: number, id: string): void => {
  g[i] = { id, count: 1 };
};
const byName = (name: string) => RECIPES.find((r) => r.name === name)!;

describe('crafting', () => {
  it('ships at least 25 recipes (FR-5.5)', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(25);
    expect(allRecipes().length).toBe(RECIPES.length);
  });

  it('matches a shapeless recipe in the 2x2 grid', () => {
    const g = grid(2);
    put(g, 0, bi(B.OAK_LOG));
    const m = matchRecipe(g, 2);
    expect(m).not.toBeNull();
    expect(m!.recipe.result.id).toBe(bi(B.OAK_PLANKS));
    expect(m!.recipe.result.count).toBe(4);
    expect(m!.consume).toEqual([0]);
  });

  it('accepts tag ingredients (any planks make sticks)', () => {
    const g = grid(2);
    put(g, 0, bi(B.OAK_PLANKS));
    put(g, 1, bi(B.BIRCH_PLANKS));
    const m = matchRecipe(g, 2);
    expect(m!.recipe.result.id).toBe('stick');
    expect(m!.consume.length).toBe(2);
  });

  it('trims empty rows and columns when matching shaped recipes', () => {
    const g = grid(3);
    put(g, 3, bi(B.OAK_PLANKS));
    put(g, 4, bi(B.OAK_PLANKS));
    put(g, 5, bi(B.OAK_PLANKS));
    put(g, 6, bi(B.OAK_PLANKS));
    put(g, 8, bi(B.OAK_PLANKS));
    const m = matchRecipe(g, 3);
    expect(m!.recipe.name).toBe('Crafting Table');
    expect(m!.consume.length).toBe(5);
  });

  it('requires the exact shape', () => {
    const g = grid(3);
    put(g, 0, bi(B.OAK_PLANKS));
    put(g, 1, bi(B.OAK_PLANKS));
    put(g, 3, bi(B.OAK_PLANKS));
    expect(matchRecipe(g, 3)).toBeNull();
  });

  it('matches the furnace ring and the torch column', () => {
    const g = grid(3);
    for (const i of [0, 1, 2, 3, 5, 6, 7, 8]) put(g, i, bi(B.COBBLE));
    expect(matchRecipe(g, 3)!.recipe.result.id).toBe(bi(B.FURNACE));

    const t = grid(2);
    put(t, 0, 'coal');
    put(t, 2, 'stick');
    const torch = matchRecipe(t, 2);
    expect(torch!.recipe.result.id).toBe(bi(B.TORCH));
    expect(torch!.recipe.result.count).toBe(4);
  });

  it('returns nothing for an empty grid', () => {
    expect(matchRecipe(grid(3), 3)).toBeNull();
  });

  it('knows what the player can craft (FR-5.4)', () => {
    expect(isCraftable(byName('Furnace'), { [bi(B.COBBLE)]: 8 })).toBe(true);
    expect(isCraftable(byName('Furnace'), { [bi(B.COBBLE)]: 7 })).toBe(false);
    expect(isCraftable(byName('Sticks'), { [bi(B.SPRUCE_PLANKS)]: 2 })).toBe(true);
  });

  it('maps a recipe back onto grid cells for the book', () => {
    const cells = recipeCells(byName('Furnace'), 3);
    expect(cells.length).toBe(9);
    expect(cells.filter((c) => c !== null).length).toBe(8);
    expect(cells[4]).toBeNull();
  });

  it('labels every recipe', () => {
    for (const r of RECIPES) expect(recipeLabel(r).length).toBeGreaterThan(0);
  });
});
