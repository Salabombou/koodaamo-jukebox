import { startTransition, useCallback, useEffect, useRef, useState, useTransition } from "react";
import * as signalR from "@microsoft/signalr";

import { LS_KEY_AUTH_TOKEN, ROOM_HUB_PING_INTERVAL_MS } from "../constants";
import { shuffle } from "../services/shuffleService";
import * as timeService from "../services/timeService";
import type { QueueItem } from "../types/queue";
import type {
  LoopToggledEvent,
  PauseToggledEvent,
  QueueAddedEvent,
  QueueClearedEvent,
  QueueDeletedEvent,
  QueueMovedEvent,
  ShuffleToggledEvent,
  TrackSeekedEvent,
  TrackSkippedEvent,
} from "../types/room";
import type { RoomInfo } from "../types/room";

import { useDiscordSDK } from "./useDiscordSDK";

export default function useRoomHub() {
  const discordSDK = useDiscordSDK();

  const [playingSince, setPlayingSince] = useState<number | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);
  const [currentItemShuffleIndex, setCurrentItemShuffleIndex] = useState<number | null>(null);
  const [currentItemId, setCurrentItemId] = useState<number | null>(null);
  const [currentItemTrackId, setCurrentItemTrackId] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState<boolean | null>(null);
  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  const [isShuffled, setIsShuffled] = useState<boolean | null>(null);

  const [queueItems, setQueueItems] = useState<Map<number, QueueItem>>(new Map());
  const [queueList, setQueueList] = useState<QueueItem[]>([]);

  const connection = useRef<signalR.HubConnection | null>(null);

  // Use refs for working data to avoid state management issues
  const queueItemsRef = useRef<Map<number, QueueItem>>(new Map());
  const isShuffledRef = useRef<boolean>(false);
  const currentItemIndexRef = useRef<number | null>(null);
  const currentItemShuffleIndexRef = useRef<number | null>(null);
  const currentItemIdRef = useRef<number | null>(null);
  const currentItemTrackIdRef = useRef<string | null>(null);
  const isPausedRef = useRef<boolean | null>(null);
  const isLoopingRef = useRef<boolean | null>(null);
  const playingSinceRef = useRef<number | null>(null);

  const roomInfoReceived = useRef<boolean>(false);

  const [invokeError, setInvokeError] = useState<string | null>(null);
  const [invokePending, invokeTransition] = useTransition();

  const invokeRoomAction = useCallback(
    (action: string, ...args: unknown[]) => {
      if (invokePending) return;
      invokeTransition(async () => {
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

  // Setup SignalR connection
  useEffect(() => {
    const token = localStorage.getItem(LS_KEY_AUTH_TOKEN);
    if (!token) return;
    connection.current = new signalR.HubConnectionBuilder()
      .withUrl(`${discordSDK.isEmbedded ? "/.proxy" : ""}/api/hubs/room`, {
        headers: { Authorization: `Bearer ${token}` },
        transport: signalR.HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect()
      .withHubProtocol(new signalR.JsonHubProtocol())
      .configureLogging(signalR.LogLevel.Information)
      .build();

    connection.current.on("Connected", () => {
      console.log("Connected to room hub");
      if (!roomInfoReceived.current) {
        connection.current?.invoke("RoomInfo");
      }
    });

    connection.current.on("Pong", () => {
      console.log("Pong received");
    });

    // Handle initial room update (for connection)
    connection.current.on("RoomInfo", (roomInfo: RoomInfo, updatedItems: QueueItem[]) => {
      console.log("Room info received:", roomInfo, updatedItems);

      // Batch state updates to reduce re-renders
      startTransition(() => {
        // Update refs first
        playingSinceRef.current = roomInfo.playing_since ?? null;
        isPausedRef.current = roomInfo.is_paused;
        currentItemIndexRef.current = roomInfo.current_item.index ?? null;
        currentItemShuffleIndexRef.current = roomInfo.current_item.shuffle_index ?? null;
        currentItemIdRef.current = roomInfo.current_item.id ?? null;
        currentItemTrackIdRef.current = roomInfo.current_item.track_id ?? null;
        isLoopingRef.current = roomInfo.is_looping;
        isShuffledRef.current = roomInfo.is_shuffled;
        queueItemsRef.current = new Map<number, QueueItem>();
        for (const item of updatedItems) {
          queueItemsRef.current.set(item.id, item);
        }

        // Update state
        setPlayingSince(roomInfo.playing_since ?? null);
        setIsPaused(roomInfo.is_paused);
        setCurrentItemIndex(roomInfo.current_item.index ?? null);
        setCurrentItemShuffleIndex(roomInfo.current_item.shuffle_index ?? null);
        setCurrentItemId(roomInfo.current_item.id ?? null);
        setCurrentItemTrackId(roomInfo.current_item.track_id ?? null);
        setIsLooping(roomInfo.is_looping);
        setIsShuffled(roomInfo.is_shuffled);
        setQueueItems(new Map(queueItemsRef.current));
        setQueueList(
          Array.from(queueItemsRef.current.values()).sort((a, b) => {
            const aIndex = isShuffledRef.current ? (a.shuffled_index ?? a.index) : a.index;
            const bIndex = isShuffledRef.current ? (b.shuffled_index ?? b.index) : b.index;
            return aIndex - bIndex;
          }),
        );

        roomInfoReceived.current = true;
      });
    });

    // Handle specific events
    connection.current.on("PauseToggled", (event: PauseToggledEvent) => {
      console.log("Pause toggled:", event);
      startTransition(() => {
        // Update refs first
        isPausedRef.current = event.is_paused;
        playingSinceRef.current = event.playing_since;

        // Update state
        setIsPaused(event.is_paused);
        setPlayingSince(event.playing_since);
      });
    });

    connection.current.on("LoopToggled", (event: LoopToggledEvent) => {
      console.log("Loop toggled:", event);
      startTransition(() => {
        // Update ref first
        isLoopingRef.current = event.is_looping;

        // Update state
        setIsLooping(event.is_looping);
      });
    });

    connection.current.on("ShuffleToggled", (event: ShuffleToggledEvent) => {
      console.log("Shuffle toggled:", event);
      startTransition(() => {
        // Update refs first
        isShuffledRef.current = event.is_shuffled;
        currentItemIndexRef.current = event.current_item_index;
        currentItemShuffleIndexRef.current = event.current_item_shuffle_index;
        currentItemIdRef.current = event.current_item_id;
        currentItemTrackIdRef.current = event.current_item_track_id;

        if (event.is_shuffled && typeof event.seed === "number") {
          // Enabling shuffle
          const itemList = Array.from(queueItemsRef.current.values()).sort((a, b) => a.index - b.index);

          // Find current item directly from queueItemsRef.current
          let currentItem: QueueItem | undefined = undefined;
          if (event.current_item_id !== null) {
            currentItem = queueItemsRef.current.get(event.current_item_id);
          }

          if (!currentItem) {
            return;
          }

          const otherItems = itemList.filter((item) => item.id !== currentItem!.id);
          const shuffledItems = shuffle(otherItems, event.seed);
          shuffledItems.unshift(currentItem);

          for (let i = 0; i < shuffledItems.length; i++) {
            shuffledItems[i].shuffled_index = i;
          }

          queueItemsRef.current = new Map<number, QueueItem>(shuffledItems.map((item) => [item.id, item]));
        } else if (!event.is_shuffled) {
          // Disabling shuffle - reset shuffle indices
          console.log("Disabling shuffle, resetting shuffle indices");
          const updatedItems = new Map(queueItemsRef.current);
          for (const item of updatedItems.values()) {
            item.shuffled_index = null;
          }
          queueItemsRef.current = updatedItems;
        }

        setQueueItems(new Map(queueItemsRef.current));
        setQueueList(
          Array.from(queueItemsRef.current.values()).sort((a, b) => {
            const aIndex = isShuffledRef.current ? (a.shuffled_index ?? a.index) : a.index;
            const bIndex = isShuffledRef.current ? (b.shuffled_index ?? b.index) : b.index;
            return aIndex - bIndex;
          }),
        );

        // Update state AFTER queue state is updated
        setIsShuffled(event.is_shuffled);
        setCurrentItemIndex(event.current_item_index);
        setCurrentItemShuffleIndex(event.current_item_shuffle_index);
        setCurrentItemId(event.current_item_id);
        setCurrentItemTrackId(event.current_item_track_id);
      });
    });

    connection.current.on("TrackSeeked", (event: TrackSeekedEvent) => {
      console.log("Track seeked:", event);
      startTransition(() => {
        // Update ref first
        playingSinceRef.current = event.playing_since;

        // Update state
        setPlayingSince(event.playing_since);
      });
    });

    connection.current.on("TrackSkipped", (event: TrackSkippedEvent) => {
      console.log("Track skipped:", event);
      startTransition(() => {
        // Update refs first
        currentItemIndexRef.current = event.current_item_index;
        currentItemShuffleIndexRef.current = event.current_item_shuffle_index;
        currentItemIdRef.current = event.current_item_id;
        currentItemTrackIdRef.current = event.current_item_track_id;
        playingSinceRef.current = null;

        // Update state
        setCurrentItemIndex(event.current_item_index);
        setCurrentItemShuffleIndex(event.current_item_shuffle_index);
        setCurrentItemId(event.current_item_id);
        setCurrentItemTrackId(event.current_item_track_id);
        setPlayingSince(null);
      });
    });

    connection.current.on("QueueMoved", (event: QueueMovedEvent) => {
      console.log("Queue moved:", event);
      startTransition(() => {
        currentItemIndexRef.current = event.current_item_index;
        currentItemShuffleIndexRef.current = event.current_item_shuffle_index;
        currentItemIdRef.current = event.current_item_id;
        currentItemTrackIdRef.current = event.current_item_track_id;

        const updatedItems = new Map(queueItemsRef.current);
        const itemList = Array.from(updatedItems.values()).sort((a, b) => {
          const aIndex = isShuffledRef.current ? (a.shuffled_index ?? a.index) : a.index;
          const bIndex = isShuffledRef.current ? (b.shuffled_index ?? b.index) : b.index;
          return aIndex - bIndex;
        });

        if (event.from < itemList.length && event.to < itemList.length) {
          const movedItem = itemList[event.from];
          itemList.splice(event.from, 1);
          itemList.splice(event.to, 0, movedItem);

          // Re-assign indices
          for (let i = 0; i < itemList.length; i++) {
            const item = itemList[i];
            if (isShuffledRef.current) {
              updatedItems.set(item.id, { ...item, shuffled_index: i });
            } else {
              updatedItems.set(item.id, { ...item, index: i });
            }
          }

          queueItemsRef.current = updatedItems;
          setQueueItems(new Map(queueItemsRef.current));
          setQueueList(
            Array.from(queueItemsRef.current.values()).sort((a, b) => {
              const aIndex = isShuffledRef.current ? (a.shuffled_index ?? a.index) : a.index;
              const bIndex = isShuffledRef.current ? (b.shuffled_index ?? b.index) : b.index;
              return aIndex - bIndex;
            }),
          );

          setCurrentItemIndex(event.current_item_index);
          setCurrentItemShuffleIndex(event.current_item_shuffle_index);
          setCurrentItemId(event.current_item_id);
          setCurrentItemTrackId(event.current_item_track_id);
        }
      });
    });

    connection.current.on("QueueAdded", (event: QueueAddedEvent) => {
      console.log("Queue added:", event);
      startTransition(() => {
        // Update refs first
        currentItemIndexRef.current = event.current_item_index;
        currentItemShuffleIndexRef.current = event.current_item_shuffle_index;
        currentItemIdRef.current = event.current_item_id;
        currentItemTrackIdRef.current = event.current_item_track_id;

        // Update state
        setCurrentItemIndex(event.current_item_index);
        setCurrentItemShuffleIndex(event.current_item_shuffle_index);
        setCurrentItemId(event.current_item_id);
        setCurrentItemTrackId(event.current_item_track_id);

        const updatedItems = new Map(queueItemsRef.current);

        for (let i = 0; i < event.added_items.length; i++) {
          const item = event.added_items[i];
          updatedItems.set(item.id, item);
        }

        queueItemsRef.current = updatedItems;
        setQueueItems(new Map(queueItemsRef.current));
        setQueueList(
          Array.from(queueItemsRef.current.values()).sort((a, b) => {
            const aIndex = isShuffledRef.current ? (a.shuffled_index ?? a.index) : a.index;
            const bIndex = isShuffledRef.current ? (b.shuffled_index ?? b.index) : b.index;
            return aIndex - bIndex;
          }),
        );
      });
    });

    connection.current.on("QueueCleared", (event: QueueClearedEvent) => {
      console.log("Queue cleared:", event);
      startTransition(() => {
        const updatedItems = new Map(queueItemsRef.current);
        const currentItem = updatedItems.get(event.current_item_id);
        if (currentItem) {
          currentItem.index = 0; // Reset index of current item
          if (isShuffledRef.current) {
            currentItem.shuffled_index = 0;
          } else {
            currentItem.shuffled_index = null;
          }
          updatedItems.clear();
          updatedItems.set(currentItem.id, currentItem);
        }

        queueItemsRef.current = updatedItems;
        setQueueItems(new Map(queueItemsRef.current));
        setQueueList(
          Array.from(queueItemsRef.current.values()).sort((a, b) => {
            const aIndex = isShuffledRef.current ? (a.shuffled_index ?? a.index) : a.index;
            const bIndex = isShuffledRef.current ? (b.shuffled_index ?? b.index) : b.index;
            return aIndex - bIndex;
          }),
        );
      });
    });

    connection.current.on("QueueDeleted", (event: QueueDeletedEvent) => {
      console.log("Queue deleted:", event);
      startTransition(() => {
        // Update refs first
        currentItemIndexRef.current = event.current_item_index;
        currentItemShuffleIndexRef.current = event.current_item_shuffle_index;

        // Update state
        setCurrentItemIndex(event.current_item_index);
        setCurrentItemShuffleIndex(event.current_item_shuffle_index);
        
        const updatedItems = new Map(queueItemsRef.current);
        updatedItems.delete(event.deleted_item_id);
        
        // Re-assign indices to remaining items
        const remainingItems = Array.from(updatedItems.values()).sort((a, b) => {
          const aIndex = isShuffledRef.current ? (a.shuffled_index ?? a.index) : a.index;
          const bIndex = isShuffledRef.current ? (b.shuffled_index ?? b.index) : b.index;
          return aIndex - bIndex;
        });
        
        for (let i = 0; i < remainingItems.length; i++) {
          const item = remainingItems[i];
          if (isShuffledRef.current) {
            updatedItems.set(item.id, { ...item, shuffled_index: i });
          } else {
            updatedItems.set(item.id, { ...item, index: i });
          }
        }
        
        queueItemsRef.current = updatedItems;
        setQueueItems(new Map(queueItemsRef.current));
        setQueueList(
          Array.from(queueItemsRef.current.values()).sort((a, b) => {
            const aIndex = isShuffledRef.current ? (a.shuffled_index ?? a.index) : a.index;
            const bIndex = isShuffledRef.current ? (b.shuffled_index ?? b.index) : b.index;
            return aIndex - bIndex;
          }),
        );
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
  }, [discordSDK.isEmbedded, isShuffled]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (connection.current?.state === signalR.HubConnectionState.Connected) {
        connection.current.invoke("Ping");
      }
    }, ROOM_HUB_PING_INTERVAL_MS);
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return {
    playingSince,
    currentItemIndex,
    currentItemShuffleIndex,
    currentItemId,
    currentItemTrackId,
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
