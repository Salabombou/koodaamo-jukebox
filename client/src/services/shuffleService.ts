export class SeededRandom {
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

export class ShuffleAlgorithm {
  /**
   * Deterministic shuffle algorithm using Fisher-Yates with a specific seed.
   * Both client and server should use this exact same algorithm.
   */
  static shuffle<T>(items: T[], seed: number): T[] {
    const result = [...items];
    const rng = new SeededRandom(seed);

    // Fisher-Yates shuffle algorithm
    for (let i = result.length - 1; i > 0; i--) {
      const j = rng.nextInt(0, i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }
}
