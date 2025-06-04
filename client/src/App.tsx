import { useEffect, useRef, useState } from "react";
import Queuee from "./components/Queue";
import MusicPlayerInterface from "./components/MusicPlayerInterface";
import { Track } from "./types/track";
import Hls from "hls.js";
import * as signalR from "@microsoft/signalr"
import * as apiService from "./services/apiService";

import { QueueItem, Queue } from "./types/queue";
import { useDiscordSDK } from "./hooks/useDiscordSdk";
import { useDiscordAuth } from "./hooks/useDiscordAuth";
//import VolumeSlider from "./components/VolumeSlider";


export default function App() {
  const discordSdk = useDiscordSDK();
  const discordAuth = useDiscordAuth();

  const queue = useRef<HTMLDivElement>(null);

  const [tracks, setTracks] = useState<Map<string, Track>>(new Map());
  const [queueItems, setQueueItems] = useState<Map<number, QueueItem>>(new Map()); // key is the id of the said item
  const [queueItemsBuffer, setQueueItemsBuffer] = useState<[number, QueueItem][]>([]); // buffer for items that are being updated
  const [queueList, setQueueList] = useState<QueueItem[]>([]);
 

  useEffect(() => {
    apiService.getQueueItems()
      .then((response) => {
        setQueueItemsBuffer(response.data.map((item) => [item.id, item]));
      });
  }, []);

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
        hls.current.attachMedia(audioPlayer.current);
        hls.current.on(Hls.Events.MEDIA_ATTACHED, () => {
          console.log("HLS media attached");
          if (currentTrack) {
            hls.current!.loadSource(`/.proxy/api/track/${currentTrack.trackId}/playlist.m3u8`);
            audioPlayer.current!.play().catch((err) => {
              console.error("Error playing audio:", err);
            });
          }
        });
        hls.current.on(Hls.Events.ERROR, (event, data) => {
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
        if (currentTrack) {
          hls.current.loadSource(`/.proxy/api/track/${currentTrack.trackId}/playlist.m3u8`);
        }
      } else {
        alert("HLS is not supported in this browser.");
        window.location.reload();
      }
    }
  }, []);

  useEffect(() => {
    const currentQueueItem = Array.from(queueItems.values()).find(i => i.index === currentTrackIndex);
    const trackId = currentQueueItem?.trackId;
    setCurrentTrack(trackId ? tracks.get(trackId) ?? null : null);
  }, [currentTrackIndex, tracks, queueItems]);

  useEffect(() => {
    if (audioPlayer.current && currentTrack && hls.current) {
      hls.current.loadSource(`/.proxy/api/track/${currentTrack.trackId}/playlist.m3u8`);
      if (!paused) {
        setTimeout(() => {
          audioPlayer.current!.play();
        }, Math.max(0, playingSince ? playingSince - Date.now() : 0));
      } else {
        audioPlayer.current.pause();
      }
    }
  }, [currentTrack, paused]);


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

    connection.current.on("QueueUpdate", (queue: Queue, updatedItems: QueueItem[]) => {
      console.log("QueueUpdate received", queue, updatedItems);
      setPlayingSince(queue.playingSince)
      setPaused(queue.isPaused);
      setLooping(queue.isLooping);
      setCurrentTrackIndex(queue.currentTrackIndex);
      
      setQueueItemsBuffer(updatedItems.map((item) => [item.id, item]));
    });

    connection.current.start()
      .then(() => {
        console.log("SignalR connection established");
        connection.current!.invoke("Ping")
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


  return (
    <div className="absolute inset-0 flex flex-row items-center justify-center overflow-hidden">
      <audio
        ref={audioPlayer}
        onTimeUpdate={() => {
          const currentTime = Date.now();

          if (typeof playingSince === "number") {
              const elapsed = Math.floor((currentTime - playingSince) / 1000);
              // if the difference between the current time and the playingSince is greater than 1 second, update the timestamp
              if (Math.abs(audioPlayer.current!.currentTime - elapsed) > 1) {
                audioPlayer.current!.currentTime = elapsed;
              }
          }

          setTimestamp(audioPlayer.current?.currentTime ?? 0);
        }}
      />
      <MusicPlayerInterface
        track={currentTrack}
        duration={duration}
        timestamp={timestamp}
        paused={paused}
        looping={looping}
        onShuffle={() => {
          console.log("onShuffle");
        }}
        onBackward={() => {
          console.log("onBackward");
        }}
        onPlayToggle={() => {
          connection.current?.invoke("PauseResume", Date.now(), !paused);
        }}
        onForward={() => {
          console.log("onForward");
        }}
        onLoopToggle={() => {
          console.log("onLoopToggle");
        }}
        onVolumeChange={(volume) => {
          console.log("onVolumeChange", volume);
        }}
        onSeek={(seekTime) => {
          if (audioPlayer.current) {
            audioPlayer.current.currentTime = seekTime;
            setTimestamp(seekTime);
          }
        }}
      />
      <Queuee
        ref={queue}
        height={984}
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
