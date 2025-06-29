import { useEffect, useRef, useCallback, useState, useTransition } from "react";
import * as signalR from "@microsoft/signalr";
import * as timeService from "../services/timeService";
import { QueueItem } from "../types/queue";
import { RoomInfo } from "../types/room";
import { useDiscordSDK } from "./useDiscordSdk";

export default function useRoomHub() {
  const discordSDK = useDiscordSDK();

  const [playingSince, setPlayingSince] = useState<number | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(
    null,
  );
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState<boolean | null>(null);
  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  const [isShuffled, setIsShuffled] = useState<boolean | null>(null);

  const [queueItems, setQueueItems] = useState<Map<number, QueueItem>>(
    new Map(),
  );
  const [queueList, setQueueList] = useState<QueueItem[]>([]);

  const connection = useRef<signalR.HubConnection | null>(null);

  const [invokeError, setInvokeError] = useState<string | null>(null);
  const [invokePending, startTransition] = useTransition();

  // Setup SignalR connection
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    connection.current = new signalR.HubConnectionBuilder()
      .withUrl(`${discordSDK.isEmbedded ? "/.proxy" : ""}/api/hubs/room`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .withAutomaticReconnect()
      .withHubProtocol(new signalR.JsonHubProtocol())
      .configureLogging(signalR.LogLevel.Information)
      .build();
    connection.current.on(
      "RoomUpdate",
      (roomInfo: RoomInfo, updatedItems: QueueItem[]) => {
        console.log("Room update received:", roomInfo, updatedItems);
        setPlayingSince(roomInfo.playingSince ?? null);
        setIsPaused(roomInfo.isPaused);
        setCurrentTrackIndex(roomInfo.currentTrack.index ?? null);
        setCurrentTrackId(roomInfo.currentTrack.id ?? null);
        setIsLooping(roomInfo.isLooping);
        setIsShuffled(roomInfo.isShuffled);

        startTransition(() => {
          setQueueItems((prev) => {
            const items = new Map(prev);
            updatedItems.forEach((item) => {
              if (item.isDeleted) {
                items.delete(item.id);
              } else {
                items.set(item.id, item);
              }
            });

            const sortedItems = Array.from(items.values()).sort((a, b) => {
              const aIndex = a.shuffledIndex ?? a.index;
              const bIndex = b.shuffledIndex ?? b.index;
              return aIndex - bIndex;
            });
            setQueueList(sortedItems);

            return items;
          });
        });
      },
    );
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

  const invokeRoomAction = useCallback((action: string, ...args: unknown[]) => {
    if (invokePending) return;
    startTransition(async () => {
      if (invokePending) {
        setInvokeError("Another action is already in progress");
        return;
      }
      if (
        !connection.current?.state ||
        connection.current.state !== signalR.HubConnectionState.Connected
      ) {
        setInvokeError("Not connected to the room hub");
        return;
      }
      const error = await connection.current
        .invoke(action, Math.floor(timeService.getServerNow()), ...args)
        .then(() => null)
        .catch(
          (err) => err.message || "Unknown error happened in the room action",
        );
      if (error) {
        setInvokeError(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  }, []);

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
