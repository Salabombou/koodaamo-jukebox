import axios from "axios";
import type { QueueInfo, QueueItem } from "../types/queue";
import { Track } from "../types/track";

const apiClient = axios.create({
    baseURL: "/.proxy/",
});

apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem("authToken");
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export function getQueueInfo() {
    return apiClient.get<QueueInfo>(`/api/queue`);
}

export function getQueueItems(startTime?: number, endTime?: number) {
    return apiClient.get<QueueItem[]>(`/api/queue/items`, {
        params: { startTime, endTime },
    });
}

export function getQueueItemsHash() {
    return apiClient.get<string>(`/api/queue/items/hash`);
}

export function getTracks(trackIds: string[]) {
    return apiClient.post<Map<string, Track>>(`/api/track`, { trackIds });
}