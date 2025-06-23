import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Queue from "./components/Queue";
import MusicPlayerInterface from "./components/MusicPlayerInterface";
import { Track } from "./types/track";
import * as apiService from "./services/apiService";
import * as timeService from "./services/timeService";
import { useDiscordSDK } from "./hooks/useDiscordSdk";
import Hls from "hls.js";
import useRoomHub from "./hooks/useRoomHub";
import useHlsAudio from "./hooks/useHlsAudio";

export default function App() {
  const discordSDK = useDiscordSDK();
  const audioPlayer = useRef<HTMLAudioElement>(
    null as unknown as HTMLAudioElement,
  );

  // Memoize tracks map to avoid new reference unless contents change
  const [tracks, setTracks] = useState(() => new Map<string, Track>());

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [duration, setDuration] = useState(0);
  const [timestamp, setTimestamp] = useState(0);

  useEffect(() => {
    timeService.syncServerTime(discordSDK.isEmbedded);
  }, [discordSDK.isEmbedded]);

  useEffect(() => {
    audioPlayer.current!.volume = Number(localStorage.getItem("volume")) ?? 1;
  }, []);

  const {
    playingSince,
    currentTrackIndex,
    currentTrackId,
    isLooping,
    isPaused,
    isShuffled,
    queueItems,
    invokeRoomAction,
    invokePending,
    invokeError,
  } = useRoomHub();

  useEffect(() => {
    console.log("Queue items updated:", queueItems);
  }, [queueItems]);
  useEffect(() => {
    console.log("Current track index:", currentTrackIndex);
  }, [currentTrackIndex]);
  useEffect(() => {
    console.log("Playing since:", playingSince);
    if (playingSince === null) {
      setTimestamp(0);
    }
  }, [playingSince]);

  // Memoize queueList to avoid new array reference unless contents change
  const queueList = useMemo(() => {
    const list = [...queueItems.values()];
    list.sort(
      (a, b) => (a.shuffledIndex ?? a.index) - (b.shuffledIndex ?? b.index),
    );
    return list;
  }, [queueItems]);

  useEffect(() => {
    if (invokeError) {
      console.error("Room action error:", invokeError);
    }
  }, [invokeError]);

  useEffect(() => {
    if (currentTrackId && currentTrackId !== currentTrack?.id) {
      const track = tracks.get(currentTrackId);
      if (track) {
        setCurrentTrack(track);
      }
    }
  }, [currentTrackId, currentTrack, tracks]);

  useEffect(() => {
    // update page title with current track name
    if (currentTrack) {
      document.title = `Now playing: ${currentTrack.title} • ${currentTrack.uploader}`;
    } else {
      document.title = "Koodaamo Jukebox";
    }
  }, [currentTrack]);

  // Only update tracks if new tracks are actually added
  useEffect(() => {
    const unknownTrackIds = Array.from(queueItems.values())
      .filter((item) => !tracks.has(item.trackId))
      .map((item) => item.trackId);
    if (unknownTrackIds.length)
      apiService.getTracks(unknownTrackIds).then(({ data }) => {
        let changed = false;
        const newTracks = new Map(tracks);
        data.forEach((track) => {
          if (!newTracks.has(track.id)) {
            changed = true;
            newTracks.set(track.id, track);
          }
        });
        if (changed) setTracks(newTracks);
      });
  }, [queueItems, tracks]);

  const lastHlsTrackId = useRef<string | null>(null);
  const skipOnFatalError = useRef(false);
  const preFetch = useRef(false);
  const { loadSource } = useHlsAudio({
    audioPlayer,
    onDuration: setDuration,
    onFatalError(data) {
      if (skipOnFatalError.current) return; // Prevent multiple skips
      skipOnFatalError.current = true;
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          console.error("Network error occurred while loading audio:", data);
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          console.error("Media error occurred while loading audio:", data);
          break;
        case Hls.ErrorTypes.OTHER_ERROR:
          console.error("An unknown error occurred while loading audio:", data);
          break;
      }
      if (typeof currentTrackIndex === "number") {
        invokeRoomAction("Skip", currentTrackIndex + 1);
      }
    },
  });

  useEffect(() => {
    if (currentTrackId && lastHlsTrackId.current !== currentTrackId) {
      lastHlsTrackId.current = currentTrackId;
      skipOnFatalError.current = false;
      preFetch.current = false;

      const src = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/audio/${currentTrackId}/`;
      loadSource(src);
      setDuration(0);
      setTimestamp(0);
    }
  }, [currentTrackId]);

  const playTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    if (!isPaused && typeof playingSince === "number") {
      const playAfter = Math.max(0, playingSince - timeService.getServerNow());
      playTimeoutRef.current = setTimeout(() => {
        if (
          audioPlayer.current!.paused &&
          !isPaused &&
          playingSince !== null &&
          Math.abs(playingSince - timeService.getServerNow()) < 1000
        ) {
          audioPlayer.current!.play();
        }
      }, playAfter);
    } else {
      if (typeof playingSince === "number") {
        seeking.current = true;
        const currentTime = (timeService.getServerNow() - playingSince) / 1000;
        audioPlayer.current!.currentTime = currentTime;
        setTimestamp(currentTime);
      }
      audioPlayer.current.pause();
    }
  }, [currentTrack, isPaused, playingSince, timestamp]);

  /*useEffect(() => {
    if (hls.current?.media?.paused && !isPaused && playingSince !== null) {
      audioPlayer.current?.play();
    } else if (hls.current?.media && isPaused) {
      audioPlayer.current?.pause();
    }
  }, [playingSince, isPaused, currentTrack]);*/

  const seeking = useRef(true);

  const [backgroundColor, setBackgroundColorRaw] = useState("#000000");
  const setBackgroundColor = useCallback((color: string) => {
    setBackgroundColorRaw((prev) => (prev !== color ? color : prev));
  }, []);

  const onSkip = useCallback((index: number) => {
    invokeRoomAction("Skip", index);
  }, []);

  const onMove = useCallback((fromIndex: number, toIndex: number) => {
    console.log("Moving from", fromIndex, "to", toIndex);
    invokeRoomAction("Move", fromIndex, toIndex);
  }, []);

  const onDelete = useCallback(
    (index: number) => {
      if (index === currentTrackIndex) {
        return;
      }
      invokeRoomAction("Delete", index);
    },
    [currentTrackIndex],
  );

  const onPlayNext = useCallback(
    (index: number) => {
      if (currentTrackIndex) {
        if (index < currentTrackIndex) {
          invokeRoomAction("Move", index, currentTrackIndex);
        } else if (index > currentTrackIndex) {
          invokeRoomAction("Move", index, currentTrackIndex + 1);
        }
      }
    },
    [currentTrackIndex],
  );

  /*useEffect(() => {
    seeking.current = invokePending;
  }, [invokePending]);*/

  useEffect(() => {
    function handleContextMenu(e: MouseEvent) {
      // Allow context menu only if inside custom context menu
      const path = e.composedPath ? e.composedPath() : (e as any).path || [];
      if (
        path.some(
          (el: EventTarget) =>
            el instanceof HTMLElement &&
            el.hasAttribute &&
            el.hasAttribute("data-custom-context-menu"),
        )
      ) {
        return; // Allow custom context menu
      }
      e.preventDefault();
    }
    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  useEffect(() => {
    seeking.current = invokePending;
  }, [invokePending]);

  return (
    <div
      className="absolute inset-0 flex flex-row items-center justify-center overflow-hidden bg-gradient-to-b"
      style={{
        backgroundColor: backgroundColor + "ff", // Use solid color for transition
        transition: "background-color 0.5s ease", // Transition background-color
      }}
    >
      {/* Gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "linear-gradient(to bottom, transparent 0%, #000 100%)",
          zIndex: 0,
        }}
      />
      <audio
        ref={audioPlayer}
        autoPlay={true}
        onTimeUpdate={() => {
          if (seeking.current) return;

          const currentTime = timeService.getServerNow();
          if (!seeking.current && typeof playingSince === "number") {
            const elapsedTime =
              ((currentTime - playingSince) % (duration * 1000)) / 1000;

            do {
              if (timestamp > duration && duration > 0 && timestamp > 0) {
                invokeRoomAction("Seek", elapsedTime);
                break;
              }
              if (
                elapsedTime >= 1 &&
                Math.abs(audioPlayer.current!.currentTime - elapsedTime) > 1
              ) {
                console.log(
                  "Fixing desync, setting currentTime to",
                  elapsedTime,
                );
                audioPlayer.current!.currentTime = elapsedTime;
              }
            } while (false);
          }
          setTimestamp(Math.max(audioPlayer.current?.currentTime ?? 0, 0));

          if (
            typeof currentTrackIndex !== "number" ||
            !queueList.length ||
            duration === 0 ||
            currentTrackIndex < 0 ||
            currentTrackIndex >= queueList.length - 1
          )
            return; // No next track

          let nextTrack: Track | null = null;
          for (const item of queueItems.values()) {
            if (
              (isShuffled ? item.shuffledIndex : item.index) ===
              currentTrackIndex + 1
            ) {
              nextTrack = tracks.get(item.trackId) ?? null;
              break;
            }
          }
          if (!nextTrack) return;

          const timeLeft = duration - (audioPlayer.current?.currentTime ?? 0);
          if (timeLeft <= 10 && timeLeft > 0) {
            // Prefetch next track audio
            const nextTrackId = nextTrack.id;
            const src = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/audio/${nextTrackId}/`;
            const token = localStorage.getItem("authToken");

            if (preFetch.current) return;
            preFetch.current = true;
            fetch(src, {
              method: "GET",
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        }}
        onEnded={() => {
          if (isLooping) {
            audioPlayer.current!.currentTime = 0;
            audioPlayer.current!.play();
          } else {
            if (typeof currentTrackIndex === "number") {
              console.log("Track ended, skipping to next track");
              invokeRoomAction("Skip", currentTrackIndex + 1);
            }
          }
        }}
        onCanPlayThrough={() => {
          if (!isPaused) {
            if (playingSince === null) {
              console.log("Starting playback");
              invokeRoomAction("PauseToggle", false);
            } else if (audioPlayer.current!.paused) {
              audioPlayer.current!.play();
            }
          }
        }}
      />
      <MusicPlayerInterface
        track={currentTrack}
        duration={duration}
        timestamp={timestamp}
        paused={isPaused ?? true}
        looping={isLooping ?? false}
        shuffled={isShuffled ?? false}
        disabled={invokePending}
        onPrimaryColorChange={setBackgroundColor}
        backgroundColor={backgroundColor}
        onShuffle={() => {
          if (invokePending || typeof isShuffled === "undefined") return;
          console.log("Toggling shuffle");
          invokeRoomAction("ShuffleToggle", !isShuffled);
        }}
        onBackward={() => {
          if (invokePending) return;
          console.log("Skipping backward");
          invokeRoomAction("Skip", (currentTrackIndex ?? 0) - 1);
        }}
        onForward={() => {
          if (invokePending) return;
          console.log("Skipping forward");
          invokeRoomAction("Skip", (currentTrackIndex ?? 0) + 1);
        }}
        onPlayToggle={() => {
          if (invokePending) return;
          console.log("Toggling play/pause");
          invokeRoomAction("PauseToggle", !isPaused);
        }}
        onLoopToggle={() => {
          if (invokePending) return;
          console.log("Toggling loop");
          invokeRoomAction("LoopToggle", !isLooping);
        }}
        onSeek={(seekTime) => {
          if (invokePending || seeking.current) return;
          seeking.current = true;
          audioPlayer.current!.currentTime = seekTime;
          audioPlayer.current!.pause(); // Always pause on seek
          setTimestamp(seekTime);
          console.log("Seeking to", seekTime);
          invokeRoomAction("Seek", seekTime);
        }}
        onVolumeChange={(volume) => {
          if (invokePending) return;
          audioPlayer.current!.volume = volume;
        }}
      />
      <Queue
        tracks={tracks}
        queueList={queueList}
        currentTrackId={currentTrackId}
        currentTrackIndex={currentTrackIndex}
        controlsDisabled={invokePending}
        backgroundColor={backgroundColor}
        onSkip={onSkip}
        onMove={onMove}
        onDelete={onDelete}
        onPlayNext={onPlayNext}
      />
    </div>
  );
}
