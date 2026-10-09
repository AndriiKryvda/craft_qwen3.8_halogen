/**
 * Procedural texture atlas. Every block/item icon in the game is painted here at
 * runtime, so the repository contains no binary assets.
 *
 * Layout: 16 x 16 grid of 16 px tiles => 256 x 256 canvas.
 */

import { hash2 } from '../world/noise';

export const ATLAS_GRID = 16;
export const TILE_PX = 16;
export const ATLAS_PX = ATLAS_GRID * TILE_PX;
/** Half-texel inset so nearest filtering never bleeds into a neighbour tile. */
export const UV_EPS = 0.5 / ATLAS_GRID;

type Ctx = CanvasRenderingContext2D;

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/** amt in [-1,1]: darken or lighten a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp255(((n >> 16) & 255) * (1 + amt));
  const g = clamp255(((n >> 8) & 255) * (1 + amt));
  const b = clamp255((n & 255) * (1 + amt));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Pixel painter scoped to a single 16x16 tile. */
class P {
  constructor(private ctx: Ctx) {}
  px(x: number, y: number, c: string): void {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x | 0, y | 0, 1, 1);
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  }
  fill(c: string): void {
    this.rect(0, 0, TILE_PX, TILE_PX, c);
  }
  clear(): void {
    this.ctx.clearRect(0, 0, TILE_PX, TILE_PX);
  }
  /** Per-pixel brightness jitter. */
  noise(base: string, amt: number, seed: number): void {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        this.px(x, y, shade(base, (hash2(x, y, seed) - 0.5) * amt));
      }
    }
  }
  blob(cx: number, cy: number, r: number, c: string): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r + 0.4) this.px(cx + x, cy + y, c);
      }
    }
  }
  speckle(c: string, count: number, seed: number, size = 2): void {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(hash2(i, 7, seed) * (TILE_PX - size));
      const y = Math.floor(hash2(i, 13, seed + 5) * (TILE_PX - size));
      this.rect(x, y, size, size, c);
    }
  }
  /** Vertical stripes, used for bark. */
  stripes(c: string, step: number, seed: number): void {
    for (let x = 0; x < TILE_PX; x += step) {
      const w = 1 + Math.floor(hash2(x, 3, seed) * 2);
      this.rect(x, 0, w, TILE_PX, shade(c, (hash2(x, 9, seed) - 0.5) * 0.25));
    }
  }
}

type Painter = (p: P) => void;

const STONE = '#7f7f86';
const DIRT = '#79553a';
const GRASS = '#5aa03c';
const OAK = '#9c7f4e';
const BIRCH = '#c8c3ae';
const SPRUCE = '#6b4a2c';

