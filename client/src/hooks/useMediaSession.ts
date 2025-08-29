import { useEffect, useRef, useState } from "react";

import { getThumbnail } from "../services/thumbnailService";
import type { Track } from "../types/track";

interface UseMediaSessionProps {
  isReady: boolean;
  currentTrack: Track | null;
  duration: number;
  timestamp: number;
  isPaused: boolean | null;
  discordSDK: {
    isEmbedded: boolean;
  };
}

export default function useMediaSession({ isReady, currentTrack, duration, timestamp, isPaused, discordSDK }: UseMediaSessionProps) {
  // Update metadata every 1000ms
  const intervalRef = useRef<number | null>(null);
  const [artworkSrc, setArtworkSrc] = useState<string | null>(null);

  // Fetch and convert thumbnail to base64 when track changes
  useEffect(() => {
    let isMounted = true;
    async function fetchArtwork() {
      if (!currentTrack) {
        setArtworkSrc(null);
        return;
      }
      const url = `${window.location.origin}${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${currentTrack.id}/thumbnail-high`;
      const blobUrl = await getThumbnail(url);
      if (!blobUrl) {
        setArtworkSrc(null);
        return;
      }
      try {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (isMounted) {
            setArtworkSrc(typeof reader.result === "string" ? reader.result : null);
          }
        };
        reader.readAsDataURL(blob);
      } catch {
        setArtworkSrc(null);
      }
    }
    fetchArtwork();
    return () => {
      isMounted = false;
    };
  }, [currentTrack, discordSDK]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!isReady) return;
    if (!currentTrack) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.uploader,
      artwork: artworkSrc
        ? [
            {
              src: artworkSrc,
            },
          ]
        : undefined,
    });

    // Set up interval to update playback state and position
    function updateSession() {
      navigator.mediaSession.playbackState = isPaused ? "paused" : "playing";
      const playbackRate = 1;
      const safeDuration = isFinite(duration) ? duration : undefined;
      const safePosition = isFinite(timestamp) ? Math.min(safeDuration ?? 0, timestamp) : 0;
      try {
        navigator.mediaSession.setPositionState({
          duration: safeDuration,
          playbackRate: playbackRate,
          position: safePosition,
        });
      } catch {
        // Some browsers may throw if not supported
      }
    }
    updateSession();
    intervalRef.current = window.setInterval(updateSession, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isReady, currentTrack, duration, timestamp, isPaused, discordSDK, artworkSrc]);

  // Media session action handlers (play, pause, stop, prev, next, seek)
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!isReady) return;
    // This hook is only for metadata and position updates.
    return () => {
      // No-op cleanup
    };
  }, [isReady]);
}
