/**
 * Interval (in milliseconds) for pinging the RoomHub.
 * @constant
 */
export const ROOM_HUB_PING_INTERVAL_MS = 60_000 as const; // 1 minute

/**
 * Number of samples to take when synchronizing time.
 * @constant
 */
export const TIME_SYNC_SAMPLES = 5 as const;

/**
 * Delay (in milliseconds) between time sync samples.
 * @constant
 */
export const TIME_SYNC_SAMPLE_DELAY_MS = 25 as const;

/**
 * Interval (in milliseconds) for synchronizing time with the server.
 * @constant
 */
export const TIME_SYNC_INTERVAL = 3600_000 as const;

/**
 * Maximum delay (in milliseconds) for API retry backoff.
 * @constant
 */
export const API_MAX_RETRY_DELAY_MS = 5000 as const;

/**
 * Initial base delay (in milliseconds) for API retry backoff.
 * @constant
 */
export const API_BASE_RETRY_DELAY_MS = 1000 as const;

/**
 * Fallback duration (in seconds) for HLS manifest errors.
 * @constant
 */
export const HLS_MANIFEST_ERROR_DURATION_FALLBACK = 0 as const;
