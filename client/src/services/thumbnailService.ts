// Global cache shared across all useThumbnail instances
// Map from URL to object URL string
const thumbnailMap = new Map<string, string>();
// Track pending requests to avoid duplicates
const pendingRequests = new Map<string, Promise<string | null>>();

export async function getThumbnail(url: string): Promise<string | null> {
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
}

export function clearThumbnails() {
  for (const objectUrl of thumbnailMap.values()) {
    URL.revokeObjectURL(objectUrl);
  }
  thumbnailMap.clear();
}
export function removeThumbnail(url: string) {
  if (!thumbnailMap.has(url)) return;
  const objectUrl = thumbnailMap.get(url);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }
  thumbnailMap.delete(url);
}
