import React, { useState, useEffect, useCallback, useRef, useOptimistic, useMemo } from "react";
import type { ListChildComponentProps } from "react-window";
import { FixedSizeList } from "react-window";
import { DndContext, DragOverlay, type Modifier, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import QueueListRow from "./QueueListRow";
import { useState as useReactState } from "react";
import { useDiscordSDK } from "../hooks/useDiscordSdk";
import { useThumbnail } from "../hooks/useThumbnail";
import { QueueItem } from "../types/queue";
import { Track } from "../types/track";
import AutoSizer from "react-virtualized-auto-sizer";

const restrictToVerticalAxisCenterY: Modifier = ({ transform, draggingNodeRect, activatorEvent }) => {
  if (draggingNodeRect && activatorEvent) {
    const activatorCoordinates = getEventCoordinates(activatorEvent);
    if (!activatorCoordinates) return transform;
    const offsetY = activatorCoordinates.y - draggingNodeRect.top;
    return {
      ...transform,
      x: 0,
      y: transform.y + offsetY - draggingNodeRect.height / 2,
    };
  }
  return transform;
};

interface QueueProps {
  listRef: React.RefObject<FixedSizeList | null>;
  outerRef: React.RefObject<HTMLDivElement | null>;
  tracks: Map<string, Track>;
  queueList: QueueItem[];
  currentTrack: (Track & { itemId: number }) | null;
  currentTrackIndex: number | null;
  controlsDisabled?: boolean;
  onItemsRendered: (visibleStartIndex: number, visibleStopIndex: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (index: number) => void;
  onPlayNext: (index: number) => void;
  onScroll?: (crollPosition: number, userScroll: boolean) => void;
  onDragEnd?: (fromIndex: number, toIndex: number) => void;
}

export const itemHeight = 66;

export default function Queue({ listRef, outerRef, tracks, queueList, currentTrack, controlsDisabled, onItemsRendered, onMove, onSkip, onDelete, onPlayNext, onScroll, onDragEnd }: QueueProps) {
  const discordSDK = useDiscordSDK();
  const { getThumbnail, removeThumbnail } = useThumbnail();
  const [thumbnailBlobs, setThumbnailBlobs] = useReactState<{ [key: string]: string }>({});
  const [optimisticQueueList, moveItem] = useOptimistic<QueueItem[], [number, number]>(queueList, (state, [fromIndex, toIndex]) => {
    const newState = [...state];
    const [movedItem] = newState.splice(fromIndex, 1);
    newState.splice(toIndex, 0, movedItem);
    return newState;
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const itemKey = useCallback((index: number, data: QueueItem[]) => data[index].id, []);
  const stableProps = useMemo(
    () => ({
      onDelete,
      onPlayNext,
      controlsDisabled,
    }),
    [onDelete, onPlayNext, controlsDisabled],
  );

  // Setup DnD sensors for pointer and touch
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 0,
        tolerance: 0
      },
    }),
  );

  const [visibleRange, setVisibleRange] = useState<{
    start: number;
    stop: number;
  }>({ start: 0, stop: 0 });

  // Prefetch thumbnails for visible and overscanned items only - optimized
  useEffect(() => {
    let cancelled = false;
    async function fetchThumbnails() {
      // Only fetch thumbnails for visible and overscanned items
      const start = Math.max(0, visibleRange.start - 3); // reduced overscan
      const stop = Math.min(optimisticQueueList.length - 1, visibleRange.stop + 3);

      const promises: Promise<void>[] = [];
      const batchSize = 2; // Limit concurrent requests

      for (let i = start; i <= stop; i++) {
        const item = optimisticQueueList[i];
        if (!item) continue;
        const track = tracks.get(item.track_id);
        if (track?.id) {
          const url = discordSDK.isEmbedded ? `/.proxy/api/track/${track.id}/thumbnail-low` : `/api/track/${track.id}/thumbnail-low`;
          if (!thumbnailBlobs[url]) {
            promises.push(
              (async () => {
                const objectUrl = await getThumbnail(url);
                if (!cancelled && objectUrl) {
                  setThumbnailBlobs((prev) => ({ ...prev, [url]: objectUrl }));
                }
              })(),
            );
          }
        }

        // Process in batches to avoid overwhelming the browser
        if (promises.length >= batchSize) {
          await Promise.all(promises.splice(0, batchSize));
        }
      }

      // Process remaining promises
      if (promises.length > 0) {
        await Promise.all(promises);
      }
    }
    fetchThumbnails();
    return () => {
      cancelled = true;
    };
  }, [visibleRange, optimisticQueueList, tracks, discordSDK.isEmbedded, getThumbnail, thumbnailBlobs]);

  const rowRenderer = useMemo(() => {
    return (props: ListChildComponentProps<QueueItem[]>) => {
      const track = tracks.get(props.data[props.index].track_id) ?? null;
      let thumbnailBlob = "/black.jpg";
      if (track?.id) {
        const url = discordSDK.isEmbedded ? `/.proxy/api/track/${track.id}/thumbnail-low` : `/api/track/${track.id}/thumbnail-low`;
        thumbnailBlob = thumbnailBlobs[url] || "/black.jpg";
      }
      return (
        <QueueListRow
          {...props}
          track={track}
          currentTrack={currentTrack}
          thumbnailBlob={thumbnailBlob}
          onSkip={(i) => {
            onSkip(i);
          }}
          onDelete={stableProps.onDelete}
          onPlayNext={stableProps.onPlayNext}
          controlsDisabled={stableProps.controlsDisabled}
        />
      );
    };
  }, [tracks, currentTrack, onSkip, stableProps, thumbnailBlobs, discordSDK.isEmbedded]);

  // Remove thumbnails for items no longer in the queue to avoid memory leaks
  const prevQueueIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentIds = new Set(queueList.map((item) => String(item.id)));
    const prevIds = prevQueueIdsRef.current;
    // If any previous IDs are no longer present, remove their thumbnails
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        // Remove thumbnail for this item
        // Find the previous track_id for this id
        const prevTrackId = (() => {
          // Try to find in previous queueList (not available), fallback to tracks map
          for (const track of tracks.values()) {
            if (String(track.id) === id) return track.id;
          }
          return undefined;
        })();
        if (prevTrackId) {
          const urlLow = `/api/track/${prevTrackId}/thumbnail-low`;
          const urlProxyLow = `/.proxy/api/track/${prevTrackId}/thumbnail-low`;
          removeThumbnail(urlLow);
          removeThumbnail(urlProxyLow);
        }
      }
    }
    prevQueueIdsRef.current = currentIds;
  }, [queueList, tracks, removeThumbnail]);

  return (
    <AutoSizer>
      {({ height, width }) => (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxisCenterY]}
          onDragStart={(e) => setDraggedIndex(e.active.data.current?.sortable.index as number)}
          onDragEnd={(e) => {
            const fromIndex = draggedIndex;
            const toIndex = e.over?.data.current?.sortable.index;
            setDraggedIndex(null);
            if (typeof fromIndex === "number" && typeof toIndex === "number" && fromIndex !== toIndex && !controlsDisabled) {
              onMove(fromIndex, toIndex);
              moveItem([fromIndex, toIndex]);
              onDragEnd?.(fromIndex, toIndex);
            }
          }}
        >
          <SortableContext items={optimisticQueueList} strategy={verticalListSortingStrategy}>
            <FixedSizeList
              ref={listRef}
              outerRef={outerRef}
              height={height}
              width={width}
              onScroll={({ scrollOffset, scrollUpdateWasRequested }) => {
                onScroll?.(scrollOffset, !scrollUpdateWasRequested);
              }}
              itemData={optimisticQueueList}
              itemCount={optimisticQueueList.length}
              overscanCount={5}
              itemSize={itemHeight}
              itemKey={itemKey}
              style={{
                overflowX: "hidden",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch", // Enable momentum scroll on iOS
                scrollbarWidth: "none",
                touchAction: "pan-y",
              }}
              onItemsRendered={({ visibleStartIndex, visibleStopIndex }) => {
                setVisibleRange({ start: visibleStartIndex, stop: visibleStopIndex });
                onItemsRendered(visibleStartIndex, visibleStopIndex);
              }}
            >
              {rowRenderer}
            </FixedSizeList>
          </SortableContext>
          <DragOverlay>
            {draggedIndex !== null &&
              (() => {
                const track = tracks.get(optimisticQueueList[draggedIndex].track_id) ?? null;
                let thumbnailBlob = "/black.jpg";
                if (track?.id) {
                  const url = discordSDK.isEmbedded ? `/.proxy/api/track/${track.id}/thumbnail-low` : `/api/track/${track.id}/thumbnail-low`;
                  thumbnailBlob = thumbnailBlobs[url] || "/black.jpg";
                }
                return (
                  <QueueListRow
                    overlay={true}
                    index={draggedIndex}
                    track={track}
                    currentTrack={currentTrack}
                    thumbnailBlob={thumbnailBlob}
                    onSkip={() => {}}
                    onDelete={() => {}}
                    onPlayNext={() => {}}
                    style={{}}
                    data={optimisticQueueList}
                    controlsDisabled={controlsDisabled}
                  />
                );
              })()}
          </DragOverlay>
        </DndContext>
      )}
    </AutoSizer>
  );
}
