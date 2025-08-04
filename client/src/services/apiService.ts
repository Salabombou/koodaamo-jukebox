import axios from "axios";
//import type { QueueItem } from "../types/queue";
//import type { RoomInfo } from "../types/room";
import { Track } from "../types/track";

const apiClient = axios.create();

// Request deduplication cache with proper typing
const pendingRequests = new Map<string, Promise<any>>();

apiClient.interceptors.request.use((config) => {
  if (localStorage.getItem("is_embedded") === "true") {
    config.baseURL = "/.proxy";
  }
  return config;
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (!config || config.__retryCount >= 3) { // Reduced from 5 retries
    return Promise.reject(error);
  }
  config.__retryCount = (config.__retryCount || 0) + 1;
  
  // Exponential backoff for retries
  const delay = Math.min(1000 * Math.pow(2, config.__retryCount - 1), 5000);
  await new Promise(resolve => setTimeout(resolve, delay));
  
  return apiClient(config);
});

/*export function getQueueInfo() {
  return apiClient.get<RoomInfo>(`/api/queue`);
}

export function getQueueItems(startTime?: number, endTime?: number) {
  return apiClient.get<QueueItem[]>(`/api/queue/items`, {
    params: { start: startTime, end: endTime },
  });
}

export function getQueueItemsHash() {
  return apiClient.get<string>(`/api/queue/items/hash`);
}*/

export function getTracks(trackIds: string[]): Promise<{ data: Map<string, Track> }> {
  // Create a cache key for request deduplication
  const cacheKey = `getTracks:${trackIds.sort().join(',')}`;
  
  // Return pending request if one exists for the same track IDs
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey) as Promise<{ data: Map<string, Track> }>;
  }
  
  const request = apiClient.post<Map<string, Track>>(`/api/track`, {
    webpage_url_hashes: trackIds,
  }).finally(() => {
    // Clean up pending request when done
    pendingRequests.delete(cacheKey);
  });
  
  pendingRequests.set(cacheKey, request);
  return request;
}
