// Pseudo-random shuffle (Fisher-Yates) for QueueItem[]
import type { QueueItem } from "../types/queue";

// "Simple" seedable RNG (Mulberry32)
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleQueue(
  queueItems: QueueItem[],
  seed: number,
): QueueItem[] {
  const rng = mulberry32(seed);
  const arr = queueItems.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
