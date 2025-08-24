import React, {
  useCallback,
  useEffect,
  useOptimistic,
  useState,
} from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import type { ListChildComponentProps } from "react-window";
import { FixedSizeList } from "react-window";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type Modifier,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";

import {
  QUEUE_ITEM_HEIGHT_DESKTOP,
  QUEUE_ITEM_HEIGHT_MOBILE,
} from "../../constants";
import { useDiscordSDK } from "../../hooks/useDiscordSDK";
import * as thumbnailService from "../../services/thumbnailService";
import type { QueueItem } from "../../types/queue";
import type { Track } from "../../types/track";
import QueueItemDesktop from "../desktop/QueueItemDesktop";
import QueueItemMobile from "../mobile/QueueItemMobile";

export interface QueueItemProps extends ListChildComponentProps {
  data: QueueItem[];
  track: Track | null;
  currentItemId: number | null;
  thumbnailBlob?: string;
  onSkip: (index: number) => void;
  onDelete: (itemId: number) => void;
  onPlayNext: (index: number) => void;
  controlsDisabled?: boolean;
  overlay?: boolean; // for drag overlay
}

// ----------- MEMOIZED ITEM COMPONENTS -------------
const MemoQueueItemDesktop = React.memo(QueueItemDesktop, (prev, next) => {
  return (
    prev.track?.id === next.track?.id &&
    prev.currentItemId === next.currentItemId &&
    prev.thumbnailBlob === next.thumbnailBlob &&
    prev.overlay === next.overlay &&
    prev.controlsDisabled === next.controlsDisabled
  );
});

const MemoQueueItemMobile = React.memo(QueueItemMobile, (prev, next) => {
  return (
    prev.track?.id === next.track?.id &&
    prev.currentItemId === next.currentItemId &&
    prev.thumbnailBlob === next.thumbnailBlob &&
    prev.overlay === next.overlay &&
    prev.controlsDisabled === next.controlsDisabled
  );
});

// ----------- DRAG AXIS MODIFIER -------------
const restrictToVerticalAxisCenterY: Modifier = ({
  transform,
  draggingNodeRect,
  activatorEvent,
}) => {
  if (draggingNodeRect && activatorEvent) {
    const activatorCoordinates = getEventCoordinates(activatorEvent);
    if (!activatorCoordinates) return { ...transform, x: 0 };
    const offsetY = activatorCoordinates.y - draggingNodeRect.top;
    return {
      ...transform,
      x: 0,
      y: transform.y + offsetY - draggingNodeRect.height / 2,
    };
  }
  return { ...transform, x: 0 };
};

interface QueueProps {
  type: "desktop" | "mobile";
  listRef: React.RefObject<FixedSizeList | null>;
  outerRef: React.RefObject<HTMLDivElement | null>;
  tracks: Map<string, Track>;
  queueList: QueueItem[];
  currentItemId: number | null;
  currentItemIndex: number | null;
  controlsDisabled?: boolean;
  onItemsRendered: (visibleStartIndex: number, visibleStopIndex: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (itemId: number) => void;
  onPlayNext: (index: number) => void;
  onScroll?: (crollPosition: number, userScroll: boolean) => void;
  onDragEnd?: (fromIndex: number, toIndex: number) => void;
}

/**
 * Virtualized, draggable queue list supporting optimistic reordering.
 */
export default function Queue({
  type,
  listRef,
  outerRef,
  tracks,
  queueList,
  currentItemId,
  currentItemIndex,
  controlsDisabled,
  onItemsRendered,
  onMove,
  onSkip,
  onDelete,
  onPlayNext,
  onScroll,
  onDragEnd,
}: QueueProps) {
  const discordSDK = useDiscordSDK();
  const [thumbnailBlobs, setThumbnailBlobs] = useState<Record<string, string>>(
    {}
  );

  // Optimistic queue list manager
  const [optimisticQueueList, moveItem] = useOptimistic<
    QueueItem[],
    [number, number]
  >(queueList, (state, [fromIndex, toIndex]) => {
    const newState = [...state];
    const [movedItem] = newState.splice(fromIndex, 1);

    if (toIndex >= 0) {
      newState.splice(toIndex, 0, movedItem);
    }
    // if toIndex === -1 → removed
    return newState;
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const itemKey = useCallback(
    (index: number, data: QueueItem[]) => data[index].id,
    []
  );

  // Setup DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 0, tolerance: 0 },
    })
  );

  const [visibleRange, setVisibleRange] = useState({ start: 0, stop: 0 });

