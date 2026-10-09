import { generateChunk } from '../world/worldgen';

interface GenRequest {
  id: number;
  cx: number;
  cz: number;
  seed: number;
}

self.onmessage = (e: MessageEvent<GenRequest>): void => {
  const { id, cx, cz, seed } = e.data;
  const r = generateChunk(cx, cz, seed);
  const target = self as unknown as Worker;
  target.postMessage(
    { id, cx, cz, blocks: r.blocks, meta: r.meta, height: r.height },
    [r.blocks.buffer, r.meta.buffer, r.height.buffer]
  );
};
