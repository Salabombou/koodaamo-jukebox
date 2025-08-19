namespace KoodaamoJukebox.Api.Utilities
{
    /// <summary>
    /// Seeded random number generator using Linear Congruential Generator (LCG)
    /// to ensure identical results between C# and JavaScript implementations
    /// </summary>
    public class SeededRandom
    {
        private uint state;

        public SeededRandom(int seed)
        {
            state = (uint)seed;
            if (state == 0) state = 2463534242; // avoid zero state
        }

        /// <summary>
        /// Xorshift32 for deterministic random numbers
        /// </summary>
        public double Next()
        {
            uint x = state;
            x ^= (x << 13);
            x ^= (x >> 17);
            x ^= (x << 5);
            state = x;
            return state / 4294967296.0;
        }

        /// <summary>
        /// Generate a random integer between min (inclusive) and max (exclusive)
        /// </summary>
        public int NextInt(int min, int max)
        {
            return (int)Math.Floor(Next() * (max - min)) + min;
        }
    }

    public static class ShuffleAlgorithm
    {
        /// <summary>
        /// Deterministic shuffle algorithm using Fisher-Yates with a specific seed.
        /// Both client and server should use this exact same algorithm.
        /// </summary>
        public static List<T> Shuffle<T>(IList<T> items, int seed)
        {
            var result = new List<T>(items);
            var rng = new SeededRandom(seed);
            
            // Fisher-Yates shuffle algorithm
            for (int i = result.Count - 1; i > 0; i--)
            {
                int j = rng.NextInt(0, i + 1);
                (result[i], result[j]) = (result[j], result[i]);
            }
            
            return result;
        }

        /// <summary>
        /// Generate a random seed for shuffling
        /// </summary>
        public static int GenerateSeed()
        {
            return new Random().Next(int.MinValue, int.MaxValue);
        }
    }
}
