import type { RefObject } from "react";
import { useEffect, useImperativeHandle, useRef } from "react";
import type { Events } from "hls.js";
import Hls, { type ErrorData, type ManifestParsedData } from "hls.js";

import { LS_KEY_AUTH_TOKEN } from "../../constants";

/**
 * Public imperative API exposed by the <AudioPlayer/> component via ref.
 */
export interface AudioPlayerRef {
  loadSource: (src: string) => void;
  setVolume: (volume: number) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  reset: () => void;
  get ready(): boolean;
  get paused(): boolean;
  get currentTime(): number;
  get volume(): number;
}

interface AudioPlayerProps {
  ref: RefObject<AudioPlayerRef | null>;
  onDuration: (duration: number) => void;
  onFatalError: (data: ErrorData | Event | string) => void;
  onEnded: () => void;
  onCanPlayThrough: () => void;
  onTimeUpdate: () => void;
}

/**
 * Thin wrapper around a hidden <audio> element powered by hls.js for HLS stream playback.
 * Exposes imperative controls through a forwarded ref and surfaces key lifecycle callbacks.
 */
export default function AudioPlayer({ ref, onDuration, onFatalError, onEnded, onCanPlayThrough, onTimeUpdate }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hls = useRef<Hls | null>(null);
  // Keep track of last loaded source to avoid redundant reloads
  const lastSrcRef = useRef<string | null>(null);
  // Ref for the silence audio element
  const silenceAudioRef = useRef<HTMLAudioElement>(null);

  useImperativeHandle(ref, () => ({
    loadSource: (src: string) => {
      if (!hls.current || !audioRef.current) return;
      if (lastSrcRef.current === src) return; // Already loaded

      // Fully reset audio element & detach previous media to prevent residual buffered audio
      try {
        audioRef.current.pause();
        // Stop any network / buffer activity
        try {
          hls.current.stopLoad();
        } catch {
          // ignore
        }
        try {
          hls.current.detachMedia();
        } catch {
          // ignore
        }
        // Clear existing src & buffered data in the element
        audioRef.current.removeAttribute("src");
        audioRef.current.load(); // forces element to reset

        // Re-attach then load new source
        hls.current.attachMedia(audioRef.current);
        hls.current.loadSource(src);
        hls.current.startLoad();
        audioRef.current.currentTime = 0;
        lastSrcRef.current = src;
      } catch (e) {
        console.error("Failed to load new HLS source", e);
      }
    },
    setVolume: (volume: number) => {
      if (audioRef.current) {
        audioRef.current.volume = volume;
      }
    },
    play: () => {
      if (audioRef.current) {
        audioRef.current.play();
        // Play silent audio if ready
        if (silenceAudioRef.current && silenceAudioRef.current.readyState === 4 && silenceAudioRef.current.paused) {
          silenceAudioRef.current.play();
        }
      }
    },
    pause: () => {
      audioRef.current?.pause();
      // Pause silent audio if playing
      if (silenceAudioRef.current && !silenceAudioRef.current.paused) {
        silenceAudioRef.current.pause();
      }
    },
    seek: (time: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
      }
    },
    reset: () => {
      if (!audioRef.current) return;
      try {
        audioRef.current.pause();
        if (hls.current) {
          try {
            hls.current.stopLoad();
          } catch {
            // ignore
          }
          try {
            hls.current.detachMedia();
          } catch {
            // ignore
          }
        }
        audioRef.current.removeAttribute("src");
        // Only call load if not already in HAVE_NOTHING state
        if (audioRef.current.readyState !== 0) {
          audioRef.current.load();
        }
        // Reset silent audio
        if (silenceAudioRef.current) {
          silenceAudioRef.current.pause();
          silenceAudioRef.current.currentTime = 0;
        }
      } catch (e) {
        console.warn("Audio reset failed", e);
      }
    },
    get ready() {
      return audioRef.current?.readyState === 4; // HAVE_ENOUGH_DATA
    },
    get paused() {
      return audioRef.current?.paused ?? true;
    },
    get currentTime() {
      return audioRef.current?.currentTime ?? 0;
    },
    get volume() {
      return audioRef.current?.volume ?? 0;
    },
  }));

  useEffect(() => {
    if (!ref.current) return;
    if (Hls.isSupported()) {
      console.log("HLS is supported, initializing...");
      hls.current = new Hls({
        xhrSetup: (xhr) => {
          const token = localStorage.getItem(LS_KEY_AUTH_TOKEN) ?? "";
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
  }, [ref]);

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
    const audioEl = audioRef.current;
    audioEl?.addEventListener("seeking", handleSeeking);
    return () => {
      audioEl?.removeEventListener("seeking", handleSeeking);
    };
  }, []);

  // When not ready, silent audio should be playing
  useEffect(() => {
    const checkAndPlaySilence = () => {
      const audio = audioRef.current;
      const silence = silenceAudioRef.current;
      if (!audio || !silence) return;
      if (audio.readyState !== 4) {
        if (silence.readyState === 4 && silence.paused) {
          silence.pause();
        } else {
          silence.play();
        }
      }
    };
    checkAndPlaySilence();
    const interval = setInterval(checkAndPlaySilence, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <audio ref={audioRef} className="sr-only" controls={false} autoPlay={false} onEnded={onEnded} onCanPlayThrough={onCanPlayThrough} onTimeUpdate={onTimeUpdate} />
      <audio ref={silenceAudioRef} src="/silence.mp3" className="sr-only" loop autoPlay />
    </>
  );
}
