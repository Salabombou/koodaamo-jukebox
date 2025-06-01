import { useEffect, useRef, useState } from "react";
import Queue from "./components/Queue";
import MusicPlayerInterface from "./components/MusicPlayerInterface";
import { Track } from "./types/track";
import Hls from "hls.js";
import * as signalR from "@microsoft/signalr"
import * as apiService from "./services/apiService";

import { QueueItem } from "./types/queue";
import { useDiscordSDK } from "./hooks/useDiscordSdk";
import { useDiscordAuth } from "./hooks/useDiscordAuth";
//import VolumeSlider from "./components/VolumeSlider";


export default function App() {
  const discordSdk = useDiscordSDK();
  const discordAuth = useDiscordAuth();

  const queue = useRef<HTMLDivElement>(null);

  const [tracks, setTracks] = useState<Map<string, Track>>(new Map());
  const [queueitems, setQueueItems] = useState<Map<number, QueueItem>>(new Map()); // key is the id of the said item
  const [queueList, setQueueList] = useState<QueueItem[]>([]);

  useEffect(() => {
    apiService.getQueueItems()
      .then((response) => {
        setQueueItems(new Map(response.data.map((item) => [item.id, item])));
      });
  }, []);

  useEffect(() => {
    const unknownTrackIds = new Set<string>();
    queueitems.forEach((item) => {
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

    setTimeout(() => {
      setQueueList(Array.from(queueitems.values()).sort((a, b) => a.index - b.index));
    }, 100);
  }, [queueitems]);

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
        hls.current = new Hls();
        hls.current.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setDuration(data.levels?.[0]?.details?.totalduration ?? 0);
        });
      } else {
        alert("HLS is not supported in this browser.");
        window.location.reload();
      }
    }
  }, []);

  useEffect(() => {
    setCurrentTrack(tracks.get(queueitems.get(currentTrackIndex)?.trackId ?? "") ?? null);
  }, [currentTrackIndex, tracks, queueitems]);


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

    connection.current.on("QueueChange", (startTime: number, endTime: number, currentTrackIndex: number) => {
      console.log("QueueChange", startTime, endTime, currentTrackIndex);
      apiService.getQueueItems(startTime, endTime)
        .then((response) => {
          setQueueItems((prev) => {
            const newQueueItems = new Map(prev);

            response.data.forEach((item) => {
              if (item.isDeleted) {
                newQueueItems.delete(item.id);
              } else {
                item.index = item.index - 0.5; // make sure that for items with the same index, when sorted, the new item is always before the old one
                newQueueItems.set(item.id, item);
              }
            });

            const sortedItems = Array.from(newQueueItems.values()).sort((a, b) => a.index - b.index);
            for (let i = 0; i < sortedItems.length; i++) {
              sortedItems[i].index = i;
            }

            setCurrentTrackIndex(currentTrackIndex);

            return new Map(sortedItems.map((item) => [item.id, item]));
          });
        });
    });

    connection.current.on("PauseResume", (sentAt: number, paused: boolean) => {
      console.log("PauseResume", sentAt, paused);
      setTimeout(() => {
        setPaused(paused);
      }, Math.max(0, sentAt - Date.now()));
    });

    connection.current.on("Skip", (playingSince: number, index: number) => {
      console.log("Skip", playingSince, index);
      setCurrentTrackIndex(index);
      setPlayingSince(playingSince);
      setPaused(false);
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
            if ((currentTime - playingSince) < 0) {
              setTimeout(() => {
                if (audioPlayer.current && !paused) {
                  audioPlayer.current!.play();
                }
              }
                , Math.max(0, playingSince - currentTime));
            } else if (audioPlayer.current) {
              const elapsed = Math.floor((currentTime - playingSince) / 1000);
              // if the difference between the current time and the playingSince is greater than 1 second, update the timestamp
              if (Math.abs(audioPlayer.current.currentTime - elapsed) > 1) {
                audioPlayer.current.currentTime = elapsed;
              }
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
          if (audioPlayer.current) {
            if (paused) {
              audioPlayer.current.play();
            } else {
              audioPlayer.current.pause();
            }
            setPaused(!paused);
          }
        }}
        onForward={() => {
          if (audioPlayer.current) {
            audioPlayer.current.currentTime += 0;
          }
          // play the next track in the queue
          audioPlayer.current!.src = "/test/index.m3u8";
          audioPlayer.current!.load();
          audioPlayer.current!.play();
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
      <Queue
        ref={queue}
        height={984}
        tracks={tracks}
        queueList={queueList}
      />
    </div>
  );
}
