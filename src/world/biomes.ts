/** Biome selection and per-column terrain sampling (pure + deterministic). */

import { fbm2, ridged } from './noise';
import { SEA_LEVEL } from './constants';

export const BIOME = {
  OCEAN: 0,
  PLAINS: 1,
  FOREST: 2,
  TAIGA: 3,
  DESERT: 4,
  MOUNTAINS: 5,
  BEACH: 6
} as const;

export type BiomeId = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const BIOME_NAMES = ['Ocean', 'Plains', 'Forest', 'Taiga', 'Desert', 'Mountains', 'Beach'];

export interface ColumnInfo {
  /** Surface Y (before water fill). */
  h: number;
  biome: BiomeId;
  /** 0..1 river influence. */
  river: number;
}

/**
 * Deterministic terrain column sample. Everything that depends on terrain shape
 * (worldgen, spawn search, debug overlay, mob spawning) funnels through here so
 * the answers always agree.
 */
export function columnInfo(wx: number, wz: number, seed: number): ColumnInfo {
  const continent = fbm2(wx * 0.0018, wz * 0.0018, seed + 1, 3);
  const temp = fbm2(wx * 0.0026, wz * 0.0026, seed + 7, 3);
  const hum = fbm2(wx * 0.0033, wz * 0.0033, seed + 13, 3);
  const relief = fbm2(wx * 0.012, wz * 0.012, seed + 19, 4);
  const rough = fbm2(wx * 0.005, wz * 0.005, seed + 23, 3);

  // Mountainous where the very low frequency noise is high and the continent is high.
  const mountainAmt = Math.max(0, rough - 0.55) * 2.4;

  // River: thin triangular band following a warped noise line.
  const rn = fbm2(wx * 0.0032, wz * 0.0032, seed + 31, 2);
  const river = Math.max(0, 1 - Math.abs(rn - 0.5) * 13);

  let h = 33 + (continent - 0.5) * 26 + (relief - 0.5) * 9;
  h += mountainAmt * mountainAmt * 26;
  h -= river * river * 11;

  if (h < 4) h = 4;
  if (h > 60) h = 60;
  h = Math.round(h);

  let biome: BiomeId;
  if (h < SEA_LEVEL - 1) biome = BIOME.OCEAN;
  else if (h <= SEA_LEVEL + 1) biome = BIOME.BEACH;
  else if (mountainAmt > 0.55 || h > 47) biome = BIOME.MOUNTAINS;
  else if (temp > 0.6 && hum < 0.46) biome = BIOME.DESERT;
  else if (temp < 0.36) biome = BIOME.TAIGA;
  else if (hum > 0.52) biome = BIOME.FOREST;
  else biome = BIOME.PLAINS;

  return { h, biome, river };
}

export function biomeAt(wx: number, wz: number, seed: number): BiomeId {
  return columnInfo(wx, wz, seed).biome;
}

export function biomeName(id: number): string {
  return BIOME_NAMES[id] ?? '?';
}
