import { useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import type { RefObject } from "react";

type UseHlsAudioProps = {
  audioPlayer: RefObject<HTMLAudioElement>;
  onDuration: (duration: number) => void;
  onFatalError: (data: any) => void;
};

export default function useHlsAudio({ audioPlayer, onDuration, onFatalError }: UseHlsAudioProps) {
  const hls = useRef<Hls | null>(null);

  useEffect(() => {
    if (!audioPlayer.current) return;
    if (Hls.isSupported()) {
      hls.current = new Hls({
        xhrSetup: (xhr) => {
          const token = localStorage.getItem("authToken") ?? "";
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
    function handleManifestParsed(_: any, data: any) {
      const duration = data.levels[0].details?.totalduration;
      if (isNaN(duration)) {
        console.warn("HLS manifest parsed but duration is NaN");
        onDuration(0);
        return;
      }
      onDuration(duration);
    }
    function handleError(_: any, data: any) {
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
      if (!hls.current) return;
      hls.current.loadSource(src);
      hls.current.startLoad();
      if (!hls.current.media) {
        hls.current.attachMedia(audioPlayer.current!);
      }
    },
    [audioPlayer],
  );

  useEffect(() => {
    const player = audioPlayer.current;
    if (!player || !hls.current) return;
    const handleSeeking = () => {
      // Force hls.js to start loading after seeking
      hls.current?.startLoad();
    };
    player.addEventListener("seeking", handleSeeking);
    return () => {
      player.removeEventListener("seeking", handleSeeking);
    };
  }, [audioPlayer]);

  return { hls, loadSource };
}
