import { useEffect, useRef, useState, useCallback, startTransition } from "react";
import InterfaceDesktop from "./components/desktop/InterfaceDesktop";
import InterfaceMobile from "./components/mobile/InterfaceMobile";
import { Track } from "./types/track";
import * as apiService from "./services/apiService";
import * as timeService from "./services/timeService";
import * as colorService from "./services/colorService";
import { useDiscordSDK } from "./hooks/useDiscordSdk";
import Hls from "hls.js";
import useRoomHub from "./hooks/useRoomHub";
import GradientBackground from "./components/common/GradientBackground";
import QueueMobile from "./components/mobile/QueueMobile";
import QueueDesktop from "./components/desktop/QueueDesktop";
import { useHls } from "./hooks/useHls";
import { useThumbnail } from "./hooks/useThumbnail";
import { ErrorData } from "hls.js";

export default function App() {
  const discordSDK = useDiscordSDK();
  const { getThumbnail, removeThumbnail } = useThumbnail();
  const modalRef = useRef<HTMLDialogElement>(null as unknown as HTMLDialogElement);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [dropdownClosed, setDropdownClosed] = useState(true);
  useEffect(() => {
    if (!discordSDK.isEmbedded) {
      modalRef.current.showModal();
    } else {
      setIsReady(true);
      modalRef.current.close();
    }
  }, [discordSDK.isEmbedded]);

  const [tracks, setTracks] = useState<Map<string, Track>>(new Map());

  const [currentTrack, setCurrentTrack] = useState<(Track & { itemId: number }) | null>(null);
  const [duration, setDuration] = useState(0);
  const [timestamp, setTimestamp] = useState(0);
  const [audioReady, setAudioReady] = useState(false);

  useEffect(() => {
    timeService.syncServerTime(discordSDK.isEmbedded);
  }, [discordSDK.isEmbedded]);

  const secretUnlockedSfx = useRef<HTMLAudioElement>(null as unknown as HTMLAudioElement);
  const secretLockedSfx = useRef<HTMLAudioElement>(null as unknown as HTMLAudioElement);
  const diskDriveSfx = useRef<HTMLAudioElement>(null as unknown as HTMLAudioElement);

  useEffect(() => {
    secretUnlockedSfx.current = new Audio(`${discordSDK.isEmbedded ? "/.proxy" : ""}/sfx/secret-unlocked.mp3`);
    secretLockedSfx.current = new Audio(`${discordSDK.isEmbedded ? "/.proxy" : ""}/sfx/secret-locked.mp3`);
    diskDriveSfx.current = new Audio(`${discordSDK.isEmbedded ? "/.proxy" : ""}/sfx/disc-drive.ogg`);
  }, [discordSDK.isEmbedded]);

  useEffect(() => {
    audioElementRef.current!.volume = Number(localStorage.getItem("volume") ?? 0.01);
    diskDriveSfx.current.volume = Number(localStorage.getItem("volume") ?? 0.01);
  }, []);

  const users = useRef<Set<string>>(new Set(discordSDK.clientId));
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

  const { playingSince, currentTrackIndex, currentTrackId, isLooping, isPaused, isShuffled, queueItems, queueList, invokeRoomAction, invokePending, invokeError } = useRoomHub();

  const seeking = useRef(true);
  const hasSeekToBeginning = useRef(false);

  const [backgroundColors, setBackgroundColors] = useState<[string, string]>(["#ffffff", "#000000"]);

  const onSkip = useCallback((index: number) => invokeRoomAction("Skip", index), [invokeRoomAction]);
  const onMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (invokePending) return;
      console.log("Moving item from index", fromIndex, "to", toIndex);
      invokeRoomAction("Move", fromIndex, toIndex);
    },
    [invokeRoomAction, invokePending],
  );
  const onDelete = useCallback(
    (index: number) => {
      if (index !== currentTrackIndex) invokeRoomAction("Delete", index);
    },
    [currentTrackIndex, invokeRoomAction],
  );
  const onPlayNext = useCallback(
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

  const onSeek = useCallback(
    (seekTime: number, pause: boolean = false) => {
      if (invokePending) return;
      seekTime = Math.floor(Math.max(0, Math.min(seekTime, duration)));
      seeking.current = true;
      audioPlayer.seek(seekTime);
      audioPlayer.pause();
      setTimestamp(seekTime);
      console.log("Seeking to", seekTime, "Pausing:", pause);
      invokeRoomAction("Seek", seekTime, pause);
    },
    [invokePending, duration, invokeRoomAction],
  );

  const onPlayToggle = useCallback(() => {
    if (invokePending) return;
    console.log("Toggling play/pause");
    invokeRoomAction("PauseToggle", !isPaused);
  }, [invokePending, isPaused, invokeRoomAction]);

  const onBackward = useCallback(() => {
    if (invokePending) return;
    if (audioPlayer.currentTime >= 5) {
      console.log("Rewinding to start of track");
      onSeek(0, false);
    } else {
      console.log("Skipping backward");
      invokeRoomAction("Skip", Math.max(currentTrackIndex ?? 1) - 1);
    }
  }, [invokePending, currentTrackIndex, invokeRoomAction, onSeek]);

  const onForward = useCallback(() => {
    if (invokePending) return;
    console.log("Skipping forward");
    invokeRoomAction("Skip", (currentTrackIndex ?? 0) + 1);
  }, [invokePending, currentTrackIndex, invokeRoomAction]);

  const onShuffle = useCallback(() => {
    if (invokePending || typeof isShuffled !== "boolean") return;
    console.log("Toggling shuffle");
    invokeRoomAction("ShuffleToggle", !isShuffled);
  }, [invokePending, isShuffled, invokeRoomAction]);

  const onLoopToggle = useCallback(() => {
    if (invokePending || typeof isLooping !== "boolean") return;
    console.log("Toggling loop");
    invokeRoomAction("LoopToggle", !isLooping);
  }, [invokePending, isLooping, invokeRoomAction]);

  const onVolumeChange = useCallback((volume: number) => {
    audioPlayer.setVolume(volume);
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
    if (!isReady) return;
    if (isLooping) {
      audioPlayer.seek(0);
      audioPlayer.play();
      invokeRoomAction("Seek", 0, false);
    } else {
      audioPlayer.pause();
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
    if (!isReady) return;
    if (seeking.current) return;
    if (invokePending) return; // Don't fix desync during pending operations (like queue moves)

    const currentTime = timeService.getServerNow();
    if (typeof playingSince === "number") {
      const rawElapsedTime = (currentTime - playingSince) / 1000;
      const elapsedtime = isLooping && duration > 0 ? rawElapsedTime % duration : rawElapsedTime;

      if (rawElapsedTime > duration && duration > 0) {
        if (isLooping) {
          // For looping tracks, don't invoke seek action - just let the modulo handle the position
          // The server should handle the looping logic
        } else {
          // Don't pause here - let the audio element naturally reach its end
          // so that onEnded event can fire and trigger track skipping
          return;
        }
      }

      if (elapsedtime >= 1 && Math.abs(audioPlayer.currentTime - elapsedtime) > 1) {
        console.log("Fixing desync, setting currentTime to", elapsedtime);
        audioPlayer.seek(elapsedtime);
      }
      if (!isPaused && audioPlayer.paused) {
        audioPlayer.play();
      }
    }

    const newTimestamp = Math.max(audioPlayer.currentTime ?? 0, 0);
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
    const timeLeft = duration - (audioPlayer.currentTime ?? 0);
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
  }, [playingSince, duration, currentTrackIndex, queueItems, isShuffled, isPaused, tracks, discordSDK.isEmbedded, isReady, isLooping, invokePending]);

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

  // Media session API support
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!isReady) return;

    navigator.mediaSession.setActionHandler("play", onPlayToggle);
    navigator.mediaSession.setActionHandler("pause", onPlayToggle);
    navigator.mediaSession.setActionHandler("stop", () => {
      onSeek(0, true);
    });
    navigator.mediaSession.setActionHandler("previoustrack", onBackward);
    navigator.mediaSession.setActionHandler("nexttrack", onForward);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") {
        console.log("Media session seek action triggered:", details.seekTime);
        onSeek(details.seekTime, false);
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
  }, [onPlayToggle, onSeek, onBackward, onForward, isReady]);

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
    if (!isReady) return;
    if (playingSince === null) return;
    if (!isFinite(duration) || duration <= 0) return;
    if (!audioReady) return;

    // If we just seeked to beginning due to estimated time being past duration,
    // don't calculate timestamp from the old playingSince value
    if (hasSeekToBeginning.current) {
      return;
    }

    const currentTime = timeService.getServerNow();
    const rawElapsedTime = (currentTime - playingSince) / 1000;
    const elapsedTime = isLooping && duration > 0 ? rawElapsedTime % duration : rawElapsedTime;

    if (!isFinite(elapsedTime)) return;

    setTimestamp(Math.max(0, Math.min(elapsedTime, duration)));
  }, [playingSince, duration, isReady, audioReady, isLooping]);

  useEffect(() => {
    if (!isReady) return;
    if (!audioReady) return;

    console.log("Playing since:", playingSince);
    if (playingSince === null) {
      setTimestamp(0);
      hasSeekToBeginning.current = false; // Clear flag when playingSince becomes null
    } else {
      const msSince = timeService.getServerNow() - playingSince;
      console.log("Milliseconds since playing started:", msSince);

      // Check if estimated resume time is past the duration
      const estimatedResumeTime = msSince / 1000;
      if (estimatedResumeTime >= duration && duration > 0 && !isLooping) {
        console.log("Estimated resume time is past duration, skipping to beginning");
        hasSeekToBeginning.current = true; // Set flag to prevent timestamp calculation from old playingSince
        seeking.current = true;
        audioPlayer.seek(0);
        setTimestamp(0); // Explicitly reset timestamp
        // Seek with current server time to restart playback from beginning
        invokeRoomAction("Seek", 0, isPaused);
        return; // Exit early to prevent other seek logic from running
      } else if (msSince >= duration * 1000 && duration > 0 && !isLooping) {
        console.log("Invoking seek to normalize playback position");
        hasSeekToBeginning.current = true; // Set flag to prevent timestamp calculation from old playingSince
        seeking.current = true;
        audioPlayer.seek(0);
        setTimestamp(0); // Explicitly reset timestamp
        invokeRoomAction("Seek", 0, isPaused);
        return; // Exit early to prevent other seek logic from running
      } else {
        // Clear the flag if we don't need to seek to beginning
        hasSeekToBeginning.current = false;
      }

      if (msSince < 0) {
        setTimeout(() => {
          // Only play if all conditions are met
          if (!isPaused && audioReady && isReady && audioPlayer.paused) {
            console.log("Centralized: Ensuring playback after delay");
            audioPlayer.play();
          }
        }, Math.abs(msSince));
        audioPlayer.seek(0);
        setTimestamp(0);
      }
      if (isPaused) {
        console.log("Pausing audio playback");
        audioPlayer.pause();
      } else if (audioPlayer.paused) {
        console.log("Resuming audio playback");
        audioPlayer.play();
      }
    }
  }, [playingSince, isPaused, duration, isReady, audioReady, invokeRoomAction, isLooping]);

  useEffect(() => {
    if (typeof invokeError !== "string") return;
    console.error("Room action error:", invokeError);
  }, [invokeError]);

  useEffect(() => {
    // Update currentTrack if either the track ID or the queue item ID changes
    if (typeof currentTrackId === "string" && typeof currentTrackIndex === "number") {
      // First try to find by both index and track_id (normal case)
      let item = queueList.find((item) => {
        const indexToCompare = isShuffled ? item.shuffled_index : item.index;
        return indexToCompare === currentTrackIndex && item.track_id === currentTrackId;
      });

      // If not found, fallback to finding by track_id only (handles move operations)
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
      // Update if track or itemId changed
      if (!currentTrack || currentTrack.id !== currentTrackId || currentTrack.itemId !== item.id) {
        setCurrentTrack({ ...track, itemId: item.id });
        document.title = `Now playing: ${track.title} • ${track.uploader}`;
      }
    }
  }, [currentTrackId, currentTrackIndex, currentTrack, tracks, queueList, isShuffled]);

  // Extract colors from current track thumbnail
  useEffect(() => {
    if (!currentTrack?.id) {
      return;
    }

    const extractColors = async () => {
      try {
        const thumbnailUrl = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${currentTrack.id}/thumbnail-high`;
        const blobUrl = await getThumbnail(thumbnailUrl);

        if (blobUrl) {
          const colors = await colorService.getProminentColorFromUrl(blobUrl);
          setBackgroundColors(colors);
        }
      } catch (error) {
        console.warn("Failed to extract colors from thumbnail:", error);
      }
    };

    extractColors();

    // Cleanup function to remove thumbnail when track changes
    return () => {
      removeThumbnail(currentTrack.id);
    };
  }, [currentTrack?.id, discordSDK.isEmbedded, getThumbnail, removeThumbnail]);

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

  const lastHlsTrackId = useRef<string | null>(null);
  const skipOnFatalError = useRef(false);
  const preFetch = useRef(false);

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

  useEffect(() => {
    if (!isReady) return;
    // Use only track ID for uniqueness - item ID changes during queue moves but shouldn't trigger reloading
    const currentUniqueId = currentTrack ? currentTrack.id : null;
    const lastUniqueId = lastHlsTrackId.current;

    if (typeof currentUniqueId === "string" && lastUniqueId !== currentUniqueId && currentTrack) {
      lastHlsTrackId.current = currentUniqueId;
      skipOnFatalError.current = false;
      preFetch.current = false;
      setAudioReady(false); // Reset readiness on new track
      const src = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/audio/${currentTrack.id}/`;
      audioPlayer.loadSource(src);
      setDuration(0);
      setTimestamp(0);
      console.log("Loading new track:", currentTrack.title);
    } else if (typeof currentUniqueId === "string" && lastUniqueId === currentUniqueId) {
      // If the track is already loaded, restore the correct position based on server time
      if (typeof playingSince === "number" && duration > 0) {
        const currentTime = timeService.getServerNow();
        const elapsedTime = (currentTime - playingSince) / 1000;
        const seekPosition = Math.max(0, Math.min(elapsedTime, duration));

        if (Math.abs(audioPlayer.currentTime - seekPosition) > 1) {
          audioPlayer.seek(seekPosition);
          setTimestamp(seekPosition);
          console.log("Restoring playback position to", seekPosition, "seconds");
        }
      } else {
        audioPlayer.seek(0);
        setTimestamp(0);
      }
      // Set audioReady to true since the track is already loaded
      setAudioReady(true);
      // Don't pause here - let the playback state management handle play/pause
    } else if (!currentTrack && lastUniqueId) {
      // Current track became null (might happen during queue operations)
      console.log("Current track became null, keeping last track loaded");
      // Don't change the loaded track, just pause playback
      audioPlayer.pause();
    }
  }, [currentTrack, discordSDK.isEmbedded, isReady, playingSince, duration]);

  const [secretUnlocked, setSecretUnlocked] = useState(localStorage.getItem("secret") === "true");
  const secretEverUnlocked = useRef(false);

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
    }

    // Pause SFX exactly when playback starts (playingSince transitions from null to a number)
    if (!isPaused && playingSince !== null) {
      diskDriveSfx.current.pause();
    }
  }, [isPaused, playingSince, isReady, secretUnlocked]);

  useEffect(() => {
    // Ensure playback starts if isReady becomes true after audioReady
    if (!isReady) return;
    if (!audioReady) return;
    if (playingSince === null) return;
    if (isPaused) return;
    // Only play if not already playing
    if (audioPlayer.paused) {
      audioPlayer.play();
    }
  }, [audioReady, isReady, playingSince, isPaused]);

  // Ensure audioPlayer is only created when audioElement is available
  const audioPlayer = useHls({
    audioElement: audioElementRef,
    onDuration: setDuration,
    onFatalError: handleFatalError,
  });

  return (
    <>
      {/* Hidden audio element for HLS playback */}
      <audio ref={audioElementRef} className="sr-only" controls={false} autoPlay={false} onEnded={handleEnded} onCanPlayThrough={handleCanPlayThrough} onTimeUpdate={handleTimeUpdate} />

      <GradientBackground backgroundColors={backgroundColors} />

      {/* Startup Modal */}
      <dialog className="modal backdrop-blur-xs" ref={modalRef} onClose={() => setIsReady(true)}>
        <div className="modal-action">
          <form method="dialog">
            <button className="btn size-50 font-bold text-6xl">Start</button>
          </form>
        </div>
      </dialog>

      {/* Main App */}
      {isReady && (
        <main className="h-screen w-screen flex items-center justify-center overflow-hidden">
          {/* Mobile UI - visible on screens smaller than md (768px) */}
          <div className="flex md:hidden relative z-2 w-full justify-center h-full items-center">
            <InterfaceMobile
              visible={dropdownClosed}
              track={currentTrack}
              duration={duration}
              timestamp={timestamp}
              paused={isPaused ?? true}
              looping={isLooping ?? false}
              shuffled={isShuffled ?? false}
              disabled={invokePending}
              backgroundColor={backgroundColors[0]}
              onShuffle={onShuffle}
              onBackward={onBackward}
              onForward={onForward}
              onPlayToggle={onPlayToggle}
              onLoopToggle={onLoopToggle}
              onSeek={onSeek}
              onVolumeChange={onVolumeChange}
              setSecret={setSecretUnlocked}
            />

            <QueueMobile
              tracks={tracks}
              queueList={queueList}
              currentTrack={currentTrack}
              currentTrackIndex={currentTrackIndex}
              paused={isPaused ?? true}
              loop={isLooping ?? false}
              controlsDisabled={invokePending}
              timestamp={timestamp}
              duration={duration}
              onDropdownAction={(action) => {
                setDropdownClosed(action === "close");
                console.log("Dropdown action:", action);
              }}
              onPlayToggle={onPlayToggle}
              onLoopToggle={onLoopToggle}
              onMove={onMove}
              onSkip={onSkip}
              onDelete={onDelete}
              onPlayNext={onPlayNext}
            />
          </div>

          {/* Desktop UI - visible on screens md (768px) and larger */}
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
              onShuffle={onShuffle}
              onBackward={onBackward}
              onForward={onForward}
              onPlayToggle={onPlayToggle}
              onLoopToggle={onLoopToggle}
              onSeek={onSeek}
              onVolumeChange={onVolumeChange}
              setSecret={setSecretUnlocked}
            />

            <QueueDesktop
              visible={dropdownClosed}
              tracks={tracks}
              queueList={queueList}
              currentTrack={currentTrack}
              currentTrackIndex={currentTrackIndex}
              controlsDisabled={invokePending}
              onMove={onMove}
              onSkip={onSkip}
              onDelete={onDelete}
              onPlayNext={onPlayNext}
            />
          </div>
        </main>
      )}
    </>
  );
}
