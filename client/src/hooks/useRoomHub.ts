import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import * as signalR from "@microsoft/signalr";

import * as timeService from "../services/timeService";
import { QueueItem } from "../types/queue";
import { RoomInfo } from "../types/room";

import { useDiscordSDK } from "./useDiscordSDK";

export default function useRoomHub() {
  const discordSDK = useDiscordSDK();

  const [playingSince, setPlayingSince] = useState<number | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState<boolean | null>(null);
  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  const [isShuffled, setIsShuffled] = useState<boolean | null>(null);

  const [queueItems, setQueueItems] = useState<Map<number, QueueItem>>(new Map());
  const [queueList, setQueueList] = useState<QueueItem[]>([]);

  const connection = useRef<signalR.HubConnection | null>(null);

  const [invokeError, setInvokeError] = useState<string | null>(null);
  const [invokePending, startTransition] = useTransition();

  // Setup SignalR connection
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;
    connection.current = new signalR.HubConnectionBuilder()
      .withUrl(`${discordSDK.isEmbedded ? "/.proxy" : ""}/api/hubs/room`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .withAutomaticReconnect()
      .withHubProtocol(new signalR.JsonHubProtocol())
      .configureLogging(signalR.LogLevel.Information)
      .build();
    connection.current.on("RoomUpdate", (roomInfo: RoomInfo, updatedItems: QueueItem[]) => {
      console.log("Room update received:", roomInfo, updatedItems);

      // Batch state updates to reduce re-renders
      startTransition(() => {
        setPlayingSince(roomInfo.playing_since ?? null);
        setIsPaused(roomInfo.is_paused);
        setCurrentTrackIndex(roomInfo.current_track.index ?? null);
        setCurrentTrackId(roomInfo.current_track.id ?? null);
        setIsLooping(roomInfo.is_looping);
        setIsShuffled(roomInfo.is_shuffled);

        setQueueItems((prev) => {
          const items = new Map(prev);
          let hasChanges = false;

          updatedItems.forEach((item) => {
            if (item.is_deleted) {
              if (items.has(item.id)) {
                items.delete(item.id);
                hasChanges = true;
              }
            } else {
              const existing = items.get(item.id);
              if (!existing || JSON.stringify(existing) !== JSON.stringify(item)) {
                items.set(item.id, item);
                hasChanges = true;
              }
            }
          });

          // Only update if there are actual changes
          if (!hasChanges) return prev;

          const sortedItems = Array.from(items.values()).sort((a, b) => {
            const aIndex = a.shuffled_index ?? a.index;
            const bIndex = b.shuffled_index ?? b.index;
            return aIndex - bIndex;
          });
          setQueueList(sortedItems);

          return items;
        });
      });
    });
    connection.current.on("Error", (error: string) => {
      console.error("Room hub error:", error);
      setInvokeError(error);
    });
    connection.current.start().catch((err) => {
      console.error("Failed to connect to room hub:", err);
      setInvokeError("Failed to connect to room hub");
    });
    return () => {
      connection.current?.stop();
    };
  }, [discordSDK.isEmbedded]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (connection.current?.state === signalR.HubConnectionState.Connected) {
        connection.current.invoke("Ping");
      }
    }, 60_000);
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const invokeRoomAction = useCallback(
    (action: string, ...args: unknown[]) => {
      if (invokePending) return;
      startTransition(async () => {
        if (invokePending) {
          setInvokeError("Another action is already in progress");
          return;
        }
        if (!connection.current?.state || connection.current.state !== signalR.HubConnectionState.Connected) {
          setInvokeError("Not connected to the room hub");
          return;
        }
        const error = await connection.current
          .invoke(action, Math.floor(timeService.getServerNow()), ...args)
          .then(() => null)
          .catch((err) => err.message || "Unknown error happened in the room action");
        if (error) {
          setInvokeError(error);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
    },
    [invokePending],
  );

  return {
    playingSince,
    currentTrackIndex,
    currentTrackId,
    isLooping,
    isPaused,
    isShuffled,
    queueItems,
    queueList,
    invokeRoomAction,
    invokeError,
    invokePending,
  };
}
