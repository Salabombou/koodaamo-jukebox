import { useState, useEffect, useCallback, useRef, useOptimistic, useMemo } from "react";
import type { ListChildComponentProps } from "react-window";
import { FixedSizeList } from "react-window";
import { DndContext, DragOverlay, type Modifier, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import QueueRow from "./QueueRow";
import { useState as useReactState } from "react";
import { useDiscordSDK } from "../hooks/useDiscordSdk";
import { useThumbnail } from "../hooks/useThumbnail";
import { QueueItem } from "../types/queue";
import { Track } from "../types/track";
import { FaArrowDown, FaArrowUp } from "react-icons/fa";
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
  tracks: Map<string, Track>;
  queueList: QueueItem[];
  currentTrack: (Track & { itemId: number }) | null;
  currentTrackIndex: number | null;
  controlsDisabled?: boolean;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (index: number) => void;
  onPlayNext: (index: number) => void;
}

const itemHeight = 66;

export default function Queue({
  tracks,
  queueList,
  currentTrack,
  currentTrackIndex,
  controlsDisabled,
  onMove,
  onSkip,
  onDelete,
  onPlayNext,
}: QueueProps) {
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
        distance: 5
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 0,
        tolerance: 5, 
      },
    })
  );

  const [visibleRange, setVisibleRange] = useState<{
    start: number;
    stop: number;
  }>({ start: 0, stop: 0 });

  // Prefetch thumbnails for visible and overscanned items only
  useEffect(() => {
    let cancelled = false;
    async function fetchThumbnails() {
      const promises: Promise<void>[] = [];
      // Only fetch thumbnails for visible and overscanned items
      const start = Math.max(0, visibleRange.start - 5); // overscan before
      const stop = Math.min(optimisticQueueList.length - 1, visibleRange.stop + 5); // overscan after
      for (let i = start; i <= stop; i++) {
        const item = optimisticQueueList[i];
        if (!item) continue;
        const track = tracks.get(item.track_id);
        if (track?.id) {
          const url = discordSDK.isEmbedded
            ? `/.proxy/api/track/${track.id}/thumbnail-low`
            : `/api/track/${track.id}/thumbnail-low`;
          if (!thumbnailBlobs[url]) {
            promises.push(
              (async () => {
                const objectUrl = await getThumbnail(url);
                if (!cancelled && objectUrl) {
                  setThumbnailBlobs(prev => ({ ...prev, [url]: objectUrl }));
                }
              })()
            );
          }
        }
      }
      await Promise.all(promises);
    }
    fetchThumbnails();
    return () => {
      cancelled = true;
    };
  }, [visibleRange, optimisticQueueList, tracks, discordSDK.isEmbedded]);

  const rowRenderer = useMemo(() => {
    return (props: ListChildComponentProps<QueueItem[]>) => {
      const track = tracks.get(props.data[props.index].track_id) ?? null;
      let thumbnailBlob = "/black.jpg";
      if (track?.id) {
        const url = discordSDK.isEmbedded
          ? `/.proxy/api/track/${track.id}/thumbnail-low`
          : `/api/track/${track.id}/thumbnail-low`;
        thumbnailBlob = thumbnailBlobs[url] || "/black.jpg";
      }
      return (
        <QueueRow
          {...props}
          track={track}
          currentTrack={currentTrack}
          thumbnailBlob={thumbnailBlob}
          onSkip={(i) => {
            scrolledSince.current = Date.now();
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
    const currentIds = new Set(queueList.map(item => String(item.id)));
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

  const list = useRef<FixedSizeList>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  const scrolledSince = useRef<number | null>(null);

  // Helper to scroll to a specific index and center it
  const scrollToIndexCentered = useCallback((index: number) => {
    if (list.current) {
      const height = outerRef.current ? outerRef.current.clientHeight : Number(list.current.props.height);
      const visibleCount = Math.floor(height / itemHeight);
      const offset = Math.max(0, index - Math.floor(visibleCount / 2));
      list.current.scrollTo(offset * itemHeight);
    }
  }, []);

  useEffect(() => {
    if (typeof currentTrackIndex === "number" && currentTrackIndex >= 0) {
      if (list.current) {
        const isScrolled = scrolledSince.current !== null && (Date.now() - scrolledSince.current) < 5000;
        if (!isScrolled && draggedIndex === null) {
          scrollToIndexCentered(currentTrackIndex);
        }
      }
    }
  }, [currentTrack?.itemId, currentTrackIndex, optimisticQueueList]);

  // Scroll to current track when arrow is clicked
  const scrollToCurrentTrack = useCallback(() => {
    if (typeof currentTrackIndex === "number" && currentTrackIndex >= 0 && list.current) {
      scrollToIndexCentered(currentTrackIndex);
    }
  }, [currentTrackIndex, scrollToIndexCentered]);

  const topArrowVisible = typeof currentTrackIndex === "number" && currentTrackIndex < visibleRange.start && optimisticQueueList.length > 0;
  const bottomArrowVisible = typeof currentTrackIndex === "number" && currentTrackIndex > visibleRange.stop && optimisticQueueList.length > 0;

  return (
    <div style={{ height: "100%" }} className="relative ml-6 w-full hidden md:flex touch-manipulation">
      {/* Top arrow */}
      {topArrowVisible && (
        <div className="hidden md:flex absolute top-2 right-2 z-10 pointer-events-none">
          <button
            onClick={scrollToCurrentTrack}
            className="btn btn-square btn-ghost hover:bg-queue-arrow-button-hover text-3xl text-white cursor-pointer pointer-events-auto"
            aria-label="Scroll to current track"
          >
            <FaArrowUp className="animate-bounce pt-2" />
          </button>
        </div>
      )}
      {/* Bottom arrow */}
      {bottomArrowVisible && (
        <div className="hidden md:flex absolute bottom-2 right-2 z-10 pointer-events-none">
          <button
            onClick={scrollToCurrentTrack}
            className="btn btn-square btn-ghost hover:bg-queue-arrow-button-hover text-3xl text-white cursor-pointer pointer-events-auto"
            aria-label="Scroll to current track"
          >
            <FaArrowDown className="animate-bounce pt-2" />
          </button>
        </div>
      )}
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
                scrolledSince.current = Date.now();
                onMove(fromIndex, toIndex);
                moveItem([fromIndex, toIndex]);
              }
            }}
          >
            <SortableContext items={optimisticQueueList} strategy={verticalListSortingStrategy}>
              <FixedSizeList
                ref={list}
                outerRef={outerRef}
                height={height}
                width={width}
                itemData={optimisticQueueList}
                itemCount={optimisticQueueList.length}
                overscanCount={5}
                onScroll={async (e) => {
                  if (e.scrollUpdateWasRequested) return;
                  scrolledSince.current = Date.now();
                }}
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
                  setVisibleRange({
                    start: visibleStartIndex,
                    stop: visibleStopIndex,
                  });
                }}
              >
                {rowRenderer}
              </FixedSizeList>
            </SortableContext>
            <DragOverlay>
              {draggedIndex !== null && (() => {
                const track = tracks.get(optimisticQueueList[draggedIndex].track_id) ?? null;
                let thumbnailBlob = "/black.jpg";
                if (track?.id) {
                  const url = discordSDK.isEmbedded
                    ? `/.proxy/api/track/${track.id}/thumbnail-low`
                    : `/api/track/${track.id}/thumbnail-low`;
                  thumbnailBlob = thumbnailBlobs[url] || "/black.jpg";
                }
                return (
                  <QueueRow
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
    </div>
  );
}
