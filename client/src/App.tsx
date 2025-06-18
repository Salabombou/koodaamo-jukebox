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
        (item) => (isShuffled ? item.shuffledIndex : item.index) === currentTrackIndex,
      )
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
  }, [currentTrack, currentTrackIndex]);

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
  useEffect(() => {
    seeking.current = false;
  }, [playingSince]);

  // Only update backgroundColor if it actually changes
  const [backgroundColor, setBackgroundColorRaw] =
    useState("rgba(0, 0, 0, 0.5)");
  const setBackgroundColor = useCallback((color: string) => {
    setBackgroundColorRaw((prev) => (prev !== color ? color : prev));
  }, []);

  // Memoize onSkip and onMove
  const onSkip = useCallback(
    (index: number) => {
      if (typeof currentTrackIndex === "number") {
        invokeRoomAction("Skip", index);
      }
    },
    [currentTrackIndex, invokeRoomAction],
  );

  const onMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (typeof currentTrackIndex === "number" && fromIndex !== toIndex) {
        invokeRoomAction("Move", fromIndex, toIndex);
      }
    },
    [currentTrackIndex, invokeRoomAction],
  );

  return (
    <div
      className="absolute inset-0 flex flex-row items-center justify-center overflow-hidden"
      style={{ backgroundColor }}
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
          audioPlayer.current!.currentTime = seekTime;
          audioPlayer.current!.pause();
          setTimestamp(seekTime);
          invokeRoomAction("Seek", seekTime);
          setTimeout(() => {
            seeking.current = false;
          }, 300);
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
      />
    </div>
  );
}