/** Ordered: the index in this array *is* the tile id. */
const PAINT: Array<[string, Painter]> = [
  ['stone', (p) => { p.noise(STONE, 0.22, 1); p.speckle(shade(STONE, -0.16), 10, 2); }],
  ['cobblestone', (p) => {
    p.noise(STONE, 0.1, 3);
    for (let y = 0; y < 16; y += 5) for (let x = 0; x < 16; x += 5) {
      const o = Math.floor(hash2(x, y, 4) * 2);
      p.rect(x + o, y + o, 4, 4, shade(STONE, -0.18 + hash2(x, y, 6) * 0.3));
      p.rect(x + o, y + o, 4, 1, shade(STONE, 0.16));
    }
  }],
  ['dirt', (p) => { p.noise(DIRT, 0.3, 7); p.speckle(shade(DIRT, -0.25), 12, 8); }],
  ['grass_top', (p) => { p.noise(GRASS, 0.34, 11); p.speckle(shade(GRASS, 0.22), 14, 12); p.speckle(shade(GRASS, -0.28), 10, 13); }],
  ['grass_side', (p) => {
    p.noise(DIRT, 0.3, 7);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(hash2(x, 21, 14) * 3);
      for (let y = 0; y < h; y++) p.px(x, y, shade(GRASS, (hash2(x, y, 15) - 0.5) * 0.34));
    }
  }],
  ['oak_log_side', (p) => { p.noise(OAK, 0.16, 21); p.stripes(shade(OAK, -0.3), 3, 22); }],
  ['oak_log_top', (p) => {
    p.noise(shade(OAK, 0.12), 0.14, 23);
    for (let r = 6; r > 0; r -= 2) p.blob(8, 8, r, shade(OAK, -0.05 - (6 - r) * 0.05));
    p.blob(8, 8, 1, shade(OAK, -0.3));
  }],
  ['birch_log_side', (p) => {
    p.noise(BIRCH, 0.1, 24);
    for (let i = 0; i < 7; i++) {
      const y = Math.floor(hash2(i, 31, 25) * 15);
      const x = Math.floor(hash2(i, 37, 26) * 12);
      p.rect(x, y, 2 + Math.floor(hash2(i, 41, 27) * 3), 2, '#3a3630');
    }
  }],
  ['birch_log_top', (p) => { p.noise(shade(BIRCH, 0.05), 0.12, 28); p.blob(8, 8, 5, shade(BIRCH, -0.18)); p.blob(8, 8, 2, shade(BIRCH, -0.3)); }],
  ['spruce_log_side', (p) => { p.noise(SPRUCE, 0.2, 29); p.stripes(shade(SPRUCE, -0.32), 2, 30); }],
  ['spruce_log_top', (p) => { p.noise(shade(SPRUCE, 0.2), 0.16, 31); p.blob(8, 8, 5, shade(SPRUCE, 0.05)); p.blob(8, 8, 1, shade(SPRUCE, -0.3)); }],
  ['oak_leaves', (p) => { p.noise('#3f7a2e', 0.4, 33); p.speckle('#2c5c20', 26, 34); p.speckle('#57933f', 18, 35); }],
  ['birch_leaves', (p) => { p.noise('#59913c', 0.4, 36); p.speckle('#3d6b28', 26, 37); p.speckle('#74ac53', 16, 38); }],
  ['spruce_leaves', (p) => { p.noise('#2c5535', 0.36, 39); p.speckle('#1e3d26', 26, 40); p.speckle('#3d6f45', 16, 41); }],
  ['oak_planks', (p) => planks(p, OAK, 51)],
  ['birch_planks', (p) => planks(p, BIRCH, 52)],
  ['spruce_planks', (p) => planks(p, SPRUCE, 53)],
  ['sand', (p) => { p.noise('#dbd3a0', 0.16, 54); p.speckle('#c9bf87', 10, 55); }],
  ['gravel', (p) => { p.noise('#8a8177', 0.28, 56); p.speckle('#6a625a', 20, 57); p.speckle('#a49c92', 14, 58); }],
  ['water', (p) => {
    p.noise('#2f5fd0', 0.14, 59);
    for (let y = 1; y < 16; y += 4) for (let x = 0; x < 16; x++) {
      if (hash2(x, y, 60) > 0.45) p.px(x, y, '#4a7ce4');
    }
  }],
  ['glass', (p) => {
    p.rect(0, 0, 16, 16, 'rgba(210,235,245,0.10)');
    p.rect(0, 0, 16, 1, 'rgba(230,245,250,0.85)');
    p.rect(0, 15, 16, 1, 'rgba(190,215,225,0.85)');
    p.rect(0, 0, 1, 16, 'rgba(230,245,250,0.85)');
    p.rect(15, 0, 1, 16, 'rgba(190,215,225,0.85)');
    p.rect(3, 3, 1, 6, 'rgba(255,255,255,0.55)');
    p.rect(4, 2, 1, 3, 'rgba(255,255,255,0.4)');
  }],
  ['coal_ore', (p) => ore(p, '#232323', 71)],
  ['iron_ore', (p) => ore(p, '#c79a72', 72)],
  ['gold_ore', (p) => ore(p, '#f2ce3c', 73)],
  ['diamond_ore', (p) => ore(p, '#4fe6e2', 74)],
  ['bedrock', (p) => { p.noise('#4a4a52', 0.5, 75); p.speckle('#22222a', 22, 76); p.speckle('#6e6e78', 12, 77); }],
  ['torch', (p) => {
    p.clear();
    p.rect(7, 7, 2, 9, '#7a5a30');
    p.rect(7, 7, 1, 9, '#8f6b39');
    p.rect(6, 4, 4, 3, '#ffcf4a');
    p.rect(7, 3, 2, 4, '#ffe9a0');
    p.rect(7, 5, 2, 2, '#ff7b2a');
  }],
  ['crafting_table_top', (p) => { planks(p, OAK, 80); p.rect(0, 0, 16, 3, shade(OAK, -0.28)); p.rect(2, 4, 12, 10, shade(OAK, -0.12)); p.rect(3, 5, 4, 4, shade(OAK, 0.1)); p.rect(9, 5, 4, 4, shade(OAK, -0.3)); p.rect(3, 10, 4, 3, shade(OAK, -0.3)); p.rect(9, 10, 4, 3, shade(OAK, 0.05)); }],
  ['crafting_table_side', (p) => { planks(p, OAK, 81); p.rect(0, 0, 16, 4, shade(OAK, -0.25)); p.rect(2, 6, 5, 6, shade(OAK, -0.18)); p.rect(9, 6, 5, 6, shade(OAK, -0.18)); }],
  ['furnace_front', (p) => { p.noise(STONE, 0.16, 82); p.rect(3, 7, 10, 8, '#2b2b2b'); p.rect(4, 8, 8, 6, '#1a1a1a'); p.rect(3, 3, 10, 2, '#5c5c62'); }],
  ['furnace_front_lit', (p) => { p.noise(STONE, 0.16, 82); p.rect(3, 7, 10, 8, '#2b2b2b'); p.rect(4, 8, 8, 6, '#ff8a1e'); p.rect(5, 10, 6, 4, '#ffd24a'); p.rect(3, 3, 10, 2, '#5c5c62'); }],
  ['furnace_side', (p) => { p.noise(STONE, 0.18, 83); p.rect(0, 0, 16, 2, shade(STONE, 0.14)); }],
  ['chest_side', (p) => { planks(p, shade(OAK, -0.08), 84); p.rect(0, 0, 16, 4, shade(OAK, -0.3)); p.rect(0, 6, 16, 2, shade(OAK, -0.36)); }],
  ['chest_top', (p) => { planks(p, shade(OAK, -0.05), 85); p.rect(0, 0, 16, 2, shade(OAK, -0.34)); p.rect(0, 14, 16, 2, shade(OAK, -0.34)); }],
  ['bricks', (p) => {
    p.fill('#8a4436');
    for (let y = 0; y < 16; y += 4) {
      const off = ((y / 4) % 2) * 4;
      p.rect(0, y + 3, 16, 1, '#b9aca4');
      for (let x = -4; x < 16; x += 8) p.rect(x + off, y, 1, 3, '#b9aca4');
    }
  }],
  ['stone_bricks', (p) => {
    p.noise(STONE, 0.1, 87);
    for (let y = 0; y < 16; y += 8) for (let x = 0; x < 16; x += 8) {
      p.rect(x + 1, y + 1, 6, 6, shade(STONE, 0.08 + hash2(x, y, 88) * 0.16));
      p.rect(x, y, 8, 1, shade(STONE, -0.3));
      p.rect(x, y, 1, 8, shade(STONE, -0.3));
    }
  }],
  ['snow', (p) => { p.noise('#f3fbff', 0.08, 89); p.speckle('#dceaf3', 10, 90); }],
  ['ice', (p) => { p.noise('#93c7ef', 0.14, 91); for (let i = 0; i < 5; i++) { const x = Math.floor(hash2(i, 5, 92) * 14); p.rect(x, i * 3, 3, 1, '#c6e4fb'); } }],
  ['clay', (p) => { p.noise('#a3a9b5', 0.16, 93); p.speckle('#8d939f', 12, 94); }],
  ['cactus_side', (p) => { p.noise('#3f7f34', 0.2, 95); p.rect(0, 0, 1, 16, '#2b5c24'); p.rect(15, 0, 1, 16, '#2b5c24'); p.rect(7, 2, 1, 12, '#5c9c4c'); for (let y = 2; y < 16; y += 4) { p.px(4, y, '#dfe6c0'); p.px(11, y + 2, '#dfe6c0'); } }],
  ['cactus_top', (p) => { p.clear(); p.rect(2, 2, 12, 12, '#4c8c3c'); p.rect(6, 6, 4, 4, '#69ad56'); }],
  ['tall_grass', (p) => {
    p.clear();
    for (let i = 0; i < 7; i++) {
      const x = 1 + i * 2;
      const h = 6 + Math.floor(hash2(i, 61, 97) * 8);
      for (let y = 0; y < h; y++) p.px(x + (y > h - 3 ? 1 : 0), 15 - y, shade('#4f8f36', (hash2(x, y, 98) - 0.5) * 0.4));
    }
  }],
  ['flower_red', (p) => flower(p, '#d43b3b')],
  ['flower_yellow', (p) => flower(p, '#e8cf3a')],
  ['sapling', (p) => {
    p.clear();
    p.rect(7, 9, 2, 7, '#6b4a2c');
    p.blob(8, 6, 4, '#3f7f2e');
    p.blob(6, 5, 2, '#54a03c');
    p.blob(10, 7, 2, '#2f6624');
  }],
  ['farmland', (p) => { p.noise('#6b4a30', 0.26, 103); for (let y = 1; y < 16; y += 4) p.rect(0, y, 16, 1, '#54381f'); p.rect(0, 0, 16, 1, '#7d5a3c'); }],
  ['wheat_0', (p) => crop(p, 1, 104)],
  ['wheat_1', (p) => crop(p, 2, 105)],
  ['wheat_2', (p) => crop(p, 3, 106)],
  ['wheat_3', (p) => crop(p, 4, 107)],
  ['dead_bush', (p) => {
    p.clear();
    p.rect(7, 8, 2, 8, '#7a5a30');
    p.rect(4, 5, 1, 5, '#8a6a3c');
    p.rect(11, 6, 1, 4, '#8a6a3c');
    p.rect(5, 4, 3, 1, '#8a6a3c');
    p.rect(9, 6, 3, 1, '#8a6a3c');
  }],
  ['iron_block', (p) => metal(p, '#d8d8d8', 111)],
  ['gold_block', (p) => metal(p, '#f6ce3f', 112)],
  ['diamond_block', (p) => metal(p, '#4fe6e2', 113)],
  ['coal_block', (p) => metal(p, '#24242a', 114)],
  ['ladder', (p) => { p.clear(); p.rect(2, 0, 2, 16, '#8a6a3c'); p.rect(12, 0, 2, 16, '#8a6a3c'); for (let y = 2; y < 16; y += 5) p.rect(2, y, 12, 2, '#a3814c'); }],
  ['fence', (p) => { p.clear(); p.rect(5, 0, 6, 16, '#9c7f4e'); p.rect(0, 3, 16, 3, '#8a6f45'); p.rect(0, 10, 16, 3, '#8a6f45'); p.rect(5, 0, 6, 1, '#b39561'); }],
  ['fence_post', (p) => { p.clear(); p.rect(5, 0, 6, 16, '#9c7f4e'); p.rect(5, 0, 1, 16, '#b39561'); p.rect(10, 0, 1, 16, '#7a6238'); }],

  // ---- items -------------------------------------------------------------
  ['stick', (p) => { p.clear(); for (let i = 0; i < 10; i++) p.rect(4 + i, 12 - i, 2, 2, i % 2 ? '#8a6a3c' : '#9c7f4e'); }],
  ['coal', (p) => { p.clear(); p.blob(8, 8, 5, '#26262b'); p.blob(6, 6, 2, '#3d3d45'); p.blob(10, 10, 1, '#141418'); }],
  ['charcoal', (p) => { p.clear(); p.blob(8, 8, 5, '#2f2620'); p.blob(6, 6, 2, '#4a3c30'); }],
  ['raw_iron', (p) => { p.clear(); p.blob(8, 8, 5, '#c79a72'); p.blob(6, 6, 2, '#e0b892'); p.blob(10, 10, 2, '#a97c56'); }],
  ['raw_gold', (p) => { p.clear(); p.blob(8, 8, 5, '#f2ce3c'); p.blob(6, 6, 2, '#fff0a0'); p.blob(10, 10, 2, '#c9a41c'); }],
  ['iron_ingot', (p) => ingot(p, '#d9d9d9', '#9d9d9d')],
  ['gold_ingot', (p) => ingot(p, '#fbd43c', '#c99f10')],
  ['diamond', (p) => { p.clear(); p.rect(6, 3, 4, 2, '#7ff2ee'); p.rect(4, 5, 8, 4, '#4fe6e2'); p.rect(6, 9, 4, 3, '#2fbdb9'); p.rect(6, 5, 2, 2, '#d6fffe'); }],
  ['apple', (p) => { p.clear(); p.blob(8, 9, 5, '#c8292b'); p.blob(6, 7, 2, '#e8554f'); p.rect(8, 2, 1, 3, '#6b4a2c'); p.rect(9, 3, 3, 2, '#3f7f2e'); }],
  ['wheat_item', (p) => { p.clear(); p.rect(7, 6, 1, 10, '#b39a4c'); for (let y = 1; y < 9; y += 2) { p.rect(5, y, 2, 2, '#e0c877'); p.rect(9, y + 1, 2, 2, '#e0c877'); } }],
  ['wheat_seed', (p) => { p.clear(); p.blob(6, 9, 2, '#c8b469'); p.blob(10, 7, 2, '#b39a4c'); p.blob(9, 11, 1, '#dccf8f'); }],
  ['bread', (p) => { p.clear(); p.rect(3, 5, 10, 7, '#b3762c'); p.rect(3, 5, 10, 2, '#d69a4a'); p.rect(4, 8, 2, 1, '#8a5620'); p.rect(8, 8, 2, 1, '#8a5620'); p.rect(11, 8, 1, 1, '#8a5620'); }],
  ['raw_beef', (p) => { p.clear(); p.blob(8, 8, 5, '#c0463f'); p.blob(6, 7, 2, '#e0726a'); p.rect(4, 10, 4, 2, '#e8cfc8'); }],
  ['cooked_beef', (p) => { p.clear(); p.blob(8, 8, 5, '#8a4a26'); p.blob(6, 7, 2, '#b06a3a'); p.rect(4, 10, 4, 2, '#d8b58f'); }],
  ['raw_pork', (p) => { p.clear(); p.blob(8, 8, 5, '#e29a9a'); p.blob(6, 7, 2, '#f4c0c0'); }],
  ['cooked_pork', (p) => { p.clear(); p.blob(8, 8, 5, '#b4713c'); p.blob(6, 7, 2, '#d99a5e'); }],
  ['leather', (p) => { p.clear(); p.rect(4, 3, 8, 10, '#a3743c'); p.rect(5, 4, 6, 8, '#c08c4c'); p.rect(4, 3, 2, 2, '#8a5f2e'); p.rect(10, 11, 2, 2, '#8a5f2e'); }],
  ['clay_ball', (p) => { p.clear(); p.blob(8, 8, 4, '#a3a9b5'); p.blob(6, 6, 2, '#c3c9d5'); }],
  ['brick_item', (p) => { p.clear(); p.rect(3, 6, 10, 5, '#8a4436'); p.rect(3, 6, 10, 1, '#a85a48'); }],
  ['flint', (p) => { p.clear(); p.blob(8, 8, 4, '#3a3a44'); p.blob(6, 7, 2, '#5a5a68'); p.rect(9, 9, 3, 1, '#22222a'); }],
  ['bone', (p) => { p.clear(); p.rect(6, 3, 3, 10, '#eae6d8'); p.rect(4, 2, 3, 3, '#f6f3ea'); p.rect(8, 11, 3, 3, '#f6f3ea'); }],
  ['string_item', (p) => { p.clear(); for (let i = 0; i < 12; i++) p.px(4 + (i % 8), 3 + i, '#d8d8d8'); }],
  ['spider_eye', (p) => { p.clear(); p.blob(8, 8, 4, '#7a2f2f'); p.blob(8, 8, 2, '#c94a3a'); p.blob(7, 7, 1, '#f0a090'); }]
];

