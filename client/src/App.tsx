import { useEffect, useRef, useState, useCallback, startTransition } from "react";
import Queue from "./components/Queue";
import MusicPlayerInterface from "./components/MusicPlayerInterface";
import { Track } from "./types/track";
import * as apiService from "./services/apiService";
import * as timeService from "./services/timeService";
import { useDiscordSDK } from "./hooks/useDiscordSdk";
import Hls from "hls.js";
import useRoomHub from "./hooks/useRoomHub";
import useHlsAudio from "./hooks/useHlsAudio";
import GradientBackground from "./components/GradientBackground";

export default function App() {
  const discordSDK = useDiscordSDK();
  const audioPlayer = useRef<HTMLAudioElement>(null as unknown as HTMLAudioElement);
  const modalRef = useRef<HTMLDialogElement>(null as unknown as HTMLDialogElement);
  const [modalClosed, setModalClosed] = useState(false);
  useEffect(() => {
    if (!discordSDK.isEmbedded) {
      // Show modal only if not embedded
      modalRef.current.showModal();
    } else {
      setModalClosed(true);
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
    audioPlayer.current.volume = Number(localStorage.getItem("volume") ?? 0.01);
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

  const [backgroundColors, setBackgroundColors] = useState<[string, string]>(["#ffffff", "#000000"]);

  const onSkip = useCallback((index: number) => invokeRoomAction("Skip", index), [invokeRoomAction]);
  const onMove = useCallback((fromIndex: number, toIndex: number) => invokeRoomAction("Move", fromIndex, toIndex), [invokeRoomAction]);
  const onDelete = useCallback(
    (index: number) => {
      if (index !== currentTrackIndex) invokeRoomAction("Delete", index);
    },
    [currentTrackIndex, invokeRoomAction],
  );
  const onPlayNext = useCallback(
    (index: number) => {
      if (typeof currentTrackIndex === "number") {
        if (index < currentTrackIndex) invokeRoomAction("Move", index, currentTrackIndex);
        else if (index > currentTrackIndex) invokeRoomAction("Move", index, currentTrackIndex + 1);
      }
    },
    [currentTrackIndex, invokeRoomAction],
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
      audioPlayer.current!.currentTime = seekTime;
      audioPlayer.current!.pause();
      setTimestamp(seekTime);
      console.log("Seeking to", seekTime, "Pausing:", pause);
      invokeRoomAction("Seek", seekTime, pause);
    },
    [invokePending, duration, invokeRoomAction, audioPlayer],
  );

  const onPlayToggle = useCallback(() => {
    if (invokePending) return;
    console.log("Toggling play/pause");
    invokeRoomAction("PauseToggle", !isPaused);
  }, [invokePending, isPaused, invokeRoomAction]);

  const onBackward = useCallback(() => {
    if (invokePending) return;
    if (audioPlayer.current.currentTime >= 5) {
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
    audioPlayer.current!.volume = volume;
    diskDriveSfx.current.volume = volume;
    localStorage.setItem("volume", String(volume));
  }, []);

  const onCanPlayThrough = useCallback(() => {
    if (!modalClosed) return;
    setAudioReady(true);
    if (!isPaused && playingSince === null) {
      console.log("Resuming playback after can play through");
      invokeRoomAction("PauseToggle", false);
    }
  }, [isPaused, playingSince, invokeRoomAction, modalClosed]);

  const onEnded = useCallback(() => {
    if (!modalClosed) return;
    if (isLooping) {
      audioPlayer.current!.currentTime = 0;
      audioPlayer.current!.play();
      invokeRoomAction("Seek", 0, false);
    } else {
      audioPlayer.current.pause();
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
  }, [isLooping, currentTrackIndex, queueItems, invokeRoomAction, modalClosed]);

  const onTimeUpdate = useCallback(() => {
    if (!modalClosed) return;
    if (seeking.current) return;
    const currentTime = timeService.getServerNow();
    if (typeof playingSince === "number") {
      const elapsedtime = ((currentTime - playingSince) / 1000) % duration;

      if (elapsedtime >= 1 && Math.abs(audioPlayer.current.currentTime - elapsedtime) > 1) {
        console.log("Fixing desync, setting currentTime to", elapsedtime);
        audioPlayer.current!.currentTime = elapsedtime;
      }
      if (!isPaused && audioPlayer.current.paused) {
        audioPlayer.current.play();
      }
    }

    const newTimestamp = Math.max(audioPlayer.current?.currentTime ?? 0, 0);
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
    const timeLeft = duration - (audioPlayer.current?.currentTime ?? 0);
    if (timeLeft <= 10 && timeLeft > 0) {
      // Prefetch next track audio
      const nextTrackId = nextTrack.id;
      const src = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/audio/${nextTrackId}/`
      const token = localStorage.getItem("auth_token");
      if (preFetch.current) return;
      preFetch.current = true;
      fetch(src, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }, [playingSince, duration, currentTrackIndex, queueItems, isShuffled, isPaused, tracks, discordSDK.isEmbedded, modalClosed]);

  useEffect(() => {
    if (!modalClosed) return;
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
  }, [currentTrack, playingSince, duration, discordSDK, users, modalClosed]);

  // Media session API support
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!modalClosed) return;

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
  }, [onPlayToggle, onSeek, onBackward, onForward, modalClosed]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!modalClosed) return;
    if (!currentTrack || !audioPlayer.current) return;

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

    const playbackRate = audioPlayer.current.playbackRate;
    const safeDuration = isFinite(duration) ? duration : undefined;
    const safePosition = isFinite(timestamp) ? Math.min(safeDuration ?? 0, timestamp) : 0;

    navigator.mediaSession.setPositionState({
      duration: safeDuration,
      playbackRate: playbackRate,
      position: safePosition,
    });
  }, [currentTrack, timestamp, duration, discordSDK, modalClosed]);

  useEffect(() => {
    if (!modalClosed) return;
    if (playingSince === null) return;
    if (!isFinite(duration) || duration <= 0) return;
    if (!audioReady) return;
    const currentTime = timeService.getServerNow();
    const elapsedTime = ((currentTime - playingSince) % (duration * 1000)) / 1000;

    if (!isFinite(elapsedTime)) return;
    setTimestamp(Math.max(0, Math.min(elapsedTime, duration)));
  }, [playingSince, duration, modalClosed, audioReady]);

  useEffect(() => {
    if (!modalClosed) return;
    if (!audioReady) return;
    
    console.log("Playing since:", playingSince);
    if (playingSince === null) {
      setTimestamp(0);
    } else {
      const msSince = timeService.getServerNow() - playingSince;
      console.log("Milliseconds since playing started:", msSince);
      if (msSince >= (duration * 1000) && duration > 0) {
        console.log("Invoking seek to normalize playback position");
        seeking.current = true;
        audioPlayer.current.currentTime = 0;
        invokeRoomAction("Seek", 0);
      }
      if (msSince < 0) {
        setTimeout(() => {
          // Only play if all conditions are met
          if (!isPaused && audioReady && modalClosed && audioPlayer.current.paused) {
            console.log("Centralized: Ensuring playback after delay");
            audioPlayer.current!.play();
          }
        }, Math.abs(msSince));
        audioPlayer.current.currentTime = 0;
        setTimestamp(0);
      }
      if (isPaused) {
        console.log("Pausing audio playback");
        audioPlayer.current.pause();
      } else if (audioPlayer.current.paused) {
        console.log("Resuming audio playback");
        audioPlayer.current.play().catch((error) => {
          console.error("Failed to resume audio playback:", error);
        });
      }
    }
  }, [playingSince, isPaused, duration, modalClosed, audioReady, invokeRoomAction]);

  useEffect(() => {
    if (typeof invokeError !== "string") return;
    console.error("Room action error:", invokeError);
  }, [invokeError]);

  useEffect(() => {
    // Update currentTrack if either the track ID or the queue item ID changes
    if (typeof currentTrackId === "string" && typeof currentTrackIndex === "number") {
      const item = queueList.find((item) => {
        const indexToCompare = isShuffled ? item.shuffled_index : item.index;
        return indexToCompare === currentTrackIndex && item.track_id === currentTrackId;
      });
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
  }, [currentTrackId, currentTrackIndex, currentTrack, tracks, queueList]);

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
  const { loadSource } = useHlsAudio({
    audioPlayer,
    onDuration: setDuration,
    onFatalError(data) {
      console.log("HLS fatal error:", data);
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
        default:
          console.error("Unhandled HLS error type:", data.type, data);
          break;
      }
      if (typeof currentTrackIndex === "number") {
        invokeRoomAction("Skip", currentTrackIndex + 1);
      }
    },
  });

  useEffect(() => {
    if (!modalClosed) return;
    const currentUniqueId = currentTrack ? `${currentTrack.id}:${currentTrack.itemId}` : null;
    const lastUniqueId = lastHlsTrackId.current;
    if (typeof currentUniqueId === "string" && lastUniqueId !== currentUniqueId && currentTrack) {
      lastHlsTrackId.current = currentUniqueId;
      skipOnFatalError.current = false;
      preFetch.current = false;
      setAudioReady(false); // Reset readiness on new track
      const src = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/audio/${currentTrack.id}/`;
      if (audioPlayer.current) {
        loadSource(src);
      }
      setDuration(0);
      setTimestamp(0);
    } else if (typeof currentUniqueId === "string" && lastUniqueId === currentUniqueId) {
      // If the track is already loaded, just reset the audio player
      audioPlayer.current!.currentTime = 0;
      audioPlayer.current!.pause();
      setTimestamp(0);
    }
  }, [currentTrack, discordSDK.isEmbedded, loadSource, modalClosed]);

  const [secretUnlocked, setSecretUnlocked] = useState(localStorage.getItem("secret") === "true");
  const secretEverUnlocked = useRef(false);

  useEffect(() => {
    if (!modalClosed) return;
    // Only allow sounds if secret has ever been unlocked
    if (secretUnlocked && secretEverUnlocked.current) {
      secretUnlockedSfx.current.currentTime = 0;
      secretUnlockedSfx.current.play();
    } else if (secretEverUnlocked.current) {
      secretLockedSfx.current.currentTime = 0;
      secretLockedSfx.current.play();
    }
    secretEverUnlocked.current = true;
  }, [secretUnlocked, modalClosed]);
  useEffect(() => {
    if (!modalClosed) return;
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
  }, [isPaused, playingSince, modalClosed, secretUnlocked]);

  useEffect(() => {
    // Ensure playback starts if modalClosed becomes true after audioReady
    if (!modalClosed) return;
    if (!audioReady) return;
    if (playingSince === null) return;
    if (isPaused) return;
    // Only play if not already playing
    if (audioPlayer.current && audioPlayer.current.paused) {
      audioPlayer.current.play();
    }
  }, [audioReady, modalClosed, playingSince, isPaused]);

  return (
    <>
      <dialog
        className="modal backdrop-blur-xs"
        ref={modalRef}
        onClose={() => {
          setModalClosed(true);
          modalRef.current?.close();
        }}
      >
        <div className="modal-action">
          <form method="dialog">
            <button className="btn size-50 font-bold text-6xl">Start</button>
          </form>
        </div>
      </dialog>
      <div
        className="h-screen w-screen flex items-center justify-center md:flex-row md:items-center md:justify-center overflow-hidden"
        style={{
          position: "relative",
        }}
      >
        <GradientBackground backgroundColors={backgroundColors} />
        <div style={{ position: "relative", zIndex: 2, width: "100%", height: "100%" }} className="flex flex-1 items-center justify-center">
          <audio
            ref={audioPlayer}
            className="hidden pointer-events-none select-none"
            autoPlay={false}
            controls={false}
            onTimeUpdate={onTimeUpdate}
            onEnded={onEnded}
            onCanPlayThrough={onCanPlayThrough}
            onError={(e) => {
              console.error("Audio player error:", e);
              if (currentTrack) {
                const src = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/audio/${currentTrack.id}/`;
                loadSource(src);
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
            onPrimaryColorChange={setBackgroundColors}
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
          <Queue
            tracks={tracks}
            queueList={queueList}
            currentTrack={currentTrack}
            currentTrackIndex={currentTrackIndex}
            controlsDisabled={invokePending}
            onSkip={onSkip}
            onMove={onMove}
            onDelete={onDelete}
            onPlayNext={onPlayNext}
          />
        </div>
      </div>
    </>
  );
}
