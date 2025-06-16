import { useEffect, useRef, useState, useMemo } from "react";
import Queue from "./components/Queue";
import MusicPlayerInterface from "./components/MusicPlayerInterface";
import { Track } from "./types/track";
import Hls from "hls.js";
import * as signalR from "@microsoft/signalr";
import * as apiService from "./services/apiService";
import * as timeService from "./services/timeService";
import { QueueItem } from "./types/queue";
import { RoomInfo } from "./types/room";
import { useDiscordSDK } from "./hooks/useDiscordSdk";

export default function App() {
  const discordSDK = useDiscordSDK();
  const roomInfo = useRef<RoomInfo | null>(null);
  const audioPlayer = useRef<HTMLAudioElement>(null);
  const hls = useRef<Hls | null>(null);
  const [tracks, setTracks] = useState(new Map<string, Track>());
  const [queueItems, setQueueItems] = useState(new Map<number, QueueItem>());
  const [queueItemsBuffer, setQueueItemsBuffer] = useState<[
    number,
    QueueItem
  ][]>([]);
  const [controlsDisabled, setControlsDisabled] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [playingSince, setPlayingSince] = useState<number | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [paused, setPaused] = useState(true);
  const [looping, setLooping] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const [duration, setDuration] = useState(0);
  const [timestamp, setTimestamp] = useState(0);

  const queueList = useMemo(() => {
    const list = Array.from(queueItems.values());
    list.sort((a, b) => (shuffled ? a.shuffledIndex - b.shuffledIndex : a.index - b.index));
    return list;
  }, [queueItems, shuffled]);

  useEffect(() => {
    if (!queueItemsBuffer.length) return;
    const items = new Map(queueItems);
    queueItemsBuffer.forEach(([_, item]) => {
      item.isDeleted ? items.delete(item.id) : items.set(item.id, item);
    });
    Array.from(items.values())
      .sort((a, b) => a.index - b.index)
      .forEach((item, idx) => (item.index = idx));
    setQueueItems(items);
    setQueueItemsBuffer([]);
  }, [queueItemsBuffer]);

  useEffect(() => {
    const unknownTrackIds = Array.from(queueItems.values()).filter(item => !tracks.has(item.trackId)).map(item => item.trackId);
    if (unknownTrackIds.length)
      apiService.getTracks(unknownTrackIds).then(({ data }) => {
        const newTracks = new Map(tracks);
        data.forEach(track => newTracks.set(track.id, track));
        setTracks(newTracks);
      });
  }, [queueItems]);

  useEffect(() => {
    if (!audioPlayer.current) return;
    if (Hls.isSupported()) {
      hls.current = new Hls({
        xhrSetup: xhr => {
          const token = localStorage.getItem("authToken") ?? "";
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }
      });
      hls.current.on(Hls.Events.MANIFEST_PARSED, (_, data) => setDuration(data.levels?.[0]?.details?.totalduration ?? 0));
      hls.current.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (currentTrack) {
          const newSrc = `${discordSDK.isEmbedded ? "/.proxy/" : ""}/api/audio/${currentTrack.id}/`;
          if (!hls.current!.url?.includes(currentTrack.id)) hls.current!.loadSource(newSrc);
          if (!paused && hls.current?.media?.paused && playingSince !== null) audioPlayer.current!.play().catch(console.error);
        }
      });
      hls.current.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          connection.current?.invoke("Skip", Math.floor(timeService.getServerNow()), roomInfo.current!.currentTrackIndex + 1);
        }
      });
      hls.current.attachMedia(audioPlayer.current);
    } else {
      alert("HLS is not supported in this browser.");
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    if (queueItemsBuffer.length) return;
    const items = Array.from(queueItems.values()).sort((a, b) => (shuffled ? a.shuffledIndex - b.shuffledIndex : a.index - b.index));
    setCurrentTrack(items[currentTrackIndex]?.trackId ? tracks.get(items[currentTrackIndex].trackId) ?? null : null);
  }, [tracks, queueItems, queueItemsBuffer, currentTrackIndex]);

  const playTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    if (audioPlayer.current && currentTrack && hls.current) {
      const src = `${discordSDK.isEmbedded ? "/.proxy/" : ""}/api/audio/${currentTrack.id}/`;
      if (!hls.current.url?.includes(currentTrack.id)) hls.current.loadSource(src);
      if (!paused && playingSince !== null) {
        playTimeoutRef.current = setTimeout(() => {
          if (hls.current!.media?.paused && !paused && playingSince !== null && playingSince <= timeService.getServerNow()) audioPlayer.current!.play();
        }, Math.max(0, playingSince ? playingSince - timeService.getServerNow() : 0));
      } else {
        audioPlayer.current.pause();
      }
    }
  }, [currentTrack, paused, playingSince]);

  const connection = useRef<signalR.HubConnection | null>(null);
  useEffect(() => {
    connection.current = new signalR.HubConnectionBuilder()
      .withUrl(`${discordSDK.isEmbedded ? "/.proxy" : ""}/api/hubs/queue`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken") ?? ""}` },
      })
      .withAutomaticReconnect()
      .withHubProtocol(new signalR.JsonHubProtocol())
      .configureLogging(signalR.LogLevel.Information)
      .build();
    connection.current.on("QueueUpdate", (queue: RoomInfo, updatedItems: QueueItem[]) => {
      roomInfo.current = queue;
      setQueueItemsBuffer(updatedItems.map(item => [item.id, item]));
      setPlayingSince(queue.playingSince);
      setPaused(queue.isPaused);
      setLooping(queue.isLooping);
      setShuffled(queue.isShuffled);
      setCurrentTrackIndex(queue.currentTrackIndex);
    });
    connection.current.start().catch(console.error);
    return () => { connection.current?.stop(); };
  }, []);

  useEffect(() => { timeService.syncServerTime(discordSDK.isEmbedded); }, [discordSDK.isEmbedded]);
  const seeking = useRef(false);
  useEffect(() => { seeking.current = false; }, [playingSince]);
  const endSeeking = () => setTimeout(() => { seeking.current = false; }, 300);
  const [backgroundColor, setBackgroundColor] = useState("rgba(0, 0, 0, 0.5)");

  return (
    <div className="absolute inset-0 flex flex-row items-center justify-center overflow-hidden" style={{ backgroundColor }}>
      <audio
        ref={audioPlayer}
        onTimeUpdate={() => {
          if (seeking.current) return;
          const currentTime = timeService.getServerNow();
          if (!seeking.current && typeof playingSince === "number") {
            const elapsedTime = ((currentTime - playingSince) % (duration * 1000)) / 1000;
            if (elapsedTime >= 1 && Math.abs(audioPlayer.current!.currentTime - elapsedTime) > 1) audioPlayer.current!.currentTime = elapsedTime;
          }
          setTimestamp(Math.max(audioPlayer.current?.currentTime ?? 0, 0));
        }}
        onEnded={() => {
          if (looping) {
            seeking.current = true;
            audioPlayer.current!.currentTime = 0;
            audioPlayer.current!.play();
          } else {
            connection.current?.invoke("Skip", Math.floor(timeService.getServerNow()), roomInfo.current!.currentTrackIndex + 1);
          }
        }}
        onCanPlayThrough={() => {
          if (!paused && playingSince === null) connection.current?.invoke("PauseToggle", Math.floor(timeService.getServerNow()), false);
        }}
      />
      <MusicPlayerInterface
        track={currentTrack}
        duration={duration}
        timestamp={timestamp}
        paused={paused}
        looping={looping}
        disabled={controlsDisabled}
        onPrimaryColorChange={setBackgroundColor}
        onShuffle={() => {
          setControlsDisabled(true);
          connection.current?.invoke("ShuffleToggle", Math.floor(timeService.getServerNow()), !roomInfo.current!.isShuffled).finally(() => setControlsDisabled(false));
        }}
        onBackward={() => {
          setControlsDisabled(true);
          connection.current?.invoke("Skip", Math.floor(timeService.getServerNow()), roomInfo.current!.currentTrackIndex - 1).finally(() => setControlsDisabled(false));
        }}
        onForward={() => {
          setControlsDisabled(true);
          connection.current?.invoke("Skip", Math.floor(timeService.getServerNow()), roomInfo.current!.currentTrackIndex + 1).finally(() => setControlsDisabled(false));
        }}
        onPlayToggle={() => {
          setControlsDisabled(true);
          connection.current?.invoke("PauseToggle", Math.floor(timeService.getServerNow()), !roomInfo.current!.isPaused).finally(() => setControlsDisabled(false));
        }}
        onLoopToggle={() => {
          setControlsDisabled(true);
          connection.current?.invoke("LoopToggle", Math.floor(timeService.getServerNow()), !roomInfo.current!.isLooping).finally(() => setControlsDisabled(false));
        }}
        onSeek={seekTime => {
          if (seeking.current) return;
          setControlsDisabled(true);
          seeking.current = true;
          audioPlayer.current!.currentTime = seekTime;
          audioPlayer.current!.pause();
          setTimestamp(seekTime);
          connection.current?.invoke("Seek", Math.floor(timeService.getServerNow()), seekTime).catch(console.error).finally(() => { setControlsDisabled(false); endSeeking(); });
        }}
        onVolumeChange={volume => { audioPlayer.current!.volume = volume; }}
      />
      <Queue
        tracks={tracks}
        queueList={queueList}
        currentTrackIndex={currentTrackIndex}
        controlsDisabled={controlsDisabled}
        backgroundColor={backgroundColor}
        onSkip={index => {
          setControlsDisabled(true);
          connection.current?.invoke("Skip", Math.floor(timeService.getServerNow()), index).finally(() => setControlsDisabled(false));
        }}
        onMove={(fromIndex, toIndex) => {
          setControlsDisabled(true);
          connection.current?.invoke("Move", Math.floor(timeService.getServerNow()), fromIndex, toIndex).finally(() => setControlsDisabled(false));
        }}
      />
    </div>
  );
}
