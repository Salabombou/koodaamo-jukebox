import { useRef, useCallback } from "react";

interface UseThumbnailResult {
  getThumbnail: (url: string) => Promise<string | null>;
  clearThumbnails: () => void;
  removeThumbnail: (url: string) => void;
}

export function useThumbnail(): UseThumbnailResult {
  // Map from URL to object URL string
  const thumbnailMap = useRef<Map<string, string>>(new Map());
  // Track pending requests to avoid duplicates
  const pendingRequests = useRef<Map<string, Promise<string | null>>>(new Map());

  // Fetch and cache thumbnail blob, return object URL
  const getThumbnail = useCallback(async (url: string): Promise<string | null> => {
    if (!url) return null;

    // Return cached version if available
    if (thumbnailMap.current.has(url)) {
      return thumbnailMap.current.get(url)!;
    }

    // Return pending request if already in progress
    if (pendingRequests.current.has(url)) {
      return pendingRequests.current.get(url)!;
    }

    // Create new request
    const request = (async (): Promise<string | null> => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch thumbnail");
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        thumbnailMap.current.set(url, objectUrl);
        return objectUrl;
      } catch {
        return null;
      } finally {
        // Clean up pending request
        pendingRequests.current.delete(url);
      }
    })();

    pendingRequests.current.set(url, request);
    return request;
  }, []);

  // Clear all cached thumbnails and revoke object URLs
  const clearThumbnails = useCallback(() => {
    for (const objectUrl of thumbnailMap.current.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    thumbnailMap.current.clear();
  }, []);

  const removeThumbnail = useCallback((url: string) => {
    if (!thumbnailMap.current.has(url)) return;
    const objectUrl = thumbnailMap.current.get(url);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    thumbnailMap.current.delete(url);
  }, []);

  return { getThumbnail, clearThumbnails, removeThumbnail };
}
