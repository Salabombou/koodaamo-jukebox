import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import AudioPlayer, { type AudioPlayerRef } from "./components/common/AudioPlayer";
import GradientBackground from "./components/common/GradientBackground";
import InterfaceDesktop from "./components/desktop/InterfaceDesktop";
import InterfaceMobile from "./components/mobile/InterfaceMobile";
import useDiscordActivity from "./hooks/useDiscordActivity";
import { useDiscordSDK } from "./hooks/useDiscordSDK";
import useMediaSession from "./hooks/useMediaSession";
import useRoomHub from "./hooks/useRoomHub";
import * as apiService from "./services/apiService";
import * as timeService from "./services/timeService";
import type { QueueItem } from "./types/queue";
import type { Track } from "./types/track";
import { LS_KEY_AUTH_TOKEN } from "./constants";

export default function App() {
  const discordSDK = useDiscordSDK();
  const { playingSince, currentItemIndex, currentItemId, isLooping, isPaused, isShuffled, queueItems, queueList, invokeRoomAction, invokePending, invokeError } = useRoomHub();
  const modalRef = useRef<HTMLDialogElement>(null as unknown as HTMLDialogElement);
  const seeking = useRef(true);
  const lastHlsTrackId = useRef<string | null>(null);
  const skipOnFatalError = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [tracks, setTracks] = useState<Map<string, Track>>(new Map());
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [nextItem, setNextItem] = useState<QueueItem | null>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [timestamp, setTimestamp] = useState(0);
  const [audioReady, setAudioReady] = useState(false);

  const player = useRef<AudioPlayerRef>(null);

  useEffect(() => {
    if (!discordSDK.isEmbedded) {
      modalRef.current.showModal();
    } else {
      setIsReady(true);
      modalRef.current.close();
    }
  }, [discordSDK.isEmbedded]);

  useEffect(() => {
    timeService.syncServerTime();
  }, []);

  useEffect(() => {
    const initialVolume = Number(localStorage.getItem("volume") ?? 0.01);
    setVolume(initialVolume);
    player.current?.setVolume(initialVolume);
  }, []);

  useEffect(() => {
    seeking.current = invokePending;
  }, [invokePending]);

  useEffect(() => {
    function handleContextMenu(e: MouseEvent) {
      // Allow context menu only if inside custom context menu
      const path = e.composedPath();
      if (
        path.some((el) => {
          return el instanceof HTMLElement && el.hasAttribute && el.hasAttribute("data-custom-context-menu");
        })
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
    if (typeof invokeError !== "string") return;
    console.error("Room action error:", invokeError);
  }, [invokeError]);

  useEffect(() => {
    if (typeof currentItemId === "number") {
      const item = queueItems.get(currentItemId);
      if (!item) return;

      const track = tracks.get(item.track_id);
      if (!track) return;

      setCurrentTrack(track);
    }
    if (typeof currentItemIndex === "number") {
      const nextItemIndex = currentItemIndex + 1;
      const item = queueList[nextItemIndex];
      console.log("Queue list item at current index:", item);
      if (!item) return;

      const itemIndex = isShuffled ? item.shuffled_index : item.index;
      console.log("Next item index:", nextItemIndex);
      console.log("Item index:", itemIndex);
      if (itemIndex !== nextItemIndex) return;

      setNextItem(item);
    }
  }, [currentItemId, currentItemIndex, queueItems, tracks, isShuffled, queueList]);

  const handleDeleteById = useCallback(
    (id: number) => {
      if (invokePending) return;
      console.log("Deleting item by id", id);
      invokeRoomAction("Delete", id);
    },
    [invokeRoomAction, invokePending],
  );
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!nextItem) return;
      const url = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/audio/${nextItem.track_id}/`;
      const token = localStorage.getItem(LS_KEY_AUTH_TOKEN);
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).then((response) => {
        if (response.status === 500) {
          console.error("Error fetching next track:", response);
          handleDeleteById(nextItem.id);
        }
      });
    }, 20_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [nextItem, discordSDK.isEmbedded, handleDeleteById]);

  // Only update tracks if new tracks are actually added
  useEffect(() => {
    const unknownTrackIds = Array.from(queueItems.values())
      .filter((item) => !tracks.has(item.track_id))
      .map((item) => item.track_id);
    if (unknownTrackIds.length > 0) {
      startTransition(async () => {
        await apiService.getTracks(unknownTrackIds).then(({ data }) => {
          setTracks((prev) => {
            let changed = false;
            const newTracks = new Map(prev);
            data.forEach((track) => {
              if (!newTracks.has(track.id)) {
                changed = true;
                newTracks.set(track.id, track);
              }
            });
            return changed ? newTracks : prev;
          });
        });
      });
    }
  }, [queueItems, tracks]);

  useEffect(() => {
    if (!isReady) return;
    if (!audioReady) return;
    if (playingSince === null) return;
    if (isPaused) return;
    if (!player.current) return;

    if (!player.current.paused) {
      player.current.play();
    }
  }, [audioReady, isReady, playingSince, isPaused]);

  const handleSkip = useCallback((index: number) => invokeRoomAction("Skip", index), [invokeRoomAction]);
  const handleMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (invokePending) return;
      console.log("Moving item from index", fromIndex, "to", toIndex);
      invokeRoomAction("Move", fromIndex, toIndex);
    },
    [invokeRoomAction, invokePending],
  );
  const handlePlayNext = useCallback(
    (index: number) => {
      if (invokePending) return;
      if (typeof currentItemIndex === "number") {
        if (index < currentItemIndex) {
          console.log("Moving item", index, "to play next (position", currentItemIndex, ")");
          invokeRoomAction("Move", index, currentItemIndex);
        } else if (index > currentItemIndex) {
          console.log("Moving item", index, "to play next (position", currentItemIndex + 1, ")");
          invokeRoomAction("Move", index, currentItemIndex + 1);
        }
      }
    },
    [currentItemIndex, invokeRoomAction, invokePending],
  );

  const seekDebounceTimer = useRef<number | null>(null);
  const lastSeekTime = useRef<number | null>(null);

  // New handleSeek callback with debounce logic
  const handleSeek = useCallback(
    (seekTime: number, pause: boolean = false) => {
      if (!player.current) return;
      if (invokePending) return;
      seekTime = Math.floor(Math.max(0, Math.min(seekTime, duration)));
      seeking.current = true;
      player.current.seek(seekTime);
      player.current.pause();
      setTimestamp(seekTime);
      lastSeekTime.current = seekTime;
      if (seekDebounceTimer.current) {
        clearTimeout(seekDebounceTimer.current);
        seekDebounceTimer.current = null;
      }
      seekDebounceTimer.current = window.setTimeout(() => {
        invokeRoomAction("Seek", player.current!.currentTime, pause);
        seekDebounceTimer.current = null;
      }, 500);
    },
    [invokePending, duration, invokeRoomAction],
  );

  // handleSeekBarSeek now just calls handleSeek
  const handleSeekBarSeek = useCallback(
    (seekTime: number, pause: boolean = false) => {
      handleSeek(seekTime, pause);
    },
    [handleSeek],
  );

  // handlePositionSeek now just calculates seekTime and calls handleSeek
  const handlePositionSeek = useCallback(
    (seconds: number) => {
      if (!player.current) return;
      if (invokePending) return;
      seconds = Math.floor(Math.min(seconds, duration));
      const seekTime = player.current.currentTime + seconds;
      handleSeek(seekTime);
      console.log("Seeking to", seekTime);
    },
    [invokePending, duration, handleSeek],
  );

  const handlePlayToggle = useCallback(() => {
    if (invokePending) return;
    console.log("Toggling play/pause");
    invokeRoomAction("PauseToggle", !isPaused);
  }, [invokePending, isPaused, invokeRoomAction]);

  const handleBackward = useCallback(() => {
    if (!player.current) return;
    if (invokePending) return;
    if (player.current.currentTime >= 5) {
      console.log("Rewinding to start of track");
      handleSeekBarSeek(0, false);
    } else {
      console.log("Skipping backward");
      invokeRoomAction("Skip", Math.max(currentItemIndex ?? 1) - 1);
    }
  }, [invokePending, currentItemIndex, invokeRoomAction, handleSeekBarSeek]);

  const handleForward = useCallback(() => {
    if (invokePending) return;
    console.log("Skipping forward");
    invokeRoomAction("Skip", (currentItemIndex ?? 0) + 1);
  }, [invokePending, currentItemIndex, invokeRoomAction]);

  const handleShuffle = useCallback(() => {
    if (invokePending || typeof isShuffled !== "boolean") return;
    console.log("Toggling shuffle");
    invokeRoomAction("ShuffleToggle", !isShuffled);
  }, [invokePending, isShuffled, invokeRoomAction]);

  const handleLoopToggle = useCallback(() => {
    if (invokePending || typeof isLooping !== "boolean") return;
    console.log("Toggling loop");
    invokeRoomAction("LoopToggle", !isLooping);
  }, [invokePending, isLooping, invokeRoomAction]);

  const handleVolumeChange = useCallback((volume: number) => {
    if (!player.current) return;
    volume = Math.min(Math.max(volume, 0), 1);
    localStorage.setItem("volume", String(volume));
    player.current?.setVolume(volume);
    setVolume(volume);
  }, []);

  const handleCanPlayThrough = useCallback(() => {
    if (!isReady) return;
    setAudioReady(true);
    player.current?.setVolume(volume);
    if (!isPaused && playingSince === null) {
      console.log("Resuming playback after can play through");
      invokeRoomAction("PauseToggle", false);
    }
  }, [isPaused, playingSince, invokeRoomAction, isReady, volume]);

  const handleEnded = useCallback(() => {
    if (!player.current) return;
    if (!isReady) return;
    if (isLooping) {
      player.current.seek(0);
      player.current.play();
      invokeRoomAction("Seek", 0, false);
    } else {
      // Reset player to prevent old audio from playing when skipping to next track
      player.current.reset();
      if (typeof currentItemIndex === "number") {
        if (currentItemIndex + 1 >= queueItems.size && queueItems.size > 0) {
          console.log("Reached end of queue, looping back to start");
          invokeRoomAction("Skip", 0);
        } else {
          console.log("Track ended, skipping to next track");
          invokeRoomAction("Skip", currentItemIndex + 1);
        }
      }
    }
  }, [isLooping, currentItemIndex, queueItems, invokeRoomAction, isReady]);

  // Track desync count across renders
  const desyncCount = useRef(0);
  const handleTimeUpdate = useCallback(() => {
    if (!player.current) return;
    if (!isReady) return;
    if (seeking.current) return;
    if (invokePending) return;

    const newestDuration = duration;

    setDuration(newestDuration);

    const currentTime = timeService.getServerNow();
    if (typeof playingSince === "number") {
      const elapsedTime = (currentTime - playingSince) / 1000;

      if (elapsedTime > newestDuration && newestDuration > 0) {
        return;
      }

      if (elapsedTime >= 1 && Math.abs(player.current.currentTime - elapsedTime) > 1) {
        desyncCount.current++;
        if (desyncCount.current >= 25) {
          console.log("Fixing desync, setting currentTime to", elapsedTime);
          player.current.seek(elapsedTime);
          desyncCount.current = 0;
        }
      } else {
        desyncCount.current = 0;
      }
      if (!isPaused && player.current.paused) {
        player.current.play();
      }
    }

    const newTimestamp = Math.max(player.current.currentTime, 0);
    if (!isNaN(newTimestamp) && !player.current.paused) {
      setTimestamp(newTimestamp);
    }
  }, [playingSince, isPaused, isReady, invokePending, duration]);

  useEffect(() => {
    const timeUpdateInterval = window.setInterval(() => {
      if (player.current && !player.current.paused) {
        handleTimeUpdate();
      }
    }, 100);

    return () => {
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
      }
    };
  });

  const handleFatalError = useCallback(
    (error: unknown) => {
      if (skipOnFatalError.current) return;
      skipOnFatalError.current = true;

      if (typeof error === "string") return;

      console.error("Audio Player error:", error);
      if (typeof currentItemIndex === "number") {
        invokeRoomAction("Skip", currentItemIndex + 1);
      }
    },
    [currentItemIndex, invokeRoomAction],
  );

  useEffect(() => {
    if (!isReady) return;
    if (!audioReady) return;
    if (!player.current) return;

    console.log("Playing since:", playingSince);
    if (playingSince === null) {
      setTimestamp(0);
      return;
    }

    const msSince = timeService.getServerNow() - playingSince;
    console.log("Milliseconds since playing started:", msSince);

    // Check if estimated resume time is past the duration
    const estimatedResumeTime = msSince / 1000;
    if (estimatedResumeTime >= duration && duration > 0 && !isLooping) {
      console.log("Estimated resume time is past duration, skipping to beginning");
      seeking.current = true;
      player.current.seek(0);
      setTimestamp(0);
      invokeRoomAction("Seek", 0, isPaused);
      return;
    }

    if (msSince < 0) {
      setTimeout(() => {
        // Only play if all conditions are met
        if (!isPaused && audioReady && isReady && player.current?.paused) {
          console.log("Centralized: Ensuring playback after delay");
          player.current!.play();
        }
      }, Math.abs(msSince));
      player.current.seek(0);
      setTimestamp(0);
    }
    if (isPaused) {
      console.log("Pausing audio playback");
      player.current.pause();
    } else if (player.current.paused) {
      console.log("Resuming audio playback");
      player.current.play();
    }
  }, [playingSince, isPaused, duration, isReady, audioReady, invokeRoomAction, isLooping]);

  useEffect(() => {
    const handleArrowleft = () => {
      if (!player.current) return;
      const seekTime = player.current.currentTime - 1;
      handleSeek(seekTime);
    };
    const handleArrowRight = () => {
      if (!player.current) return;
      const seekTime = player.current.currentTime + 1;
      handleSeek(seekTime);
    };

    const handleArrowUp = () => {
      if (!player.current) return;
      const newVolume = player.current.volume + 0.01;
      handleVolumeChange(newVolume);
    };
    const handleArrowDown = () => {
      if (!player.current) return;
      const newVolume = player.current.volume - 0.01;
      handleVolumeChange(newVolume);
    };

    const handleKeyPress = (e: KeyboardEvent) => {
      let handled = false;
      switch (e.key) {
        case "ArrowLeft":
          handled = true;
          handleArrowleft();
          break;
        case "ArrowRight":
          handled = true;
          handleArrowRight();
          break;
        case "ArrowUp":
          handled = true;
          handleArrowUp();
          break;
        case "ArrowDown":
          handled = true;
          handleArrowDown();
          break;
        case " ":
        case "Enter":
          handled = true;
          handlePlayToggle();
          break;
      }
      if (handled) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyPress);

    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [handleSeek, handleVolumeChange, handlePlayToggle]);

  useEffect(() => {
    navigator.mediaSession.setActionHandler("play", handlePlayToggle);
    navigator.mediaSession.setActionHandler("pause", handlePlayToggle);
    navigator.mediaSession.setActionHandler("stop", () => {
      handleSeek(0, true);
    });
    navigator.mediaSession.setActionHandler("previoustrack", handleBackward);
    navigator.mediaSession.setActionHandler("nexttrack", handleForward);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") {
        console.log("Media session seek action triggered:", details.seekTime);
        handleSeek(details.seekTime, false);
      }
    });
  }, [handleSeek, handleBackward, handleForward, handlePlayToggle]);

  useMediaSession({
    isReady,
    currentTrack,
    duration,
    timestamp,
    isPaused,
    discordSDK,
  });

  useDiscordActivity({
    isReady,
    currentTrack,
    duration,
    playingSince,
  });

  useEffect(() => {
    if (!isReady) return;
    const currentUniqueId = currentTrack ? currentTrack.id : null;
    const lastUniqueId = lastHlsTrackId.current;

    if (typeof currentUniqueId === "string" && lastUniqueId !== currentUniqueId && currentTrack) {
      lastHlsTrackId.current = currentUniqueId;
      skipOnFatalError.current = false;
      setAudioReady(false);
      const src = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/audio/${currentTrack.id}/`;
      player.current!.loadSource(src);
      setDuration(0);
      setTimestamp(0);
      console.log("Loading new track:", currentTrack.title);
    } else if (typeof currentUniqueId === "string" && lastUniqueId === currentUniqueId) {
      if (typeof playingSince === "number" && duration > 0) {
        const currentTime = timeService.getServerNow();
        const elapsedTime = (currentTime - playingSince) / 1000;
        const seekPosition = Math.max(0, Math.min(elapsedTime, duration));

        if (player.current && Math.abs(player.current.currentTime - seekPosition) > 1 && !player.current.paused) {
          player.current.seek(seekPosition);
          setTimestamp(seekPosition);
          console.log("Restoring playback position to", seekPosition, "seconds");
        }
      } else if (player.current) {
        player.current.seek(0);
        setTimestamp(0);
      }
      setAudioReady(true);
    }
  }, [currentTrack, discordSDK.isEmbedded, isReady, playingSince, duration]);

  return (
    <>
      <AudioPlayer
        ref={player}
        onDuration={(duration) => setDuration(duration)}
        onFatalError={handleFatalError}
        onEnded={handleEnded}
        onCanPlayThrough={handleCanPlayThrough}
        onTimeUpdate={handleTimeUpdate}
      />
      <GradientBackground sourceImage={currentTrack?.id && `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${currentTrack.id}/thumbnail-high`} />
      <dialog className="modal backdrop-blur-xs" ref={modalRef} onClose={() => setIsReady(true)}>
        <div className="modal-action">
          <form method="dialog">
            <button className="btn size-50 font-bold text-6xl">Start</button>
          </form>
        </div>
      </dialog>
      {isReady && (
        <main className="h-screen w-screen flex items-center justify-center overflow-hidden">
          <div className="flex md:hidden relative z-2 w-full justify-center h-full items-center">
            <InterfaceMobile
              currentItemId={currentItemId}
              track={currentTrack}
              duration={duration}
              volume={volume}
              timestamp={timestamp}
              paused={isPaused ?? true}
              looping={isLooping ?? false}
              shuffled={isShuffled ?? false}
              disabled={invokePending}
              onShuffle={handleShuffle}
              onBackward={handleBackward}
              onForward={handleForward}
              onPlayToggle={handlePlayToggle}
              onLoopToggle={handleLoopToggle}
              onSeekBarSeek={handleSeekBarSeek}
              onPositionSeek={handlePositionSeek}
              onVolumeChange={handleVolumeChange}
              tracks={tracks}
              queueList={queueList}
              currentItemIndex={currentItemIndex}
              onMove={handleMove}
              onSkip={handleSkip}
              onDelete={handleDeleteById}
              onPlayNext={handlePlayNext}
            />
          </div>
          <div className="hidden md:flex relative z-2 w-full h-full flex-1 items-center justify-center">
            <InterfaceDesktop
              track={currentTrack}
              currentItemId={currentItemId}
              duration={duration}
              volume={volume}
              timestamp={timestamp}
              paused={isPaused ?? true}
              looping={isLooping ?? false}
              shuffled={isShuffled ?? false}
              disabled={invokePending}
              onShuffle={handleShuffle}
              onBackward={handleBackward}
              onForward={handleForward}
              onPlayToggle={handlePlayToggle}
              onLoopToggle={handleLoopToggle}
              onSeekBarSeek={handleSeekBarSeek}
              onPositionSeek={handlePositionSeek}
              onVolumeChange={handleVolumeChange}
              tracks={tracks}
              queueList={queueList}
              currentItemIndex={currentItemIndex}
              onMove={handleMove}
              onSkip={handleSkip}
              onDelete={handleDeleteById}
              onPlayNext={handlePlayNext}
            />
          </div>
        </main>
      )}
    </>
  );
}
