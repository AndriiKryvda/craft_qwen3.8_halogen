/** Save file shape and read/write helpers. */

import { getValue, putValue, deleteValue, storageAvailable } from './idb';
import type { ItemStack } from '../inventory/item';
import type { Settings } from '../config';

export const SAVE_KEY = 'main';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  seed: number;
  /** Day fraction 0..1. */
  time: number;
  mode: 'survival' | 'creative';
  spawn: [number, number, number];
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    health: number;
    hunger: number;
    air: number;
    selected: number;
  };
  inventory: Array<ItemStack | null>;
  /** chunkKey -> flat [index, blockId, index, blockId, ...] */
  edits: Record<string, number[]>;
  furnaces: Record<
    string,
    { input: ItemStack | null; fuel: ItemStack | null; output: ItemStack | null; burn: number; burnMax: number; cook: number }
  >;
  chests: Record<string, Array<ItemStack | null>>;
  mobs: Array<{ type: string; x: number; y: number; z: number; health: number }>;
  settings: Settings;
  savedAt: number;
}

export async function writeSave(data: SaveData): Promise<void> {
  await putValue(SAVE_KEY, data);
}

export async function readSave(): Promise<SaveData | null> {
  const data = await getValue<SaveData>(SAVE_KEY);
  if (!data || data.version !== SAVE_VERSION) return null;
  return data;
}

export async function clearSave(): Promise<void> {
  await deleteValue(SAVE_KEY);
}

export { storageAvailable };