function planks(p: P, base: string, seed: number): void {
  p.noise(base, 0.12, seed);
  for (let y = 0; y < 16; y += 4) {
    p.rect(0, y + 3, 16, 1, shade(base, -0.34));
    const j = Math.floor(hash2(y, 5, seed + 1) * 14) + 1;
    p.rect(j, y, 1, 3, shade(base, -0.26));
  }
}

function ore(p: P, color: string, seed: number): void {
  p.noise(STONE, 0.2, 1);
  p.speckle(shade(STONE, -0.16), 8, 2);
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(hash2(i, 3, seed) * 11);
    const y = 2 + Math.floor(hash2(i, 7, seed + 1) * 11);
    p.blob(x, y, 1 + Math.floor(hash2(i, 11, seed + 2)), color);
    p.px(x - 1, y - 1, shade(color, 0.3));
  }
}

function flower(p: P, color: string): void {
  p.clear();
  p.rect(7, 7, 2, 9, '#3f7f2e');
  p.rect(5, 10, 2, 1, '#4f9f3c');
  p.rect(9, 12, 2, 1, '#4f9f3c');
  p.blob(8, 5, 3, color);
  p.blob(8, 5, 1, shade(color, 0.45));
  p.px(5, 3, shade(color, -0.2));
  p.px(10, 3, shade(color, -0.2));
  p.px(5, 7, shade(color, -0.2));
  p.px(10, 7, shade(color, -0.2));
}

