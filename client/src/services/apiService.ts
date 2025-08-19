import axios from "axios";

import { API_BASE_RETRY_DELAY_MS, API_MAX_RETRY_DELAY_MS, LS_KEY_AUTH_TOKEN, LS_KEY_IS_EMBEDDED } from "../constants";
//import type { QueueItem } from "../types/queue";
//import type { RoomInfo } from "../types/room";
import type { Track } from "../types/track";

const apiClient = axios.create();

// Request deduplication cache with proper typing
const pendingRequests = new Map<string, Promise<{ data: Map<string, Track> }>>();

apiClient.interceptors.request.use((config) => {
  if (localStorage.getItem(LS_KEY_IS_EMBEDDED) === "true") {
    config.baseURL = "/.proxy";
  }
  return config;
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(LS_KEY_AUTH_TOKEN);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (!config || config.__retryCount >= 3) {
    // Reduced from 5 retries
    return Promise.reject(error);
  }
  config.__retryCount = (config.__retryCount || 0) + 1;

  // Exponential backoff for retries
  const delay = Math.min(API_BASE_RETRY_DELAY_MS * Math.pow(2, config.__retryCount - 1), API_MAX_RETRY_DELAY_MS);
  await new Promise((resolve) => setTimeout(resolve, delay));

  return apiClient(config);
});

/**
 * Fetch track metadata for a set of track IDs (webpage_url_hashes) with request de‑duplication.
 * Parallel identical calls while the request is in flight share the same Promise.
 * @param trackIds Array of track identifier hashes to resolve.
 * @returns Axios promise resolving to a Map keyed by track id.
 */
export function getTracks(trackIds: string[]): Promise<{ data: Map<string, Track> }> {
  // Create a cache key for request deduplication
  const cacheKey = `getTracks:${trackIds.sort().join(",")}`;

  // Return pending request if one exists for the same track IDs
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey) as Promise<{ data: Map<string, Track> }>;
  }

  const request = apiClient
    .post<Map<string, Track>>(`/api/track`, {
      webpage_url_hashes: trackIds,
    })
    .finally(() => {
      // Clean up pending request when done
      pendingRequests.delete(cacheKey);
    });

  pendingRequests.set(cacheKey, request);
  return request;
}
