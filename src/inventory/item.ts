/** Item registry. Every block is also an item ("b<id>"); the rest live here. */

import { DEFS, BLOCK_COUNT, type ToolInfo, type ToolKind } from '../world/blocks';
import { TILE } from '../mesh/atlas';

export interface ItemStack {
  id: string;
  count: number;
}

export interface ItemDef {
  id: string;
  label: string;
  icon: number;
  stack: number;
  /** Block placed by this item, or -1. */
  block: number;
  tool: ToolInfo | null;
  /** Hunger points restored, 0 = not food. */
  food: number;
  /** Burn seconds as furnace fuel, 0 = not fuel. */
  fuel: number;
  tags: string[];
}

const MAP = new Map<string, ItemDef>();

function add(def: ItemDef): void {
  MAP.set(def.id, def);
}

// ---- block items ----------------------------------------------------------
for (const d of DEFS) {
  if (d.id === 0) continue;
  let fuel = 0;
  if (d.group === 'planks' || d.group === 'log') fuel = 15;
  if (d.id === 45) fuel = 15; // fence
  add({
    id: 'b' + d.id,
    label: d.label,
    icon: d.side,
    stack: 64,
    block: d.id,
    tool: null,
    food: 0,
    fuel,
    tags: d.group ? ['#' + d.group] : []
  });
}

// ---- material / food items ------------------------------------------------
const simple: Array<[string, string, number, number, number, string[]]> = [
  // id, label, icon tile name, stack, fuel, tags
  ['stick', 'Stick', TILE.stick, 64, 5, ['#stick']],
  ['coal', 'Coal', TILE.coal, 64, 80, ['#coal']],
  ['charcoal', 'Charcoal', TILE.charcoal, 64, 80, ['#coal']],
  ['raw_iron', 'Raw Iron', TILE.raw_iron, 64, 0, []],
  ['raw_gold', 'Raw Gold', TILE.raw_gold, 64, 0, []],
  ['iron_ingot', 'Iron Ingot', TILE.iron_ingot, 64, 0, []],
  ['gold_ingot', 'Gold Ingot', TILE.gold_ingot, 64, 0, []],
  ['diamond', 'Diamond', TILE.diamond, 64, 0, []],
  ['clay_ball', 'Clay Ball', TILE.clay_ball, 64, 0, []],
  ['brick_item', 'Brick', TILE.brick_item, 64, 0, []],
  ['flint', 'Flint', TILE.flint, 64, 0, []],
  ['leather', 'Leather', TILE.leather, 64, 0, []],
  ['bone', 'Bone', TILE.bone, 64, 0, []],
  ['string_item', 'String', TILE.string_item, 64, 0, []],
  ['wheat_item', 'Wheat', TILE.wheat_item, 64, 0, []],
  ['wheat_seed', 'Wheat Seeds', TILE.wheat_seed, 64, 0, []]
];
for (const [id, label, icon, stack, fuel, tags] of simple) {
  add({ id, label, icon, stack, block: -1, tool: null, food: 0, fuel, tags });
}

const foods: Array<[string, string, number, number]> = [
  ['apple', 'Apple', TILE.apple, 4],
  ['bread', 'Bread', TILE.bread, 5],
  ['raw_beef', 'Raw Beef', TILE.raw_beef, 2],
  ['cooked_beef', 'Steak', TILE.cooked_beef, 8],
  ['raw_pork', 'Raw Porkchop', TILE.raw_pork, 2],
  ['cooked_pork', 'Cooked Porkchop', TILE.cooked_pork, 8],
  ['spider_eye', 'Spider Eye', TILE.spider_eye, 2]
];
for (const [id, label, icon, food] of foods) {
  add({ id, label, icon, stack: 64, block: -1, tool: null, food, fuel: 0, tags: ['#food'] });
}

// ---- tools ----------------------------------------------------------------
const TIER_DEFS: Array<[string, string, number]> = [
  ['wood', 'Wooden', 1],
  ['stone', 'Stone', 2],
  ['iron', 'Iron', 3],
  ['diamond', 'Diamond', 4]
];
const KIND_LABEL: Record<ToolKind, string> = {
  pickaxe: 'Pickaxe',
  axe: 'Axe',
  shovel: 'Shovel',
  sword: 'Sword',
  hoe: 'Hoe'
};
for (const [tierName, tierLabel, tier] of TIER_DEFS) {
  for (const kind of Object.keys(KIND_LABEL) as ToolKind[]) {
    add({
      id: `${tierName}_${kind}`,
      label: `${tierLabel} ${KIND_LABEL[kind]}`,
      icon: TILE[`${tierName}_${kind}`],
      stack: 1,
      block: -1,
      tool: { kind, tier },
      food: 0,
      fuel: tierName === 'wood' ? 10 : 0,
      tags: ['#tool']
    });
  }
}

export const ITEMS: Map<string, ItemDef> = MAP;
export const ITEM_IDS: string[] = [...MAP.keys()];

export function getItem(id: string): ItemDef | undefined {
  return MAP.get(id);
}

export function itemLabel(id: string): string {
  return MAP.get(id)?.label ?? id;
}

export function itemIcon(id: string): number {
  return MAP.get(id)?.icon ?? 0;
}

export function maxStack(id: string): number {
  return MAP.get(id)?.stack ?? 64;
}

export function blockItemOf(blockId: number): string {
  return 'b' + blockId;
}

export function toolInfoOf(itemId: string | null): ToolInfo | null {
  if (!itemId) return null;
  return MAP.get(itemId)?.tool ?? null;
}

export function foodOf(itemId: string | null): number {
  if (!itemId) return 0;
  return MAP.get(itemId)?.food ?? 0;
}

export function fuelOf(itemId: string | null): number {
  if (!itemId) return 0;
  return MAP.get(itemId)?.fuel ?? 0;
}

/** Recipe ingredient spec: an item id, or a "#tag" matching any item carrying it. */
export function matchesSpec(itemId: string, spec: string): boolean {
  if (itemId === spec) return true;
  if (spec.startsWith('#')) return MAP.get(itemId)?.tags.includes(spec) ?? false;
  return false;
}

export function itemsWithSpec(spec: string): string[] {
  if (!spec.startsWith('#')) return [spec];
  const out: string[] = [];
  MAP.forEach((d) => {
    if (d.tags.includes(spec)) out.push(d.id);
  });
  return out;
}

void BLOCK_COUNT;
