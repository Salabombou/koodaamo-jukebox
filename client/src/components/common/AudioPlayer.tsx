import { useRef, useEffect, RefObject, useImperativeHandle } from "react";
import Hls, { Events, type ErrorData, type ManifestParsedData } from "hls.js";

export interface AudioPlayerRef {
  loadSource: (src: string) => void;
  setVolume: (volume: number) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  get paused(): boolean;
  get currentTime(): number;
}

interface AudioPlayerProps {
  ref: RefObject<AudioPlayerRef | null>;
  onDuration: (duration: number) => void;
  onFatalError: (data: ErrorData | Event | string) => void;
  onEnded: () => void;
  onCanPlayThrough: () => void;
  onTimeUpdate: () => void;
}

export default function AudioPlayer({ ref, onDuration, onFatalError, onEnded, onCanPlayThrough, onTimeUpdate }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hls = useRef<Hls | null>(null);

  useImperativeHandle(ref, () => ({
    loadSource: (src: string) => {
      if (!hls.current || !audioRef.current) return;

      // Only load if the source is different from current
      if (hls.current.url === src) return;

      hls.current.loadSource(src);
      hls.current.startLoad();

      audioRef.current.load();
      hls.current.attachMedia(audioRef.current);
    },
    setVolume: (volume: number) => {
      if (audioRef.current) {
        audioRef.current.volume = volume;
      }
    },
    play: () => {
      if (audioRef.current) {
        audioRef.current.play();
      }
    },
    pause: () => {
      audioRef.current?.pause();
    },
    seek: (time: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
      }
    },
    get paused() {
      return audioRef.current?.paused ?? true;
    },
    get currentTime() {
      return audioRef.current?.currentTime ?? 0;
    },
  }));

  useEffect(() => {
    if (!ref.current) return;
    if (Hls.isSupported()) {
      console.log("HLS is supported, initializing...");
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

  useEffect(() => {
    const handleSeeking = () => {
      // Force hls.js to start loading after seeking
      hls.current?.startLoad();
    };
    audioRef.current?.addEventListener("seeking", handleSeeking);
    return () => {
      audioRef.current?.removeEventListener("seeking", handleSeeking);
    };
  }, []);

  return <audio ref={audioRef} className="sr-only" controls={false} autoPlay={false} onEnded={onEnded} onCanPlayThrough={onCanPlayThrough} onTimeUpdate={onTimeUpdate} />;
}