  // -------- Thumbnail prefetching ----------
  useEffect(() => {
    let cancelled = false;
    async function fetchThumbnails() {
      const start = Math.max(0, visibleRange.start - 3);
      const stop = Math.min(
        optimisticQueueList.length - 1,
        visibleRange.stop + 3
      );

      const promises: Promise<void>[] = [];
      const batchSize = 2;

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
                const objectUrl = await thumbnailService.getThumbnail(url);
                if (!cancelled && objectUrl) {
                  setThumbnailBlobs((prev) => ({ ...prev, [url]: objectUrl }));
                }
              })()
            );
          }
        }
        if (promises.length >= batchSize) {
          await Promise.all(promises.splice(0, batchSize));
        }
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
    }
    fetchThumbnails();
    return () => {
      cancelled = true;
    };
  }, [visibleRange, optimisticQueueList, tracks, discordSDK.isEmbedded, thumbnailBlobs]);

  // --------- Custom handlers using moveItem ----------
  const handleDelete = useCallback(
    (itemId: number) => {
      const index = optimisticQueueList.findIndex((item) => item.id === itemId);
      if (index !== -1) {
        moveItem([index, -1]);
      }
      onDelete(itemId);
    },
    [optimisticQueueList, moveItem, onDelete]
  );

  const handlePlayNext = useCallback(
    (index: number) => {
      if (currentItemIndex == null) return;
      const nextIndex = Math.min(
        currentItemIndex + 1,
        optimisticQueueList.length - 1
      );
      if (index !== nextIndex) {
        moveItem([index, nextIndex]);
      }
      onPlayNext(index);
    },
    [optimisticQueueList, currentItemIndex, moveItem, onPlayNext]
  );

  // --------- Row Renderer -----------
  const rowRenderer = useCallback(
    (props: ListChildComponentProps<QueueItem[]>) => {
      const item = props.data[props.index];
      const track = tracks.get(item.track_id) ?? null;

      const url = track?.id
        ? discordSDK.isEmbedded
          ? `/.proxy/api/track/${track.id}/thumbnail-low`
          : `/api/track/${track.id}/thumbnail-low`
        : null;

      const thumbnailBlob = (url && thumbnailBlobs[url]) || "/black.jpg";

      const QueueItemComponent =
        type === "desktop" ? MemoQueueItemDesktop : MemoQueueItemMobile;

      return (
        <QueueItemComponent
          {...props}
          track={track}
          currentItemId={currentItemId}
          thumbnailBlob={thumbnailBlob}
          onSkip={onSkip}
          onDelete={handleDelete}
          onPlayNext={handlePlayNext}
          controlsDisabled={controlsDisabled}
        />
      );
    },
    [
      type,
      tracks,
      currentItemId,
      thumbnailBlobs,
      onSkip,
      handleDelete,
      handlePlayNext,
      controlsDisabled,
      discordSDK.isEmbedded,
    ]
  );

  return (
    <AutoSizer>
      {({ height, width }) => (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxisCenterY]}
          onDragStart={(e) =>
            setDraggedIndex(e.active.data.current?.sortable.index as number)
          }
          onDragEnd={(e) => {
            const fromIndex = draggedIndex;
            const toIndex = e.over?.data.current?.sortable.index;
            setDraggedIndex(null);
            if (
              typeof fromIndex === "number" &&
              typeof toIndex === "number" &&
              fromIndex !== toIndex &&
              !controlsDisabled
            ) {
              onMove(fromIndex, toIndex);
              moveItem([fromIndex, toIndex]);
              onDragEnd?.(fromIndex, toIndex);
            }
          }}
        >
          <SortableContext
            items={optimisticQueueList}
            strategy={verticalListSortingStrategy}
          >
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
              itemSize={
                type === "desktop"
                  ? QUEUE_ITEM_HEIGHT_DESKTOP
                  : QUEUE_ITEM_HEIGHT_MOBILE
              }
              itemKey={itemKey}
              style={{
                overflowX: "hidden",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                touchAction: "pan-y",
              }}
              onItemsRendered={({ visibleStartIndex, visibleStopIndex }) => {
                setVisibleRange({
                  start: visibleStartIndex,
                  stop: visibleStopIndex,
                });
                onItemsRendered(visibleStartIndex, visibleStopIndex);
              }}
            >
              {rowRenderer}
            </FixedSizeList>
          </SortableContext>

          {/* Drag overlay */}
          <DragOverlay>
            {draggedIndex !== null &&
              (() => {
                const track =
                  tracks.get(optimisticQueueList[draggedIndex].track_id) ??
                  null;
                const url = track?.id
                  ? discordSDK.isEmbedded
                    ? `/.proxy/api/track/${track.id}/thumbnail-low`
                    : `/api/track/${track.id}/thumbnail-low`
                  : null;
                const thumbnailBlob =
                  (url && thumbnailBlobs[url]) || "/black.jpg";
                const QueueItemComponent =
                  type === "desktop"
                    ? MemoQueueItemDesktop
                    : MemoQueueItemMobile;

                return (
                  <QueueItemComponent
                    overlay={true}
                    index={draggedIndex}
                    track={track}
                    currentItemId={currentItemId}
                    thumbnailBlob={thumbnailBlob}
                    onSkip={() => {}}
                    onDelete={() => {}}
                    onPlayNext={() => {}}
                    style={{}}
                    data={optimisticQueueList}
                    controlsDisabled={true}
                  />
                );
              })()}
          </DragOverlay>
        </DndContext>
      )}
    </AutoSizer>
  );
}
