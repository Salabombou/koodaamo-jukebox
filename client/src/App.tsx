import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import Hls, { ErrorData } from "hls.js";

import AudioPlayer, { AudioPlayerRef } from "./components/common/AudioPlayer";
import GradientBackground from "./components/common/GradientBackground";
import InterfaceDesktop from "./components/desktop/InterfaceDesktop";
import InterfaceMobile from "./components/mobile/InterfaceMobile";
import { useDiscordSDK } from "./hooks/useDiscordSDK";
import useRoomHub from "./hooks/useRoomHub";
import * as apiService from "./services/apiService";
import * as colorService from "./services/colorService";
import * as thumbnailService from "./services/thumbnailService";
import * as timeService from "./services/timeService";
import { Track } from "./types/track";

export default function App() {
  const discordSDK = useDiscordSDK();
  // Replaced useThumbnail hook with direct service usage
  const { playingSince, currentTrackIndex, currentTrackId, isLooping, isPaused, isShuffled, queueItems, queueList, invokeRoomAction, invokePending, invokeError } = useRoomHub();
  const player = useRef<AudioPlayerRef>(null);
  const modalRef = useRef<HTMLDialogElement>(null as unknown as HTMLDialogElement);
  const seeking = useRef(true);
  const users = useRef<Set<string>>(new Set(discordSDK.clientId));
  const secretUnlockedSfx = useRef<HTMLAudioElement>(null as unknown as HTMLAudioElement);
  const secretLockedSfx = useRef<HTMLAudioElement>(null as unknown as HTMLAudioElement);
  const diskDriveSfx = useRef<HTMLAudioElement>(null as unknown as HTMLAudioElement);
  const lastHlsTrackId = useRef<string | null>(null);
  const skipOnFatalError = useRef(false);
  const preFetch = useRef(false);
  const secretEverUnlocked = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [tracks, setTracks] = useState<Map<string, Track>>(new Map());
  const [currentTrack, setCurrentTrack] = useState<(Track & { itemId: number }) | null>(null);
  const [duration, setDuration] = useState(0);
  const [timestamp, setTimestamp] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [backgroundColors, setBackgroundColors] = useState<[string, string]>(["#ffffff", "#000000"]);
  const [secretUnlocked, setSecretUnlocked] = useState(localStorage.getItem("secret") === "true");

  useEffect(() => {
    if (!discordSDK.isEmbedded) {
      modalRef.current.showModal();
    } else {
      setIsReady(true);
      modalRef.current.close();
    }
  }, [discordSDK.isEmbedded]);

  useEffect(() => {
    timeService.syncServerTime(discordSDK.isEmbedded);
  }, [discordSDK.isEmbedded]);

  useEffect(() => {
    secretUnlockedSfx.current = new Audio(`${discordSDK.isEmbedded ? "/.proxy" : ""}/sfx/secret-unlocked.mp3`);
    secretLockedSfx.current = new Audio(`${discordSDK.isEmbedded ? "/.proxy" : ""}/sfx/secret-locked.mp3`);
    diskDriveSfx.current = new Audio(`${discordSDK.isEmbedded ? "/.proxy" : ""}/sfx/disc-drive.ogg`);
  }, [discordSDK.isEmbedded]);

  useEffect(() => {
    player.current!.setVolume(Number(localStorage.getItem("volume") ?? 0.01));
    diskDriveSfx.current.volume = Number(localStorage.getItem("volume") ?? 0.01);
  }, []);

  useEffect(() => {
    const handleParticipantsUpdate = (event: { participants: Array<{ id: string }> }) => {
      users.current = new Set(event.participants.map((p) => p.id));
    };
    if (discordSDK.isEmbedded) {
      discordSDK.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", handleParticipantsUpdate);
    }
    return () => {
      if (discordSDK.isEmbedded) {
        discordSDK.unsubscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", handleParticipantsUpdate);
      }
    };
  }, [discordSDK]);

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
    seeking.current = invokePending;
  }, [invokePending]);

  useEffect(() => {
    if (!isReady) return;
    if (!currentTrack) return;
    if (typeof playingSince !== "number") return;
    if (duration <= 0) return;

    console.log("Setting Discord activity for track:", currentTrack.title);

    const startTime = playingSince;
    const endTime = startTime + duration * 1000;

    discordSDK.commands
      .setActivity({
        activity: {
          type: 2, // ActivityType.LISTENING
          details: currentTrack.title,
          state: currentTrack.uploader,
          assets: {
            large_image: `${window.location.origin}${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${currentTrack.id}/thumbnail-high`,
            small_text: !discordSDK.isEmbedded ? `Room Code: ${discordSDK.instanceId}` : undefined,
          },
          timestamps: {
            start: startTime,
            end: endTime,
          },
          party: discordSDK.isEmbedded
            ? {
                id: discordSDK.instanceId,
                size: [users.current.size, 99],
              }
            : {},
        },
      })
      .catch((error) => {
        console.error("Failed to set Discord activity:", error);
      });
  }, [currentTrack, playingSince, duration, discordSDK, users, isReady]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!isReady) return;
    if (!currentTrack) return;

    // Update media session metadata
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.uploader,
      artwork: [
        {
          src: `${window.location.origin}${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${currentTrack.id}/thumbnail-high`,
        },
      ],
    });

    const playbackRate = 1;
    const safeDuration = isFinite(duration) ? duration : undefined;
    const safePosition = isFinite(timestamp) ? Math.min(safeDuration ?? 0, timestamp) : 0;

    navigator.mediaSession.setPositionState({
      duration: safeDuration,
      playbackRate: playbackRate,
      position: safePosition,
    });
  }, [currentTrack, timestamp, duration, discordSDK, isReady]);

  useEffect(() => {
    if (!player.current) return;
    if (!isReady) return;
    if (!audioReady) return;

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
        if (!player.current) return;
        if (!isPaused && audioReady && isReady && player.current.paused) {
          console.log("Centralized: Ensuring playback after delay");
          player.current.play();
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
    if (typeof invokeError !== "string") return;
    console.error("Room action error:", invokeError);
  }, [invokeError]);

  useEffect(() => {
    if (typeof currentTrackId === "string" && typeof currentTrackIndex === "number") {
      let item = queueList.find((item) => {
        const indexToCompare = isShuffled ? item.shuffled_index : item.index;
        return indexToCompare === currentTrackIndex && item.track_id === currentTrackId;
      });

      if (!item) {
        item = queueList.find((item) => item.track_id === currentTrackId);
        if (item) {
          console.log("Current track found by ID only after queue move, index mismatch detected");
        }
      }

      const track = tracks.get(currentTrackId);
      if (!item || !track) {
        return;
      }

      if (!currentTrack || currentTrack.id !== currentTrackId || currentTrack.itemId !== item.id) {
        setCurrentTrack({ ...track, itemId: item.id });
        document.title = `Now playing: ${track.title} • ${track.uploader}`;
      }
    }
  }, [currentTrackId, currentTrackIndex, currentTrack, tracks, queueList, isShuffled]);

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
    if (!isReady || !player.current) return;
    const currentUniqueId = currentTrack ? currentTrack.id : null;
    const lastUniqueId = lastHlsTrackId.current;

    if (typeof currentUniqueId === "string" && lastUniqueId !== currentUniqueId && currentTrack) {
      lastHlsTrackId.current = currentUniqueId;
      skipOnFatalError.current = false;
      preFetch.current = false;
      setAudioReady(false);
      const src = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/audio/${currentTrack.id}/`;
      player.current.loadSource(src);
      setDuration(0);
      setTimestamp(0);
      console.log("Loading new track:", currentTrack.title);
    } else if (typeof currentUniqueId === "string" && lastUniqueId === currentUniqueId) {
      if (typeof playingSince === "number" && duration > 0) {
        const currentTime = timeService.getServerNow();
        const elapsedTime = (currentTime - playingSince) / 1000;
        const seekPosition = Math.max(0, Math.min(elapsedTime, duration));

        if (Math.abs(player.current.currentTime - seekPosition) > 1) {
          player.current.seek(seekPosition);
          setTimestamp(seekPosition);
          console.log("Restoring playback position to", seekPosition, "seconds");
        }
      } else {
        player.current.seek(0);
        setTimestamp(0);
      }
      setAudioReady(true);
    }
  }, [currentTrack, discordSDK.isEmbedded, isReady, playingSince, duration]);

  useEffect(() => {
    if (!isReady) return;
    // Only allow sounds if secret has ever been unlocked
    if (secretUnlocked && secretEverUnlocked.current) {
      secretUnlockedSfx.current.currentTime = 0;
      secretUnlockedSfx.current.play();
    } else if (secretEverUnlocked.current) {
      secretLockedSfx.current.currentTime = 0;
      secretLockedSfx.current.play();
    }
    secretEverUnlocked.current = true;
  }, [secretUnlocked, isReady]);

  useEffect(() => {
    if (!isReady) return;
    if (!secretUnlocked) return;

    // Play SFX when unpaused and playback hasn't started yet
    if (!isPaused && playingSince === null) {
      diskDriveSfx.current.currentTime = 0;
      diskDriveSfx.current.play();
    } else {
      diskDriveSfx.current.pause();
    }
  }, [isPaused, playingSince, isReady, secretUnlocked]);

  useEffect(() => {
    if (!isReady) return;
    if (!audioReady) return;
    if (playingSince === null) return;
    if (isPaused) return;
    if (!player.current) return;

    if (player.current.paused) {
      player.current.play();
    }
  }, [audioReady, isReady, playingSince, isPaused]);

  // Extract colors from current track thumbnail
  useEffect(() => {
    if (!currentTrack?.id) {
      return;
    }

    const extractColors = async () => {
      try {
        const thumbnailUrl = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${currentTrack.id}/thumbnail-high`;
        const blobUrl = await thumbnailService.getThumbnail(thumbnailUrl);

        if (blobUrl) {
          const colors = await colorService.getProminentColorFromUrl(blobUrl);
          setBackgroundColors(colors);
        }
      } catch (error) {
        console.warn("Failed to extract colors from thumbnail:", error);
      }
    };

    extractColors();

    return () => {
      const thumbnailUrl = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${currentTrack.id}/thumbnail-high`;
      thumbnailService.removeThumbnail(thumbnailUrl);
    };
  }, [currentTrack?.id, discordSDK.isEmbedded]);

  const handleSkip = useCallback((index: number) => invokeRoomAction("Skip", index), [invokeRoomAction]);
  const handleMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (invokePending) return;
      console.log("Moving item from index", fromIndex, "to", toIndex);
      invokeRoomAction("Move", fromIndex, toIndex);
    },
    [invokeRoomAction, invokePending],
  );
  const handleDelete = useCallback(
    (index: number) => {
      if (index !== currentTrackIndex) invokeRoomAction("Delete", index);
    },
    [currentTrackIndex, invokeRoomAction],
  );
  const handlePlayNext = useCallback(
    (index: number) => {
      if (invokePending) return;
      if (typeof currentTrackIndex === "number") {
        if (index < currentTrackIndex) {
          console.log("Moving item", index, "to play next (position", currentTrackIndex, ")");
          invokeRoomAction("Move", index, currentTrackIndex);
        } else if (index > currentTrackIndex) {
          console.log("Moving item", index, "to play next (position", currentTrackIndex + 1, ")");
          invokeRoomAction("Move", index, currentTrackIndex + 1);
        }
      }
    },
    [currentTrackIndex, invokeRoomAction, invokePending],
  );

  const handleSeek = useCallback(
    (seekTime: number, pause: boolean = false) => {
      if (!player.current) return;
      if (invokePending) return;
      seekTime = Math.floor(Math.max(0, Math.min(seekTime, duration)));
      seeking.current = true;
      player.current.seek(seekTime);
      player.current.pause();
      setTimestamp(seekTime);
      console.log("Seeking to", seekTime, "Pausing:", pause);
      invokeRoomAction("Seek", seekTime, pause);
    },
    [invokePending, duration, invokeRoomAction],
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
      handleSeek(0, false);
    } else {
      console.log("Skipping backward");
      invokeRoomAction("Skip", Math.max(currentTrackIndex ?? 1) - 1);
    }
  }, [invokePending, currentTrackIndex, invokeRoomAction, handleSeek]);

  const handleForward = useCallback(() => {
    if (invokePending) return;
    console.log("Skipping forward");
    invokeRoomAction("Skip", (currentTrackIndex ?? 0) + 1);
  }, [invokePending, currentTrackIndex, invokeRoomAction]);

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
    player.current.setVolume(volume);
    diskDriveSfx.current.volume = volume;
    localStorage.setItem("volume", String(volume));
  }, []);

  const handleCanPlayThrough = useCallback(() => {
    if (!isReady) return;
    setAudioReady(true);
    if (!isPaused && playingSince === null) {
      console.log("Resuming playback after can play through");
      invokeRoomAction("PauseToggle", false);
    }
  }, [isPaused, playingSince, invokeRoomAction, isReady]);

  const handleEnded = useCallback(() => {
    if (!player.current) return;
    if (!isReady) return;
    if (isLooping) {
      player.current.seek(0);
      player.current.play();
      invokeRoomAction("Seek", 0, false);
    } else {
  // Fully reset underlying element to avoid a brief replay of old buffered audio
  player.current.reset();
      if (typeof currentTrackIndex === "number") {
        if (currentTrackIndex + 1 >= queueItems.size && queueItems.size > 0) {
          console.log("Reached end of queue, looping back to start");
          invokeRoomAction("Skip", 0);
        } else {
          console.log("Track ended, skipping to next track");
          invokeRoomAction("Skip", currentTrackIndex + 1);
        }
      }
    }
  }, [isLooping, currentTrackIndex, queueItems, invokeRoomAction, isReady]);

  const handleTimeUpdate = useCallback(() => {
    if (!player.current) return;
    if (!isReady) return;
    if (seeking.current) return;
    if (invokePending) return;

    const currentTime = timeService.getServerNow();
    if (typeof playingSince === "number") {
      const elapsedTime = (currentTime - playingSince) / 1000;

      if (elapsedTime > duration && duration > 0) {
        return;
      }

      if (elapsedTime >= 1 && Math.abs(player.current.currentTime - elapsedTime) > 1) {
        console.log("Fixing desync, setting currentTime to", elapsedTime);
        player.current.seek(elapsedTime);
      }
      if (!isPaused && player.current.paused) {
        player.current.play();
      }
    }

    const newTimestamp = Math.max(player.current.currentTime ?? 0, 0);
    if (!isNaN(newTimestamp)) {
      setTimestamp(newTimestamp);
    }

    if (typeof currentTrackIndex !== "number" || queueItems.size === 0 || duration === 0 || currentTrackIndex < 0 || currentTrackIndex >= queueItems.size) {
      return;
    } // No next track

    let nextTrack: Track | null = null;
    for (const item of queueItems.values()) {
      if ((isShuffled ? item.shuffled_index : item.index) === currentTrackIndex + 1) {
        nextTrack = tracks.get(item.track_id) ?? null;
        break;
      }
    }
    if (!nextTrack) return;
    const timeLeft = duration - (player.current.currentTime ?? 0);
    if (timeLeft <= 10 && timeLeft > 0) {
      // Prefetch next track audio
      const nextTrackId = nextTrack.id;
      const src = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/audio/${nextTrackId}/`;
      const token = localStorage.getItem("auth_token");
      if (preFetch.current) return;
      preFetch.current = true;
      fetch(src, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }, [playingSince, duration, currentTrackIndex, queueItems, isShuffled, isPaused, tracks, discordSDK.isEmbedded, isReady, invokePending]);

  const handleFatalError = useCallback(
    (data: ErrorData | Event | string) => {
      if (skipOnFatalError.current) return; // Prevent multiple skips
      skipOnFatalError.current = true;

      if (typeof data === "string") return;

      if ("fatal" in data) {
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
          default:
            console.error("Unhandled HLS error type:", data.type, data);
            break;
        }
      } else if (data instanceof Event) {
        console.error("Audio Player error:", data);
      }

      if (typeof currentTrackIndex === "number") {
        invokeRoomAction("Skip", currentTrackIndex + 1);
      }
    },
    [currentTrackIndex, invokeRoomAction],
  );

  // Media session API support
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!isReady) return;

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

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("stop", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, [handlePlayToggle, handleSeek, handleBackward, handleForward, isReady]);

  return (
    <>
      <AudioPlayer ref={player} onDuration={setDuration} onFatalError={handleFatalError} onEnded={handleEnded} onCanPlayThrough={handleCanPlayThrough} onTimeUpdate={handleTimeUpdate} />
      <GradientBackground backgroundColors={backgroundColors} />
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
              track={currentTrack}
              duration={duration}
              timestamp={timestamp}
              paused={isPaused ?? true}
              looping={isLooping ?? false}
              shuffled={isShuffled ?? false}
              disabled={invokePending}
              backgroundColor={backgroundColors[0]}
              onShuffle={handleShuffle}
              onBackward={handleBackward}
              onForward={handleForward}
              onPlayToggle={handlePlayToggle}
              onLoopToggle={handleLoopToggle}
              onSeek={handleSeek}
              onVolumeChange={handleVolumeChange}
              setSecret={setSecretUnlocked}
              tracks={tracks}
              queueList={queueList}
              currentTrackIndex={currentTrackIndex}
              onMove={handleMove}
              onSkip={handleSkip}
              onDelete={handleDelete}
              onPlayNext={handlePlayNext}
            />
          </div>
          <div className="hidden md:flex relative z-2 w-full h-full flex-1 items-center justify-center">
            <InterfaceDesktop
              track={currentTrack}
              duration={duration}
              timestamp={timestamp}
              paused={isPaused ?? true}
              looping={isLooping ?? false}
              shuffled={isShuffled ?? false}
              disabled={invokePending}
              backgroundColor={backgroundColors[0]}
              onShuffle={handleShuffle}
              onBackward={handleBackward}
              onForward={handleForward}
              onPlayToggle={handlePlayToggle}
              onLoopToggle={handleLoopToggle}
              onSeek={handleSeek}
              onVolumeChange={handleVolumeChange}
              setSecret={setSecretUnlocked}
              tracks={tracks}
              queueList={queueList}
              currentTrackIndex={currentTrackIndex}
              onMove={handleMove}
              onSkip={handleSkip}
              onDelete={handleDelete}
              onPlayNext={handlePlayNext}
            />
          </div>
        </main>
      )}
    </>
  );
}
