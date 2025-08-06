import { useRef, useEffect, useCallback, RefObject } from "react";
import Hls, { Events, type ErrorData, type ManifestParsedData } from "hls.js";

interface IaudioElement {
  loadSource: (src: string) => void;
  setVolume: (volume: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  get paused(): boolean;
  get currentTime(): number;
}

interface UseaudioElementProps {
  audioElement: RefObject<HTMLAudioElement | null>;
  onDuration: (duration: number) => void;
  onFatalError: (data: ErrorData | Event | string) => void;
}

export function useHls({ audioElement, onDuration, onFatalError }: UseaudioElementProps): IaudioElement {
  const hls = useRef<Hls | null>(null);

  useEffect(() => {
    if (!audioElement.current) return;
    if (Hls.isSupported()) {
      hls.current = new Hls({
        xhrSetup: (xhr) => {
          const token = localStorage.getItem("auth_token") ?? "";
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        },
      });
    } else {
      alert("HLS is not supported in this browser.");
      window.location.reload();
    }
    return () => {
      if (hls.current) {
        hls.current.destroy();
        hls.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!hls.current) return;
    function handleManifestParsed(_: Events.MANIFEST_PARSED, data: ManifestParsedData) {
      const duration = data.levels[0].details?.totalduration;
      if (typeof duration !== "number") {
        console.warn("HLS manifest parsed but duration is not a number:", duration);
        onDuration(0);
        return;
      }
      if (isNaN(duration)) {
        console.warn("HLS manifest parsed but duration is NaN");
        onDuration(0);
        return;
      }
      onDuration(duration);
    }
    function handleError(_: Events.ERROR, data: ErrorData) {
      console.error("HLS error:", data);
      if (data.fatal) {
        onFatalError(data);
      }
    }
    hls.current.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
    hls.current.on(Hls.Events.ERROR, handleError);
    return () => {
      hls.current?.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
      hls.current?.off(Hls.Events.ERROR, handleError);
    };
  }, [onDuration, onFatalError]);

  const loadSource = useCallback(
    (src: string) => {
      if (!hls.current || !audioElement.current) return;
      
      // Only load if the source is different from current
      if (hls.current.url === src) return;
      
      hls.current.loadSource(src);
      hls.current.startLoad();
      
      audioElement.current.load();
      hls.current.attachMedia(audioElement.current);
    },
    [audioElement],
  );

  useEffect(() => {
    const player = audioElement.current;
    if (!player || !hls.current) return;
    const handleSeeking = () => {
      // Force hls.js to start loading after seeking
      hls.current?.startLoad();
    };
    player.addEventListener("seeking", handleSeeking);
    return () => {
      player.removeEventListener("seeking", handleSeeking);
    };
  }, [audioElement]);

  return {
    loadSource,

    setVolume(volume: number) {
      if (audioElement.current) {
        audioElement.current.volume = volume;
      }
    },

    seek(time: number) {
      if (audioElement.current) {
        audioElement.current.currentTime = time;
      }
    },

    async play(): Promise<void> {
      if (audioElement.current) {
        try {
          await audioElement.current.play();
        } catch (error) {
          console.error("Failed to play audio:", error);
          throw error;
        }
      }
    },

    pause() {
      audioElement.current?.pause();
    },

    get paused() {
      return audioElement.current?.paused ?? true;
    },

    get currentTime() {
      return audioElement.current?.currentTime ?? 0;
    },
  };
}
