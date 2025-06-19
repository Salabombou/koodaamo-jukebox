import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Queue from "./components/Queue";
import MusicPlayerInterface from "./components/MusicPlayerInterface";
import { Track } from "./types/track";
import Hls from "hls.js";
import * as apiService from "./services/apiService";
import * as timeService from "./services/timeService";
import { useDiscordSDK } from "./hooks/useDiscordSdk";
import useRoomHub from "./hooks/useRoomHub";

export default function App() {
  const discordSDK = useDiscordSDK();

  const audioPlayer = useRef<HTMLAudioElement>(null);
  const hls = useRef<Hls | null>(null);

  // Memoize tracks map to avoid new reference unless contents change
  const [tracks, setTracks] = useState(() => new Map<string, Track>());

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [duration, setDuration] = useState(0);
  const [timestamp, setTimestamp] = useState(0);

  useEffect(() => {
    timeService.syncServerTime(discordSDK.isEmbedded);
  }, [discordSDK.isEmbedded]);

  const {
    playingSince,
    currentTrackIndex,
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

  // Memoize queueList to avoid new array reference unless contents change
  const queueList = useMemo(() => {
    const list = Array.from(queueItems.values());
    list.sort((a, b) =>
      isShuffled ? a.shuffledIndex - b.shuffledIndex : a.index - b.index,
    );
    return list;
  }, [queueItems, isShuffled]);

  useEffect(() => {
    if (invokeError) {
      console.error("Room action error:", invokeError);
    }
  }, [invokeError]);

  useEffect(() => {
    setCurrentTrack(() => {
      if (typeof currentTrackIndex !== "number" || queueList.length === 0) {
        return null;
      }

      const item = [...queueItems.values()].find(
        (item) =>
          (isShuffled ? item.shuffledIndex : item.index) === currentTrackIndex,
      );
      if (!item) {
        return null;
      }

      const track = tracks.get(item.trackId);
      if (!track) return null;

      return track;
    });
  }, [queueItems, tracks, currentTrackIndex, isShuffled]);

  useEffect(() => {
    // update page title with current track name
    if (currentTrack) {
      document.title = `Now playing: ${currentTrack.title}`;
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

  useEffect(() => {
    if (!audioPlayer.current) return;
    if (Hls.isSupported()) {
      hls.current = new Hls({
        xhrSetup: (xhr) => {
          const token = localStorage.getItem("authToken") ?? "";
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        },
      });
      hls.current.attachMedia(audioPlayer.current);
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

    const abortController = new AbortController();

    hls.current.on(
      Hls.Events.MANIFEST_PARSED,
      (_, data) => {
        if (currentTrack) {
          setDuration(data.levels[0].details?.totalduration || 0);
        }
      },
      abortController.signal,
    );

    hls.current.on(
      Hls.Events.ERROR,
      (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error(
                "Network error occurred while loading audio:",
                data,
              );
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("Media error occurred while loading audio:", data);
              break;
            case Hls.ErrorTypes.OTHER_ERROR:
              console.error(
                "An unknown error occurred while loading audio:",
                data,
              );
              break;
          }
          if (typeof currentTrackIndex === "number") {
            invokeRoomAction("Skip", currentTrackIndex + 1);
          }
        }
      },
      abortController.signal,
    );

    return () => {
      abortController.abort();
    };
  }, [currentTrack, currentTrackIndex, duration]);

  const playTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    if (audioPlayer.current && currentTrack && hls.current) {
      const src = `${discordSDK.isEmbedded ? "/.proxy/" : ""}/api/audio/${currentTrack.id}/`;
      if (!hls.current.url?.includes(currentTrack.id)) {
        setDuration(0);
        hls.current.loadSource(src);
        hls.current.startLoad();
        if (!hls.current.media) {
          hls.current.attachMedia(audioPlayer.current);
        }
      }
      if (!isPaused && typeof playingSince === "number") {
        playTimeoutRef.current = setTimeout(
          () => {
            if (
              audioPlayer.current!.paused &&
              !isPaused &&
              playingSince !== null &&
              Math.abs(playingSince - timeService.getServerNow()) < 1000
            ) {
              audioPlayer.current!.play();
            }
          },
          Math.max(
            0,
            playingSince ? playingSince - timeService.getServerNow() : 0,
          ),
        );
      } else {
        audioPlayer.current.pause();
      }
    }
  }, [currentTrack, isPaused, playingSince]);

  useEffect(() => {
    if (hls.current?.media?.paused && !isPaused && playingSince !== null) {
      audioPlayer.current?.play();
    } else if (hls.current?.media && isPaused) {
      audioPlayer.current?.pause();
    }
  }, [playingSince, isPaused, currentTrack]);

  const seeking = useRef(false);
  // Track the last seeked time and previous time
  const lastSeek = useRef<{requested: number|null, previous: number|null}>({requested: null, previous: null});

  // When playingSince changes, clear seeking if it matches the last seek and resume playback if not paused
  useEffect(() => {
    if (
      lastSeek.current.requested !== null &&
      typeof playingSince === "number" &&
      Math.abs(playingSince / 1000 - lastSeek.current.requested) < 2 // allow 2s tolerance
    ) {
      seeking.current = false;
      lastSeek.current = {requested: null, previous: null};
      // Resume playback if not paused
      if (audioPlayer.current && !isPaused) {
        audioPlayer.current.play();
      }
    }
  }, [playingSince, isPaused]);

  // If invokeError occurs after a seek, revert to previous timestamp
  useEffect(() => {
    if (invokeError && seeking.current && lastSeek.current.previous !== null) {
      if (audioPlayer.current) {
        audioPlayer.current.currentTime = lastSeek.current.previous;
        setTimestamp(lastSeek.current.previous);
        audioPlayer.current.pause();
      }
      seeking.current = false;
      lastSeek.current = {requested: null, previous: null};
    }
  }, [invokeError]);

  

  // Only update backgroundColor if it actually changes
  const [backgroundColor, setBackgroundColorRaw] =
    useState("#000000");
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

  useEffect(() => {
    seeking.current = invokePending;
  }, [invokePending]);

  useEffect(() => {
    function handleContextMenu(e: MouseEvent) {
      // Allow context menu only if inside custom context menu
      const path = e.composedPath ? e.composedPath() : (e as any).path || [];
      if (
        path.some(
          (el: EventTarget) =>
            el instanceof HTMLElement &&
            el.hasAttribute &&
            el.hasAttribute("data-custom-context-menu")
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

  return (
    <div
      className="absolute inset-0 flex flex-row items-center justify-center overflow-hidden"
      style={{
        backgroundColor: backgroundColor + "cc"
      }}
    >
      <audio
        ref={audioPlayer}
        autoPlay={true}
        onTimeUpdate={() => {
          if (seeking.current) return;
          const currentTime = timeService.getServerNow();
          if (!seeking.current && typeof playingSince === "number") {
            const elapsedTime =
              ((currentTime - playingSince) % (duration * 1000)) / 1000;
            if (
              elapsedTime >= 1 &&
              Math.abs(audioPlayer.current!.currentTime - elapsedTime) > 1
            )
              audioPlayer.current!.currentTime = elapsedTime;
          }
          setTimestamp(Math.max(audioPlayer.current?.currentTime ?? 0, 0));
        }}
        onEnded={() => {
          if (isLooping) {
            seeking.current = true;
            audioPlayer.current!.currentTime = 0;
            audioPlayer.current!.play();
          } else {
            invokeRoomAction("Skip", (currentTrackIndex ?? 0) + 1);
          }
        }}
        onCanPlayThrough={() => {
          if (!isPaused && playingSince === null) {
            invokeRoomAction("PauseToggle", false);
          }
        }}
      />
      <MusicPlayerInterface
        track={currentTrack}
        duration={duration}
        timestamp={timestamp}
        paused={isPaused ?? true}
        looping={isLooping ?? false}
        disabled={invokePending}
        onPrimaryColorChange={setBackgroundColor}
        backgroundColor={backgroundColor}
        onShuffle={() => {
          if (typeof isShuffled === "undefined") return;
          invokeRoomAction("ShuffleToggle", !isShuffled);
        }}
        onBackward={() => {
          invokeRoomAction("Skip", (currentTrackIndex ?? 0) - 1);
        }}
        onForward={() => {
          invokeRoomAction("Skip", (currentTrackIndex ?? 0) + 1);
        }}
        onPlayToggle={() => {
          invokeRoomAction("PauseToggle", !isPaused);
        }}
        onLoopToggle={() => {
          invokeRoomAction("LoopToggle", !isLooping);
        }}
        onSeek={(seekTime) => {
          if (seeking.current) return;
          seeking.current = true;
          lastSeek.current = {
            requested: seekTime,
            previous: audioPlayer.current!.currentTime,
          };
          audioPlayer.current!.currentTime = seekTime;
          audioPlayer.current!.pause(); // Always pause on seek
          setTimestamp(seekTime);
          invokeRoomAction("Seek", seekTime);
        }}
        onVolumeChange={(volume) => {
          audioPlayer.current!.volume = volume;
        }}
      />
      <Queue
        tracks={tracks}
        queueList={queueList}
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
