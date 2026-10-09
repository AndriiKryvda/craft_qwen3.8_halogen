/** Shared fixtures for the logic test suites (no DOM, no WebGL). */

import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { CHUNK_SIZE, CHUNK_VOL, cidx } from '../src/world/constants';
import { B } from '../src/world/blocks';

/** A world of `radius +` generated chunks with everything set to `id`. */
export function solidWorld(id: number, radius = 1): World {
  const world = new World(1);
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      const chunk = new Chunk(cx, cz);
      chunk.blocks.fill(id);
      chunk.generated = true;
      chunk.recalcAllHeights();
      world.attach(chunk);
    }
  }
  return world;
}

/** Stone ground filling y = 0..topInclusive, air above. */
export function groundWorld(topInclusive = 9, radius = 1): World {
  const world = new World(1);
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      const chunk = new Chunk(cx, cz);
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let y = 0; y <= topInclusive; y++) chunk.blocks[cidx(x, y, z)] = B.STONE;
        }
      }
      chunk.generated = true;
      chunk.recalcAllHeights();
      world.attach(chunk);
    }
  }
  return world;
}

/** Volume size guard used by a couple of tests. */
export const VOLUME = CHUNK_VOL;
