import axios from "axios";
import type { QueueItem } from "../types/queue";
import type { RoomInfo } from "../types/room";
import { Track } from "../types/track";

const apiClient = axios.create();

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
  if (!config || config.__retryCount >= 5) {
    return Promise.reject(error);
  }
  config.__retryCount = (config.__retryCount || 0) + 1;
  return apiClient(config);
});

export function getQueueInfo() {
  return apiClient.get<RoomInfo>(`/api/queue`);
}

export function getQueueItems(startTime?: number, endTime?: number) {
  return apiClient.get<QueueItem[]>(`/api/queue/items`, {
    params: { start: startTime, end: endTime },
  });
}

export function getQueueItemsHash() {
  return apiClient.get<string>(`/api/queue/items/hash`);
}

export function getTracks(trackIds: string[]) {
  return apiClient.post<Map<string, Track>>(`/api/track`, {
    webpage_url_hashes: trackIds,
  });
}
