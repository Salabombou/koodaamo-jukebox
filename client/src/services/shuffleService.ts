class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 2463534242; // avoid zero state
  }

  /**
   * Xorshift32 for deterministic random numbers
   */
  next(): number {
    let x = this.state;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    this.state = x >>> 0; // keep unsigned
    return this.state / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }
}

export function shuffle<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  const random = new SeededRandom(seed);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = random.nextInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
