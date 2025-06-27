import {
  useEffect,
  useRef,
  useState,
  useCallback,
  startTransition,
} from "react";
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
  const modalRef = useRef<HTMLDialogElement>(null);
  const [modalClosed, setModalClosed] = useState(false);
  useEffect(() => {
    modalRef.current?.showModal();
  }, []);

  // Memoize tracks map to avoid new reference unless contents change
  const [tracks, setTracks] = useState(() => new Map<string, Track>());

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [duration, setDuration] = useState(0);
  const [timestamp, setTimestamp] = useState(0);

  useEffect(() => {
    timeService.syncServerTime(discordSDK.isEmbedded);
  }, [discordSDK.isEmbedded]);

  useEffect(() => {
    audioPlayer.current!.volume = 0.5;
  }, [audioPlayer]);

  useEffect(() => {
    const handleParticipantsUpdate = (event: {
      participants: Array<{ id: string }>;
    }) => {
      users.current = new Set(event.participants.map((p) => p.id));
    };
    if (discordSDK.isEmbedded) {
      discordSDK.subscribe(
        "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
        handleParticipantsUpdate,
      );
    }

    return () => {
      if (discordSDK.isEmbedded) {
        discordSDK.unsubscribe(
          "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
          handleParticipantsUpdate,
        );
      }
    };
  }, [discordSDK]);

  const users = useRef<Set<string>>(new Set(discordSDK.clientId));
  useEffect(() => {
    const handleParticipantsUpdate = (event: {
      participants: Array<{ id: string }>;
    }) => {
      users.current = new Set(event.participants.map((p) => p.id));
    };
    if (discordSDK.isEmbedded) {
      discordSDK.subscribe(
        "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
        handleParticipantsUpdate,
      );
    }

    return () => {
      if (discordSDK.isEmbedded) {
        discordSDK.unsubscribe(
          "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
          handleParticipantsUpdate,
        );
      }
    };
  }, [discordSDK]);

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

  const seeking = useRef(true);

  const [backgroundColor, setBackgroundColorRaw] = useState("#000000");
  const setBackgroundColor = useCallback(
    (color: string) => {
      setBackgroundColorRaw((prev) => (prev !== color ? color : prev));
    },
    [setBackgroundColorRaw],
  );

  const onSkip = useCallback(
    (index: number) => {
      invokeRoomAction("Skip", index);
    },
    [invokeRoomAction, modalClosed],
  );

  const onMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      console.log("Moving from", fromIndex, "to", toIndex);
      invokeRoomAction("Move", fromIndex, toIndex);
    },
    [invokeRoomAction],
  );

  const onDelete = useCallback(
    (index: number) => {
      if (index === currentTrackIndex) {
        return;
      }
      invokeRoomAction("Delete", index);
    },
    [currentTrackIndex, invokeRoomAction],
  );

  const onPlayNext = useCallback(
    (index: number) => {
      if (typeof currentTrackIndex === "number") {
        if (index < currentTrackIndex) {
          invokeRoomAction("Move", index, currentTrackIndex);
        } else if (index > currentTrackIndex) {
          invokeRoomAction("Move", index, currentTrackIndex + 1);
        }
      }
    },
    [currentTrackIndex, invokeRoomAction],
  );

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
  }, [invokePending, seeking]);

  const onPlayToggle = useCallback(() => {
    if (invokePending) return;
    console.log("Toggling play/pause");
    invokeRoomAction("PauseToggle", !isPaused);
  }, [invokePending, isPaused, invokeRoomAction]);
  const onBackward = useCallback(() => {
    if (invokePending) return;
    console.log("Skipping backward");
    invokeRoomAction("Skip", (currentTrackIndex ?? 0) - 1);
  }, [invokePending, currentTrackIndex, invokeRoomAction]);
  const onForward = useCallback(() => {
    if (invokePending) return;
    console.log("Skipping forward");
    invokeRoomAction("Skip", (currentTrackIndex ?? 0) + 1);
  }, [invokePending, currentTrackIndex, invokeRoomAction]);

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
    [
      invokePending,
      duration,
      invokeRoomAction,
      seeking,
      audioPlayer,
      setTimestamp,
    ],
  );

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

  const onVolumeChange = useCallback(
    (volume: number) => {
      audioPlayer.current!.volume = volume;
      localStorage.setItem("volume", String(volume));
    },
    [audioPlayer],
  );

  const onCanPlayThrough = useCallback(() => {
    if (!modalClosed) return;
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
  }, [
    isLooping,
    currentTrackIndex,
    queueItems,
    invokeRoomAction,
    audioPlayer,
    modalClosed,
  ]);

  const onTimeUpdate = useCallback(() => {
    if (!modalClosed) return;
    if (seeking.current) return;
    const currentTime = timeService.getServerNow();
    if (typeof playingSince === "number") {
      const elapsedTime =
        ((currentTime - playingSince) % (duration * 1000)) / 1000;

      if (
        elapsedTime >= 1 &&
        Math.abs(audioPlayer.current!.currentTime - elapsedTime) > 1
      ) {
        console.log("Fixing desync, setting currentTime to", elapsedTime);
        audioPlayer.current!.currentTime = elapsedTime;
      }
    }
    setTimestamp(Math.max(audioPlayer.current?.currentTime ?? 0, 0));

    if (
      typeof currentTrackIndex !== "number" ||
      queueItems.size === 0 ||
      duration === 0 ||
      currentTrackIndex < 0 ||
      currentTrackIndex >= queueItems.size
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
  }, [
    audioPlayer,
    seeking,
    playingSince,
    duration,
    currentTrackIndex,
    queueItems,
    isShuffled,
    tracks,
    discordSDK.isEmbedded,
    modalClosed,
  ]);

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
            small_text: !discordSDK.isEmbedded
              ? `Room Code: ${discordSDK.instanceId}`
              : undefined,
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
          //sizes: "512x512",
          //type: "image/jpeg",
        },
      ],
    });

    navigator.mediaSession.setPositionState({
      duration: duration,
      playbackRate: audioPlayer.current.playbackRate,
      position: Math.min(duration, timestamp),
    });
  }, [currentTrack, timestamp, duration, discordSDK, audioPlayer, modalClosed]);

  useEffect(() => {
    if (playingSince === null) return;
    const currentTime = timeService.getServerNow();
    const elapsedTime =
      ((currentTime - playingSince) % (duration * 1000)) / 1000;

    setTimestamp(Math.max(0, Math.min(elapsedTime, duration)));
  }, [playingSince, duration]);

  useEffect(() => {
    if (!modalClosed) return;
    console.log("Playing since:", playingSince);
    if (playingSince === null) {
      setTimestamp(0);
    } else {
      const msSince = timeService.getServerNow() - playingSince;
      console.log("Milliseconds since playing started:", msSince);
      if (msSince >= duration * 1000 && duration > 0) {
        console.log("Invoking seek to normalize playback position");
        invokeRoomAction("Seek", 0);
        return;
      }
      if (msSince >= 0) {
        const currentTime = msSince / 1000;
        if (Math.abs(audioPlayer.current!.currentTime - currentTime) > 1) {
          console.log("Fixing desync, setting currentTime to", currentTime);
          audioPlayer.current!.currentTime = currentTime;
        }
        setTimestamp(currentTime);
        if (!isPaused) {
          console.log("Resuming audio playback immediately");
          audioPlayer.current.play();
        }
      } else {
        setTimeout(() => {
          if (!isPaused) {
            console.log("Resuming audio playback after delay");
            audioPlayer.current!.play();
          }
        }, Math.abs(msSince));
        audioPlayer.current.currentTime = 0;
        setTimestamp(0);
      }

      if (isPaused) {
        console.log("Pausing audio playback");
        audioPlayer.current!.pause();
      }
    }
  }, [
    playingSince,
    isPaused,
    duration,
    invokeRoomAction,
    audioPlayer,
    setTimestamp,
    modalClosed,
  ]);

  useEffect(() => {
    if (typeof invokeError !== "string") return;
    console.error("Room action error:", invokeError);
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
    if (unknownTrackIds.length > 0) {
      startTransition(async () => {
        await apiService.getTracks(unknownTrackIds).then(({ data }) => {
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
      });
    }
  }, [queueItems, tracks, startTransition, apiService, setTracks]);

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
  }, [currentTrackId, discordSDK.isEmbedded, loadSource]);

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
          className="hidden pointer-events-none select-none "
          autoPlay={false}
          controls={false}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onCanPlayThrough={onCanPlayThrough}
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
          onShuffle={onShuffle}
          onBackward={onBackward}
          onForward={onForward}
          onPlayToggle={onPlayToggle}
          onLoopToggle={onLoopToggle}
          onSeek={onSeek}
          onVolumeChange={onVolumeChange}
        />
        <Queue
          tracks={tracks}
          queueItems={queueItems}
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
    </>
  );
}
