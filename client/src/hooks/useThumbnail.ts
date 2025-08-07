import { useCallback } from "react";

interface UseThumbnailResult {
  getThumbnail: (url: string) => Promise<string | null>;
  clearThumbnails: () => void;
  removeThumbnail: (url: string) => void;
}

// Global cache shared across all useThumbnail instances
// Map from URL to object URL string
const thumbnailMap = new Map<string, string>();
// Track pending requests to avoid duplicates
const pendingRequests = new Map<string, Promise<string | null>>();

export function useThumbnail(): UseThumbnailResult {
  // Fetch and cache thumbnail blob, return object URL
  const getThumbnail = useCallback(async (url: string): Promise<string | null> => {
    if (!url) return null;

    // Return cached version if available
    if (thumbnailMap.has(url)) {
      return thumbnailMap.get(url)!;
    }

    // Return pending request if already in progress
    if (pendingRequests.has(url)) {
      return pendingRequests.get(url)!;
    }

    // Create new request
    const request = (async (): Promise<string | null> => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch thumbnail");
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        thumbnailMap.set(url, objectUrl);
        return objectUrl;
      } catch {
        return null;
      } finally {
        // Clean up pending request
        pendingRequests.delete(url);
      }
    })();

    pendingRequests.set(url, request);
    return request;
  }, []);

  // Clear all cached thumbnails and revoke object URLs
  const clearThumbnails = useCallback(() => {
    for (const objectUrl of thumbnailMap.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    thumbnailMap.clear();
  }, []);

  const removeThumbnail = useCallback((url: string) => {
    if (!thumbnailMap.has(url)) return;
    const objectUrl = thumbnailMap.get(url);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    thumbnailMap.delete(url);
  }, []);

  return { getThumbnail, clearThumbnails, removeThumbnail };
}