function crop(p: P, stage: number, seed: number): void {
  p.clear();
  const h = 3 + stage * 3;
  const head = stage >= 3 ? '#dcc25c' : stage === 2 ? '#9cc25c' : '#5aa03c';
  for (let i = 0; i < 4; i++) {
    const x = 2 + i * 4;
    for (let y = 0; y < h; y++) p.px(x, 15 - y, shade(head, (hash2(x, y, seed) - 0.5) * 0.25));
    if (stage >= 2) p.rect(x - 1, 15 - h, 3, 2, head);
  }
}

function metal(p: P, color: string, seed: number): void {
  p.noise(color, 0.14, seed);
  p.rect(0, 0, 16, 1, shade(color, 0.3));
  p.rect(0, 15, 16, 1, shade(color, -0.35));
  p.rect(0, 0, 1, 16, shade(color, 0.2));
  p.rect(15, 0, 1, 16, shade(color, -0.3));
  p.speckle(shade(color, -0.2), 6, seed + 1);
}

function ingot(p: P, top: string, side: string): void {
  p.clear();
  p.rect(3, 6, 10, 5, side);
  p.rect(4, 5, 8, 4, top);
  p.rect(4, 5, 8, 1, shade(top, 0.3));
  p.rect(3, 10, 10, 1, shade(side, -0.3));
}

