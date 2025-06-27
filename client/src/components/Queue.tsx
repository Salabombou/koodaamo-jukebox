import { useState, useEffect, useCallback, useRef, useOptimistic } from "react";
import type { ListChildComponentProps } from "react-window";
import { FixedSizeList } from "react-window";
import {
  DndContext,
  DragOverlay,
  type Modifier,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import QueueRow from "./QueueRow";
import { QueueItem } from "../types/queue";
import { Track } from "../types/track";
import { FaArrowDown, FaArrowUp } from "react-icons/fa";

const restrictToVerticalAxisCenterY: Modifier = ({
  transform,
  draggingNodeRect,
  activatorEvent,
}) => {
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
  queueItems: Map<number, QueueItem>;
  currentTrackId: string | null;
  currentTrackIndex?: number | null;
  controlsDisabled?: boolean;
  backgroundColor: string;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (index: number) => void;
  onPlayNext: (index: number) => void;
}
export default function Queue({
  tracks,
  queueItems,
  currentTrackId,
  currentTrackIndex,
  backgroundColor,
  onMove,
  onSkip,
  onDelete,
  onPlayNext,
  controlsDisabled,
}: QueueProps) {
  const [optimisticQueueList, moveItem] = useOptimistic<
    QueueItem[],
    [number, number]
  >(
    [...queueItems.values()].sort(
      (a, b) => (a.shuffledIndex ?? a.index) - (b.shuffledIndex ?? b.index),
    ),
    (state, [fromIndex, toIndex]) => {
      const newState = [...state];
      const [movedItem] = newState.splice(fromIndex, 1);
      newState.splice(toIndex, 0, movedItem);
      return newState;
    },
  );

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Debounced resize handler to avoid rapid state updates
  const resizeTimeout = useRef<number | null>(null);
  const [listHeight, setListHeight] = useState(window.innerHeight);
  useEffect(() => {
    const handleResize = () => {
      if (resizeTimeout.current) clearTimeout(resizeTimeout.current);
      resizeTimeout.current = window.setTimeout(() => {
        const newHeight = window.innerHeight;
        setListHeight((prev) => (prev !== newHeight ? newHeight : prev));
      }, 100); // 100ms debounce
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeTimeout.current) clearTimeout(resizeTimeout.current);
    };
  }, []);

  const itemKey = useCallback(
    (index: number, data: QueueItem[]) => data[index].id,
    [],
  );

  const rowRenderer = useCallback(
    (props: ListChildComponentProps) => (
      <QueueRow
        {...props}
        tracks={tracks}
        currentTrackId={currentTrackId}
        backgroundColor={backgroundColor}
        onSkip={onSkip}
        onDelete={onDelete}
        onPlayNext={onPlayNext}
        controlsDisabled={controlsDisabled}
      />
    ),
    [tracks, currentTrackId, onSkip, backgroundColor, controlsDisabled],
  );

  const list = useRef<FixedSizeList>(null);

  const scrolled = useRef(false);
  const scrollTimeout = useRef<number | null>(null);
  useEffect(() => {
    // scroll where the current track is visible as first item
    if (typeof currentTrackIndex === "number" && currentTrackIndex >= 0) {
      if (list.current) {
        const currentTrackItemVisible =
          currentTrackIndex >= visibleRange.start &&
          currentTrackIndex <= visibleRange.stop;
        if (!scrolled.current && currentTrackItemVisible) {
          list.current.scrollToItem(currentTrackIndex, "center");
        }
        scrolled.current = false;
      }
    }
  }, [currentTrackIndex]);

  const [visibleRange, setVisibleRange] = useState<{
    start: number;
    stop: number;
  }>({ start: 0, stop: 0 });

  // Scroll to current track when arrow is clicked
  const scrollToCurrentTrack = useCallback(() => {
    if (
      typeof currentTrackIndex === "number" &&
      currentTrackIndex >= 0 &&
      list.current
    ) {
      list.current.scrollToItem(currentTrackIndex, "center");
    }
  }, [currentTrackIndex]);

  return (
    <div style={{ position: "relative", height: listHeight, width: "100%" }}>
      {/* Top arrow */}
      {typeof currentTrackIndex === "number" &&
        currentTrackIndex < visibleRange.start && (
          <div className="absolute top-2 left-0 w-full flex justify-center z-10">
            <button
              onClick={scrollToCurrentTrack}
              className="btn btn-wide text-xl cursor-pointer"
              aria-label="Scroll to current track"
            >
              <FaArrowUp />
            </button>
          </div>
        )}
      {/* Bottom arrow */}
      {typeof currentTrackIndex === "number" &&
        currentTrackIndex > visibleRange.stop && (
          <div className="absolute bottom-2 left-0 w-full flex justify-center z-10">
            <button
              onClick={scrollToCurrentTrack}
              className="btn btn-wide text-xl cursor-pointer"
              aria-label="Scroll to current track"
            >
              <FaArrowDown />
            </button>
          </div>
        )}
      <DndContext
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
          }
        }}
      >
        <SortableContext
          items={optimisticQueueList}
          strategy={verticalListSortingStrategy}
        >
          <FixedSizeList
            ref={list}
            height={listHeight}
            width="100%"
            className="hidden md:flex mx-6"
            itemData={optimisticQueueList}
            itemCount={optimisticQueueList.length}
            onScroll={(e) => {
              if (e.scrollUpdateWasRequested) return;
              scrolled.current = true;
              if (scrollTimeout.current) {
                clearTimeout(scrollTimeout.current);
              }
              scrollTimeout.current = window.setTimeout(() => {
                scrolled.current = false;
              }, 5000);
            }}
            itemSize={66}
            itemKey={itemKey}
            style={{
              overflowX: "hidden",
              overflowY: "scroll",
              scrollbarWidth: "none",
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
          {draggedIndex !== null && (
            <QueueRow
              overlay={true}
              index={draggedIndex}
              currentTrackId={currentTrackId}
              backgroundColor={backgroundColor}
              onSkip={() => {}}
              onDelete={() => {}}
              onPlayNext={() => {}}
              style={{}}
              data={optimisticQueueList}
              tracks={tracks}
              controlsDisabled={controlsDisabled}
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
