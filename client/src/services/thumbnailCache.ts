// Shared thumbnail URL caches for the entire app
// Use these to persist thumbnail URLs across components and mounts

export const thumbnailUrlCacheLow = new Map<string, string>();
export const thumbnailUrlCacheHigh = new Map<string, string>();
