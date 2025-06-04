import { useEffect, useRef, useState } from "react";
import Queuee from "./components/Queue";
import MusicPlayerInterface from "./components/MusicPlayerInterface";
import { Track } from "./types/track";
import Hls from "hls.js";
import * as signalR from "@microsoft/signalr"
import * as apiService from "./services/apiService";

import { QueueItem } from "./types/queue";
import { RoomInfo } from "./types/room";

//import { useDiscordSDK } from "./hooks/useDiscordSdk";
//import { useDiscordAuth } from "./hooks/useDiscordAuth";
//import VolumeSlider from "./components/VolumeSlider";


export default function App() {
  const queue = useRef<HTMLDivElement>(null);

  const [tracks, setTracks] = useState<Map<string, Track>>(new Map());
  const [queueItems, setQueueItems] = useState<Map<number, QueueItem>>(new Map()); // key is the id of the said item
  const [queueItemsBuffer, setQueueItemsBuffer] = useState<[number, QueueItem][]>([]); // buffer for items that are being updated
  const [queueList, setQueueList] = useState<QueueItem[]>([]);


  /*useEffect(() => {
    apiService.getQueueItems()
      .then((response) => {
        setQueueItemsBuffer(response.data.map((item) => [item.id, item]));
      });
  }, []);*/

  useEffect(() => {
    if (queueItemsBuffer.length === 0) return;

    for (let i = 0; i < queueItemsBuffer.length; i++) {
      queueItemsBuffer[i][1].index += 0.5;
    }

    const items = new Map(queueItems);
    for (const [_, item] of queueItemsBuffer.values()) {
      if (item.isDeleted) {
        items.delete(item.id);
      } else {
        items.set(item.id, item);
      }
    }

    // Recalculate indices by first sorting with index 0.5 and then assigning new indices
    const sortedItems = Array.from(items.values()).sort((a, b) => a.index - b.index);
    for (const [index, item] of sortedItems.entries()) {
      item.index = index;
      items.set(item.id, item);
    }

    setQueueItems(items);
    setQueueItemsBuffer([]);
  }, [queueItemsBuffer]);

  useEffect(() => {
    const unknownTrackIds = new Set<string>();
    queueItems.forEach((item) => {
      if (!tracks.has(item.trackId)) {
        unknownTrackIds.add(item.trackId);
      }
    });

    if (unknownTrackIds.size > 0) {
      apiService.getTracks(Array.from(unknownTrackIds))
        .then((response) => {
          const newTracks = new Map(tracks);
          response.data.forEach((track) => {
            newTracks.set(track.trackId, track);
          });
          setTracks(newTracks);
        });
    }

    setQueueList(Array.from(queueItems.values()).sort((a, b) => a.index - b.index));
  }, [queueItems]);

  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [playingSince, setPlayingSince] = useState<number | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  //const [timestamp, setTimestamp] = useState<number>(0);
  const [paused, setPaused] = useState<boolean>(true);
  const [looping, setLooping] = useState<boolean>(false);
  const [shuffled, setShuffled] = useState<boolean>(false);

  const audioPlayer = useRef<HTMLAudioElement>(null);
  const hls = useRef<Hls | null>(null);

  const [duration, setDuration] = useState<number>(0);
  const [timestamp, setTimestamp] = useState<number>(0);

  useEffect(() => {
    if (audioPlayer.current) {
      if (Hls.isSupported()) {
        hls.current = new Hls({
          xhrSetup: (xhr) => {
            const token = localStorage.getItem("authToken") ?? "";
            if (token) {
              xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            }
          }
        });
        hls.current.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setDuration(data.levels?.[0]?.details?.totalduration ?? 0);
        });
        hls.current.on(Hls.Events.MEDIA_ATTACHED, () => {
          console.log("HLS media attached");
          if (currentTrack) {
            const newSrc = `/.proxy/api/track/${currentTrack.trackId}/playlist.m3u8`;
            if (hls.current!.url?.includes(currentTrack.trackId)) {
              console.log("Loading new track source:", newSrc);
              hls.current!.loadSource(newSrc);
            }
            if (!paused && hls.current?.media?.paused) {
              audioPlayer.current!.play().catch((err) => {
                console.error("Error playing audio:", err);
              });
            }
          }
        });
        hls.current.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error("Network error encountered:", data);
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error("Media error encountered:", data);
                break;
              case Hls.ErrorTypes.OTHER_ERROR:
                console.error("Other error encountered:", data);
                break;
            }
          }
        });
        hls.current.attachMedia(audioPlayer.current);
      } else {
        alert("HLS is not supported in this browser.");
        window.location.reload();
      }
    }
  }, []);

  useEffect(() => {
    if (queueItemsBuffer.length > 0) return;
    const currentQueueItem = Array.from(queueItems.values()).find(i => i.index === currentTrackIndex);
    const trackId = currentQueueItem?.trackId;
    setCurrentTrack(trackId ? tracks.get(trackId) ?? null : null);
  }, [tracks, queueItems, queueItemsBuffer, currentTrackIndex]);

  const playTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    if (audioPlayer.current && currentTrack && hls.current) {
      const src = `/.proxy/api/track/${currentTrack.trackId}/playlist.m3u8`;
      if (!hls.current.url?.includes(currentTrack.trackId)) {
        console.log("Loading new track source:", currentTrack.trackId);
        hls.current.loadSource(src);
      }
      if (!paused && hls.current.media?.paused) {
        playTimeoutRef.current = setTimeout(() => {
          audioPlayer.current!.play();
        }, Math.max(0, playingSince ? playingSince - Date.now() : 0));
      } else {
        audioPlayer.current.pause();
      }
    }
  }, [currentTrack, paused, playingSince]);


  const connection = useRef<signalR.HubConnection | null>(null);
  useEffect(() => {
    connection.current = new signalR.HubConnectionBuilder()
      .withUrl("/.proxy/api/hubs/queue", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken") ?? ""}`,
        }
      })
      .withAutomaticReconnect()
      .withHubProtocol(new signalR.JsonHubProtocol())
      .configureLogging(signalR.LogLevel.Information)
      .build();

    connection.current.on("QueueUpdate", (queue: RoomInfo, updatedItems: QueueItem[]) => {
      console.log("QueueUpdate received", queue, updatedItems);
      setQueueItemsBuffer(updatedItems.map((item) => [item.id, item]));
      
      setPlayingSince(queue.playingSince);
      setPaused(queue.isPaused);
      setLooping(queue.isLooping);
      setShuffled(queue.isShuffled);
      setCurrentTrackIndex(queue.currentTrackIndex);
    });

    connection.current.start()
      .then(() => {
        console.log("SignalR connection established");
      })
      .catch((err) => {
        console.error("Error establishing SignalR connection:", err);
      });

    return () => {
      if (connection.current) {
        connection.current.stop();
      }
    }
  }, []);

  const [listHeight, setListHeight] = useState<number>(window.innerHeight - 24);
  useEffect(() => {
    const handleResize = () => {
      setListHeight(window.innerHeight - 24);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const seeking = useRef<boolean>(false);
  useEffect(() => {
    seeking.current = false;
  }, [playingSince]);

  return (
    <div className="absolute inset-0 flex flex-row items-center justify-center overflow-hidden">
      <audio
        ref={audioPlayer}
        onTimeUpdate={() => {
          const currentTime = Date.now();

          if (!seeking.current && typeof playingSince === "number") {
            const elapsedTime = ((currentTime - playingSince) % (duration * 1000)) / 1000;
            if (Math.abs(audioPlayer.current!.currentTime - elapsedTime) > 1) {
              audioPlayer.current!.currentTime = elapsedTime;
            }
          }
          setTimestamp(Math.max(audioPlayer.current?.currentTime ?? 0, 0));
        }}
        onEnded={() => {
          console.log("Track ended");
          if (looping) {
            audioPlayer.current!.currentTime = 0;
            audioPlayer.current!.play();
          } else {
            connection.current?.invoke("Skip", Date.now(), currentTrackIndex + 1);
          }
        }}
      />
      <MusicPlayerInterface
        track={currentTrack}
        duration={duration}
        timestamp={timestamp}
        paused={paused}
        looping={looping}
        onShuffle={() => {
          connection.current?.invoke("ShuffleToggle", Date.now(), !shuffled);
        }}
        onBackward={() => {
          connection.current?.invoke("Skip", Date.now(), currentTrackIndex - 1);
        }}
        onForward={() => {
          connection.current?.invoke("Skip", Date.now(), currentTrackIndex + 1);
        }}
        onPlayToggle={() => {
          connection.current?.invoke("PauseToggle", Date.now(), !paused);
        }}
        onLoopToggle={() => {
          connection.current?.invoke("LoopToggle", Date.now(), !looping);
        }}
        onSeek={(seekTime) => {
          seeking.current = true;
          audioPlayer.current!.currentTime = seekTime;
          audioPlayer.current!.pause();
          setTimestamp(seekTime);
          connection.current?.invoke("Seek", Date.now(), seekTime)
            .catch((err) => {
              console.error("Error seeking:", err);
              seeking.current = false;
            });
        }}
        onVolumeChange={(volume) => {
          console.log("onVolumeChange", volume);
          audioPlayer.current!.volume = volume;
        }}
      />
      <Queuee
        ref={queue}
        height={listHeight}
        tracks={tracks}
        queueList={queueList}
        onMove={(fromIndex, toIndex) => {
          console.log("onMove", fromIndex, toIndex);
          connection.current?.invoke("Move", Date.now(), fromIndex, toIndex)
        }}
      />
    </div>
  );
}
