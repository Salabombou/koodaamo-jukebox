import { useEffect, useRef, useCallback, useState } from "react";
import Hls from "hls.js";

type UseWebAudioHlsProps = {
  onDuration: (duration: number) => void;
  onFatalError: (data: any) => void;
  onTimeUpdate: (currentTime: number) => void;
  onEnded: () => void;
  onCanPlayThrough: () => void;
};

export default function useWebAudioHls({ onDuration, onFatalError, onTimeUpdate, onEnded, onCanPlayThrough }: UseWebAudioHlsProps) {
  const audioContext = useRef<AudioContext | null>(null);
  const sourceNode = useRef<MediaElementAudioSourceNode | null>(null);
  const compressorNode = useRef<DynamicsCompressorNode | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const hls = useRef<Hls | null>(null);
  const animationFrame = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // Initialize Web Audio Context and nodes
  useEffect(() => {
    const initAudioContext = async () => {
      try {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Create audio element for HLS
        audioElement.current = new Audio();
        audioElement.current.crossOrigin = "anonymous";
        audioElement.current.preload = "auto";

        // Create Web Audio nodes
        sourceNode.current = audioContext.current.createMediaElementSource(audioElement.current);
        compressorNode.current = audioContext.current.createDynamicsCompressor();
        // Configure compressor for normalization
        if (compressorNode.current) {
          compressorNode.current.threshold.setValueAtTime(-24, audioContext.current.currentTime); // dB
          compressorNode.current.knee.setValueAtTime(30, audioContext.current.currentTime); // dB
          compressorNode.current.ratio.setValueAtTime(12, audioContext.current.currentTime);
          compressorNode.current.attack.setValueAtTime(0.003, audioContext.current.currentTime); // seconds
          compressorNode.current.release.setValueAtTime(0.25, audioContext.current.currentTime); // seconds
        }
        gainNode.current = audioContext.current.createGain();

        // Connect the audio graph: source -> compressor -> gain -> destination
        sourceNode.current.connect(compressorNode.current!);
        compressorNode.current!.connect(gainNode.current);
        gainNode.current.connect(audioContext.current.destination);

        // Set up HLS
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
      } catch (error) {
        console.error("Failed to initialize Web Audio Context:", error);
      }
    };

    initAudioContext();

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      if (hls.current) {
        hls.current.destroy();
        hls.current = null;
      }
      if (sourceNode.current) {
        sourceNode.current.disconnect();
      }
      if (gainNode.current) {
        gainNode.current.disconnect();
      }
      if (compressorNode.current) {
        compressorNode.current.disconnect();
      }
      if (audioContext.current && audioContext.current.state !== "closed") {
        audioContext.current.close();
      }
    };
  }, []);

  // Set up HLS event listeners
  useEffect(() => {
    if (!hls.current) return;

    function handleManifestParsed(_: any, data: any) {
      const duration = data.levels[0].details?.totalduration;
      if (isNaN(duration)) {
        console.warn("HLS manifest parsed but duration is NaN");
        setDuration(0);
        onDuration(0);
        return;
      }
      setDuration(duration);
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

  // Set up audio element event listeners
  useEffect(() => {
    if (!audioElement.current) return;

    const audio = audioElement.current;

    const handleCanPlayThrough = () => {
      onCanPlayThrough();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onEnded();
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
        onDuration(audio.duration);
      }
    };

    audio.addEventListener("canplaythrough", handleCanPlayThrough);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("canplaythrough", handleCanPlayThrough);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [onCanPlayThrough, onEnded, onDuration]);

  // Animation frame for time updates
  const updateTime = useCallback(() => {
    if (audioElement.current && isPlaying) {
      const newTime = audioElement.current.currentTime;
      setCurrentTime(newTime);
      onTimeUpdate(newTime);
    }
    if (isPlaying) {
      animationFrame.current = requestAnimationFrame(updateTime);
    }
  }, [isPlaying, onTimeUpdate]);

  useEffect(() => {
    if (isPlaying) {
      animationFrame.current = requestAnimationFrame(updateTime);
    } else if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [isPlaying, updateTime]);

  const loadSource = useCallback((src: string) => {
    if (!hls.current || !audioElement.current) return;

    // Stop any existing playback
    pause();

    // Always unload before loading new source
    try {
      hls.current.stopLoad();
      hls.current.detachMedia();
    } catch (e) {
      // ignore
    }

    // Reset state
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    // Load new source
    hls.current.loadSource(src);
    hls.current.attachMedia(audioElement.current);
    hls.current.startLoad();
    audioElement.current.load();
  }, []);

  const unloadSource = useCallback(() => {
    if (hls.current) {
      try {
        hls.current.stopLoad();
        hls.current.detachMedia();
      } catch (e) {
        // ignore
      }
    }
    if (audioElement.current) {
      audioElement.current.pause();
      audioElement.current.currentTime = 0;
      audioElement.current.removeAttribute("src");
      audioElement.current.load();
    }
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, []);

  const play = useCallback(async () => {
    if (!audioElement.current || !audioContext.current) return false;

    try {
      // Resume audio context if it's suspended
      if (audioContext.current.state === "suspended") {
        await audioContext.current.resume();
      }

      await audioElement.current.play();
      setIsPlaying(true);
      return true;
    } catch (error) {
      console.error("Failed to play audio:", error);
      return false;
    }
  }, []);

  const pause = useCallback(() => {
    if (!audioElement.current) return;

    audioElement.current.pause();
    setIsPlaying(false);
  }, []);

  const seek = useCallback(
    (time: number) => {
      if (!audioElement.current) return;

      const clampedTime = Math.max(0, Math.min(time, duration));
      audioElement.current.currentTime = clampedTime;
      setCurrentTime(clampedTime);

      // Force hls.js to start loading after seeking
      if (hls.current) {
        hls.current.startLoad();
      }
    },
    [duration],
  );

  const setVolumeLevel = useCallback((level: number) => {
    const clampedVolume = Math.max(0, Math.min(1, level));
    setVolume(clampedVolume);

    if (gainNode.current) {
      gainNode.current.gain.setValueAtTime(clampedVolume, audioContext.current?.currentTime || 0);
    }
  }, []);

  // Get audio analysis data
  const getAnalyserNode = useCallback(() => {
    if (!audioContext.current || !sourceNode.current || !compressorNode.current || !gainNode.current) return null;

    const analyser = audioContext.current.createAnalyser();
    analyser.fftSize = 256;

    // Disconnect compressor node temporarily and insert analyser between compressor and gain
    compressorNode.current.disconnect();
    compressorNode.current.connect(analyser);
    analyser.connect(gainNode.current);

    return analyser;
  }, []);

  return {
    loadSource,
    unloadSource,
    play,
    pause,
    seek,
    setVolume: setVolumeLevel,
    getAnalyserNode,
    currentTime,
    duration,
    isPlaying,
    volume,
    audioContext: audioContext.current,
    paused: !isPlaying,
  };
}