/** Tool head silhouettes, tinted by material colour. */
const TOOL_SHAPES: Record<string, Array<[number, number, number, number]>> = {
  pickaxe: [[2, 3, 12, 3], [3, 5, 3, 2], [10, 5, 3, 2]],
  axe: [[4, 3, 7, 3], [4, 5, 5, 4], [9, 4, 3, 5]],
  shovel: [[6, 2, 5, 5], [6, 6, 5, 1]],
  sword: [[6, 2, 4, 8], [4, 9, 8, 2], [6, 11, 4, 2]],
  hoe: [[4, 3, 8, 3], [10, 5, 2, 4]]
};

const TOOL_KINDS = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
const TOOL_TIERS: Array<[string, string]> = [
  ['wood', '#9c7f4e'],
  ['stone', '#8a8a90'],
  ['iron', '#d9d9d9'],
  ['diamond', '#4fe6e2']
];

for (const [tier, color] of TOOL_TIERS) {
  for (const kind of TOOL_KINDS) {
    PAINT.push([`${tier}_${kind}`, (p) => {
      p.clear();
      for (let i = 0; i < 8; i++) p.rect(6 + i, 14 - i, 2, 2, i % 2 ? '#8a6a3c' : '#9c7f4e');
      for (const [x, y, w, h] of TOOL_SHAPES[kind]) {
        p.rect(x, y, w, h, color);
        p.rect(x, y, w, 1, shade(color, 0.3));
        p.rect(x, y + h - 1, w, 1, shade(color, -0.35));
      }
    }]);
  }
}

