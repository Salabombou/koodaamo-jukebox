import React, { useCallback, useOptimistic, useState } from "react";
//import AutoSizer from "react-virtualized-auto-sizer";
import type { ListImperativeAPI, RowComponentProps } from "react-window";
import { List } from "react-window";
import { closestCenter, DndContext, DragOverlay, type Modifier, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";

import { QUEUE_ITEM_HEIGHT_DESKTOP, QUEUE_ITEM_HEIGHT_MOBILE } from "../../constants";
import type { QueueItem } from "../../types/queue";
import type { Track } from "../../types/track";
import QueueItemDesktop from "../desktop/QueueItemDesktop";
import QueueItemMobile from "../mobile/QueueItemMobile";

export type QueueItemProps = RowComponentProps<{
  data: QueueItem[];
  tracks: Map<string, Track>;
  currentItemId: number | null;
  onSkip: (index: number) => void;
  onDelete: (itemId: number) => void;
  onPlayNext: (index: number) => void;
  controlsDisabled?: boolean;
  overlay?: boolean; // for drag overlay
}>;

// drag axis modifier (unchanged)
const restrictToVerticalAxisCenterY: Modifier = ({ transform, draggingNodeRect, activatorEvent }) => {
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
  listRef: React.RefObject<ListImperativeAPI | null>;
  //outerRef: React.RefObject<HTMLDivElement | null>;
  tracks: Map<string, Track>;
  queueList: QueueItem[];
  currentItemId: number | null;
  currentItemIndex: number | null;
  controlsDisabled?: boolean;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (itemId: number) => void;
  onPlayNext: (index: number) => void;
  onScroll?: (scrollPosition: number, userScroll: boolean) => void;
  onDragEnd?: (fromIndex: number, toIndex: number) => void;
  onRowsRendered?: (startIndex: number, stopIndex: number) => void;
}

/**
 * Virtualized, draggable queue list supporting optimistic reordering.
 */
export default function Queue({
  type,
  listRef,
  //outerRef,
  tracks,
  queueList,
  currentItemId,
  currentItemIndex,
  controlsDisabled,
  //onItemsRendered,
  onMove,
  onSkip,
  onDelete,
  onPlayNext,
  onScroll,
  onDragEnd,
  onRowsRendered,
}: QueueProps) {
  // Optimistic queue list manager
  const [optimisticQueueList, moveItem] = useOptimistic<QueueItem[], [number, number]>(queueList, (state, [fromIndex, toIndex]) => {
    const newState = [...state];
    const [movedItem] = newState.splice(fromIndex, 1);

    if (toIndex >= 0) {
      newState.splice(toIndex, 0, movedItem);
    }
    // if toIndex === -1 → removed
    return newState;
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Setup DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 0, tolerance: 0 },
    }),
  );

  // --------- Custom handlers using moveItem ----------
  const handleDelete = useCallback(
    (itemId: number) => {
      const index = optimisticQueueList.findIndex((item) => item.id === itemId);
      if (index !== -1) {
        moveItem([index, -1]);
      }
      onDelete(itemId);
    },
    [optimisticQueueList, moveItem, onDelete],
  );

  const handlePlayNext = useCallback(
    (index: number) => {
      if (currentItemIndex == null) return;
      const nextIndex = Math.min(currentItemIndex + 1, optimisticQueueList.length - 1);
      if (index !== nextIndex) {
        moveItem([index, nextIndex]);
      }
      onPlayNext(index);
    },
    [optimisticQueueList, currentItemIndex, moveItem, onPlayNext],
  );

  const QueueItemComponent = type === "desktop" ? QueueItemDesktop : QueueItemMobile;

  return (
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
            <List
              listRef={listRef}
              rowCount={optimisticQueueList.length}
              rowHeight={type === "desktop" ? QUEUE_ITEM_HEIGHT_DESKTOP : QUEUE_ITEM_HEIGHT_MOBILE}
              style={{
                overflowX: "hidden",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                touchAction: "pan-y",
              }}
              onScroll={(e) => {
                if (onScroll) {
                  onScroll(e.currentTarget.scrollTop, e.currentTarget.scrollHeight - e.currentTarget.clientHeight - e.currentTarget.scrollTop > 1);
                }
              }}
              onRowsRendered={({ startIndex, stopIndex }) => {
                onRowsRendered?.(startIndex, stopIndex);
              }}
              rowComponent={QueueItemComponent}
              rowProps={{ data: optimisticQueueList, tracks, currentItemId, onSkip, onDelete: handleDelete, onPlayNext: handlePlayNext, controlsDisabled }}
            />
          </SortableContext>

          {/* Drag overlay (unchanged except for using the same QueueItemComponent) */}
          <DragOverlay>
            {draggedIndex !== null &&
              (() => {
                const draggedItem = optimisticQueueList[draggedIndex];
                if (!draggedItem) return null;

                return (
                  <QueueItemComponent
                    ariaAttributes={{
                      role: "listitem",
                      "aria-setsize": optimisticQueueList.length,
                      "aria-posinset": draggedIndex + 1,
                    }}
                    overlay={true}
                    index={draggedIndex}
                    tracks={tracks}
                    currentItemId={currentItemId}
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
  );
}