export const TILE: Record<string, number> = {};
PAINT.forEach(([name], i) => {
  TILE[name] = i;
});

export const TILE_COUNT = PAINT.length;

let cachedCanvas: HTMLCanvasElement | null = null;

/** Paint (and memoise) the atlas canvas. */
export function buildAtlasCanvas(): HTMLCanvasElement {
  if (cachedCanvas) return cachedCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX);
  for (let i = 0; i < PAINT.length; i++) {
    const col = i % ATLAS_GRID;
    const row = Math.floor(i / ATLAS_GRID);
    ctx.save();
    ctx.translate(col * TILE_PX, row * TILE_PX);
    ctx.beginPath();
    ctx.rect(0, 0, TILE_PX, TILE_PX);
    ctx.clip();
    PAINT[i][1](new P(ctx));
    ctx.restore();
  }
  cachedCanvas = canvas;
  return canvas;
}

let cachedUrl: string | null = null;
/** Data URL of the atlas, used for CSS sprite icons in the UI. */
export function atlasDataUrl(): string {
  if (!cachedUrl) cachedUrl = buildAtlasCanvas().toDataURL();
  return cachedUrl;
}

/** CSS background-position percentages that reveal `tile` in a sprite sheet. */
export function tileCssPosition(tile: number): { x: string; y: string } {
  const col = tile % ATLAS_GRID;
  const row = Math.floor(tile / ATLAS_GRID);
  const pct = (n: number): string => ((n / (ATLAS_GRID - 1)) * 100).toFixed(4) + '%';
  return { x: pct(col), y: pct(row) };
}



